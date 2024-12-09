export { SessionTypes } from 'genesys-cloud-streaming-client';

export enum SdkErrorTypes {
  generic = 'generic',
  initialization = 'initialization',
  invalid_token = 'invalid_token',
  http = 'http',
  invalid_options = 'invalid_options',
  not_supported = 'not_supported',
  session = 'session',
  call = 'call',
  media = 'media'
}

export type LogLevels = 'log' | 'debug' | 'info' | 'warn' | 'error';

/**
 * https://developer.genesys.cloud/api/rest/v2/analytics/conversation_detail_model#overview
 */
export enum CommunicationStates {
  /** An agent is being alerted about an incoming call */
  alerting = 'alerting',
  /** An agent is performing an outbound call and is currently trying to establish a connection with the agent's station. */
  contacting = 'contacting',
  /** The participant is performing an outbound call and is currently dialing and waiting for the other party to pick up. */
  dialing = 'dialing',
  /** The agent has put the customer on hold. */
  hold = 'hold',
  /** call has connected */
  connected = 'connected',
  /** call has ended */
  disconnected = 'disconnected',
  /** not really sure, but it means it is done-done */
  terminated = 'terminated'
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
