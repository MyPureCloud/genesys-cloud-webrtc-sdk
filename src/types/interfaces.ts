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
   * Auto connect incoming softphone sessions (ie. sessions
   *  coming from `sdk.on('sessionStarted', (evt))`. If set
   *  to `false`, the session will need to be manually accepted
   *  using `sdk.acceptSession({ sessionId })`.
   *
   * Optional: default `true`.
   */
  autoConnectSessions?: boolean;

  /**
   * Disable auto answering softphone calls. By default softphone calls will
   *  respect the `autoAnswer` flag passed in on the `pendingSession` session object.
   *  `autoAnswer` is always `true` for outbound calls and can also be set
   *  in the user's  phone settings.
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
   * Optional: defaults to `'info'`
   */
  logLevel?: LogLevels;

  /**
   * Logger to use. Must implement the `ILogger` interface.
   *
   * Defaults to [GenesysCloudClientLogger](https://github.com/purecloudlabs/genesys-cloud-client-logger)
   *  which sends logs to the server (unless `optOutOfTelemetry` is `true`)
   *  and outputs them in the console.
   *
   * ``` ts
   * interface ILogger {
   *    log (message: string | Error, details?: any, skipServer?: boolean): void;
   *    debug (message: string | Error, details?: any, skipServer?: boolean): void;
   *    info (message: string | Error, details?: any, skipServer?: boolean): void;
   *    warn (message: string | Error, details?: any, skipServer?: boolean): void;
   *    error (message: string | Error, details?: any, skipServer?: boolean): void;
   * }
   * ```
   */
  logger?: ILogger;

  /**
   * Opt out of sending logs to the server. Logs are only sent to the server
   *  if a custom logger is _not_ provided. The default logger will
   *  send logs to the server unless this option is `true`
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

  /** defaults for various SDK functionality */
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
     * HTML Audio Element to attach incoming audio streams to.
     *
     * Note: default behavior if this is not provided here or at
     *  `sdk.acceptSession()` is the sdk will create an
     *  HTMLAudioElement and append it to the DOM
     *
     * Optional: no default. (See note about default behavior)
     */
    audioElement?: HTMLAudioElement;

    /**
     * HTML Video Element to attach incoming video streams to.
     *  A video element is _required_ for accepting incoming video
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
     * Note: if the resolution causes `getUserMedia()` to fail
     *  (which can happen sometimes in some browsers), the
     *  SDK will retry _without_ the resolution request.
     *  This means this setting may or may not be used if
     *  depending on the browser.
     *
     * Optional: no default.
     *
     * ConstrainULong interface:
     * ``` ts
     * type ConstrainULong = number | {
     *  exact?: number;
     *  ideal?: number;
     *  max?: number;
     *  min?: number;
     * }
     * ```
     */
    videoResolution?: {
      width: ConstrainULong,
      height: ConstrainULong
    };

    /**
     * Default video device ID to use when starting camera media.
     *  - `string` to request media for specified deviceId
     *  - `null|falsey` to request media system default device
     *
     * Optional: defaults to `null`
     */
    videoDeviceId?: string | null;

    /**
     * Default audio device ID to use when starting microphone media.
     *  - `string` to request media for specified deviceId
     *  - `null|falsey` to request media system default device
     *
     * Optional: defaults to `null`
     */
    audioDeviceId?: string | null;

    /**
     * Default output device ID to use when starting camera media.
     *  - `string` ID for output media device to use
     *  - `null|falsey` to request media system default device
     *
     * Note: Not all browsers support output devices. System default
     *  for output devices is always an empty string (ex: `''`)
     *
     * Optional: defaults to `null`
     */
    outputDeviceId?: string | null;

    /**
     * When `true` all audio tracks created via the SDK
     *  will have their volumes monitored and emited on
     *  `sdk.media.on('audioTrackVolume', evt)`.
     *  See `sdk.media` events for more details.
     * Optional: defaults to `false`
     */
    monitorMicVolume?: boolean;
  };
}

/**
 * if defaultAudioElement is provided, it will be used to play incoming call audio *unless* it already has a source in which case the sdk will create a temporary audio element for the call.
 * defaultAudioStream is the outgoing mediaStream for softphone calls. If not provided, one will be created during `acceptSession`. the sdk will not clean up provided streams
 */

/**
 * Interface for defining the SDK's contract for requesting media.
 */
