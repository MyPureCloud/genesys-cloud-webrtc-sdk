/* eslint-disable-line @typescript-eslint/no-explicit-any */
import { ISessionInfo, IPendingSession, IMediaSession, TypedJsonRpcMessage } from 'genesys-cloud-streaming-client';
import { JingleReason } from 'stanza/protocol';
import { Constants } from 'stanza';
import ILogger, { LogFormatterFn } from 'genesys-cloud-client-logger';

import { SdkError } from '../utils';
import { LogLevels, SessionTypes, JingleReasons, CommunicationStates } from './enums';
import { ConversationUpdate } from '../conversations/conversation-update';

export { ISessionInfo, IPendingSession };
// extend the emittable events
declare module 'genesys-cloud-streaming-client' {
  export interface SessionEvents {
    participantsUpdate: IParticipantsUpdate;
    activeVideoParticipantsUpdate: IOnScreenParticipantsUpdate;
    speakersUpdate: ISpeakersUpdate;
    incomingMedia: void;
    pinnedParticipant: { participantId: string | null };
    memberStatusUpdate: MemberStatusMessage;
  }
}

export type KeyFrom<T extends { [key: string]: any }, key extends keyof T> = key;

/**
 * SDK configuration options for constructing a new instance
 */
export interface ISdkFullConfig {
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
   * jwt providing limited functionality. For the time being,
   * this is limited to agent screen recording functionality.
   */
  jwt?: string;

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
   *  using `sdk.acceptSession({ conversationId })`.
   *
   * Optional: default `true`.
   */
  autoConnectSessions?: boolean;

  /**
   * If a propose for a screen recording is received *and* this client is configured to handle screen recording
   *   sessions, automatically call `acceptPendingSession()` for this request.
   *
   * Optional: default `false`.
   */
  autoAcceptPendingScreenRecordingRequests?: boolean;

  /**
   * If a propose for a live screen monitoring is received *and* this client is configured to handle screen monitoring
   *   sessions, automatically call `acceptPendingSession()` for this request.
   *
   * Optional: default `false`.
   */
  autoAcceptPendingLiveScreenMonitoringRequests?: boolean

