export enum SdkErrorTypes {
  generic = 'generic',
  initialization = 'initialization',
  http = 'http',
  invalid_options = 'invalid_options',
  not_supported = 'not_supported',
  session = 'session'
}

export enum LogLevels {
  log = 'log',
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error'
}

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
