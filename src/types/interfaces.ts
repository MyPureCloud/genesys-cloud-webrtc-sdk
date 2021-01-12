import { LogLevels, SessionTypes, JingleReasons } from './enums';
import { GenesysCloudMediaSession } from 'genesys-cloud-streaming-client';
import { SdkError } from '../utils';
import { JingleReason } from 'stanza/protocol';

// extend the emittable events
declare module 'genesys-cloud-streaming-client' {
  export interface SessionEvents {
    participantsUpdate: IParticipantsUpdate;
    activeVideoParticipantsUpdate: IOnScreenParticipantsUpdate;
    speakersUpdate: ISpeakersUpdate;
    incomingMedia: void;
    pinnedParticipant: { participantId: string | null };
  }
}

export type KeyFrom<T extends { [key: string]: any }, key extends keyof T> = key;

/**
 * SDK configuration options for construction a new instance
 */
export interface ISdkConfig {
  /** 
   * Domain to use. 
   * 
   * Optional: default is `mypurecloud.com`. 
   * 
   * Available Options: 
   * ``` ts
   *  'mypurecloud.com',
   *  'mypurecloud.com.au',
   *  'mypurecloud.jp',
   *  'mypurecloud.de',
   *  'mypurecloud.ie',
   *  'usw2.pure.cloud',
   *  'cac1.pure.cloud',
   *  'euw2.pure.cloud',
   *  'apne2.pure.cloud'
   * ```
   */
  environment?: string;

  /** 
   * Access token received from authentication. 
   *  Required for authenticated users (aka agent). 
   */
  accessToken?: string;

  /** 
   * Organization ID (aka the GUID).
   *  Required for unauthenticated users (aka guest).
   */
  organizationId?: string;

  /** 
   * WebSocket Host. 
   * Optional: defaults to `wss://streaming.{environment}` 
   */
  wsHost?: string;

  /** 
   * Auto connect softphone sessions
   * Optional: default `true`
   * 
   * Note: This is required to be true for guest screen share
   */
  autoConnectSessions?: boolean;

  /** 
   * Disable auto answering softphone calls. By default softphone
   *  calls will be auth answered unless this is set to `true`
   *  
   * Optional: default `false`
   */
  disableAutoAnswer?: boolean;

  /** 
   * Desired log level. 
   * Available options: 
   * ``` ts
   *  type LogLevels = 'log' | 'debug' | 'info' | 'warn' | 'error'
   * ```
   * 
   * Optional: defaults to `'info'` 
   */
  logLevel?: LogLevels;

  /** 
   * Logger to use. Must implement the `ILogger` interface. 
   * ``` ts
   * interface ILogger {
   *    log (message: string | Error, details?: any, skipServer?: boolean): void;
   *    debug (message: string | Error, details?: any, skipServer?: boolean): void;
   *    info (message: string | Error, details?: any, skipServer?: boolean): void;
   *    warn (message: string | Error, details?: any, skipServer?: boolean): void;
   *    error (message: string | Error, details?: any, skipServer?: boolean): void;
   * }
   * ```
   * 
   * Defaults to [GenesysCloudClientLogger](https://github.com/purecloudlabs/genesys-cloud-client-logger)
   *  which sends logs to sumo (unless `optOutOfTelemetry` is `true`) 
   *  and outputs them in the console.
   */
  logger?: ILogger;

  /** 
   * Opt out of sending logs to sumo. Logs are only sent to sumo 
   *  if a custom logger is _not_ provided. The default logger will
   *  send logs to sumo unless this option is `true`
   * 
   * Optional: default `false`
   */
  optOutOfTelemetry?: boolean;

  /** 
   * Allowed session types the sdk instance should handle.
   *  Only session types listed here will be handled. 
   * Available options passed in as an array:
   * ``` ts
   * enum SessionTypes {
   *    softphone = 'softphone',
   *    collaborateVideo = 'collaborateVideo',
   *    acdScreenShare = 'screenShare'
   * }
   * ```
   * 
   * example: 
   * ``` ts
   * import { SessionTypes } from 'genesys-cloud-webrtc-sdk/dist/src/types/enums';
   * 
   * new GenesysCloudWebrtcSdk({
   *    allowedSessionTypes: [SessionTypes.collaborateVideo, SessionTypes.acdScreenShare],
   *    // other config options
   * });
   * ```
   *
   * Optional: defaults to all session types.
   */
  allowedSessionTypes?: SessionTypes[];

