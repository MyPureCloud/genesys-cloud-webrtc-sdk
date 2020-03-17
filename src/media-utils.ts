import browserama from 'browserama';
import { PureCloudWebrtcSdk } from './client';
import { log } from './logging';
import { LogLevels, SdkErrorTypes } from './types/enums';
import { IMediaRequestOptions, IEnumeratedDevices } from './types/interfaces';
import { throwSdkError } from './utils';

const PC_AUDIO_EL_CLASS = '__pc-webrtc-inbound';
export let _hasTransceiverFunctionality: boolean | null = null;

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

  // if we are requesting video
  if (opts.video || opts.video === null) {
    const videoDeviceId = await getValidDeviceId(sdk, 'videoinput', opts.video);
    if (videoDeviceId) {
      log.call(sdk, LogLevels.info, 'Requesting video with deviceId', { deviceId: videoDeviceId });
      constraints.video.deviceId = {
        exact: videoDeviceId
      };
    } else {
      log.call(sdk, LogLevels.info, 'Unable to find a video deviceId. Using system defaults');
    }
  }

  // if we are requesting audio
  if (opts.audio || opts.audio === null) {
    const audioDeviceId = await getValidDeviceId(sdk, 'audioinput', opts.audio);

    if (audioDeviceId) {
      log.call(sdk, LogLevels.info, 'Requesting audio with deviceId', { deviceId: audioDeviceId });
      constraints.audio.deviceId = {
        exact: audioDeviceId
      };
    } else {
      log.call(sdk, LogLevels.info, 'Unable to find an audio deviceId. Using system defaults');
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
export const attachAudioMedia = function (sdk: PureCloudWebrtcSdk, stream: MediaStream, audioElement?: HTMLAudioElement): HTMLAudioElement {
  if (!audioElement) {
    audioElement = createAudioMediaElement();
  }

  if (audioElement.srcObject) {
    log.call(sdk, LogLevels.warn, 'Attaching media to an audio element that already has a srcObject. This can result is audio issues.');
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

  return constraints;
}

let refreshDevices = true;
const enumeratedDevices: IEnumeratedDevices = {
  videoDeviceIds: [],
  audioDeviceIds: [],
  outputDeviceIds: []
};

export async function getEnumeratedDevices (sdk: PureCloudWebrtcSdk): Promise<IEnumeratedDevices> {
  if (!window.navigator.mediaDevices || !window.navigator.mediaDevices.enumerateDevices) {
    log.call(sdk, LogLevels.warn, 'Unable to enumerate devices');
    enumeratedDevices.videoDeviceIds = [];
    enumeratedDevices.audioDeviceIds = [];
    enumeratedDevices.outputDeviceIds = [];
    return enumeratedDevices;
  }

  if (!window.navigator.mediaDevices.ondevicechange) {
    window.navigator.mediaDevices.ondevicechange = () => {
      log.call(sdk, LogLevels.debug, 'onDeviceChange fired');
      refreshDevices = true;
    };
  }

  // if devices haven't changed since last time we called this
  if (!refreshDevices) {
    log.call(sdk, LogLevels.debug, 'Returning cached enumerated devices', { devices: enumeratedDevices });
    return enumeratedDevices;
  }

  try {
    enumeratedDevices.videoDeviceIds = [];
    enumeratedDevices.audioDeviceIds = [];
    enumeratedDevices.outputDeviceIds = [];

    const devices = await window.navigator.mediaDevices.enumerateDevices();
    refreshDevices = false;
    devices.forEach(device => {
      if (device.kind === 'videoinput') {
        enumeratedDevices.videoDeviceIds.push(device.deviceId);
      } else if (device.kind === 'audioinput') {
        enumeratedDevices.audioDeviceIds.push(device.deviceId);
      } else /* if (device.kind === 'audiooutput') */ {
        enumeratedDevices.outputDeviceIds.push(device.deviceId);
      }
    });
  } catch (e) {
    throwSdkError.call(sdk, SdkErrorTypes.generic, 'Error enumerating devices', e);
  }

  return enumeratedDevices;
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
 * @param sdk purecloud sdk instance
 * @param kind desired device kind
 * @param deviceId `deviceId` for specific device, `true` for sdk default device, or `null` for system default
 */
export async function getValidDeviceId (sdk: PureCloudWebrtcSdk, kind: MediaDeviceKind, deviceId: string | boolean | null): Promise<undefined | string> {
  const devices = await getEnumeratedDevices(sdk);

  let availableDevices: string[];
  let sdkConfigDefault: string | null;
  let foundDeviceId: string | undefined;

  if (kind === 'videoinput') {
    availableDevices = devices.videoDeviceIds.slice();
    sdkConfigDefault = sdk._config.defaultVideoDeviceId;
  } else if (kind === 'audioinput') {
    availableDevices = devices.audioDeviceIds.slice();
    sdkConfigDefault = sdk._config.defaultAudioDeviceId;
  } else {
    availableDevices = devices.outputDeviceIds.slice();
    sdkConfigDefault = sdk._config.defaultOutputDeviceId;
  }

  // if a deviceId was passed in, try to use it
  if (typeof deviceId === 'string') {
    foundDeviceId = availableDevices.find((d: string) => d === deviceId);
  }

  // log if we didn't find the requested deviceId
  if (!foundDeviceId) {
    log.call(sdk, LogLevels.warn, `Unable to find requested ${kind} deviceId`, { deviceId });

    // then try to find the sdk default device (if it is not `null`)
    if (sdkConfigDefault !== null) {
      foundDeviceId = availableDevices.find((d: string) => d === sdkConfigDefault);
      // log if we couldn't find the sdk default device
      if (!foundDeviceId) {
        log.call(sdk, LogLevels.warn, `Unable to find the sdk default ${kind} deviceId`, { deviceId: sdk._config.defaultAudioDeviceId });
      }
    }
  }

  /* if we are requesting 'audiooutput' and haven't found a device yet,
    use the first output device in the list as it's the default. */
  if (!foundDeviceId && kind === 'audiooutput') {
    foundDeviceId = availableDevices[0];
    log.call(sdk, LogLevels.info, `Using the system default 'audiooutput' device`, { deviceId: foundDeviceId });
  }

  return foundDeviceId;
}
