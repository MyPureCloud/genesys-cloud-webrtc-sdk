import browserama from 'browserama';

import { PureCloudWebrtcSdk } from './client';
import { IMediaRequestOptions, IEnumeratedDevices } from './types/interfaces';
import { SdkErrorTypes } from './types/enums';
import { throwSdkError } from './utils';

const PC_AUDIO_EL_CLASS = '__pc-webrtc-inbound';
const DEFAULT_VIDEO_RESOLUTION = {
  height: {
    ideal: 2160
  },
  width: {
    ideal: 4096
  }
};

export let _hasTransceiverFunctionality: boolean | null = null;
let isListeningForDeviceChanges = false;

declare var window: {
  navigator: {
    mediaDevices: {
      getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    } & MediaDevices;
  } & Navigator;
} & Window;

/**
 * Get the screen media
 */
export const startDisplayMedia = function (): Promise<MediaStream> {
  const constraints = getScreenShareConstraints();

  if (hasGetDisplayMedia()) {
    return window.navigator.mediaDevices.getDisplayMedia(constraints);
  }

  return window.navigator.mediaDevices.getUserMedia(constraints);
};

export const startMedia = async function (sdk: PureCloudWebrtcSdk, opts: IMediaRequestOptions = { video: true, audio: true }): Promise<MediaStream> {
  const constraints: any = getStandardConstraints(opts);

  const conversationId = opts.session && opts.session.conversationId;

  // if we are requesting video
  if (opts.video || opts.video === null) {
    const videoDeviceId = await getValidDeviceId(sdk, 'videoinput', opts.video, conversationId);
    if (videoDeviceId) {
      sdk.logger.info('Requesting video with deviceId', { deviceId: videoDeviceId, conversationId });
      constraints.video.deviceId = {
        exact: videoDeviceId
      };
    }
  }

  // if we are requesting audio
  if (opts.audio || opts.audio === null) {
    const audioDeviceId = await getValidDeviceId(sdk, 'audioinput', opts.audio, conversationId);
    if (audioDeviceId) {
      sdk.logger.info('Requesting audio with deviceId', { deviceId: audioDeviceId, conversationId });
      constraints.audio.deviceId = {
        exact: audioDeviceId
      };
    }
  }

  return window.navigator.mediaDevices.getUserMedia(constraints);
};

/**
 * Select or create the `audio.__pc-webrtc-inbound` element
 */
export const createAudioMediaElement = function (): HTMLAudioElement {
  const existing = document.querySelector(`audio.${PC_AUDIO_EL_CLASS}`);
  if (existing) {
    return existing as HTMLAudioElement;
  }
  const audio = document.createElement('audio');
  audio.classList.add(PC_AUDIO_EL_CLASS);
  (audio.style as any) = 'visibility: hidden';

  document.body.append(audio);
  return audio;
};

/**
 * Attach an audio stream to the audio element
 * @param this must be called with a PureCloudWebrtcSdk as `this`
 * @param stream audio stream to attach
 */
export const attachAudioMedia = function (sdk: PureCloudWebrtcSdk, stream: MediaStream, audioElement?: HTMLAudioElement, conversationId?: string): HTMLAudioElement {
  if (!audioElement) {
    audioElement = createAudioMediaElement();
  }

  if (audioElement.srcObject) {
    sdk.logger.warn('Attaching media to an audio element that already has a srcObject. This can result is audio issues.', { conversationId });
  }

  audioElement.autoplay = true;
  audioElement.srcObject = stream;
  return audioElement;
};

export const checkHasTransceiverFunctionality = function (): boolean {
  if (_hasTransceiverFunctionality !== null) {
    return _hasTransceiverFunctionality;
  }

  try {
    // make sure we are capable to use tracks
    const dummyRtcPeerConnection = new RTCPeerConnection();
    // if this function exists we should be good
    _hasTransceiverFunctionality = !!dummyRtcPeerConnection.getTransceivers;
  } catch (err) {
    _hasTransceiverFunctionality = false;
  }
  return _hasTransceiverFunctionality;
};

