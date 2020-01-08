/// <reference path="types/libs.ts" />

import WildEmitter from 'wildemitter';
import uuidv4 from 'uuid/v4';
import {
  setupStreamingClient,
  proxyStreamingClientEvents
} from './client-private';
import { requestApi, throwSdkError, SdkError } from './utils';
import { log, setupLogging } from './logging';
import { ISdkConstructOptions, ILogger, ICustomerData, ISdkConfig, IEndSessionRequest, IAcceptSessionRequest, ISessionMuteRequest, IPersonDetails } from './types/interfaces';
import { SdkErrorTypes, LogLevels, SessionTypes } from './types/enums';
import { SessionManager } from './sessions/session-manager';
import { startMedia } from './media-utils';

const ENVIRONMENTS = [
  'mypurecloud.com',
  'mypurecloud.com.au',
  'mypurecloud.jp',
  'mypurecloud.de',
  'mypurecloud.ie',
  'usw2.pure.cloud'
];

/**
 * Validate SDK construct options.
 *  Returns `null` if no errors,
 *    returns `string` with error message if there are errors
 * @param options
 */
function validateOptions (options: ISdkConstructOptions): string | null {
  if (!options) {
    return 'Options required to create an instance of the SDK';
  }

  if (!options.accessToken && !options.organizationId) {
    return 'Access token is required to create an authenticated instance of the SDK. Otherwise, provide organizationId for a guest/anonymous user.';
  }

  if (!options.environment) {
    (options.logger || console).warn('No environment provided, using mypurecloud.com');
    options.environment = 'mypurecloud.com';
  }

  if (ENVIRONMENTS.indexOf(options.environment) === -1) {
    (options.logger || console).warn('Environment is not in the standard list. You may not be able to connect.');
  }
  return null;
}

/**
 * SDK to interact with PureCloud WebRTC functionality
 */
export class PureCloudWebrtcSdk extends WildEmitter {

  public logger: ILogger;

  readonly VERSION = '[AIV]{version}[/AIV]';

  _reduceLogPayload: boolean;
  _logBuffer: any[];
  _logTimer: NodeJS.Timeout | null;
  _connected: boolean;
  _streamingConnection: any;
  _backoffActive: boolean;
  _failedLogAttempts: number;
  _backoff: any;
  _orgDetails: any;
  _personDetails: IPersonDetails;
  _clientId: string;
  _customerData: ICustomerData;
  _hasConnected: boolean;
  _refreshTurnServersInterval: NodeJS.Timeout;
  _config: ISdkConfig;
  sessionManager: SessionManager;

  get isInitialized (): boolean {
    return !!this._streamingConnection;
  }

  get connected (): boolean {
    return !!this._streamingConnection.connected;
  }

  get isGuest (): boolean {
    return !this._config.accessToken;
  }

  constructor (options: ISdkConstructOptions) {
    super();

    const errorMsg = validateOptions(options);
    if (errorMsg) {
      throw new SdkError(SdkErrorTypes.invalid_options, errorMsg);
    }

    this._config = {
      accessToken: options.accessToken,
      autoConnectSessions: options.autoConnectSessions !== false, // default true
      customIceServersConfig: options.iceServers,
      defaultAudioElement: options.defaultAudioElement,
      defaultAudioStream: options.defaultAudioStream,
      defaultVideoElement: options.defaultVideoElement,
      disableAutoAnswer: options.disableAutoAnswer || false, // default false
      environment: options.environment,
      iceTransportPolicy: options.iceTransportPolicy || 'all',
      logLevel: options.logLevel || LogLevels.info,
      optOutOfTelemetry: options.optOutOfTelemetry || false, // default false
      wsHost: options.wsHost
    };

    this._orgDetails = { id: options.organizationId };

    Object.defineProperty(this, '_clientId', {
      value: uuidv4(),
      writable: false
    });

    setupLogging.call(this, options.logger, this._config.logLevel);

    // Telemetry for specific events
    // onPendingSession, onSession, onMediaStarted, onSessionTerminated logged in event handlers
    this.on('error', log.bind(this, LogLevels.error));
    this.on('disconnected', log.bind(this, LogLevels.error, 'onDisconnected'));
    this.on('cancelPendingSession', log.bind(this, LogLevels.warn, 'cancelPendingSession'));
    this.on('handledPendingSession', log.bind(this, LogLevels.warn, 'handledPendingSession'));
    this.on('trace', log.bind(this, LogLevels.debug));

    this._connected = false;
    this._streamingConnection = null;
  }