export interface IMediaRequestOptions {
  /**
   * Desired audio constraint
   * - `string` to request media from device
   * - `true` to request media from sdk default device
   * - `null` to request media from system default device
   * - `false` | `undefined` to not request/update this type of media
   */
  audio?: string | boolean | null;

  /**
   * Desired video constraint
   * - `string` to request media from device
   * - `true` to request media from sdk default device
   * - `null` to request media from system default device
   * - `false` | `undefined` to not request/update this type of media
   */
  video?: string | boolean | null;

  /**
   * Video resolution to request from getUserMedia.
   *
   * Default is SDK configured resolution. `false` will
   *  not any resolution including the sdk default
   */
  videoResolution?: {
    width: ConstrainULong,
    height: ConstrainULong
  } | false;

  /**
   * Video frame rate to request from getUserMedia. Example, if is set
   *  `videoFrameRate: { ideal: 45 }`then the translated
   *  constraint to `getUserMedia` will be
   *  `video: { frameRate: { ideal: 45 } }`
   *
   * Defaults to 30. `false` will explicitly not use any
   *  frameRate
   */
  videoFrameRate?: ConstrainDouble | false;

  /**
   * Flag to emit volume change events for audio tracks. If
   *  this is a `boolean` value, it will override the
   *  SDK default configuration of `monitorMicVolume`.
   *
   * If it is not a `boolean` (ie. left `undefined`) then
   *  the SDK default will be used
   *
   * Default is SDK config's `monitorMicVolume` value
   */
  monitorMicVolume?: boolean;

  /**
   * Session to associate logs to. It will also tie `audioTrackVolume`
   *  events to a sessionId if requesting audio
   *  with `monitorMicVolume = true`
   */
  session?: IExtendedMediaSession;
}

/**
 * Interface for defining the default devices to use when constructing
 *  an SDK instance.
 */
export interface IMediaDeviceIds {
  /** `string` for video deviceId to use, `falsy` for system default */
  videoDeviceId?: string | null;
  /** `string` for microphone deviceId to use, `falsy` for system default */
  audioDeviceId?: string | null;
  /** `deviceId` for audio output, `falsy` for system default */
  outputDeviceId?: string | null;
}

/**
 * Interface for defining the SDK's contract for how to request media with specific deviceIds.
 */
export interface ISdkMediaDeviceIds {
  /**
   * Request video media in the following manner
   * - `string` for a specified deviceId,
   * - `true` for sdk default deviceId,
   * - `null` for system default device,
   * - `false|undefined` to not request video.
   */
  videoDeviceId?: string | boolean | null;
  /**
   * Request audio media in the following manner
   * - `string` for a specified deviceId,
   * - `true` for sdk default deviceId,
   * - `null` for system default device,
   * - `false|undefined` to not request audio.
   */
  audioDeviceId?: string | boolean | null;
}

export interface IUpdateOutgoingMedia extends ISdkMediaDeviceIds {
  /** session id (this _OR_ `session` is required) */
  sessionId?: string;
  /** session (this _OR_ `sessionId` is required) */
  session?: IExtendedMediaSession;
  /** stream with desired media */
  stream?: MediaStream;
}

export interface IAcceptSessionRequest extends ISdkMediaDeviceIds {
  /** id of the session to accept */
  sessionId: string;

  /**
   * media stream to use on the session. if this is
   *  provided, no media will be requested.
   */
  mediaStream?: MediaStream;

  /** audio element to attach incoming audio to. default is sdk `defaults.audioElement` */
  audioElement?: HTMLAudioElement;

  /** video element to attach incoming video to. default is sdk `defaults.videoElement` */
  videoElement?: HTMLVideoElement;
}

export interface IEndSessionRequest {
  sessionId?: string;
  conversationId?: string;
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
  /**
   * Log a message to the location specified by the logger.
   *  The logger can decide if it wishes to implement `details`
   *  or `skipServer`.
   * @param message message or error to log
   * @param details any additional details to log
   * @param skipServer should log skip server
   */
  log (message: string | Error, details?: any, skipServer?: boolean): void;

  /**
   * Log a message to the location specified by the logger.
   *  The logger can decide if it wishes to implement `details`
   *  or `skipServer`.
   * @param message message or error to log
   * @param details any additional details to log
   * @param skipServer should log skip server
   */
  debug (message: string | Error, details?: any, skipServer?: boolean): void;

  /**
   * Log a message to the location specified by the logger.
   *  The logger can decide if it wishes to implement `details`
   *  or `skipServer`.
   * @param message message or error to log
   * @param details any additional details to log
   * @param skipServer should log skip server
   */
  info (message: string | Error, details?: any, skipServer?: boolean): void;

