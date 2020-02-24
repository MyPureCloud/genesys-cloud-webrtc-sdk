import browserama from 'browserama';
import { PureCloudWebrtcSdk } from './client';
import { log } from './logging';
import { LogLevels, SdkErrorTypes } from './types/enums';
import { IMediaRequestOptions, IEnumeratedDevices, ISdkConfig, KeyFrom } from './types/interfaces';
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
  if (opts.video) {
    const videoDeviceId = await getDeviceByKindAndId(sdk, 'videoinput', opts.video);

    if (videoDeviceId) {
      log.call(sdk, LogLevels.info, 'Requesting video with deviceId', { deviceId: videoDeviceId });
      constraints.video.deviceId = {
        exact: videoDeviceId
      }
    } else {
      log.call(sdk, LogLevels.info, 'Unable to find a video deviceId. Using system defaults');
    }
  }

  // if we are requesting audio
  if (opts.audio) {
    const audioDeviceId = await getDeviceByKindAndId(sdk, 'audioinput', opts.audio);

    if (audioDeviceId) {
      log.call(sdk, LogLevels.info, 'Requesting audio with deviceId', { deviceId: audioDeviceId });
      constraints.audio.deviceId = {
        exact: audioDeviceId
      }
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

  if (!opts.video) {
    constraints.video = false;
  }

  if (!opts.audio) {
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

async function getEnumeratedDevices (sdk: PureCloudWebrtcSdk): Promise<IEnumeratedDevices> {
  if (!window.navigator.mediaDevices || !window.navigator.mediaDevices.enumerateDevices) {
    log.call(sdk, LogLevels.warn, 'Unable to enumerate devices');
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
      } else if (device.kind === 'audiooutput') {
        enumeratedDevices.outputDeviceIds.push(device.deviceId);
      }
    });
  } catch (e) {
    throwSdkError.call(sdk, SdkErrorTypes.generic, 'Error enumerating devices', e)
  }

  return enumeratedDevices;
}

export async function getDeviceByKindAndId (sdk: PureCloudWebrtcSdk, kind: MediaDeviceKind, deviceId: boolean | string): Promise<string | undefined> {

  if (deviceId === false) {
    return;
  }

  const devices = await getEnumeratedDevices(sdk);

  const enumProp: KeyFrom<IEnumeratedDevices, 'videoDeviceIds' | 'audioDeviceIds' | 'outputDeviceIds'> =
    kind === 'videoinput'
      ? 'videoDeviceIds'
      : kind === 'audioinput'
        ? 'audioDeviceIds'
        : 'outputDeviceIds';

  const configProp: KeyFrom<ISdkConfig, 'defaultVideoDeviceId' | 'defaultAudioDeviceId' | 'defaultOutputDeviceId'> =
    kind === 'videoinput'
      ? 'defaultVideoDeviceId'
      : kind === 'audioinput'
        ? 'defaultAudioDeviceId'
        : 'defaultOutputDeviceId';

  let foundDeviceId: string | undefined;

  // if a deviceId was passed in, try to use it
  if (typeof deviceId === 'string') {
    foundDeviceId = devices[enumProp].find((d: string) => d === deviceId);

    // log if we didn't find the requested deviceId
    if (!foundDeviceId) {
      log.call(sdk, LogLevels.warn, `Unable to find requested ${kind} deviceId`, { deviceId });
    }
  }

  // if we don't have a deviceId, look up the sdk default
  if (!foundDeviceId) {
    foundDeviceId = devices[enumProp].find((d: string) => d === sdk._config[configProp]);

    // if we don't have the deviceId just use system default
    if (!foundDeviceId) {
      log.call(sdk, LogLevels.warn, `Unable to find the sdk default ${kind} deviceId`, { deviceId: sdk._config.defaultAudioDeviceId });
    }
  }

  return foundDeviceId;
}