  /**
   * The identifier that will go into the full jid. The jid will be constructed as {usersBareJid}/{jidResource}
   * This is helpful for identifying specific clients and considered advanced usage.
   */
  jidResource?: string;

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
   * If the station is configured for persistent connection and an active connection is required to go on queue,
   * a "fake" call will be used to establish the persistent connection as part of the process to go on queue.
   * This setting is additional configuration for how the webrtc sdk handles this circumstance but
   * only comes into play if `disableAutoAnswer` is `true`. If `disableAutoAnswer` is `false`, `eagerPersistentConnectionEstablishment`
   * will always be `'auto'`.
   *
   * Options:
   * ``` ts
   * 'auto': will automatically establish the connection upon receiving the fake call without emitting a `pendingSession` event.
   * 'event': will emit a pendingSession event and allow the application to decide if it will establish the connection
   * 'none': will not emit an event and will not establish the persistent connection
   * ```
   *
   * Defaults to `'auto'`
   */
  eagerPersistentConnectionEstablishment?: 'auto' | 'event' | 'none';

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
   * Secondary logger to use. Must implement the `ILogger` interface. Defaults to `console`.
   *
   * NOTE: The SDK will always use [GenesysCloudClientLogger](https://github.com/purecloudlabs/genesys-cloud-client-logger)
   *  which sends logs to the server (unless `optOutOfTelemetry` is `true`) and outputs them to the secondary logger
   * (ie. which ever logger was passed in using this config property).
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
   * Formatters for intercepting and handling log messages. See
   * https://github.com/purecloudlabs/genesys-cloud-client-logger#how-formatters-work for more information.
   * Note: These formatters also apply to logs that are generated by the embedded streaming client.
   */
  logFormatters?: LogFormatterFn[];

  /**
   * This is name of the app that is consuming the SDK. This field is optional and only
   *  used for logging purposes.
   */
  originAppName?: string;

  /**
   * This is the version of the app that is consuming the SDK. This field is optional and only
   *  used for logging purposes.
   */
  originAppVersion?: string;

  /**
   * This is an unique ID from the app that is consuming the SDK. This field is optional and only
   *  used for logging purposes to tie the consuming app client instance with the
   *  SDK's logger instance.
   */
  originAppId?: string;

  /**
   * Opt out of sending logs to the server. Logs are only sent to the server
   *  if a custom logger is _not_ provided. The default logger will
   *  send logs to the server unless this option is `true`
   *
   * Optional: default `false`
   */
  optOutOfTelemetry?: boolean;

  /**
   * Opt out of initializing the headset functionality included in the SDK.
   *  See the "Headset" documentation of the SDK for more details.
   *
   * Note: if `false`, a no-op stub will be used at `sdk.headset` to eliminate
   *  the need to "null" type check `sdk.headset` before using in code.
   *
   * Optional: default `false`
   */
  useHeadsets?: boolean;

  /**
   * When the sdk initializes, it will negotiate with other sdk instances to determine which will
   * get call controls. The instance that is instantiated last and with the highest priority
   * will be the one that gets call controls.
   *
   * Note: There is a third type called 'mediaHelper' which is set by the sdk at runtime if it
   * is running as a media helper.
   *
   * Optional: default `standard`
   */
  headsetRequestType?: HeadsetRequestType;

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
   * import { SessionTypes } from 'genesys-cloud-webrtc-sdk';
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

  /**
   * disables the negotiation between the user's different client which ensures
   * that only one client effectively has headset call controls. This flag will
   * be temporary and may be removed without notice.
   *
   * Optional: defaults to `false`
   */
  disableHeadsetControlsOrchestration?: boolean;

  /**
   * Genesys internal use only - non-Genesys apps that pass in custom headers will be ignored.
   * Used for telemetry purposes only.
  */
  customHeaders?: ICustomHeader;

  /**
   * Controls whether to attempt to use `ping` stanzas from the server or the client.
   * When `true`, `ping` stanzas from the server will be requested. If `false` (or unsupported by the server), the client will send `ping` stanzas.
   *
   * Optional: default `false`
   */
  useServerSidePings?: boolean;

  /** defaults for various SDK functionality */
  defaults?: {

    /**
     * A default audio stream to accept softphone sessions with
     *  if no audio stream was used when accepting the session
     *  (ie: `sdk.acceptSession({ id: 'session-id', mediaStream })`)
     *
     * Warning: Firefox does not allow multiple microphone media tracks.
     *  using a default could cause the SDK to be unable to request any
     *  other audio device besides the active microphone - which would be the
     *  audio track on this default stream.
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
     * Volume for session that use audio
     *
     * Optional: defaults to 100
     */
    audioVolume?: number;

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
    videoResolution?: IVideoResolution;

    /**
     * Automatic gain control is a feature in which a sound
     * source automatically manages changes in the volume
     * of its source media to maintain a steady overall volume level.
     *
     * Optional: defaluts to `true`.
     *
     * ConstrainBoolean interface:
     * ``` ts
     * type ConstrainBoolean = boolean | {
     *  exact?: boolean;
     *  ideal?: boolean;
     * }
     * ```
     */
    micAutoGainControl?: ConstrainBoolean;

    /**
     * Echo cancellation is a feature which attempts to prevent echo
     * effects on a two-way audio connection by attempting to reduce
     * or eliminate crosstalk between the user's output device and
     * their input device. For example, it might apply a filter that
     * negates the sound being produced on the speakers from being included
     * in the input track generated from the microphone.
     *
     * Optional: defaluts to `true`.
     *
     * ConstrainBoolean interface:
     * ``` ts
     * type ConstrainBoolean = boolean | {
     *  exact?: boolean;
     *  ideal?: boolean;
     * }
     * ```
     */
    micEchoCancellation?: ConstrainBoolean;

    /**
     * Noise suppression automatically filters the audio to remove or
     * at least reduce background noise, hum caused by equipment, and
     * the like from the sound before delivering it to your code.
     *
     * Optional: defaluts to `true`.
     *
     * ConstrainBoolean interface:
     * ``` ts
     * type ConstrainBoolean = boolean | {
     *  exact?: boolean;
     *  ideal?: boolean;
     * }
     * ```
     */
    micNoiseSuppression?: ConstrainBoolean;

    /**
     * Default video device ID to use when starting camera media.
     *  - `string` to request media for specified deviceId
     *  - `null|falsy` to request media system default device
     *
     * Optional: defaults to `null`
     */
    videoDeviceId?: string | null;

    /**
     * Default audio device ID to use when starting microphone media.
     *  - `string` to request media for specified deviceId
     *  - `null|falsy` to request media system default device
     *
     * Optional: defaults to `null`
     */
    audioDeviceId?: string | null;

    /**
     * Default output device ID to use when starting camera media.
     *  - `string` ID for output media device to use
     *  - `null|falsy` to request media system default device
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

export interface ISdkConfig extends ISdkFullConfig{
  headsetRequestType?: DefaultHeadsetRequestType;
}

/**
 * if defaultAudioElement is provided, it will be used to play incoming call audio *unless* it already has a source in which case the sdk will create a temporary audio element for the call.
 * defaultAudioStream is the outgoing mediaStream for softphone calls. If not provided, one will be created during `acceptSession`. the sdk will not clean up provided streams
 */

export interface IPendingSessionActionParams {
  conversationId: string;

  /**
   * If you are using screen recording and softphone, you should use this since screen recordings have the same conversationId
   * as softphone sessions.
   */
  sessionType?: SessionTypes;
  /** boolean to show if the event needs to pass along to the headset */
  fromHeadset?: boolean
}

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
  videoResolution?: IVideoResolution | false;

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

  /**
   * Flag to retry media (if available) when it fails. Example would
   *  be if a specific microphone is requested, but fails. With this
   *  falg set, it will try again with the SDK default microphone and/or
   *  the system default microphone
   */
  retryOnFailure?: boolean;

  /**
   * Flag to ignore media errors for one type if the other type succeeds.
   *  Example: if media is requested for audio & video, but audio fails –
   *  with this flag set, a warning will be logged for the failed audio
   *  but a valid stream will be returned with the successful video media.
   *
   * Notes:
   *  1. This setting is only taken into consideration if _both_ media
   *    types are requested. It has no effect if only one is requested.
   *  2. If using this flag, you may need to verify what tracks are
   *    received on the returned stream because it is not guaranteed
   *    that the stream will contain both types of media.
   *  3. If _both_ types of media fail, the error for the audio stream
   *    request will be thrown.
   */
  preserveMediaIfOneTypeFails?: boolean;

  /**
   * Option to pass in a uniqueID to be able to tie the media request
   *  with the actual getUserMedia (gUM) request made to the browser.
   *  See notes on `sdk.media.on('gumRequest', evt)` event.
   *
   * Note: if no uuid is passed in the SDK will create one and use it
   *  for the request.
   */
  uuid?: string | number;
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
 * Interface for updating the default media settings an SDK instance.
 */
export interface IMediaSettings {
  /**
   * Automatic gain control is a feature in which a sound
   * source automatically manages changes in the volume
   * of its source media to maintain a steady overall volume level.
   *
   * ConstrainBoolean interface:
   * ``` ts
   * type ConstrainBoolean = boolean | {
   *  exact?: boolean;
   *  ideal?: boolean;
   * }
   * ```
   */
  micAutoGainControl?: ConstrainBoolean;

  /**
   * Echo cancellation is a feature which attempts to prevent echo
   * effects on a two-way audio connection by attempting to reduce
   * or eliminate crosstalk between the user's output device and
   * their input device. For example, it might apply a filter that
   * negates the sound being produced on the speakers from being included
   * in the input track generated from the microphone.
   *
   * ConstrainBoolean interface:
   * ``` ts
   * type ConstrainBoolean = boolean | {
   *  exact?: boolean;
   *  ideal?: boolean;
   * }
   * ```
   */
  micEchoCancellation?: ConstrainBoolean;

  /**
   * Noise suppression automatically filters the audio to remove or
   * at least reduce background noise, hum caused by equipment, and
   * the like from the sound before delivering it to your code.
   *
   * ConstrainBoolean interface:
   * ``` ts
   * type ConstrainBoolean = boolean | {
   *  exact?: boolean;
   *  ideal?: boolean;
   * }
   * ```
   */
  micNoiseSuppression?: ConstrainBoolean;

  /**
   * When `true` all audio tracks created via the SDK
   *  will have their volumes monitored and emited on
   *  `sdk.media.on('audioTrackVolume', evt)`.
   *  See `sdk.media` events for more details.
   */
  monitorMicVolume?: boolean;
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
  conversationId?: string;
  /** session id (this _OR_ `session` is required) */
  session?: IExtendedMediaSession;
  /** stream with desired media */
  stream?: MediaStream;
}

export interface IAcceptSessionRequest extends ISdkMediaDeviceIds {
  conversationId: string;

  /**
   * this is optional, however if you have the sdk configured for screen recording
   * you will want to specify this since the sessions share a conversationId.
   */
  sessionType?: SessionTypes;

  /**
   * media stream to use on the session. if this is
   *  provided, no media will be requested.
   */
  mediaStream?: MediaStream;

  /**
   * metadata about screens and tracks. This is required for screen recording sessions
   */
  screenRecordingMetadatas?: ScreenRecordingMetadata[];

  /** audio element to attach incoming audio to. default is sdk `defaults.audioElement` */
  audioElement?: HTMLAudioElement;

  /** video element to attach incoming video to. default is sdk `defaults.videoElement` */
  videoElement?: HTMLVideoElement;

  /** Flag set to true when the participant is a monitoring observer. default is `false` */
  liveMonitoringObserver?: boolean
}

export interface IEndSessionRequest {
  /** conversation ID of the call to end */
  conversationId: string;
  /** the reason why the call was ended to determine if intentional or an error for example*/
  reason?: Constants.JingleReasonCondition;
  /** boolean to show if the event needs to pass along to the headset */
  fromHeadset?: boolean;
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
  station?: {
    /* use this one */
    effectiveStation?: IStation;
    associatedStation?: IStation;
    lastAssociatedStation?: IStation;
    defaultStation?: IStation;
  }
}

export interface JWTDetails {
  data: {
    uid: string; // userId
    jid: string;
    gcbaid: string; // genesys cloud background assistant id
  };
  exp: number; // exp in seconds
  iat: number; // issued at time in seconds,
  iss: string; // issuer
  name: string; // users name
  org: string; // org id
}

export interface IOrgDetails {
  id: string;
  name: string;
}

export interface IStation {
  id: string;
  name: string;
  status: 'ASSOCIATED' | 'AVAILABLE';
  userId: string;
  webRtcUserId: string;
  type: 'inin_webrtc_softphone' | 'inin_remote';
  webRtcPersistentEnabled: boolean;
  webRtcForceTurn: boolean;
  webRtcCallAppearances: number;
  // webRtcMediaDscp: 46;
  // lineAppearanceId: string;
}

export interface ICustomerData {
  conversation: { id: string };
  sourceCommunicationId: string;
  jwt: string;
}

export function isCustomerData (data: { securityCode: string } | ICustomerData): data is ICustomerData {
  data = data as ICustomerData;
  return !!(data
    && data.conversation
    && data.conversation.id
    && data.sourceCommunicationId
    && data.jwt);
}

export function isSecurityCode (data: { securityCode: string } | ICustomerData): data is { securityCode: string } {
  return !!(
    data &&
    (data as { securityCode: string }).securityCode
  );
}
export interface IConversationParticipantFromEvent {
  id: string;
  purpose: string;
  userId: string;
  videos: Array<IParticipantVideo>;
  calls: Array<ICallStateFromParticipant>;
}

export interface IParticipantVideo {
  context: string;
  audioMuted: boolean;
  videoMuted: boolean;
  id: string;
  state: CommunicationStates;
  peerCount: number;
  sharingScreen: boolean;
}

export interface ICallStateFromParticipant {
  id: string;
  state: CommunicationStates;
  muted: boolean;
  confined: boolean;
  held: boolean;
  direction: 'inbound' | 'outbound';
  provider: string;
  errorInfo?: {
    code: string;
    message: string;
    messageWithParams: string;
    messageParams: { [key: string]: any }
  }
}

export interface IStoredConversationState {
  /**
   * Most recent conversation event received for this conversation
   */
  conversationUpdate: ConversationUpdate;
  /**
   * conversationId of this conversation
   */
  conversationId: string;
  /**
   * Webrtc session this conversation is using
   */
  session?: IExtendedMediaSession;
  /**
   * Most recent participant for the authenticated user
   */
  mostRecentUserParticipant?: IConversationParticipantFromEvent;
  /**
   * Most recent call start for the authenticated user
   */
  mostRecentCallState?: ICallStateFromParticipant;
}

export interface ISdkConversationUpdateEvent {
  /**
   * assumed conversationId of the activce conversation
   */
  activeConversationId: string;
  /**
   * All current softphone conversations
   */
  current: IStoredConversationState[];
  /**
   * Newly added softphone conversations
   */
  added: IStoredConversationState[];
  /**
   * Removed softphone conversations
   */
  removed: IStoredConversationState[];
}

export interface ISessionIdAndConversationId {
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

export interface IStartVideoMeetingSessionParams extends IStartSessionParams {
  meetingId: string;
}

export interface ISessionMuteRequest {
  /** conversation id */
  conversationId: string;
  /** `true` to mute, `false` to unmute using default device */
  mute: boolean;
  /** boolean to show if the event needs to pass along to the headset */
  fromHeadset?: boolean;
  /** the desired deviceId to use when unmuting, `true` for sdk default, `null` for system default, `undefined` will attempt to use the sdk default device */
  unmuteDeviceId?: string | boolean | null;
}

export interface IConversationHeldRequest {
  /** conversation id */
  conversationId: string;
  /** `true` to place on hold, `false` to take off hold */
  held: boolean;
  /** boolean to show if the event needs to pass along to the headset */
  fromHeadset?: boolean;
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

export interface IExtendedMediaSession extends IMediaSession {
  originalRoomJid: string;
  active: boolean;
  sessionReplacedByReinvite?: boolean;
  videoMuted?: boolean;
  audioMuted?: boolean;
  pcParticipant?: IConversationParticipant;
  _alreadyAccepted?: boolean;
  _emittedSessionStarteds?: { [conversationId: string]: true };
  _screenShareStream?: MediaStream;
  _outboundStream?: MediaStream;
  _outputAudioElement?: HTMLAudioElement & { sinkId?: string; setSinkId?: (deviceId: string) => Promise<any>; };
  _visibilityHandler?: EventListener;
}

export interface IResolutionChange {
  requestedResolution: IVideoResolution,
  actualResolution: IVideoResolution,
  sessionId: string,
  conversationId: string,
  videoTrack: MediaStreamTrack
}

export interface VideoMediaSession extends IExtendedMediaSession {
  fromUserId: string;
  sessionType: SessionTypes.collaborateVideo;
  startScreenShare?: () => Promise<void>;
  stopScreenShare?: () => Promise<void>;
  pinParticipantVideo?: (participantId: string) => Promise<void>;
  _resurrectVideoOnScreenShareEnd?: boolean;
  _lastParticipantsUpdate?: IParticipantsUpdate;
  _lastOnScreenUpdate?: IOnScreenParticipantsUpdate;
}

export interface ScreenRecordingMediaSession extends IExtendedMediaSession {
  sessionType: SessionTypes.screenRecording;
  screenMetadatas: ScreenRecordingMetadata[];
}

export interface ScreenRecordingMetadata {
  /**
   * The `MediaStreamTrack.id` associated with this screen.
   */
  trackId: string;

  /**
   * The id associated with the monitor/screen you are recording. This can often be found at
   * `MediaStreamTrack.getSettings().deviceId`.
   */
  screenId: string;

  /**
   * The left coordinate for this screen.
   */
  originX: number;

  /**
   * The bottom coordinatefor this screen. *NOTE: Windows and Mac sometimes switch where
   * they reference originY. This property is for playback purposes and a Y coordinate of
   * 0 should always represent the bottom of the screen.
   */
  originY: number;

  /**
   * The width of the screen.
   */
  resolutionX: number;

  /**
   * The height of the screen.
   */
  resolutionY: number;

  /**
   * This monitor is the system default/primary monitor where the start bar and/or dock lives.
   */
  primary: boolean;
}

export interface LiveScreenMonitoringSession extends IExtendedMediaSession {
  sessionType: SessionTypes.liveScreenMonitoring;
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
  disconnected: (info: string, eventData: { reconnecting: boolean }) => void;

  // session related stuff
  pendingSession: IPendingSession;
  sessionStarted: IExtendedMediaSession;
  sessionEnded: (session: IExtendedMediaSession, reason: JingleReason) => void;
  sessionInterrupted: (event) => { sessionId: string, sessionType: string, conversationId: string };
  handledPendingSession: ISessionIdAndConversationId;
  cancelPendingSession: ISessionIdAndConversationId;
  conversationUpdate: ISdkConversationUpdateEvent;
  conversationUpdateRaw: SubscriptionEvent;
  station: (event: { action: 'Associated' | 'Disassociated', station: IStation | null }) => void;
  concurrentSoftphoneSessionsEnabled: boolean; // lineAppearence > 1
  resolutionUpdated: IResolutionChange
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

  /**
   * Event when the SDK makes a request to `navigator.mediaDevices.getUserMedia()`
   *  (gUM). Many browsers only allow requests to `gUM()` when the window is in
   *  focus. Use this event to monitor when media is requested to ensure that the
   *  window is in focus so the media request will complete.
   *
   * Note: if requesting both media types at the same time (`audio & video`), the
   *  SDK will make _two_ separate `gUM()` requests – one for each media type
   *  (see notes on `sdk.media.startMedia()`). This event will emit for _each_
   *  `gUM()` request. For this reason, it is recommended to utilize the
   *  `uuid` field of the `interface IMediaRequestOptions` to help track which
   *  `gUM()` requests were made by your application (see docs for `IMediaRequestOptions#uuid`).
   */
  gumRequest: ISdkGumRequest;
}

export type SdkMediaEventTypes = keyof Omit<SdkMediaEvents, 'audioTrackVolume' | 'gumRequest'>;

export type SdkMediaStateWithType = ISdkMediaState & {
  eventType: SdkMediaEventTypes;
};

export type MicVolumeEvent = Parameters<SdkMediaEvents['audioTrackVolume']>[0];

export type SdkMediaTypesToRequest = 'audio' | 'video' | 'none';
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

/**
 * Event emitted when a `getUserMedia()` (gUM) request is made
 *  to the browser.
 */
export interface ISdkGumRequest {
  /**
   * The returned promise from the browser's
   *  `getUserMedia()` (gUM) request
   */
  gumPromise: Promise<MediaStream>;

  /**
   * The requested options passed to the SDK
   */
  mediaRequestOptions: IMediaRequestOptions;

  /**
   * The actual media constraints used to make the
   *  `getUserMedia()` (gUM) request.
   */
  constraints: MediaStreamConstraints;
}

export interface IStartSoftphoneSessionParams extends IStartSessionParams {
  /** phone number to dial */
  phoneNumber?: string;
  /** caller id phone number for outbound call */
  callerId?: string;
  /** caller id name for outbound call */
  callerIdName?: string;
  /** the queue ID to call on behalf of */
  callFromQueueId?: string;
  /** queue ID to call */
  callQueueId?: string;
  /** user ID to call */
  callUserId?: string;
  /** priority to assign to call if calling a queue */
  priority?: number;
  /** language skill ID to use for routing call if calling a queue */
  languageId?: string;
  /** skill IDs to use for routing if calling a queue */
  routingSkillsIds?: string[];
  /** list of existing conversations to merge into new ad-hoc conference */
  conversationIds?: string[];
  /** Used for starting conference calls with multiple participants. */
  participants?: ISdkSoftphoneDestination[];
  /** user to user information managed by SIP session app */
  uuiData?: string;
}

export interface ISdkSoftphoneDestination {
  /** address or phone number */
  address: string;
  name?: string;
  userId?: string;
  queueId?: string;
}

export interface IVideoResolution {
  width: ConstrainULong,
  height: ConstrainULong
}

export type GenesysDataChannelMessageParams = {
  'member.notify.status': NotifyStatusParams;
};

export type NotifyStatusParams = {
  speakers?: VideoSpeakerStatus[];
  outgoingStreams?: OutgoingStreamStatus[];
  incomingStreams?: IncomingStreamStatus[];
  bandwidthAndRates?: IDataChannelBandwidthAndRates;
};

export type MemberStatusMessage = TypedJsonRpcMessage<'member.notify.status', NotifyStatusParams>;

export interface VideoSpeakerStatus {
  /** memberId of the conference member. */
  id: string;
  activity: 'speaking' | 'inactive' | 'non-speech';
  /** Audio level, in dB, in the range of -127.0 to 0.0 with 0.0 being the loudest */
  level: number;
  /** active audio deemed to be non-speech */
  noisy?: boolean;
  /** true to indicate the conference member is being heard, false to indicate they are not currently in the audio mix */
  included: boolean;
  /** Contains IDs of the speaker  */
  appId: IDataChannelAppId;
  bandwidthAndRates: IDataChannelBandwidthAndRates;
}

export interface IDataChannelAppId {
  /** The speaker's jabberId. */
  sourceJid: string;
  /** The speaker's participantId. */
  sourceParticipantId: string;
  /** The speaker's userId. */
  sourceUserId: string;
}

export interface OutgoingStreamStatus {
  /** Stream ID of the outgoing stream (stream sent from member to MMS) */
  outgoingStreamId: string;
  /** Userids currently viewing this stream */
  viewers: {
      /** memberId of the conference member */
      id: string;
      appId: IDataChannelAppId;
  }[];
}

export interface IncomingStreamStatus {
  /** Stream ID of the incoming stream on this member being described */
  sinkPinId: string;
  /** Track ID (from the SDP, local to this member) */
  sinkTrackId?: string;
  /** Client ID of the source being sent to this stream */
  sourceId?: string;
  /** Pin ID of the stream on the viewed member's client */
  sourcePinId: string;
  /** Track ID from the SDP of the viewed member's client */
  sourceTrackId?: string;
  appId?: IDataChannelAppId;
  contentType?: 'camera' | 'screenshare' | 'playback';
}

export interface IActiveConversationDescription {
  conversationId: string;
  sessionId: string;
  sessionType: SessionTypes;
}

export interface IDataChannelBandwidthAndRates {
  /** bandwidth, in bits per second, from mms to the client */
  bwToClient: number;

  /** data rate, in bits per second, of the streams being sent from mms to the client */
  rateToClient: number;

  /** bandwidth, in bits per second, from the client to mms */
  bwFromClient: number;

  /** data rate, in bits per second, of the streams being sent from the client to mms */
  rateFromClient: number;
}

export interface ICustomHeader {
  [header: string]: string;
}

export type DefaultHeadsetRequestType = 'prioritized' | 'standard';
export type HeadsetRequestType = 'mediaHelper' | DefaultHeadsetRequestType;

export type HawkNotification<T> = {
  topicName: string;
  metadata: {
    CorrelationId: string;
  };
  eventBody: T;
}

export type PersistentConnectionEvent = {
  userId: string;
  stationId: string;
  persistentState: PersistentState;
  errorInfo?: ErrorInfo;
}

export type PersistentState = 'UNKNOWN' | 'PERSISTED' | 'ACTIVE_CALL' | 'DISCONNECTED' | 'FAILED';

export type ErrorInfo = {
  text: string;
  code: string;
  userMessage: string;
}
