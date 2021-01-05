import { EventEmitter } from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';
import { cloneDeep } from 'lodash';
import browserama from 'browserama';

import GenesysCloudWebrtcSdk from '../client';
import { IExtendedMediaSession, IMediaRequestOptions, MediaState, SdkMediaEvents } from '../types/interfaces';

declare var window: {
  navigator: {
    mediaDevices: {
      getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    } & MediaDevices;
  } & Navigator;
  webkitAudioContext: typeof AudioContext;
} & Window & typeof globalThis;

export class SdkMedia extends (EventEmitter as { new(): StrictEventEmitter<EventEmitter, SdkMediaEvents> }) {
  private state: MediaState;
  private audioTracksBeingMonitored: { [key: string]: any } = {};
  private allMediaTracksCreated: MediaStreamTrack[] = [];

  constructor (private sdk: GenesysCloudWebrtcSdk) {
    super();
    this.state = {
      devices: [],
      oldDevices: [],
      audioDevices: [],
      videoDevices: [],
      outputDevices: [],
      hasMic: false,
      hasCamera: false,
      hasMicPermissions: false,
      hasCameraPermissions: false,
      hasOutputDeviceSupport: this.hasOutputDeviceSupport(),
    };
    /* load devices on construction */
    this.enumerateDevices();
    window.navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange.bind(this));
  }
  // ================================================================
  // Public Media Functions
  // ================================================================

  /**
   * Call to enumerate available devices. This will update the 
   *  cache of devices and emit events on `'state'` & `'devices'`
   */
  async enumerateDevices (): Promise<MediaDeviceInfo[]> {
    const enumeratedDevices = await window.navigator.mediaDevices.enumerateDevices();
    const oldDevices = this.getDevices();
    const mappedDevices = this.mapOldToNewDevices(
      oldDevices,
      enumeratedDevices
    );

    this.sdk.logger.debug('enumerated and mapped devices', {
      enumeratedDevices,
      mappedDevices,
      oldDevices
    });

    this.setDevices(mappedDevices);
    return mappedDevices;
  }

  /**
   * Creates a media stream from the screen (this will prompt for user screen selection)
   */
  startDisplayMedia (): Promise<MediaStream> {
    const constraints = this.getScreenShareConstraints();

    if (this.hasGetDisplayMedia()) {
      return window.navigator.mediaDevices.getDisplayMedia(constraints);
    }

    return window.navigator.mediaDevices.getUserMedia(constraints);
  }

  /**
   * Create media with video and/or audio
   *  `{ video?: boolean | string, audio: boolean | string }`
   *  `true` will use the sdk default device id (or system default if no sdk default)
   *  `string` (for deviceId) will attempt to use that deviceId and fallback to sdk default
   * @param opts video and/or audio default device or deviceId
   */
  async startMedia (opts: IMediaRequestOptions = { video: true, audio: true }): Promise<MediaStream> {
    const constraints: any = this.getStandardConstraints(opts);

    const conversationId = opts.session?.conversationId;
    const sessionId = opts.session?.id;
    const isFirefox = browserama.isFirefox;

    // if we are requesting video
    if (opts.video || opts.video === null) {
      const videoDeviceId = this.getValidDeviceId('videoinput', opts.video, opts.session);
      if (videoDeviceId) {
        this.sdk.logger.info('Requesting video with deviceId', { deviceId: videoDeviceId, conversationId, sessionId });
        constraints.video.deviceId = isFirefox ? { exact: videoDeviceId } : { ideal: videoDeviceId };
      }
    }

    // if we are requesting audio
    if (opts.audio || opts.audio === null) {
      const audioDeviceId = this.getValidDeviceId('audioinput', opts.audio, opts.session);
      if (audioDeviceId) {
        this.sdk.logger.info('Requesting audio with deviceId', { deviceId: audioDeviceId, conversationId, sessionId });
        constraints.audio.deviceId = isFirefox ? { exact: audioDeviceId } : { ideal: audioDeviceId };
      }
    }

    const loggingExtras = {
      constraints,
      isFirefox,
      opts,
      sessionId,
      conversationId,
      availableDevices: this.getDevices()
    };

    /* if there was a session, we don't want to log it */
    delete loggingExtras.opts.session;

    /* log what we are about to request */
    this.sdk.logger.info('requesting getUserMedia', { ...loggingExtras });

    return window.navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        if (this.sdk._config.media.monitorMicVolume) {
          stream.getAudioTracks().forEach(track => this.monitorMicVolume(stream, track, sessionId));
        }
        stream.getTracks().forEach(t => this.allMediaTracksCreated.push(t));
        return stream;
      })
      .catch(e => {
        /* get the current devices (because they could have changed by the time we get here) */
        this.sdk.logger.error(e, {
          error: e,
          ...loggingExtras,
          availableDevices: this.getDevices()
        });

        /* FF throws this error for cameras connected through a dock.. sometimes */
        if (e.name === 'AbortError' && e.message === 'Starting video failed') {

          /**
           * if we are requesting video with a set resolution, try without it 
           *  (FF and docks can cause this resolution error) 
           */
          if (opts.video && opts.videoResolution) {
            delete opts.videoResolution;
            this.sdk.logger.warn('starting video was aborted. trying again without a resolution constraint', loggingExtras);
            return this.startMedia(opts);
          }
        }

        throw e;
      });
  }

  /**
   * Get a valid deviceId (`undefined` is returned if none was found)
   *
   * This will follow the steps looking for a device:
   *  1. If `deviceId` is a `string`, it will look for that device and return it
   *  2. If device could not be found _or_ `deviceId` was `true`,
   *      it will look for the sdk default device
   *  3. If device could not be found _or_ `deviceId` was `null`,
   *      it will look for the system default device
   *  4. If no device was found, return `undefined`
   *
   * Note: if `kind === 'audiooutput'` it will always return a value.
   * Reason: There is no way to request "default" output device, so
   *  we have to return the id of the first output device.
   *  For mic/camera, we just return `undefined` because gUM will
   *  automatically find the default device (the defaults are different
   *  between Chrome and FF)
   *
   * @param kind desired device kind
   * @param deviceId `deviceId` for specific device, `true` for sdk default device, or `null` for system default
   */
  getValidDeviceId (
    kind: MediaDeviceKind,
    deviceId: string | boolean | null,
    ...sessions: IExtendedMediaSession[]
  ): string {
    const state = this.getState();
    const sessionInfos: Array<{ conversationId: string, sessionId: string }> =
      sessions
        .filter(s => s)
        .map(s => ({ sessionId: s.id, conversationId: s.conversationId }));

    let availableDevices: MediaDeviceInfo[];
    let sdkConfigDefault: string | null;
    let foundDevice: MediaDeviceInfo | undefined;

    if (kind === 'videoinput') {
      availableDevices = state.videoDevices.slice();
      sdkConfigDefault = this.sdk._config.defaults.videoDeviceId;
    } else if (kind === 'audioinput') {
      availableDevices = state.audioDevices.slice();
      sdkConfigDefault = this.sdk._config.defaults.audioDeviceId;
    } else /* if (kind === 'audiooutput') */ {
      availableDevices = state.outputDevices.slice();
      sdkConfigDefault = this.sdk._config.defaults.outputDeviceId;
    }

    // if a deviceId was passed in, try to use it
    if (typeof deviceId === 'string') {
      foundDevice = availableDevices.find((d: MediaDeviceInfo) => d.deviceId === deviceId);
    }

    // log if we didn't find the requested deviceId
    if (!foundDevice) {
      if (typeof deviceId === 'string') {
        this.sdk.logger.warn(`Unable to find requested ${kind} deviceId`, { deviceId, sessionInfos });
      }

      // then try to find the sdk default device (if it is not `null`)
      if (sdkConfigDefault !== null) {
        foundDevice = availableDevices.find((d: MediaDeviceInfo) => d.deviceId === sdkConfigDefault);
        // log if we couldn't find the sdk default device
        if (!foundDevice) {
          this.sdk.logger.warn(`Unable to find the sdk default ${kind} deviceId`, {
            deviceId: this.sdk._config.defaults.audioDeviceId,
            sessionInfos
          });
        }
      }
    }

    if (!foundDevice) {
      this.sdk.logger.info(`Using the system default ${kind} device`, { sessionInfos });

      /*
        SANITY: There is no way to request "default" output device, so
          we have to return the id of the first output device.

          I _think_ you can request default by just using an empty string. 
            Going to try that. 

          For mic/camera, we just return `undefined` because gUM will
          automatically find the default device (the defaults are different
            between Chrome and FF)
      */
      if (kind === 'audiooutput') {
        // TODO: test this change out
        foundDevice = /* availableDevices[0] ||  */{ deviceId: '' } as MediaDeviceInfo;
      }
    }

    return foundDevice ? foundDevice.deviceId : undefined;
  }

  /**
   * Get the current _cached_ media devices
   */
  getDevices (): MediaDeviceInfo[] {
    return this.getState().devices;
  }

  /**
   * Get a copy of the current media state
   */
  getState (): MediaState {
    return cloneDeep(this.state);
  }

  /**
   * Get the current _cached_ audio devices
   */
  getAduioDevices (): MediaDeviceInfo[] {
    return this.getState().audioDevices;
  }

  /**
   * Get the current _cached_ video devices
   */
  getVideoDevices (): MediaDeviceInfo[] {
    return this.getState().videoDevices;
  }

  /**
   * Get the current _cached_ output devices
   */
  getOutputDevices (): MediaDeviceInfo[] {
    return this.getState().outputDevices;
  }

  /**
   * Look through the cached devices and match based on
   *  the passed in track's `kind` and `label`. Returns the 
   *  found device or `undefined` if the device could not be found. 
   * @param track media stream track with the label to search for
   */
  findCachedDeviceByTrackLabel (track?: MediaStreamTrack): MediaDeviceInfo | undefined {
    if (!track) return;
    return this.getDevices().find(d => d.label === track.label && d.kind === track.kind);
  };

  /**
   * Look through the cached output devices and match based on
   *  the passed in output deviceId. Returns the found device
   *  or `undefined` if the device could not be found. 
   * @param id output deviceId
   */
  findCachedOutputDeviceById (id?: string): MediaDeviceInfo | undefined {
    return this.getState().outputDevices.find(d => d.deviceId === id);
  };

  /**
   * This will remove all media listeners, stop any existing media, 
   *  and stop listening for device changes.
   * 
   * WARNING: calling this effectively renders this SDK
   *  instance useless. A new instance will need to be 
   *  created after this is called. 
   */
  destory () {
    this.removeAllListeners();
    window.navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange.bind(this));
    this.allMediaTracksCreated.forEach(t => t.stop());
  }

  // ================================================================
  // Private Functions
  // ================================================================

  private setDevices (devices: MediaDeviceInfo[]) {
    const outputDevices = devices.filter(d => d.kind === 'audiooutput');
    const audioDevices = devices.filter(d => d.kind === 'audioinput');
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    const oldDevices = this.getDevices();
    this.setStateAndEmit({
      devices,
      oldDevices,
      outputDevices,
      audioDevices,
      videoDevices,
      hasCamera: !!videoDevices.length,
      hasMic: !!audioDevices.length,
    }, 'devices');
  }

  private setStateAndEmit (newState: Partial<MediaState>, eventType: keyof SdkMediaEvents = 'devices') {
    this.state = { ...this.state, ...newState };

    const stateCopy = this.getState();
    this.emit('state', { ...stateCopy, eventType: 'state' });
    this.emit(eventType, { ...stateCopy, eventType });
  }

  private monitorMicVolume (stream: MediaStream, track: MediaStreamTrack, sessionId?: string) {
    if (this.audioTracksBeingMonitored[track.id]) {
      return;
    }

    /* setup tear down monitors */
    const stopTrack = track.stop.bind(track);
    track.stop = () => {
      this.sdk.logger.debug('stopping track from track.stop()', track);
      this.clearAudioInputMonitor(track.id);
      stopTrack();
    };
    track.onended = (e) => {
      this.clearAudioInputMonitor(track.id);
      this.sdk.logger.debug('stopping track from track.onended', track);
    };

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioSource = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.minDecibels = -127;
    analyser.maxDecibels = 0;
    analyser.smoothingTimeConstant = 0.4;
    audioSource.connect(analyser);
    const volumes = new Uint8Array(analyser.frequencyBinCount);
    const volumeCallback = () => {
      analyser.getByteFrequencyData(volumes);
      let volumeSum = 0;
      for (const volume of volumes) {
        volumeSum += volume;
      }
      const averageVolume = volumeSum / volumes.length;
      this.emit('audioTrackVolume', { track, volume: averageVolume, sessionId, muted: !track.enabled || track.muted });
    };

    this.audioTracksBeingMonitored[track.id] = setInterval(volumeCallback, 100);
  };

  private clearAudioInputMonitor (trackId: string) {
    const intervalId = this.audioTracksBeingMonitored[trackId];
    if (!intervalId) {
      return;
    }

    clearInterval(intervalId);
    delete this.audioTracksBeingMonitored[trackId];
  };

  private hasGetDisplayMedia (): boolean {
    return !!(window.navigator && window.navigator.mediaDevices && window.navigator.mediaDevices.getDisplayMedia);
  }

  private hasOutputDeviceSupport (): boolean {
    return window.HTMLMediaElement.prototype.hasOwnProperty('setSinkId');
  }

  private getStandardConstraints (opts: IMediaRequestOptions): MediaStreamConstraints {
    const constraints: any = {
      video: {},
      audio: {}
    };

    if (browserama.isChromeOrChromium) {
      constraints.video.googNoiseReduction = true;
      constraints.audio = {
        googAudioMirroring: false,
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
        googDucking: false,
        googHighpassFilter: true
      };
    }

    if (opts.video === false || opts.video === undefined) {
      constraints.video = false;
    }

    if (opts.audio === false || opts.audio === undefined) {
      constraints.audio = false;
    }

    if (constraints.video) {
      constraints.video.frameRate = opts.videoFrameRate || { ideal: 30 };
      const resolution = opts.videoResolution || this.sdk._config.defaults.videoResolution;
      Object.assign(constraints.video, resolution);
    }

    return constraints;
  }

  private getScreenShareConstraints (): MediaStreamConstraints {
    if (browserama.isChromeOrChromium) {
      if (this.hasGetDisplayMedia()) {
        return {
          audio: false,
          video: {
            frameRate: { ideal: 30 },
            height: { max: 10000 },
            width: { max: 10000 }
          }
        };
      }
      return {
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            maxWidth: 10000,
            maxHeight: 10000,
            maxFrameRate: 15
          }
        } as MediaTrackConstraints
      };

    } else { /* if not chrome */
      return {
        audio: false,
        video: {
          mediaSource: 'window'
        } as MediaTrackConstraints
      };
    }
  }

  private mapOldToNewDevices (oldDevices: MediaDeviceInfo[], newDevices: MediaDeviceInfo[]): MediaDeviceInfo[] {
    /**
     * If a new device exists in the old device list _and_ has
     *  a label in the old list, we will use the old one instead
     *  of the new one because the new devices are not always 
     *  guaranteed to have labels. That happens in FF if permissions
     *  are not remembered and we enumerate devices again (and we 
     *  don't have an active media stream)
     */
    const devices = [];
    for (const newDevice of newDevices) {
      /* see if the new device exists in the old devices list */
      const foundOldDevice = oldDevices.find(
        d => d.deviceId === newDevice.deviceId && d.groupId === newDevice.groupId && d.kind === newDevice.kind
      );

      /* if the device exists in the old list _and_ has a label we will use that */
      if (foundOldDevice && foundOldDevice.label) {
        devices.push(foundOldDevice);
      } else {
        devices.push(newDevice);
      }
    }

    return devices;
  }

  private handleDeviceChange () {
    this.sdk.logger.debug('devices changed');
    // TODO: refactor this so the sessionManager isn't enumerating devices
    /* this function will enumerate devices again */
    return this.sessionManager.validateOutgoingMediaTracks();
  };
}