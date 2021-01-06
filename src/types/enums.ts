export enum SdkErrorTypes {
  generic = 'generic',
  initialization = 'initialization',
  http = 'http',
  invalid_options = 'invalid_options',
  not_supported = 'not_supported',
  session = 'session',
  media = 'media',
}

export type LogLevels = 'log' | 'debug' | 'info' | 'warn' | 'error';

export enum SessionTypes {
  softphone = 'softphone',
  collaborateVideo = 'collaborateVideo',
  acdScreenShare = 'screenShare'
}

export enum CommunicationStates {
  contacting = 'contacting',
  connected = 'connected',
  disconnected = 'disconnected'
}

export enum JingleReasons {
  success = 'success',
  failedTransport = 'failed-transport',
  generalError = 'general-error',
  decline = 'decline',
  gone = 'gone',
  timeout = 'timeout',
  connectivityError = 'connectivity-error',
  alternativeSession = 'alternative-session'
}