  /**
   * Setup the SDK for use and authenticate the user
   *  - agents must have an accessToken passed into the constructor options
   *  - guest's need a securityCode
   * @param opts optional initialize options
   */
  public async initialize (opts?: { securityCode: string } | ICustomerData): Promise<void> {
    let httpRequests: Promise<any>[] = [];
    if (this.isGuest) {
      let guestPromise: Promise<void>;

      /* if there is a securityCode, fetch conversation details */
      if (this.isSecurityCode(opts)) {
        log.call(this, LogLevels.debug, 'Fetching conversation details via secuirty code', opts.securityCode);
        guestPromise = requestApi.call(this, '/conversations/codes', {
          method: 'post',
          data: {
            organizationId: this._orgDetails.id,
            addCommunicationCode: opts.securityCode
          },
          auth: false
        }).then(({ body }) => {
          this._customerData = body;
        });

        /* if no securityCode, check for valid customerData */
      } else if (this.isCustomerData(opts)) {
        log.call(this, LogLevels.debug, 'Using customerData passed into the initialize', opts);
        guestPromise = Promise.resolve().then(() => {
          this._customerData = opts;
        });
      } else {
        throwSdkError.call(this, SdkErrorTypes.invalid_options, '`securityCode` is required to initialize the SDK as a guest');
      }

      httpRequests.push(guestPromise);
    } else {
      const getOrg = requestApi.call(this, '/organizations/me')
        .then(({ body }) => {
          this._orgDetails = body;
          log.call(this, LogLevels.debug, 'Organization details', body);
        });

      const getPerson = requestApi.call(this, '/users/me')
        .then(({ body }) => {
          this._personDetails = body;
          log.call(this, LogLevels.debug, 'Person details', body);
        });

      httpRequests.push(getOrg);
      httpRequests.push(getPerson);
    }

    try {
      await Promise.all(httpRequests);
    } catch (err) {
      throwSdkError.call(this, SdkErrorTypes.http, err.message, err);
    }

    try {
      await setupStreamingClient.call(this);
      await proxyStreamingClientEvents.call(this);
      this.emit('ready');
    } catch (err) {
      throwSdkError.call(this, SdkErrorTypes.initialization, err.message, err);
    }
  }

  /**
   * Start a screen share. Currently, guest is the only supported screen share.
   *  `initialize()` must be called first.
   */
  public async startScreenShare (): Promise<void> {
    if (this.isGuest) {
      await this.sessionManager.startSession({ sessionType: SessionTypes.acdScreenShare });
    } else {
      throwSdkError.call(this, SdkErrorTypes.not_supported, 'Agent screen share is not yet supported');
    }
  }

  /**
   * Start a video conference. Not supported for guests.
   *  `initialize()` must be called first.
   */
  public async startVideoConference (roomJid: string): Promise<void> {
    if (!this.isGuest) {
      await this.sessionManager.startSession({ jid: roomJid, sessionType: SessionTypes.collaborateVideo });
    } else {
      throwSdkError.call(this, SdkErrorTypes.not_supported, 'video conferencing not supported for guests');
    }
  }

  public async createMedia (opts: { video?: boolean, audio?: boolean }): Promise<MediaStream> {
    if (!opts || (!opts.video && !opts.audio)) {
      throwSdkError.call(this, SdkErrorTypes.invalid_options, 'createMedia must be called with at least one media type request');
    }

    return startMedia(opts);
  }

  /**
   * Mutes/Unmutes video/camera for a session and updates the conversation accordingly. Will fail if the session is not found.
   * Incoming video is unaffected
   */
  public async setVideoMute (muteOptions: ISessionMuteRequest): Promise<void> {
    await this.sessionManager.setVideoMute(muteOptions);
  }

  /**
   * Mutes/Unmutes audio/mic for a session and updates the conversation accordingly. Will fail if the session is not found.
   * Incoming audio is unaffected
   */
  public async setAudioMute (muteOptions: ISessionMuteRequest): Promise<void> {
    await this.sessionManager.setAudioMute(muteOptions);
  }

  /**
   * Accept a pending session based on the passed in ID.
   * @param opts object with mediaStream and/or audioElement to attach to session
   */
  public async acceptPendingSession (sessionId: string): Promise<void> {
    await this.sessionManager.proceedWithSession(sessionId);
  }

  /**
   * Accept a pending session based on the passed in ID.
   * @param opts object with mediaStream and/or audioElement to attach to session
   */
  public async acceptSession (opts: IAcceptSessionRequest): Promise<void> {
    await this.sessionManager.acceptSession(opts);
  }

  /**
   * End an active session based on the session ID _or_ conversation ID (one is required)
   * @param opts object with session ID _or_ conversation ID
   */
  public async endSession (opts: IEndSessionRequest): Promise<void> {
    return this.sessionManager.endSession(opts);
  }

  /**
   * Disconnect the streaming connection
   */
  public disconnect (): Promise<void> {
    return this._streamingConnection.disconnect();
  }

  /**
   * Reconnect the streaming connection
   */
  public reconnect (): Promise<void> {
    return this._streamingConnection.reconnect();
  }

  _refreshTurnServers () {
    return this._streamingConnection._webrtcSessions.refreshIceServers()
      .then(services => {
        this.logger.debug('PureCloud SDK refreshed TURN credentials successfully');
      }).catch(err => {
        const errorMessage = 'PureCloud SDK failed to update TURN credentials. The application should be restarted to ensure connectivity is maintained.';
        this.logger.warn(errorMessage, err);
        throwSdkError.call(this, SdkErrorTypes.generic, errorMessage, err);
      });
  }

  private isSecurityCode (data: { securityCode: string } | ICustomerData): data is { securityCode: string } {
    data = data as { securityCode: string };
    return !!(data && data.securityCode);
  }

  private isCustomerData (data: { securityCode: string } | ICustomerData): data is ICustomerData {
    data = data as ICustomerData;
    return !!(data
      && data.conversation
      && data.conversation.id
      && data.sourceCommunicationId
      && data.jwt);
  }

}
