import { LogLevels, SessionTypes } from "./enums";

export interface ISdkConstructOptions {
  environment: string;
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
}

export interface ISdkConfig {
  environment: string;
  accessToken: string;
  wsHost: string;
  disableAutoAnswer: boolean;
  autoConnectSessions: boolean;
  iceTransportPolicy: RTCIceTransportPolicy;
  logLevel: LogLevels;
  optOutOfTelemetry: boolean;
  customIceServersConfig: RTCConfiguration;
}

export interface ILogger {
  log (...args: any[]): void;
  debug (...args: any[]): void;
  info (...args: any[]): void;
  warn (...args: any[]): void;
  error (...args: any[]): void;
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
}

export interface ISessionInfo {
  sessionId: string;
  autoAnswer: boolean;
  fromJid: string;
  conversationId: string;
}

export interface IAcceptPendingSessionRequest {
  id: string;
  mediaStream?: MediaStream;
  audioElement?: HTMLAudioElement;
}

export interface IEndSessionRequest {
  id?: string;
  conversationId?: string;
}

export interface IStartSessionParams {
  sessionType: SessionTypes;
  jid?: string;
}
}