  /**
   * Log a message to the location specified by the logger.
   *  The logger can decide if it wishes to implement `details`
   *  or `skipServer`.
   * @param message message or error to log
   * @param details any additional details to log
   * @param skipServer should log skip server
   */
  warn (message: string | Error, details?: any, skipServer?: boolean): void;

  /**
   * Log a message to the location specified by the logger.
   *  The logger can decide if it wishes to implement `details`
   *  or `skipServer`.
   * @param message message or error to log
   * @param details any additional details to log
   * @param skipServer should log skip server
   */
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

export interface ISessionAndConversationIds {
  sessionId?: string;
  conversationId?: string;
}

export interface IStartSessionParams extends ISdkMediaDeviceIds {
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
  sessionId: string;
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
  handledPendingSession: (sessionId: string) => void;
  cancelPendingSession: (sessionId: string) => void;
}

/**
 * Events emitted on `sdk.media`
 */
export interface SdkMediaEvents {
  /**
   * Event emitted for microphone volume changes. Event includes the
   *  media track, volume average, if the mic is muted,
   *  and the sessionId (if available).
   *
   * The sessionId will only be available if the media was created
   *  with a `session` or `sessionId` passed into with the
   *  media request options (See `interface IMediaRequestOptions`).
   *
   * This will emit every `100ms` with the average volume during that
   *  time range.
   *
   * This event can be used to determine if a microphone is not picking
   *  up audio. Reasons for this can be the microphone is on "hardware mute"
   *  or the OS does not have microphone permissions for the given browser
   *  being used. Both of these reasons cannot be detected on the media track
   *  and can only be "guessed" based on no audio being picked up from the mic.
   */
  audioTrackVolume: (details: { track: MediaStreamTrack, volume: number, muted: boolean, sessionId?: string }) => void;

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
   * Event when devices change. Devices are considered to
   *  change when:
   * 1. The devices are enumerated for the first time
   * 2. The devices are enumerated with `labels` (this
   *    can happen if enumerating devices after gaining
   *    media permissions)
   * 3. `sdk.media.enumerateDevices(true)` is called
   *    (which will always emit the devices again)
   * 4. The broswer fires the `devicechange` event
   *    (which will trigger the sdk to enumerate devices)
   *
   * Note: this will only fire when devices change.
   *  For example: if `sdk.media.enumerateDevices()` is
   *  called multiple times, `sdk.media.on('devices', evt)
   *  will only fire once _unless_ the devices are different
   *  on subsequent enumerations _or_ `true` is passed in
   *  (to force emission). This ensures `enumerateDevices()`
   *  can be called many times without the event emitting
   *  with duplicate data.
   *
   */
  devices: SdkMediaStateWithType;

  /**
   * Event when media permissions change. Values
   *  that trigger this event are any of the following
   *  in the ISdkMediaState:
   * ``` ts
   *  hasMicPermissions: boolean;
   *  hasCameraPermissions: boolean;
   *  micPermissionsRequested: boolean;
   *  cameraPermissionsRequested: boolean;
   * ```
   *
   * For example, when calling through to
   *  `sdk.media.requestMediaPermissions('audio')`, this
   *  event will emit two times:
   * 1. for `micPermissionsRequested` changing to `true`
   *  (which happens right before requesting `getUserMedia()`)
   *  event will emit two times:
   * 2. for `hasMicPermissions` changing to `true` or `false`
   *  depending on the outcome of the `getUserMedia()` request
   */
  permissions: SdkMediaStateWithType;
}

export type SdkMediaEventTypes = keyof Omit<SdkMediaEvents, 'audioTrackVolume'>;

export type SdkMediaStateWithType = ISdkMediaState & {
  eventType: SdkMediaEventTypes;
};

export type MicVolumeEvent = Parameters<SdkMediaEvents['audioTrackVolume']>[0];

export interface ISdkMediaState {
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
  /** does at least one audio device exist */
  hasMic: boolean;
  /** does at least one video device exist */
  hasCamera: boolean;
  /** does the sdk have browser permissions for audio/microphone */
  hasMicPermissions: boolean;
  /** does the sdk have browser permissions for video/camera */
  hasCameraPermissions: boolean;
  /** if permissions have been requested by the sdk */
  micPermissionsRequested: boolean;
  /** if permissions have been requested by the sdk */
  cameraPermissionsRequested: boolean;
}