  /** media related configuration */
  media?: {

    /**
     * When `true` all audio tracks created via the SDK 
     *  will have their volumes monitored and emited on
     *  `sdk.media.on('audioTrackVolume', evt)`. 
     *  See `sdk.media` events for more details. 
     * Optional: defaults to `false`
     */
    monitorMicVolume?: boolean;
    // TODO: should we add a `disableMediaRetry` for hail mary attempts when media fails? 
  };

  /** defaults for various media related functionality */
  defaults?: {

    /**
     * A default audio stream to accept softphone sessions with
     *  if no audio stream was used when accepting the session
     *  (ie: `sdk.acceptSession({ id: 'session-id', mediaStream })`)
     * 
     * Optional: no default
     */
    audioStream?: MediaStream;

    /**
     * HTML Audio Element to attach incoming audio streamsto. 
     *  Default: the sdk will create one and place it 
     *    in the DOM
     * 
     * Optional: no default
     */
    audioElement?: HTMLAudioElement;

    /**
     * HTML Video Element to attach incoming video streams to. 
     *  A video element is required for accepting incoming video
     *  calls. If no video element is passed into `sdk.acceptSession()`, 
     *  this default element will be used. 
     * 
     * Optional: no default
     */
    videoElement?: HTMLVideoElement;

    /**
     * Video resolution to default to when requesting 
     *  video media. 
     * 
     * Note: if the resolution causes getUserMedia to fail
     *  (which can happen sometimes in some browsers), the 
     *  SDK will retry _without_ the resolution request. 
     *  This means this setting may or may not be used if 
     *  depending on the browser. 
     * 
     * Optional: no default
     */
    videoResolution?: {
      width: ConstrainULong,
      height: ConstrainULong
    };

    /**
     * Default video device ID to use when starting camera media. 
     *  - `string` to request media for device
     *  - `null | falsey` to request media system default device
     * 
     * Optional: defaults to `null`
     */
    videoDeviceId?: string | null;

    /**
     * Default audio device ID to use when starting microphone media. 
     *  - `string` to request media for device
     *  - `null | falsey` to request media system default device
     * 
     * Optional: defaults to `null`
     */
    audioDeviceId?: string | null;

    /**
     * Default output device ID to use when starting camera media. 
     *  - `string` ID for output media device to use
     *  - `null | falsey` to request media system default device
     *  
     * Note: Not all browsers support output devices. System default
     *  for output devices is always an empty string (ex: `''`)
     * 
     * Optional: defaults to `null`
     */
    outputDeviceId?: string | null;
  }
}

/**
 * if defaultAudioElement is provided, it will be used to play incoming call audio *unless* it already has a source in which case the sdk will create a temporary audio element for the call.
 * defaultAudioStream is the outgoing mediaStream for softphone calls. If not provided, one will be created during `acceptSession`. the sdk will not clean up provided streams
 */

export interface IMediaRequestOptions {
  /**
   * Desired video constraint
   * - `string` to request media from device
   * - `true` to request media from sdk default device
   * - `null` to request media from system default device
   * - `false` | `undefined` to not request/update this type of media
   */
  video?: boolean | string | null;

  /**
   * Video resolution to request from getUserMedia. 
   * 
   * Default is SDK configured resolution. `false` will 
   *  explicitly not use the sdk default
   */
  videoResolution?: {
    width: ConstrainULong,
    height: ConstrainULong
  } | false;

  /**
   * Video frame rate to request from getUserMedia. It 
   *  will use the browser `ideal` property for video
   *  constraints. Example, if is set `videoFrameRate: 45`
   *  then the translated constraint to `getUserMedia` will
   *  be `video: { frameRate: { ideal: 45 } }`
   * 
   * Defaults to 30. `false` will explicitly not any 
   *  frameRate
   */
  videoFrameRate?: ConstrainDouble | false;

  /**
   * Desired audio constraint
   * - `string` to request media from device
   * - `true` to request media from sdk default device
   * - `null` to request media from system default device
   * - `false` | `undefined` to not request/update this type of media
   */
  audio?: boolean | string | null;

  /**
   * This is just to be able to associate logs to a specific session. 
   *  This is primarily for internal use and not generally needed.
   */
  session?: IExtendedMediaSession;

  /**
   * Emit volume change events for audio tracks. This
   *  will override the SDK default configuration
   *  of `monitorMicVolume`.
   * 
   * Default is SDK config's `monitorMicVolume` value
   */
  monitorMicVolume?: boolean;
}

