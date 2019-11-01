import WildEmitter from 'wildemitter';
import uuidv4 from 'uuid/v4';
import { setupStreamingClient, proxyStreamingClientEvents, startGuestScreenShare } from './client-private';
import { requestApi, throwSdkError, SdkError } from './utils';
import { log, setupLogging } from './logging';
import { ISdkConstructOptions, ILogger, ICustomerData, ISdkConfig } from './types/interfaces';
import { SdkErrorTypes, LogLevels } from './types/enums';

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
  public pendingStream: MediaStream;

  readonly VERSION = '[AIV]{version}[/AIV]';

  _reduceLogPayload: boolean;
  _logBuffer: any[];
  _logTimer: NodeJS.Timeout | null;
  _connected: boolean;
  _streamingConnection: any;
  _pendingSessions: any[];
  _backoffActive: boolean;
  _failedLogAttempts: number;
  _backoff: any;
  _orgDetails: any;
  _personDetails: any;
  _clientId: string;
  _customerData: ICustomerData;
  _hasConnected: boolean;
  _refreshTurnServersInterval: NodeJS.Timeout;
  _pendingAudioElement: any;
  _config: ISdkConfig;

  get isInitialized (): boolean {
    return !!this._streamingConnection;
  }

  get connected (): boolean {
    return !!this._streamingConnection.connected;
  }

  get _sessionManager () {
    return this._streamingConnection._webrtcSessions.jingleJs;
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
    this._pendingSessions = [];
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
      proxyStreamingClientEvents.call(this);
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
      await startGuestScreenShare.call(this);
    } else {
      throwSdkError.call(this, SdkErrorTypes.not_supported, 'Agent screen share is not yet supported');
    }
  }

  /**
   * Accept a pending session based on the passed in ID.
   * @param id string ID of the pending session
   * @param opts object with mediaStream and/or audioElement to attach to session
   */
  public acceptPendingSession (id: string, opts?: { mediaStream?: MediaStream, audioElement?: HTMLAudioElement }): void {
    if (opts && opts.mediaStream) {
      this.pendingStream = opts.mediaStream;
    }
    if (opts && opts.audioElement) {
      this._pendingAudioElement = opts.audioElement;
    }
    this._streamingConnection.webrtcSessions.acceptRtcSession(id);
  }

  /**
   * End an active session based on the session ID _or_ conversation ID (one is required)
   * @param opts object with session ID _or_ conversation ID
   */
  public async endSession (opts: { id?: string, conversationId?: string } = {}): Promise<void> {
    if (!opts.id && !opts.conversationId) {
      throwSdkError.call(this, SdkErrorTypes.session, 'Unable to end session: must provide session id or conversationId.');
    }
    let session;
    if (opts.id) {
      session = this._sessionManager.sessions[opts.id];
    } else {
      const sessions = Object.keys(this._sessionManager.sessions).map(k => this._sessionManager.sessions[k]);
      session = sessions.find(s => s.conversationId === opts.conversationId);
    }

    if (!session) {
      throwSdkError.call(this, SdkErrorTypes.session, 'Unable to end session: session not connected.');
    }

    if (!session.conversationId) {
      log.call(this, LogLevels.warn, 'Session has no conversationId. Terminating session.');
      session.end();
      return;
    }

    if (this.isGuest) {
      session.end();
      return;
    }

    try {
      const { body } = await requestApi.call(this, `/conversations/calls/${session.conversationId}`);
      const participant = body.participants
        .find((p: { user?: { id?: string } }) => p.user && p.user.id === this._personDetails.id);
      await requestApi.call(this, `/conversations/calls/${session.conversationId}/participants/${participant.id}`, {
        method: 'patch',
        data: JSON.stringify({ state: 'disconnected' })
      });
    } catch (err) {
      session.end();
      throwSdkError.call(this, SdkErrorTypes.http, err.message, err);
    }

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
