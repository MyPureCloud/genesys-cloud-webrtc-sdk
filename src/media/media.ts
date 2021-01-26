import { EventEmitter } from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';
import { cloneDeep } from 'lodash';
import browserama from 'browserama';

import GenesysCloudWebrtcSdk from '../client';
import { createAndEmitSdkError } from '../utils';
import { SdkErrorTypes } from '../types/enums';
import {
  IExtendedMediaSession,
  IMediaRequestOptions,
  ISdkMediaState,
  SdkMediaEvents,
  SdkMediaEventTypes
} from '../types/interfaces';

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
  private state: ISdkMediaState;
  private audioTracksBeingMonitored: { [trackId: string]: any } = {};
  private allMediaTracksCreated = new Map<string, MediaStreamTrack>();

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
      hasOutputDeviceSupport: this.hasOutputDeviceSupport()
    };

    /* for testing's sake, moved additional logic into a separate function */
    this.initialize();
  }

  // ================================================================
  // Public Media Functions
  // ================================================================

  /**
   * Function to gain permissions for a given media type. This function should
   *  be called early after constructing the SDK and _before_ calling
   *  `sdk.media.startMedia()` to ensure permissions are granted.
   *
   * This function will call through to `startMedia` to get a `MediaStream`
   *  for the desired media permissions. That is the only surefire way to
   *  gain permissions across all browsers & platforms.
   *
   * It will also call through to `sdk.media.enumerateDevices()` to ensure
   *  all devices have been loaded after permissions have been granted.
   *
   * The media state will be updated with permissions and an event emitted
   *  on `sdk.media.on('permissions', evt)` with any outcomes
   *
   * An error will be thrown if permissions are not granted by either the browser
   *  or the OS (specifically for macOS). With the one exception of the microphone
   *  permission on the OS level. If the microphone permission has not been granted on
   *  the OS level, macOS will still allow the browser to attain an audio track for
   *  the microphone. However, the track will act as if it is in a "hardware mute"
   *  state. There is no API available for the browser to know the microphone is
   *  in a "hardware mute" state. To see if a microphone _may_ be in a "hardware mute"
   *  state, you can listen for microphone volume events on
   *  `sdk.media.on('audioTrackVolume', evt)` and add logic to respond to no volume
   *  coming through the microhpone.
   *
   * If `preserveMedia` is `true`, the `MediaStream` attained through the
   *  `startMedia()` will be returned to the caller. If not, the media will
   *  be destroyed and `undefined` returned.
   *
   * `options` can be any valid deviceId or other media options defined in
   *  `interface IMediaRequestOptions`. These options will be passed to
   *  the `startMedia()` call (which is used to gain permissions)
   *
   * Note #1: media permissions requests will always be retried (see `startMedia()`
   *   for more info). If using `preserveMedia = true`, be sure to check the
   *   returned media to ensure it is the desired media device (if requested).
   *
   * Note #2: the default option for the media type will be `true` (which is SDK default
   *  device). If a value of `false` or `undefined` is passed in, it will
   *  always use `true`. Any options for the other media type will be ignored.
   * Example:
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
   * @param mediaType media type to request permissions for (`'audio' | 'video'`)
   * @param preserveMedia flag to return media after permissions pass
   * @param options optional, advanced options to request media with.
   *
   * @returns a promise either containing a `MediaStream` or `undefined`
   *   depending on the value of `preserveMedia`
   */
  async requestMediaPermissions (
    mediaType: 'audio' | 'video',
    preserveMedia = false,
    options?: IMediaRequestOptions
  ): Promise<MediaStream | void> {
    const optionsCopy = (options && { ...options }) || {};
    const oppositeMediaType = mediaType === 'audio' ? 'video' : 'audio';
    const permissionsReqKey: keyof ISdkMediaState = mediaType === 'audio'
      ? 'micPermissionsRequested'
      : 'cameraPermissionsRequested';
    const permissionsKey: keyof ISdkMediaState = mediaType === 'audio'
      ? 'hasMicPermissions'
      : 'hasCameraPermissions';

    /* make sure the options are valid */
    if (optionsCopy[mediaType] === undefined || optionsCopy[mediaType] === false) {
      optionsCopy[mediaType] = true;
    }
    optionsCopy[oppositeMediaType] = false;

    /* delete the session off this before logging */
    const optionsToLog = {
      mediaType,
      preserveMedia,
      requestOptions: { ...optionsCopy, session: undefined },
      sessionId: options?.session?.id,
      conversationId: options?.session?.conversationId
    };

    /* we have to set that we have requested permissions to prevent an infinite loop with `startMedia()` */
    this.setPermissions({ [permissionsReqKey]: true });

    /* first load devices */
    await this.enumerateDevices();

    this.sdk.logger.info('requesting media to gain permissions', optionsToLog);

    const stream = await this.startMedia(optionsCopy);

    /**
     * if we get here, it means we have permissions
     * setPermissions will get called in startMedia for no permissions
     */
    this.setPermissions({ [permissionsKey]: true });

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
      ...optionsToLog
    });
    mediaTracks.forEach(t => t.stop());
  }

  /**
   * Call to enumerate available devices. This will update the
   *  cache of devices and emit events on `'state'` & `'devices'`
   *
   * If the devices returned from the browser are the same as the cached
   *  devices, a new event will _NOT_ emit. To force an emit pass in `true`.
   *
   * It is _highly_ recommended that `sdk.media.requestMediaPermissions('audio' | 'video')`
   *  be called at least once to ensure permissions are granted before loading devices.
   *  See `requestMediaPermissions()` for more details.
   *
   * Note: if media permissions have not been granted by the browser,
   *  enumerated devices will not return the full list of devices
   *  and/or the devices will not have ids/labels (varies per browser).
   *
   * @param forceEmit force an event to emit if the devices
   *  have not changed from the cached devices
   *
   * @returns a promise containing the devices enumerated
   *  from `navigator.mediaDevices.enumerateDevices()`
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
      oldDevices
    });
    const deviceListsMatched = this.doDeviceListsMatch(oldDevices, enumeratedDevices);

    /* if the devices changed or we want to force emit them */
    if (!deviceListsMatched || forceEmit) {
      this.sdk.logger.debug('enumerateDevices yielded the same devices, not emitting');
      this.setDevices(mappedDevices);
    }
    return mappedDevices;
  }

  /**
   * Create media with video and/or audio. See `interface IMediaRequestOptions`
   *  for more information about available options.
   *
   * It is _highly_ recommended that `sdk.media.requestMediaPermissions('audio' | 'video')`
   * be called with each desired media type _before_ using `startMedia`. This will ensure
   *  all media permissions have been granted before starting media. If `requestMediaPermissions()`
   *  has not been called, this function will call it with `preserveMedia = true` and use
   *  the returning media.
   *
   * `getUserMedia` is requested one media type at a time. If requesting both `audio`
   *  and `video`, `getUserMedia` will be called two times -- 1st with `audio` and 2nd
   *  with `video`. The two calls will be combined into a single `MediaStream` and
   *  returned to the caller. If one of the media types fail, execution of this
   *  function will stop and the error thrown (any successful media will be destroyed).
   *  This is in line with `getUserMedia`'s current behavior in the browser.
   *
   * If `retryOnFailure` is `true` (default), the SDK will have the following behavior:
   *  1. If the fail was due to a Permissions issue, it will _NOT_ retry
   *  2. For `video` only: some browsers/hardward configurations throw an error
   *      for invalid resolution requests. If `video` was requested with a
   *      `videoResolution` value (could be a SDK default), it will retry
   *      video with the same passed in value but with _no_ resolution.
   *  3. If a deviceId was requested and there was a failure, this will retry
   *      media with the SDK default deviceId for that media type.
   *  4. If the SDK default deviceId fails (or it didn't exist), then this
   *      will retry with system defaults and no other options (such as `deviceId`s,
   *      `videoFrameRate`, & `videoResolution`)
   *  5. If system defaults fails, it will throw the error and stop attempting
   *      to retry.
   *
   * Note: if using `retryOnFailure` it is recommended to check the media
   *  returned to ensure you received the desired device.
   *
   * Warning: if `sdk.media.requestPermissions(type)` has NOT been called before
   *  calling `startMedia`, `startMedia` will call `sdk.media.requestPermissions(type)`.
   *  If calling `startMedia` with both `audio` and `video` _before_ requesting permissions,
   *  `startMedia` will attempt to gain permissions for `audio` first and then `video` (because
   *  media permissions must be requested one at a time). If `audio` fails, it will
   *  not attempt to gain permissions for `video` – the error will stop execution.
   *
   * @param mediaReqOptions request video and/or audio with a default device or deviceId.
   *  Defaults to `{video: true, audio: true}`
   * @param retryOnFailure whether the sdk should retry on an error
   *
   * @returns a promise containing a `MediaStream` with the requested media
   */
  async startMedia (mediaReqOptions: IMediaRequestOptions = { video: true, audio: true }, retryOnFailure: boolean = true): Promise<MediaStream> {
    /* `getStandardConstraints` will set media type to `truthy` if `null` was passed in */
    const requestingVideo = mediaReqOptions.video || mediaReqOptions.video === null;
    const requestingAudio = mediaReqOptions.audio || mediaReqOptions.audio === null;
    const conversationId = mediaReqOptions.session?.conversationId;
    const sessionId = mediaReqOptions.session?.id;
    const {
      micPermissionsRequested,
      cameraPermissionsRequested
    } = this.getState();

    const loggingExtras = {
      mediaReqOptions: { ...mediaReqOptions, session: undefined },
      retryOnFailure,
      conversationId,
      sessionId,
      micPermissionsRequested,
      cameraPermissionsRequested
    };

    let mediaStream: MediaStream;

    this.sdk.logger.info('calling sdk.media.startMedia()', loggingExtras);

    /* if we aren't requesting any media, call through to gUM to throw an error */
    if (!requestingAudio && !requestingVideo) {
      /* 'none' will throw the error we want so make sure to set `retry` to `false` */
      return this.startSingleMedia('none', mediaReqOptions, false);
    }

    /**
     * `startMedia` will always request 1 media type at a time. If permissions have not been
     *  requested yet, it will call to `requestMediaPermissions()` (which will in turn call here)
     *  or `startMedia` will call through to `startSingleMedia`.
     * Either way, it will concat the media tracks into a single stream and return it.
     *
     * If `startMedia` was called with both media types and only 1 fails, stop() the successful
     *  media type and throw the error.
     */
    if (requestingAudio) {
      /* determine how to call through to startSingleMedia */
      if (!micPermissionsRequested) {
        this.sdk.logger.info(
          'attempted to get audio media before permissions checked. requesting audio permissions first and will preserve media response',
          loggingExtras
        );
        mediaStream = await this.requestMediaPermissions('audio', true, mediaReqOptions) as MediaStream;
        /* not catching this because we want it to throw error */
      } else {
        mediaStream = await this.startSingleMedia('audio', mediaReqOptions, retryOnFailure);
      }
    }

    if (requestingVideo) {
      try {
        let videoStream: MediaStream;
        if (!cameraPermissionsRequested) {
          this.sdk.logger.info(
            'attempted to get video media before permissions checked. requesting video permissions first and will preserve media response',
            loggingExtras
          );
          videoStream = await this.requestMediaPermissions('video', true, mediaReqOptions) as MediaStream;
        } else {
          videoStream = await this.startSingleMedia('video', mediaReqOptions, retryOnFailure);
        }

        if (!mediaStream) {
          mediaStream = videoStream;
        } else {
          videoStream.getTracks().forEach(t => mediaStream.addTrack(t));
        }
      } catch (error) {
        /* stop audio media if there was any */
        if (mediaStream) {
          mediaStream.getTracks().forEach(t => t.stop());
        }
        throw error;
      }
    }

    return mediaStream;
  }

  /**
   * Creates a `MediaStream` from the screen (this will prompt for user screen selection)
   *
   * @returns a promise containing a `MediaStream` with the requested screen media
   */
  async startDisplayMedia (): Promise<MediaStream> {
    const constraints = this.getScreenShareConstraints();
    const promise = this.hasGetDisplayMedia()
      ? window.navigator.mediaDevices.getDisplayMedia(constraints)
      : window.navigator.mediaDevices.getUserMedia(constraints);

    const stream = await promise.catch(e => {
      /* we want to emit errors on `sdk.on('sdkError')` */
      createAndEmitSdkError.call(this.sdk, SdkErrorTypes.media, e);
      throw e;
    });

    this.trackMedia(stream);
    return stream;
  }

  /**
   * Look for a valid deviceId in the cached media devices
   *  based on the passed in `deviceId`
   *
   * This will follow these steps looking for a device:
   *  1. If `deviceId` is a `string`, it will look for that device and
   *      return it if found
   *  2. If device could not be found _or_ `deviceId` was not a `string`,
   *      it will look for the sdk default device
   *  3. If device could not be found it will return `undefined`
   *
   * @param kind desired device kind
   * @param deviceId `deviceId` for specific device to look for, `true` for sdk default device, or `null` for system default
   * @param sessions any active sessions (used for logging)
   *
   * @returns a `string` if a valid deviceId was found, or `undefined` if
   *  no device could be found.
   */
  getValidDeviceId (
    kind: MediaDeviceKind,
    deviceId: string | boolean | null,
    ...sessions: IExtendedMediaSession[]
  ): string | undefined {
    const state = this.getState();
    const sessionInfos: Array<{ conversationId: string, sessionId: string }> =
      sessions
        .filter(s => s)
        .map(s => ({ sessionId: s.id, conversationId: s.conversationId }));

    let availableDevices: MediaDeviceInfo[];
    let sdkConfigDefaultDeviceId: string | null;
    let foundDevice: MediaDeviceInfo | undefined;

    if (kind === 'videoinput') {
      availableDevices = state.videoDevices.slice();
      sdkConfigDefaultDeviceId = this.sdk._config.defaults.videoDeviceId;
    } else if (kind === 'audioinput') {
      availableDevices = state.audioDevices.slice();
      sdkConfigDefaultDeviceId = this.sdk._config.defaults.audioDeviceId;
    } else /* if (kind === 'audiooutput') */ {
      availableDevices = state.outputDevices.slice();
      sdkConfigDefaultDeviceId = this.sdk._config.defaults.outputDeviceId;
    }

    /* if a deviceId was passed in, try to find it */
    if (typeof deviceId === 'string') {
      foundDevice = availableDevices.find((d: MediaDeviceInfo) => d.deviceId === deviceId);
    }

    if (!foundDevice) {
      /* log if we didn't find the requested deviceId */
      if (typeof deviceId === 'string') {
        this.sdk.logger.warn(`Unable to find requested deviceId`, { kind, deviceId, sessionInfos });
      }

      /* try to find the sdk default device (if it is not `null`) */
      if (sdkConfigDefaultDeviceId) {
        foundDevice = availableDevices.find((d: MediaDeviceInfo) => d.deviceId === sdkConfigDefaultDeviceId);
        /* log if we couldn't find the sdk default device */
        if (!foundDevice) {
          this.sdk.logger.warn(`Unable to find the sdk default deviceId`, {
            kind,
            deviceId: sdkConfigDefaultDeviceId,
            sessionInfos
          });
        }
      }
    }

    if (!foundDevice) {
      this.sdk.logger.info('Unable to find a valid deviceId', {
        kind,
        requestedDeviceId: deviceId,
        sdkConfigDefaultDeviceId,
        sessionInfos
      });
    }

    return foundDevice ? foundDevice.deviceId : undefined;
  }

  /**
   * Get a copy of the current media state
   *
   * @returns the current sdk media state
   */
  getState (): ISdkMediaState {
    return cloneDeep(this.state);
  }

  /**
   * Get the current _cached_ media devices
   *
   * @returns an array of all cached devices
   */
  getDevices (): MediaDeviceInfo[] {
    return this.getState().devices;
  }

  /**
   * Get the current _cached_ audio devices
   *
   * @returns an array of all cached audio devices
   */
  getAudioDevices (): MediaDeviceInfo[] {
    return this.getState().audioDevices;
  }

  /**
   * Get the current _cached_ video devices
   *
   * @returns an array of all cached video devices
   */
  getVideoDevices (): MediaDeviceInfo[] {
    return this.getState().videoDevices;
  }

  /**
   * Get the current _cached_ output devices
   *
   * @returns an array of all cached output devices
   */
  getOutputDevices (): MediaDeviceInfo[] {
    return this.getState().outputDevices;
  }

  /**
   * This will return all active media tracks that
   *  were created by the sdk
   *
   * @returns an array of all active media tracks
   *  created by the sdk
   */
  getAllActiveMediaTracks (): MediaStreamTrack[] {
    return Array.from(this.allMediaTracksCreated.values());
  }

  /**
   * Look through the cached devices and match based on
   *  the passed in track's `kind` and `label`.
   *
   * @param track `MediaStreamTrack` with the label to search for
   * @returns the found device or `undefined` if the
   *  device could not be found.
   */
  findCachedDeviceByTrackLabel (track?: MediaStreamTrack): MediaDeviceInfo | undefined {
    if (!track) return;
    return this.getDevices().find(d =>
      d.label === track.label && `${d.kind.substr(0, 5)}` === track.kind
    );
  }

  /**
   * Look through the cached output devices and match based on
   *  the passed in output deviceId.
   *
   * @param id output deviceId
   * @returns the found device or `undefined` if the
   *  device could not be found.
   */
  findCachedOutputDeviceById (id?: string): MediaDeviceInfo | undefined {
    return this.getState().outputDevices.find(d => d.deviceId === id);
  }

  /**
   * Determine if the passed in device exists
   *  in the cached devices
   *
   * @param device device to look for
   * @returns boolean whether the device was found
   */
  doesDeviceExistInCache (device?: MediaDeviceInfo): boolean {
    if (!device) return false;
    return this.getDevices().some(cachedDevice => this.compareDevices(device, cachedDevice));
  }

  /**
   * This will remove all media listeners, stop any existing media,
   *  and stop listening for device changes.
   *
   * WARNING: calling this effectively renders the SDK
   *  instance useless. A new instance will need to be
   *  created after this has been called.
   */
  destroy () {
    this.removeAllListeners();
    window.navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange.bind(this));
    this.allMediaTracksCreated.forEach(t => t.stop());
  }

  // ================================================================
  // Private Functions
  // ================================================================
  /**
   * loads devices and listens for devicechange events
   */
  private initialize () {
    /* tslint:disable-next-line:no-floating-promises */
    this.enumerateDevices();
    window.navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange.bind(this));
  }

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
      hasMic: !!audioDevices.length
    }, 'devices');
  }

  private setPermissions (newState: Partial<ISdkMediaState>) {
    this.setStateAndEmit(newState, 'permissions');
  }

  private setStateAndEmit (newState: Partial<ISdkMediaState>, eventType: SdkMediaEventTypes) {
    /* set the new state */
    this.state = { ...this.state, ...cloneDeep(newState) };
    /* grab a copy of it to emit */
    const stateCopy = this.getState();
    /* emit on 'state' and the specific eventType */
    this.emit('state', { ...stateCopy, eventType });
    this.emit(eventType, { ...stateCopy, eventType });
  }

  private monitorMicVolume (stream: MediaStream, track: MediaStreamTrack, sessionId?: string) {
    if (this.audioTracksBeingMonitored[track.id] || track.kind !== 'audio') {
      return;
    }

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
      const volumeSum = volumes.reduce((total, current) => total + current, 0);
      const averageVolume = volumeSum / volumes.length;
      this.emit('audioTrackVolume', { track, volume: averageVolume, sessionId, muted: !track.enabled || track.muted });
    };

    this.audioTracksBeingMonitored[track.id] = setInterval(volumeCallback, 100);
  }

  private clearAudioInputMonitor (trackId: string) {
    const intervalId = this.audioTracksBeingMonitored[trackId];
    if (!intervalId) {
      return;
    }

    clearInterval(intervalId);
    delete this.audioTracksBeingMonitored[trackId];
  }

  private hasGetDisplayMedia (): boolean {
    return !!(window.navigator?.mediaDevices?.getDisplayMedia);
  }

  private hasOutputDeviceSupport (): boolean {
    return window.HTMLMediaElement.prototype.hasOwnProperty('setSinkId');
  }

  /**
   * Build valid getUserMedia constraints for passed in SDK media
   *  request options. Behavior is as follows:
   *
   * - If media type (`audio|video`) is `undefined|false`, the media
   *    type will be set to `false`
   * - If media type is a `string`, it will set the media type
   *    deviceId as `exact` to the passed in string. Ex.
   *    `video: { deviceId: { exact: options.video } }`
   * - If media type is `true` _and_ there is an SDK default deviceId
   *    for that media type, it will set the deviceId to the SDK
   *    default.
   * - If media type is `null` or `true` with no SDK default, the
   *    system default will be requested by using a `truthy` value.
   *
   * Note: `videoResolution` and `videoFrameRate` will use the passed
   *  in value or SDK defaults, _unless_ `false` is passed in which
   *  will always override defaults and not use these properties at
   *  all in the gUM request.
   *
   * @param options media request options
   */
  private getStandardConstraints (options: IMediaRequestOptions): MediaStreamConstraints {
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

    /* `false|undefined` means don't request */
    if (options.audio === false || options.audio === undefined) {
      constraints.audio = false;
    } else if (typeof options.audio === 'string') {
      constraints.audio.deviceId = { exact: options.audio };
    } else if (options.audio === true && typeof this.sdk._config.defaults.audioDeviceId === 'string') {
      constraints.audio.deviceId = { exact: this.sdk._config.defaults.audioDeviceId };
    } /* any other truthy value is system default */

    /* `false|undefined` means don't request */
    if (options.video === false || options.video === undefined) {
      constraints.video = false;
    } else if (typeof options.video === 'string') {
      constraints.video.deviceId = { exact: options.video };
    } else if (options.video === true && typeof this.sdk._config.defaults.videoDeviceId === 'string') {
      constraints.video.deviceId = { exact: this.sdk._config.defaults.videoDeviceId };
    }  /* any other truthy value is system default */

    /* video resolution and frameRate */
    if (constraints.video) {
      /* `false` will not use any frameRate (even SDK default) */
      if (options.videoFrameRate !== false) {
        constraints.video.frameRate = options.videoFrameRate || { ideal: 30 };
      }
      /* `false` will not use any videoResolution (even SDK default) */
      if (options.videoResolution !== false) {
        const resolution = options.videoResolution || this.sdk._config.defaults.videoResolution;
        Object.assign(constraints.video, resolution);
      }
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

  private doDeviceListsMatch (deviceList1: MediaDeviceInfo[], deviceList2: MediaDeviceInfo[]): boolean {
    if (deviceList1.length !== deviceList2.length) {
      return false;
    }

    for (const d1 of deviceList1) {
      const deviceExists = deviceList2.some(d2 => this.compareDevices(d1, d2));

      if (!deviceExists) {
        return false;
      }
    }

    return true;
  }

  /**
   * Compare the two devices to see if they are the same device.
   * @param d1 first device
   * @param d2 second device
   */
  private compareDevices (d1: MediaDeviceInfo, d2: MediaDeviceInfo): boolean {
    return (
      d2.deviceId === d1.deviceId &&
      d2.groupId === d1.groupId &&
      d2.kind === d1.kind &&
      d2.label === d1.label
    );
  }
  private async handleDeviceChange () {
    this.sdk.logger.debug('devices changed');
    /* refresh devices in the cache with the new devices */
    await this.enumerateDevices();
    return this.sdk.sessionManager.validateOutgoingMediaTracks();
  }

  /**
   * Left finsihing this function. Here is what we talked about:
   *
   * startMedia will always request 1 media type at a time. If permissions have not been
   *  requested yet, it will call to `requestMediaPermissions()` (which will in turn call here)
   *  or it will call through to here (startSingleMedia).
   * Either way, it will concat the media tracks into a single stream and return it.
   *
   * If `startMedia` was called with both media types and only 1 fails, stop() the successful
   *  media type and throw the error.
   *
   * `startSingleMedia` needs to implement retry attempts in this order:
   *  - failed for permissions, throw (don't retry)
   *  - if retry is off, throw
   *  - failed for deviceId not found, try sdk default
   *  - sdk deviceId not found (or there was no default), try system default
   *  - if all those failed _or_ retry was turned off, throw
   */
  /**
   * This function will request gUM one media type at a time. It has the
   *  following behavior:
   *  * determine the exact media constraints for gUM
   *  * set the opposite media type to `false` (ensuring
   *      only one media type is requested)
   *  * request gUM
   *
   * It will handle retries in the following pattern:
   *  * permissions errors are not retried
   *  * if retryOnFailure is `false`, it will not retry
   *  * on select video errors for unacceptable video resolutions
   *      it will retry without resolutions
   *  * on all other it will retry the media type with:
   *    * sdk default deviceId (if present)
   *    * system default deviceId
   *  * if all retry attempts were exhausted, it throws
   *      the last error received
   *
   * @param mediaType media type of request from gUM
   * @param mediaRequestOptions sdk media request options
   * @param retryOnFailure attempt to retry on gUM failure
   */
  private async startSingleMedia (
    mediaType: 'audio' | 'video' | 'none',
    mediaRequestOptions: IMediaRequestOptions,
    retryOnFailure: boolean = true
  ): Promise<MediaStream> {
    const reqOptionsCopy = { ...mediaRequestOptions };
    const conversationId = reqOptionsCopy.session?.conversationId;
    const sessionId = reqOptionsCopy.session?.id;

    const requestingAudio = mediaType === 'audio';
    const requestingVideo = mediaType === 'video';

    const getCurrentSdkDefault = () => requestingAudio
      ? this.sdk._config.defaults.audioDeviceId
      : requestingVideo
        ? this.sdk._config.defaults.videoDeviceId
        : undefined;

    let sdkDefaultDeviceId = getCurrentSdkDefault();

    const constraints: MediaStreamConstraints = this.getStandardConstraints(reqOptionsCopy);

    /* make sure we are only requesting one type of media */
    if (requestingAudio) { constraints.video = false; }
    if (requestingVideo) { constraints.audio = false; }

    /* if this value is not a boolean, use the sdk config's value */
    if (typeof reqOptionsCopy.monitorMicVolume !== 'boolean') {
      reqOptionsCopy.monitorMicVolume = this.sdk._config.defaults.monitorMicVolume;
    }

    /* utility to get current logging options (to ensure devices & permissions are current) */
    const getLoggingExtras = () => {
      const state = this.getState();
      return {
        mediaRequestOptions: { ...reqOptionsCopy, session: undefined },
        retryOnFailure,
        mediaType,
        constraints,
        sessionId,
        conversationId,
        sdkDefaultDeviceId: getCurrentSdkDefault(),
        availableDevices: this.getDevices(),
        permissions: {
          micPermissionsRequested: state.micPermissionsRequested,
          cameraPermissionsRequested: state.cameraPermissionsRequested,
          hasMicPermissions: state.hasMicPermissions,
          hasCameraPermissions: state.hasCameraPermissions
        }
      };
    };

    this.sdk.logger.info('requesting getUserMedia', getLoggingExtras());

    try {
      const stream = await window.navigator.mediaDevices.getUserMedia(constraints);
      this.trackMedia(stream, reqOptionsCopy.monitorMicVolume, sessionId);
      this.sdk.logger.info('returning media from getUserMedia', {
        ...getLoggingExtras(),
        mediaTracks: stream.getTracks()
      });

      return stream;
    } catch (e) {
      /* refetch the sdk default because it could have changed by the time we get here */
      sdkDefaultDeviceId = getCurrentSdkDefault();

      /* PERMISSIONS ERRORS */
      if (this.isPermissionsError(e)) {
        const permissionsKey: keyof ISdkMediaState = requestingAudio
          ? 'hasMicPermissions'
          : 'hasCameraPermissions';

        const reqPermsKey: keyof ISdkMediaState = requestingAudio
          ? 'micPermissionsRequested'
          : 'cameraPermissionsRequested';

        /* set the requested media type permission to `false` */
        this.setPermissions({ [permissionsKey]: false, [reqPermsKey]: true });

        this.sdk.logger.warn('Permission was denied for media type. Setting sdk state', {
          ...getLoggingExtras(),
          error: e
        });
        /* we aren't handling this error because we want Permissions errors to throw */
      } else if (
        /* NOTE: we don't have to check media type here because the error message lists 'video' */
        /* FF throws this error for cameras connected through a dock.. sometimes */
        e.name === 'AbortError' && e.message === 'Starting video failed' &&
        /* make sure we are requesting video and there is a resolution */
        constraints.video && reqOptionsCopy.videoResolution &&
        /* make sure we have retry enabled */
        retryOnFailure
      ) {
        /* try without video resoution (FF and docks can cause this resolution error) */
        const newOptions = { ...reqOptionsCopy };
        newOptions.videoResolution = false; // this will ensure SDK defaults aren't used
        this.sdk.logger.warn('starting video was aborted. trying again without a video resolution constraint', {
          ...getLoggingExtras(),
          error: e,
          options: { ...newOptions, session: undefined }
        });
        return this.startSingleMedia('video', newOptions, true);
      } else if (retryOnFailure) {
        const newOptions = { ...reqOptionsCopy };
        let newRetryOnFailure = true;

        /* if requesting specific deviceId, try again with sdk default */
        if (
          /* if we were requesting a specific deviceId */
          typeof reqOptionsCopy[mediaType] === 'string' &&
          /* we have a valid sdk default */
          sdkDefaultDeviceId &&
          /* the sdk default device does not match the requested device */
          sdkDefaultDeviceId !== reqOptionsCopy[mediaType]
        ) {
          /* we will try with the sdk defaults */
          newOptions[mediaType] = sdkDefaultDeviceId; /* sdk default */
          newRetryOnFailure = true;
        } else if (reqOptionsCopy[mediaType] !== null) {
          /* try with the system defaults, do not retry if this fails */
          newOptions[mediaType] = null; /* system default */
          newRetryOnFailure = false;
        } else {
          newOptions[mediaType] = false; /* placeholder to indicate system default already attempted */
        }

        /* if it was video, we don't want resolution and only default frameRate (or none if that was requested) */
        if (requestingVideo) {
          newOptions.videoResolution = false;
          newOptions.videoFrameRate = newOptions.videoFrameRate === false
            ? false : undefined; /* `undefined` will use SDK default of `ideal: 30` */ // here
        }

        /* this means we still have valid retry paramters */
        if (newOptions[mediaType] !== false) {
          this.sdk.logger.warn('starting media failed. attempting retry with different mediaRequestOptions', {
            ...getLoggingExtras(),
            error: e,
            retryOnFailure: newRetryOnFailure,
            mediaRequestOptions: { ...newOptions, session: undefined }
          });

          return this.startSingleMedia(mediaType, newOptions, newRetryOnFailure);
        }

        /* if `newOptions[mediaType] !== false`, we've already retied with system default. we want to throw the error */
        this.sdk.logger.warn('starting media failed. no valid retry parameters available', {
          ...getLoggingExtras(),
          error: e,
          mediaRequestOptions: { ...newOptions, session: undefined }
        });
      }

      this.sdk.logger.error('error requesting getUserMedia from the sdk', {
        error: e,
        ...getLoggingExtras()
      });

      /* only want to emit the error. still want to throw the original error from gUM */
      createAndEmitSdkError.call(this.sdk, SdkErrorTypes.media, e, {
        constraints,
        requestedOptions: { ...mediaRequestOptions, session: undefined, sessionId, conversationId }
      });

      /* throw the original error */
      throw e;
    }
  }

  private trackMedia (stream: MediaStream, monitorAudio: boolean = false, sessionId?: string): void {
    stream.getTracks().forEach(track => {
      this.allMediaTracksCreated.set(track.id, track);

      if (track.kind === 'audio' && monitorAudio) {
        this.monitorMicVolume(stream, track, sessionId);
      }

      const stopTrack = track.stop.bind(track);
      const remove = () => {
        this.allMediaTracksCreated.delete(track.id);
        this.clearAudioInputMonitor(track.id);
      };

      track.stop = () => {
        this.sdk.logger.debug('stopping track from track.stop()', track);
        remove();
        stopTrack();
      };
      track.addEventListener('ended', _evt => {
        this.sdk.logger.debug('stopping track from track.onended', track);
        remove();
      });
    });
  }

  private isPermissionsError (error: Error): boolean {
    return (
      /* User denies browser permissions prompt */
      error.name === 'NotAllowedError' ||
      /* OS permissions error in chrome (no error is thrown for not having mic OS permissions) */
      (error.name === 'DOMException' && error.message === 'Could not start video source') ||
      /* OS permissions error in FF */
      (error.name === 'NotFoundError' && error.message === 'The object can not be found here.')
    );
  }
}