export interface IOutgoingMediaDeviceIds {
  /** `string` for video camera, `true` for sdk default camera, or `null` for system default */
  videoDeviceId?: string | boolean | null;
  /** `string` for microphone, `true` for sdk default microphone, or `null` for system default */
  audioDeviceId?: string | boolean | null;
}

export interface IMediaDeviceIds {
  /** `string` for video camera, `true` for sdk default camera, or `null` for system default */
  videoDeviceId?: string | null;
  /** `string` for microphone, `true` for sdk default microphone, or `null` for system default */
  audioDeviceId?: string | null;
  /** `deviceId` for audio output, `true` for sdk default output, or `null` for system default */
  outputDeviceId?: string | null;
}

export interface IUpdateOutgoingMedia {
  /** session id (this _OR_ `session` is required) */
  sessionId?: string;
  /** session (this _OR_ `sessionId` is required) */
  session?: IExtendedMediaSession;
  /* stream with desired media */
  stream?: MediaStream;
  /** `string` for video camera, `true` for sdk default camera, or `null` for system default */
  videoDeviceId?: string | boolean | null;
  /** `string` for microphone, `true` for sdk default microphone, or `null` for system default */
  audioDeviceId?: string | boolean | null;
}

/**
 * Basics, not an exhaustive list
 */
export interface IPersonDetails {
  id: string;
  name: string;
  chat: {
    jabberId: string;
  };
}

export interface ILogger {
  log (message: string | Error, details?: any, skipServer?: boolean): void;
  debug (message: string | Error, details?: any, skipServer?: boolean): void;
  info (message: string | Error, details?: any, skipServer?: boolean): void;
  warn (message: string | Error, details?: any, skipServer?: boolean): void;
  error (message: string | Error, details?: any, skipServer?: boolean): void;
}

export interface ICustomerData {
  conversation: { id: string };
  sourceCommunicationId: string;
  jwt: string;
}

export interface IPendingSession {
  id: string;
  autoAnswer: boolean;
  address: string;
  conversationId: string;
  sessionType: SessionTypes;
  originalRoomJid: string;
  fromUserId?: string;
}

export interface ISessionInfo {
  sessionId: string;
  autoAnswer: boolean;
  fromJid: string;
  conversationId: string;
  originalRoomJid: string;
  fromUserId?: string;
}

export interface IAcceptSessionRequest extends IOutgoingMediaDeviceIds {
  id: string;
  mediaStream?: MediaStream;
  audioElement?: HTMLAudioElement;
  videoElement?: HTMLVideoElement;
}

export interface IEndSessionRequest {
  id?: string;
  conversationId?: string;
}

export interface ISessionAndConversationIds {
  sessionId?: string;
  conversationId?: string;
}

export interface IStartSessionParams extends IOutgoingMediaDeviceIds {
  sessionType: SessionTypes;
}

export interface IStartVideoSessionParams extends IStartSessionParams {
  jid: string;
  /** userJid to be used when inviting a user to a conference */
  inviteeJid?: string;
}

/**
 * id: sessionId
 * mute: update the conversation's mute status to match this value
 */
export interface ISessionMuteRequest {
  /** session id */
  id: string;
  /** `true` to mute, `false` to unmute using default device */
  mute: boolean;
  /** the desired deviceId to use when unmuting, `true` for sdk default, `null` for system default, `undefined` will attempt to use the sdk default device */
  unmuteDeviceId?: string | boolean | null;
}

/**
 * Most basic params for a call participant that come from the api: /api/v2/conversations/calls/{conversationId}
 * this is not an exhaustive list, just the ones we currently care about.
 * NOTE: the `participants` in the /api/v2/conversations/{conversationId} api are slightly different, e.g. no `user` object
 */
export interface IConversationParticipant {
  id: string;
  address: string;
  purpose: string;
  state: string;
  direction: string;
  userId?: string;
  muted: boolean;
  videoMuted?: boolean;
  confined: boolean;
}

export interface IExtendedMediaSession extends GenesysCloudMediaSession {
  id: string;
  originalRoomJid: string;
  conversationId: string;
  sessionType: SessionTypes;
  active: boolean;
  videoMuted?: boolean;
  audioMuted?: boolean;
  fromUserId?: string;
  pcParticipant?: IConversationParticipant;
  startScreenShare?: () => Promise<void>;
  stopScreenShare?: () => Promise<void>;
  pinParticipantVideo?: (participantId: string) => Promise<void>;
  _resurrectVideoOnScreenShareEnd?: boolean;
  _outboundStream?: MediaStream;
  _screenShareStream?: MediaStream;
  _outputAudioElement?: HTMLAudioElement & { sinkId?: string; setSinkId?: (deviceId: string) => Promise<any>; };
  _lastParticipantsUpdate?: IParticipantsUpdate;
  _lastOnScreenUpdate?: IOnScreenParticipantsUpdate;
}

