export interface SdkConstructOptions {
  accessToken: string;
  organizationId: string;
  environment: string;
  wsHost: string;
  autoConnectSessions: boolean;
  iceServers: RTCConfiguration;
  iceTransportPolicy: RTCIceTransportPolicy;
  logLevel: string;
  logger: ILogger;
}

export interface ILogger {
  log (...args: any[]): void;
  debug (...args: any[]): void;
  info (...args: any[]): void;
  warn (...args: any[]): void;
  error (...args: any[]): void;
}