export const checkAllTracksHaveEnded = function (stream: MediaStream): boolean {
  let allTracksHaveEnded = true;
  stream.getTracks().forEach(function (t) {
    allTracksHaveEnded = t.readyState === 'ended' && allTracksHaveEnded;
  });
  return allTracksHaveEnded;
};

export const createNewStreamWithTrack = function (track: MediaStreamTrack): MediaStream {
  const newStream = new MediaStream();
  newStream.addTrack(track);
  return newStream;
};

function hasGetDisplayMedia (): boolean {
  return !!(window.navigator && window.navigator.mediaDevices && window.navigator.mediaDevices.getDisplayMedia);
}

function getScreenShareConstraints (): MediaStreamConstraints {
  if (browserama.isChromeOrChromium) {
    if (hasGetDisplayMedia()) {
      return {
        audio: false,
        video: true
      };
    }
    return {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          maxWidth: window.screen.width,
          maxHeight: window.screen.height,
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

function getStandardConstraints (opts: IMediaRequestOptions): MediaStreamConstraints {
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
    const resolution = opts.videoResolution || DEFAULT_VIDEO_RESOLUTION;
    Object.assign(constraints.video, resolution);
  }

  return constraints;
}

let refreshDevices = true;
const enumeratedDevices: IEnumeratedDevices = {
  videoDevices: [],
  audioDevices: [],
  outputDevices: []
};

export const handleDeviceChange = function (this: PureCloudWebrtcSdk) {
  this.logger.debug('devices changed');
  refreshDevices = true;
  /* this function will enumerate devices again */
  return this.sessionManager.validateOutgoingMediaTracks();
};

export const stopListeningForDeviceChanges = function () {
  isListeningForDeviceChanges = false;
  navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
};

export async function getEnumeratedDevices (sdk: PureCloudWebrtcSdk, forceRefresh: boolean = false): Promise<IEnumeratedDevices> {
  if (!window.navigator.mediaDevices || !window.navigator.mediaDevices.enumerateDevices) {
    sdk.logger.warn('Unable to enumerate devices');
    enumeratedDevices.videoDevices = [];
    enumeratedDevices.audioDevices = [];
    enumeratedDevices.outputDevices = [];
    return enumeratedDevices;
  }

  if (!isListeningForDeviceChanges) {
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange.bind(sdk));
    isListeningForDeviceChanges = true;
  }

  /* if devices haven't changed, no forceRefresh, & we have permission - return the cache devices */
  if (!refreshDevices && !forceRefresh && hasDevicePermissions(enumeratedDevices)) {
    sdk.logger.debug('Returning cached enumerated devices', { devices: enumeratedDevices });
    return enumeratedDevices;
  }

  try {
    const oldDevices = { ...enumeratedDevices };
    enumeratedDevices.videoDevices = [];
    enumeratedDevices.audioDevices = [];
    enumeratedDevices.outputDevices = [];

    const newDevices = await window.navigator.mediaDevices.enumerateDevices();
    refreshDevices = false;

    const mappedDevices = mapOldToNewDevices(oldDevices, newDevices);
    mappedDevices.forEach(device => {
      if (device.kind === 'videoinput') {
        enumeratedDevices.videoDevices.push(device);
      } else if (device.kind === 'audioinput') {
        enumeratedDevices.audioDevices.push(device);
      } else /* if (device.kind === 'audiooutput') */ {
        enumeratedDevices.outputDevices.push(device);
      }
    });
  } catch (e) {
    throwSdkError.call(sdk, SdkErrorTypes.generic, 'Error enumerating devices', e);
  }

  sdk.logger.debug('Enumerated devices', { devices: enumeratedDevices });
  return enumeratedDevices;
}

function mapOldToNewDevices (oldEnumeratedDevices: IEnumeratedDevices | undefined, newDevices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  /* if we have labels on the new devices, no reason to do anything with them
    OR if we didn't have old labels, no need to do anything */
  if (hasDevicePermissions(newDevices) || !oldEnumeratedDevices || !hasDevicePermissions(oldEnumeratedDevices)) {
    return newDevices;
  }

  /* if we don't have labels, but we HAD labels - we can map the old labels to the new devices without labels (because FF) */
  const devices = [];
  const oldDevices = mapSdkEnumeratedDevicesToArray(oldEnumeratedDevices);
  for (const newDevice of newDevices) {
    const foundOldDevice = oldDevices.find(
      d => d.deviceId === newDevice.deviceId && d.groupId === newDevice.groupId && d.kind === newDevice.kind
    );
    if (foundOldDevice && foundOldDevice.label) {
      devices.push(foundOldDevice);
    } else {
      devices.push(newDevice);
    }
  }

  return devices;
}

function mapSdkEnumeratedDevicesToArray (devices: IEnumeratedDevices): MediaDeviceInfo[] {
  return [...devices.audioDevices, ...devices.videoDevices, ...devices.outputDevices];
}

function isSdkEnumeratedDevices (obj: IEnumeratedDevices | MediaDeviceInfo[]): obj is IEnumeratedDevices {
  return (obj as IEnumeratedDevices).videoDevices !== undefined;
}

function hasDevicePermissions (devices: MediaDeviceInfo[] | IEnumeratedDevices): boolean {
  const hasPermission = { video: true, audio: true };

  if (isSdkEnumeratedDevices(devices)) {
    devices = mapSdkEnumeratedDevicesToArray(devices);
  }

  for (const device of devices) {
    if (device.kind === 'videoinput' && hasPermission.video) {
      hasPermission.video = !!device.label;
    } else if (device.kind === 'audioinput' && hasPermission.audio) {
      hasPermission.audio = !!device.label;
    }
  }

  return hasPermission.video && hasPermission.audio;
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
 * @param sdk purecloud sdk instance
 * @param kind desired device kind
 * @param deviceId `deviceId` for specific device, `true` for sdk default device, or `null` for system default
 */
export async function getValidDeviceId (sdk: PureCloudWebrtcSdk, kind: MediaDeviceKind, deviceId: string | boolean | null, conversationId?: string): Promise<string> {
  const devices = await getEnumeratedDevices(sdk);

  let availableDevices: MediaDeviceInfo[];
  let sdkConfigDefault: string | null;
  let foundDevice: MediaDeviceInfo | undefined;

  if (kind === 'videoinput') {
    availableDevices = devices.videoDevices.slice();
    sdkConfigDefault = sdk._config.defaultVideoDeviceId;
  } else if (kind === 'audioinput') {
    availableDevices = devices.audioDevices.slice();
    sdkConfigDefault = sdk._config.defaultAudioDeviceId;
  } else {
    availableDevices = devices.outputDevices.slice();
    sdkConfigDefault = sdk._config.defaultOutputDeviceId;
  }

  // if a deviceId was passed in, try to use it
  if (typeof deviceId === 'string') {
    foundDevice = availableDevices.find((d: MediaDeviceInfo) => d.deviceId === deviceId);
  }

  // log if we didn't find the requested deviceId
  if (!foundDevice) {
    if (typeof deviceId === 'string') {
      sdk.logger.warn(`Unable to find requested ${kind} deviceId`, { deviceId, conversationId });
    }

    // then try to find the sdk default device (if it is not `null`)
    if (sdkConfigDefault !== null) {
      foundDevice = availableDevices.find((d: MediaDeviceInfo) => d.deviceId === sdkConfigDefault);
      // log if we couldn't find the sdk default device
      if (!foundDevice) {
        sdk.logger.warn(`Unable to find the sdk default ${kind} deviceId`, { deviceId: sdk._config.defaultAudioDeviceId, conversationId });
      }
    }
  }

  if (!foundDevice) {
    sdk.logger.info(`Using the system default ${kind} device`, { conversationId });

    /*
      SANITY: There is no way to request "default" output device, so
        we have to return the id of the first output device.
        For mic/camera, we just return `undefined` because gUM will
        automatically find the default device (the defaults are different
          between Chrome and FF)
    */
    if (kind === 'audiooutput') {
      foundDevice = availableDevices[0];
    }
  }

  return foundDevice ? foundDevice.deviceId : undefined;
}