export interface SubscriptionEvent {
  metadata: {
    correlationId: string;
  };
  topicName: string;
  eventBody: any;
}

export interface IParticipantsUpdate {
  conversationId: string;
  addedParticipants: IParticipantUpdate[];
  removedParticipants: IParticipantUpdate[];
  activeParticipants: IParticipantUpdate[];
}

export interface IParticipantUpdate {
  participantId: string;
  userId: string;
  sharingScreen: boolean;
  videoMuted: boolean;
  audioMuted: boolean;
}

export interface IOnScreenParticipantsUpdate {
  participants: Array<
    {
      userId: string;
    }
  >;
}

export interface ISpeakersUpdate {
  speakers: Array<
    {
      userId: string;
    }
  >;
}

export interface IJingleReason {
  condition: JingleReasons;
}

export interface SdkEvents {
  sdkError: SdkError;
  trace: (...args: any[]) => void;
  connected: (info: { reconnect: boolean }) => void;
  ready: void;
  disconnected: (info: any) => void;

  // session related stuff
  pendingSession: IPendingSession;
  sessionStarted: IExtendedMediaSession;
  sessionEnded: (session: IExtendedMediaSession, reason: JingleReason) => void;
  handledPendingSession: IExtendedMediaSession;
  cancelPendingSession: (sessionId: string) => void;
}

/**
 * Events emitted on `sdk.media`
 */
export interface SdkMediaEvents {
  /**
   * Event emitted for microphone volume changes. Event includes the 
   *  media stream, media track, volume average, if the mic is muted,
   *  and the sessionId (if available). 
   * 
   * The sessionId will only be available if the media was created 
   *  with a sessionId passed in. 
   */
  audioTrackVolume: (details: { track: MediaStreamTrack, volume: number, sessionId: string, muted: boolean }) => void;

  /**
   * Event emitted whenever the media state changes. 
   *  `event.eventType` will match the other event that
   *    is emitted on.
   * 
   * Example: if the devices changed, the following will emit:
   * 
   * `sdk.media.on('state', evt => // evt.eventType === 'devices')`
   *  which means that the `'devices'` event will also emit
   * `sdk.media.on('devices', evt => // same event)`
   */
  state: SdkMediaStateWithType;

  /**
   * Event when devices change. 
   * 
   * Note: this will only fire when devices change. 
   *  For example: if `sdk.media.enumerateDevices()` is 
   *  called multiple times, `sdk.media.on('devices', evt)
   *  will only fire once _unless_ the devices are different
   *  on subsequent enumerations. This ensures `enumerateDevices()`
   *  can be called many times without the event emitting
   *  with duplicate data. 
   * 
   */
  devices: SdkMediaStateWithType;

  /**
   * Event when media permissions change
   */
  permissions: SdkMediaStateWithType;
}

export type SdkMediaEventTypes = keyof SdkMediaEvents;

export type SdkMediaStateWithType = SdkMediaState & {
  eventType: SdkMediaEventTypes;
};

export type MicVolumeEvent = Parameters<SdkMediaEvents['audioTrackVolume']>[0];

export type SdkMediaState = {
  /** list of all available devices */
  devices: MediaDeviceInfo[];
  /** 
   * list of all old devices. This will only 
   *  differ from `devices` if `devices` 
   *  changed. This is useful for diffing
   *  which devices changed
   */
  oldDevices: MediaDeviceInfo[];
  /** list of all available audio devices */
  audioDevices: MediaDeviceInfo[];
  /** list of all available video devices */
  videoDevices: MediaDeviceInfo[];
  /** list of all available output devices */
  outputDevices: MediaDeviceInfo[];
  /** whether the browser supports output devices */
  hasOutputDeviceSupport: boolean;
  /** does at least one video device exist */
  hasMic: boolean;
  /** does at least one audio device exist */
  hasCamera: boolean;
  /** does the sdk have browser permissions for audio/microphone */
  hasMicPermissions: boolean;
  /** does the sdk have browser permissions for video/camera */
  hasCameraPermissions: boolean;
  /** if permissions have been requested by the sdk */
  micPermissionsRequested: boolean;
  /** if permissions have been requested by the sdk */
  cameraPermissionsRequested: boolean;
};