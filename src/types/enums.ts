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

/** These currently only affect softphone media */
export enum MediaHandling {
  /** Handle all media; headset controls use traditional orchestration */
  standardMedia = 'standard-media',
  /** Handle all media; headset controls follow alerting leader */
  alertingLeaderMedia = 'alerting-leader-media',
  /**
   * Handle some media (see below); headset controls are not used
   *
   * - New eager persistent connections will be ignored.
   * - Auto-answer calls will be handled, which could result in a
   * persistent connection being established.
   */
  reducedMedia = 'reduced-media',
  /**
   * SDK internal use only. Handle some media (see below); headset controls use traditional orchestration.
   *
   * - New eager persistent connections will be ignored.
   * - Auto-answer calls will be handled, which could result in a
   * persistent connection being established.
   */
  reducedMediaHeadsets = 'reduced-media-headsets',
}
