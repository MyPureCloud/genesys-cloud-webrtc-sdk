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

export interface ISdkConstructOptions {
  environment?: string;
  accessToken?: string;
  organizationId?: string;
  wsHost?: string;
  autoConnectSessions?: boolean;
  iceServers?: RTCConfiguration;
  iceTransportPolicy?: RTCIceTransportPolicy;
  logLevel?: LogLevels;
  logger?: ILogger;
  optOutOfTelemetry?: boolean;
  disableAutoAnswer?: boolean;
  defaultAudioElement?: HTMLAudioElement;
  defaultAudioStream?: MediaStream;
  defaultVideoElement?: HTMLVideoElement;
  defaultVideoDeviceId?: string | null;
  defaultAudioDeviceId?: string | null;
  defaultOutputDeviceId?: string | null;
  allowedSessionTypes?: SessionTypes[];
}

/**
 * if defaultAudioElement is provided, it will be used to play incoming call audio *unless* it already has a source in which case the sdk will create a temporary audio element for the call.
 * defaultAudioStream is the outgoing mediaStream for softphone calls. If not provided, one will be created during `acceptSession`. the sdk will not clean up provided streams
 */
export interface ISdkConfig {
  environment?: string;
  accessToken?: string;
  wsHost: string;
  disableAutoAnswer?: boolean;
  autoConnectSessions?: boolean;
  defaultAudioElement?: HTMLAudioElement;
  defaultAudioStream?: MediaStream;
  defaultVideoElement?: HTMLVideoElement;
  defaultVideoDeviceId?: string | null;
  defaultAudioDeviceId?: string | null;
  defaultOutputDeviceId?: string | null;
  iceTransportPolicy?: RTCIceTransportPolicy;
  logLevel?: LogLevels;
  optOutOfTelemetry?: boolean;
  allowedSessionTypes?: SessionTypes[];
  customIceServersConfig?: RTCConfiguration;
}

export interface IMediaRequestOptions {
  /**
   * - `string` to request media from device
   * - `true` to request media from sdk default device
   * - `null` to request media from system default device
   * - `false` | `undefined` to not request/update this type of media
   */
  video?: boolean | string | null;
  videoResolution?: {
    width: ConstrainULong,
    height: ConstrainULong
  };
  videoFrameRate?: ConstrainDouble;
  /**
   * - `string` to request media from device
   * - `true` to request media from sdk default device
   * - `null` to request media from system default device
   * - `false` | `undefined` to not request/update this type of media
   */
  audio?: boolean | string | null;
  /**
   * This is just to be able to associate logs to a specific session. This is primarily for internal use an not generally needed.
   */
  session?: IExtendedMediaSession;
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

export interface IEnumeratedDevices {
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
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
