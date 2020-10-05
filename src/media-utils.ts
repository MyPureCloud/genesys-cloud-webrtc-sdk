import browserama from 'browserama';

import { GenesysCloudWebrtcSdk } from './client';
import { IMediaRequestOptions, IEnumeratedDevices, IJingleSession } from './types/interfaces';
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
} & Window & typeof globalThis;

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

export const startMedia = async function (sdk: GenesysCloudWebrtcSdk, opts: IMediaRequestOptions = { video: true, audio: true }): Promise<MediaStream> {
  const constraints: any = getStandardConstraints(opts);

  const conversationId = opts.session?.conversationId;
  const sessionId = opts.session?.id;

  // if we are requesting video
  if (opts.video || opts.video === null) {
    const videoDeviceId = await getValidDeviceId(sdk, 'videoinput', opts.video, opts.session);
    if (videoDeviceId) {
      sdk.logger.info('Requesting video with deviceId', { deviceId: videoDeviceId, conversationId, sessionId });
      constraints.video.deviceId = {
        ideal: videoDeviceId
      };
    }
  }

  // if we are requesting audio
  if (opts.audio || opts.audio === null) {
    const audioDeviceId = await getValidDeviceId(sdk, 'audioinput', opts.audio, opts.session);
    if (audioDeviceId) {
      sdk.logger.info('Requesting audio with deviceId', { deviceId: audioDeviceId, conversationId, sessionId });
      constraints.audio.deviceId = {
        ideal: audioDeviceId
      };
    }
  }

  const loggingExtras = {
    constraints,
    opts,
    sessionId,
    conversationId,
    availableDevices: getCachedEnumeratedDevices()
  };

  /* if there was a session, we don't want to log it */
  delete loggingExtras.opts.session;

  /* log what we are about to request */
  sdk.logger.info('requesting getUserMedia', { ...loggingExtras });

  return window.navigator.mediaDevices.getUserMedia(constraints)
    .catch(e => {
      /* get the current devices (because they could have changed by the time we get here) */
      sdk.logger.error(e, { ...loggingExtras, availableDevices: getCachedEnumeratedDevices() });
      throw e;
    });
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
 * @param this must be called with a GenesysCloudWebrtcSdk as `this`
 * @param stream audio stream to attach
 */
export const attachAudioMedia = function (sdk: GenesysCloudWebrtcSdk, stream: MediaStream, audioElement?: HTMLAudioElement, conversationId?: string): HTMLAudioElement {
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
    constraints.video.frameRate = opts.videoFrameRate || { ideal: 30 };
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

export const handleDeviceChange = function (this: GenesysCloudWebrtcSdk) {
  this.logger.debug('devices changed');
  refreshDevices = true;
  /* this function will enumerate devices again */
  return this.sessionManager.validateOutgoingMediaTracks();
};

export const stopListeningForDeviceChanges = function () {
  isListeningForDeviceChanges = false;
  navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
};

/**
 * Look through the cached enumerated devices and match based on
 * the passed in track's `kind` and `label`
 * @param track media stream track with the label to search for
 */
export const findCachedDeviceByTrackLabel = (track?: MediaStreamTrack): MediaDeviceInfo | undefined => {
  if (!track?.kind) return;
  const availableDevices = getCachedEnumeratedDevices();
  const devicesToSearch = track.kind === 'video' ? availableDevices.videoDevices : availableDevices.audioDevices;
  return devicesToSearch.find(d => d.label === track.label);
};

/**
 * Look through the cached enumerated devices and match based on
 *  the passed in output deviceId
 * @param id output deviceId
 */
export const findCachedOutputDeviceById = (id?: string): MediaDeviceInfo | undefined => {
  return getCachedEnumeratedDevices().outputDevices.find(d => d.deviceId === id);
};

export type LogDevicesAction =
  /* devices used on session start */
  'sessionStarted' |
  /* when a function to update any type of media is called */
  'calledToChangeDevices' |
  /* right before media is updated */
  'changingDevices' |
  /* called after media has been updated successfully */
  'successfullyChangedDevices' |
  /* called right before unmuting video (since we have to spin up new media) */
  'unmutingVideo';

/**
 * Utility to log device changes. It will use the passed in `from` track _or_
 *  look up the currently used devices via the sender (based on labels) to see
 *  what device is currently in use. Then it will log out the device changing `to`
 *  as the new device.
 *
 * NOTE: if the system default is being used and then changes (which will force
 *  devices to be enumerated) the device will not be able to be looked up in the
 *  cached devices. So the caller will need to pass in the "old" system default(s)
 *  as `fromVideoTrack` and/or `fromAudioTrack`.
 *
 * @param sdk sdk instance
 * @param session session devices are changing for
 * @param action action taken
 * @param devicesChange devices changing to/from
 */
export function logDeviceChange (
  sdk: GenesysCloudWebrtcSdk,
  session: IJingleSession,
  action: LogDevicesAction,
  devicesChange: {
    toVideoTrack?: MediaStreamTrack;
    toAudioTrack?: MediaStreamTrack;
    fromVideoTrack?: MediaStreamTrack;
    fromAudioTrack?: MediaStreamTrack;
    requestedOutputDeviceId?: string;
    requestedVideoDeviceId?: string | boolean;
    requestedAudioDeviceId?: string | boolean;
    requestedNewMediaStream?: MediaStream;
  } = {}
): void {
  let currentVideoTrack: MediaStreamTrack;
  let currentAudioTrack: MediaStreamTrack;
  const currentOutputDeviceId: string = session._outputAudioElement?.sinkId;
  const screenShareTrackId = session._screenShareStream?.getVideoTracks()[0]?.id;
  const pcSenders = session.pc.getSenders().filter(s => s.track && s.track.id && s.track.id !== screenShareTrackId);

  /* grab the currect device being used */
  pcSenders.forEach(sender => {
    if (sender.track.kind === 'audio') {
      currentAudioTrack = sender.track;
    } else /* if (sender.track.kind === 'video') */ {
      currentVideoTrack = sender.track;
    }
  });

  const availableDevices = getCachedEnumeratedDevices();
  const details = {
    /* meta data */
    action,
    availableDevices,
    sessionId: session.id,
    conversationId: session.conversationId,

    /* the device being switched from and/or currently being used.
      if a track was passed in, we will assume the caller knows what it is doing
      and we will use that track for logging. Otherwise, we will look up the device */
    currentVideoDevice: devicesChange.fromVideoTrack ? { deviceId: undefined, groupId: undefined, label: devicesChange.fromVideoTrack.label }
      : findCachedDeviceByTrackLabel(currentVideoTrack),
    currentAudioDevice: devicesChange.fromAudioTrack ? { deviceId: undefined, groupId: undefined, label: devicesChange.fromAudioTrack.label }
      : findCachedDeviceByTrackLabel(currentAudioTrack),
    currentOutputDevice: findCachedOutputDeviceById(currentOutputDeviceId),

    /* current tracks */
    currentVideoTrack,
    currentAudioTrack,

    /* the device being switched to */
    newVideoDevice: findCachedDeviceByTrackLabel(devicesChange.toVideoTrack),
    newAudioDevice: findCachedDeviceByTrackLabel(devicesChange.toAudioTrack),
    newOutputDevice: findCachedOutputDeviceById(devicesChange.requestedOutputDeviceId),

    /* the track being switched to */
    newVideoTrack: devicesChange.toVideoTrack,
    newAudioTrack: devicesChange.toAudioTrack,

    /* potential media streamTracks we _want_ to switch to */
    requestedNewMediaStreamTracks: devicesChange.requestedNewMediaStream?.getTracks(),

    /* deviceIds requested */
    requestedOutputDeviceId: devicesChange.requestedOutputDeviceId,
    requestedVideoDeviceId: devicesChange.requestedVideoDeviceId,
    requestedAudioDeviceId: devicesChange.requestedAudioDeviceId,

    /* sdk defaults */
    sdkDefaultVideoDeviceId: sdk._config.defaultVideoDeviceId,
    sdkDefaultAudioDeviceId: sdk._config.defaultAudioDeviceId,
    sdkDefaultOutputDeviceId: sdk._config.defaultOutputDeviceId,

    /* other random stuff */
    currentAudioElementSinkId: currentOutputDeviceId,
    currentSessionSenderTracks: pcSenders.map(s => s.track),
    currentSessionReceiverTracks: session.pc.getReceivers().filter(s => s.track && s.track.id).map(s => s.track),

    /* other potentially useful information to log */
    sessionVideoMute: session.videoMuted,
    sessionAudioMute: session.audioMuted,
    hasDevicePermissions: hasDevicePermissions(availableDevices),
    hasOutputDeviceSupport: hasOutputDeviceSupport()
  };

  const keysToIgnoreIfBlank: Array<keyof typeof details> = [
    'newVideoTrack',
    'newAudioTrack',
    'requestedAudioDeviceId',
    'requestedVideoDeviceId',
    'requestedOutputDeviceId',
    'requestedNewMediaStreamTracks'
  ];

  /* trim off parts of logs that aren't needed if they are blank */
  Object.keys(details)
    .filter(k => keysToIgnoreIfBlank.includes(k as keyof typeof details))
    .forEach(k => {
      if (details[k] === undefined) {
        delete details[k];
      }
    });

  sdk.logger.info('media devices changing for session', details);
}

/**
 * Get the currently cached enumerated devices
 */
export function getCachedEnumeratedDevices (): IEnumeratedDevices {
  /* return a copy of cached devices */
  return {
    audioDevices: enumeratedDevices.audioDevices.slice(),
    videoDevices: enumeratedDevices.videoDevices.slice(),
    outputDevices: enumeratedDevices.outputDevices.slice()
  };
}

export async function getEnumeratedDevices (sdk: GenesysCloudWebrtcSdk, forceRefresh: boolean = false): Promise<IEnumeratedDevices> {
  if (!window.navigator.mediaDevices || !window.navigator.mediaDevices.enumerateDevices) {
    sdk.logger.warn('Unable to enumerate devices');
    enumeratedDevices.videoDevices = [];
    enumeratedDevices.audioDevices = [];
    enumeratedDevices.outputDevices = [];
    return getCachedEnumeratedDevices();
  }

  if (!isListeningForDeviceChanges) {
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange.bind(sdk));
    isListeningForDeviceChanges = true;
  }

  /* if devices haven't changed, no forceRefresh, & we have permissions - return the cache devices */
  if (!refreshDevices && !forceRefresh && hasDevicePermissions(enumeratedDevices)) {
    sdk.logger.debug('Returning cached enumerated devices', { devices: enumeratedDevices });
    return getCachedEnumeratedDevices();
  }

  try {
    const oldDevices = getCachedEnumeratedDevices();
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
  /* the "cache" was just updated with the new devices, this will make a copy */
  return getCachedEnumeratedDevices();
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
 * @param sdk genesyscloud sdk instance
 * @param kind desired device kind
 * @param deviceId `deviceId` for specific device, `true` for sdk default device, or `null` for system default
 */
export async function getValidDeviceId (
  sdk: GenesysCloudWebrtcSdk,
  kind: MediaDeviceKind,
  deviceId: string | boolean | null,
  ...sessions: IJingleSession[]
): Promise<string> {
  const devices = await getEnumeratedDevices(sdk);
  const sessionIds: Array<{ conversationId: string, sessionId: string }> =
    sessions
      .filter(s => s)
      .map(s => ({ sessionId: s.id, conversationId: s.conversationId }));

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
      sdk.logger.warn(`Unable to find requested ${kind} deviceId`, { deviceId, sessions: sessionIds });
    }

    // then try to find the sdk default device (if it is not `null`)
    if (sdkConfigDefault !== null) {
      foundDevice = availableDevices.find((d: MediaDeviceInfo) => d.deviceId === sdkConfigDefault);
      // log if we couldn't find the sdk default device
      if (!foundDevice) {
        sdk.logger.warn(`Unable to find the sdk default ${kind} deviceId`, { deviceId: sdk._config.defaultAudioDeviceId, sessions: sessionIds });
      }
    }
  }

  if (!foundDevice) {
    sdk.logger.info(`Using the system default ${kind} device`, { sessions: sessionIds });

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

export function hasOutputDeviceSupport (): boolean {
  return window.HTMLMediaElement.prototype.hasOwnProperty('setSinkId');
}
