export interface SdkConstructOptions {
  organizationId: string;
  environment: string;
  accessToken?: string;
  wsHost?: string;
  autoConnectSessions?: boolean;
  iceServers?: RTCConfiguration;
  iceTransportPolicy?: RTCIceTransportPolicy;
  logLevel?: string;
  logger?: ILogger;
  sdkType?: SupportedSdkTypes;
}

export interface ILogger {
  log (...args: any[]): void;
  debug (...args: any[]): void;
  info (...args: any[]): void;
  warn (...args: any[]): void;
  error (...args: any[]): void;
}

export type SupportedSdkTypes = 'softphone' | 'screenshare';
