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
  private sdk: GenesysCloudWebrtcSdk;
  private state: MediaState;
  private audioTracksBeingMonitored: { [key: string]: any } = {};
  private allMediaTracksCreated: MediaStreamTrack[] = [];

  constructor (sdk: GenesysCloudWebrtcSdk) {
    super();
    this.sdk = sdk;
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
      micPermissionsRequested: false,
      cameraPermissionsRequested: false,
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
   * 
   * If the devices returned from the browser are the same as the cached
   *  devices, a new event will _NOT_ emit. To force an emit pass in `true`.
   * 
   * It is _highly_ recommended that `sdk.media.requestMediaPermissions(type)`
   *  be called at least once to ensure devices are loaded correctly _after_
   *  permissions are granted. `requestMediaPermissions()` will call
   *  `enumerateDevices()` before and after requesting permissions. 
   * 
   * Note: if media permissions have not been granted by the browser,
   *  enumerated devices will not return the full list of devices 
   *  and/or the devices will not have ids/labels (varies per browser). 
   * 
   * @param forceEmit force an event to emit if the devices 
   *  have not changed from the cached devices
   */
  async enumerateDevices (forceEmit: boolean = false): Promise<MediaDeviceInfo[]> {
    const enumeratedDevices = await window.navigator.mediaDevices.enumerateDevices();
    const oldDevices = this.getDevices();
    const mappedDevices = this.mapOldToNewDevices(
      oldDevices,
      enumeratedDevices
    );

    this.sdk.logger.debug('enumerated and mapped devices', {
      enumeratedDevices,
      mappedDevices,
      oldDevices,
    });
    const deviceListsMatched = this.doDevicesMatch(oldDevices, enumeratedDevices);

    if (deviceListsMatched && !forceEmit) {
      this.sdk.logger.debug('`setDevices` called with the same device list. Not emitting');
      return;
    }
    this.setDevices(mappedDevices);
    return mappedDevices;
  }

  /**
   * Creates a media stream from the screen (this will prompt for user screen selection)
   */
  async startDisplayMedia (): Promise<MediaStream> {
    const constraints = this.getScreenShareConstraints();
    const promise = this.hasGetDisplayMedia()
      ? window.navigator.mediaDevices.getDisplayMedia(constraints)
      : window.navigator.mediaDevices.getUserMedia(constraints);

    const stream = await promise;
    stream.getTracks().forEach(t => this.allMediaTracksCreated.push(t));
    return stream;
  }

  /**
   * Create media with video and/or audio. See `interface IMediaRequestOptions`  
   *  for more information about available options. 
   * 
   * It is _highly_ recommended that `sdk.media.requestPermissions(type)` be called
   *  with each desired media type _before_ using `startMedia`. This will ensure 
   *  all media permissions have been granted before starting media. 
   * 
   * Warning: if `sdk.media.requestPermissions(type)` has NOT been called before 
   *  calling `startMedia`, this function will call `sdk.media.requestPermissions(type)`.
   *  If calling `startMedia` with both `audio` and `video` _before_ requesting permissions,
   *  `startMedia` will attempt to gain permissions for `audio` first and then `video` (because
   *  media permissions must be requested one at a time). If `audio` fails, it will 
   *  not attempt to gain permissions for `video` – the error will stop execution. 
   * 
   * @param opts video and/or audio default device or deviceId. Defaults to `{video: true, audio: true}`
   */
  async startMedia (opts: IMediaRequestOptions = { video: true, audio: true }): Promise<MediaStream> {
    /* this will set media type to `truthy` if `null` was passed in */
    const constraints: any = this.getStandardConstraints(opts);
    const conversationId = opts.session?.conversationId;
    const sessionId = opts.session?.id;
    const isFirefox = browserama.isFirefox;
    const requestingVideo = opts.video || opts.video === null;
    const requestingAudio = opts.audio || opts.audio === null;

    const { micPermissionsRequested, cameraPermissionsRequested } = this.getState();
    let mediaStreamFromPermissions: MediaStream;

    /* if we haven't requested permissions for audio yet, we need to do that first */
    if (requestingAudio && !micPermissionsRequested) {
      const optsWithOutsession = opts;
      delete opts.session;
      this.sdk.logger.info('attempted to get audio media before permissions checked. requesting audio permissions first', {
        opts: optsWithOutsession,
        sessionId,
        conversationId,
      });
      mediaStreamFromPermissions = await this.requestMediaPermissions('audio', true, opts) as MediaStream;
    }

    /* if we haven't requested permissions for video yet, we need to do that first */
    if (requestingVideo && !cameraPermissionsRequested) {
      const optsWithOutsession = opts;
      delete opts.session;
      this.sdk.logger.info('attempted to get video media before permissions checked. requesting video permissions first', {
        opts: optsWithOutsession,
        sessionId,
        conversationId,
      });
      const videoStream = await this.requestMediaPermissions('video', true, opts) as MediaStream;

      if (!mediaStreamFromPermissions) {
        mediaStreamFromPermissions = videoStream;
      } else {
        videoStream.getTracks().forEach(t => mediaStreamFromPermissions.addTrack(t));
      }
    }

    /* if we preserved media from the permissions check, go ahead and return it (because it came from `startMedia`) */
    if (mediaStreamFromPermissions) {
      this.sdk.logger.info('returning media from permissions check inside `sdk.media.startMedia`.', {
        constraints,
        opts,
        sessionId,
        conversationId,
        mediaTracks: mediaStreamFromPermissions.getTracks()
      });
    }

    /* if we are requesting video */
    if (requestingVideo) {
      const videoDeviceId = this.getValidDeviceId('videoinput', opts.video, opts.session);
      if (videoDeviceId) {
        this.sdk.logger.info('Requesting video with deviceId', { deviceId: videoDeviceId, conversationId, sessionId });
        constraints.video.deviceId = isFirefox ? { exact: videoDeviceId } : { ideal: videoDeviceId };
      }
    }

    /* if we are requesting audio */
    if (requestingAudio) {
      const audioDeviceId = this.getValidDeviceId('audioinput', opts.audio, opts.session);
      if (audioDeviceId) {
        this.sdk.logger.info('Requesting audio with deviceId', { deviceId: audioDeviceId, conversationId, sessionId });
        constraints.audio.deviceId = isFirefox ? { exact: audioDeviceId } : { ideal: audioDeviceId };
      }
    }

    /* if this value undefined, use the sdk config's value – otherwise keep the `truthy/falsey` value */
    if (opts.monitorMicVolume === undefined) {
      opts.monitorMicVolume = this.sdk._config.media.monitorMicVolume;
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

    try {
      const stream = await window.navigator.mediaDevices.getUserMedia(constraints)
      if (opts.monitorMicVolume) {
        stream.getAudioTracks().forEach(track => this.monitorMicVolume(stream, track, sessionId));
      }
      stream.getTracks().forEach(t => this.allMediaTracksCreated.push(t));
      this.sdk.logger.info('returning media from getUserMedia.', {
        constraints,
        opts,
        sessionId,
        conversationId,
        mediaTracks: stream.getTracks()
      });
      return stream;
    } catch (e) {

      /* log with the current devices (because they could have changed by the time we get here) */
      this.sdk.logger.error(e, {
        error: e,
        ...loggingExtras,
        availableDevices: this.getDevices()
      });

      /* PERMISSIONS ERRORS */
      if (
        /* User denies browser permissions prompt */
        e.name === 'NotAllowedError' ||
        /* OS permissions error in chrome (no error is thrown for not having mic OS permissions) */
        (e.name === 'DOMException' && e.message === 'Could not start video source') ||
        /* OS permissions error in FF */
        (e.name === 'NotFoundError' && e.message === 'The object can not be found here.')
      ) {
        /* set the requested media type permission to `false` */
        if (constraints.audio) {
          this.setPermissions({ hasCameraPermissions: false });
        }
        if (constraints.video) {
          this.setPermissions({ hasMicPermissions: false });
        }
      }
      /**
       * Add setPermissions logic
       * and an if block at the beginning for notRequestinPerms yet
       */

      /* FF throws this error for cameras connected through a dock.. sometimes */
      if (e.name === 'AbortError' && e.message === 'Starting video failed') {
        /**
         * if we are requesting video with a set resolution, try without it 
         *  (FF and docks can cause this resolution error) 
         */
        if (opts.video && opts.videoResolution) {
          delete opts.videoResolution;
          this.sdk.logger.warn('starting video was aborted. trying again without a video resolution constraint', loggingExtras);
          return this.startMedia(opts);
        }
      }

      throw e;
    };
  }

  /**
   * Function to gain permissions for a given media type. This function should 
   *  be called early after constructing the SDK and _before_ calling 
   *  `sdk.media.startMedia()` to ensure permissions are granted. 
   * 
   * This function will call through to `startMedia` to get a media stream
   *  for the desired media permissions. That is the only surefire way to 
   *  gain permissions across all browsers & platforms. 
   * 
   * It will also call through to `sdk.media.enumerateDevices()` to ensure
   *  all devices have been loaded after permissions have been granted. 
   * 
   * An error will be thrown and an event emitted on `sdk.media.on('permissions', evt)`
   *  if permissions are not granted by either the browser or the OS (specifically 
   *  for macOS). With the one exception of the microphone permission on the OS level. 
   *  If the microphone permission has not be granted on the OS level, macOS will 
   *  still allow the browser to attain an audio track for the microphone. However,
   *  the track will act as if it is in a "hardware mute" state. This is no API 
   *  available for the browser to know the microphone is in a "hardware mute" 
   *  state. To see if a microphone may be in a "hardware mute" state, you can
   *  listen for microphone volume events on `sdk.media.on('audioTrackVolume', evt)`
   *  and add logic to respond to no volume coming through the microhpone. 
   * 
   * If `preserveMedia` is `true`, the media stream attained through the 
   *  `startMedia()` will be returned to the caller. If not, the media will
   *  be destroyed. 
   * 
   * `options` can be any valid deviceId or other media options defined in
   *  `interface IMediaRequestOptions` for information. These options will
   *  be passed to the `startMedia()` call. 
   * 
   * Note: default option for the media type will be `true`. If a value of 
   *  `false` or `undefined` is passed in, it will also use `true`. Any 
   *  options for the other media type will be ignored. Example:
   * ``` ts
   * await requestMediaPermissions(
   *   'audio',
   *   false,
   *   {
   *     audio: false,
   *     video: 'some-video-device-id',
   *     videoFrameRate: 30
   *   }  
   * );
   * // since type === 'audio', the options will be converted to: 
   * {
   *   // a valid option must be set (`false|undefined` are invalid)
   *   audio: true,
   *   // video will be ignored since permissions are requested one at a time
   *   video: false
   * }
   * ```
   * @param type media type to request permissions for (`'audio' | 'video'`)
   * @param preserveMedia flag to return media after permissions pass
   * @param options optional, advanced options to request media with. 
   */
  async requestMediaPermissions (
    type: 'audio' | 'video',
    preserveMedia = false,
    options?: IMediaRequestOptions
  ): Promise<MediaStream | void> {
    options = options || {};
    const requestingAudio = type === 'audio';
    const requestingVideo = type === 'video';

    /* first load devices */
    await this.enumerateDevices();

    /* if we are requesting audio permissions, make sure we don't request video */
    if (requestingAudio) {
      this.setPermissions({ micPermissionsRequested: true });
      /* make sure the options are valid */
      if (options.audio === undefined || options.audio === false) {
        options.audio = true;
      }
      options.video = false;
    }

    /* if we are requesting audio permissions, make sure we don't request audio */
    if (requestingVideo) {
      this.setPermissions({ cameraPermissionsRequested: true });
      /* make sure the options are valid */
      if (options.video === undefined || options.video === false) {
        options.video = true;
      }
      options.audio = false;
    }

    /* delete the session off this before logging */
    const optionsToLog = {
      ...options,
      sessionId: options?.session?.id,
      conversationId: options?.session?.conversationId
    };
    delete optionsToLog.session;


    this.sdk.logger.info('requiesting media to gain permissions', { options: optionsToLog });

    const stream = await this.startMedia(options);

    /**
     * if we get here, it means we have permissions
     * setPermissions will get called in startMedia for no permissions
     */
    if (requestingAudio) {
      this.setPermissions({ hasCameraPermissions: true });
    }

    if (requestingVideo) {
      this.setPermissions({ hasMicPermissions: true });
    }

    /* enumerate devices again because we may not have had labels the first time */
    await this.enumerateDevices();

    const mediaTracks = stream.getTracks();

    /* if perserveMedia, then return the media */
    if (preserveMedia) {
      this.sdk.logger.info('finished requesting media permissions. perserving media', {
        mediaTracks,
        options: optionsToLog
      });
      return stream;
    }

    this.sdk.logger.info('finished requesting media permissions. destroying media', {
      mediaTracks,
      options: optionsToLog
    });
    mediaTracks.forEach(t => t.stop());
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
   * This will return all active media tracks that 
   *  were created by the SDK
   */
  getAllActiveMediaTracks (): MediaStreamTrack[] {
    return this.allMediaTracksCreated.filter(track => track.readyState !== 'ended');
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
    const oldDevices = this.getDevices();
    const outputDevices = devices.filter(d => d.kind === 'audiooutput');
    const audioDevices = devices.filter(d => d.kind === 'audioinput');
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

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

  private setPermissions (newState: Partial<MediaState>) {
    this.setStateAndEmit(newState, 'permissions');
  }

  private setStateAndEmit (newState: Partial<MediaState>, eventType: keyof SdkMediaEvents) {
    /* set the new state */
    this.state = { ...this.state, ...newState };
    /* grab a copy of it to emit */
    const stateCopy = this.getState();
    /* emit on 'state' and the specific eventType */
    this.emit('state', { ...stateCopy, eventType });
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

  private doDevicesMatch (deviceList1: MediaDeviceInfo[], deviceList2: MediaDeviceInfo[]): boolean {
    if (deviceList1.length !== deviceList2.length) {
      return false;
    }

    for (const d1 of deviceList1) {
      const deviceExists = deviceList2.some(d2 =>
        d2.deviceId === d1.deviceId &&
        d2.groupId === d1.groupId &&
        d2.kind === d1.kind &&
        d2.label === d1.label
      );

      if (!deviceExists) {
        return false;
      }
    }

    return true;
  }

  private async handleDeviceChange () {
    this.sdk.logger.debug('devices changed');
    /* refresh devices in the cache with the new devices */
    await this.enumerateDevices();
    return this.sdk.sessionManager.validateOutgoingMediaTracks();
  };
}