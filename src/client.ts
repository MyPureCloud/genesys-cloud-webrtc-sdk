import WildEmitter from 'wildemitter';
import uuidv4 from 'uuid/v4';
import { setupStreamingClient, proxyStreamingClientEvents, startGuestScreenShare } from './client-private';
import { requestApi, rejectErr } from './utils';
import { log, setupLogging } from './logging';
import { SdkConstructOptions, ILogger } from './types/interfaces';

const ENVIRONMENTS = [
  'mypurecloud.com',
  'mypurecloud.com.au',
  'mypurecloud.jp',
  'mypurecloud.de',
  'mypurecloud.ie',
  'usw2.pure.cloud'
];

/**
 * Validate SDK construct options
 * @param options
 */
function validateOptions (options: SdkConstructOptions): void {
  if (!options) {
    throw new Error('Options required to create an instance of the SDK');
  }

  if (!options.accessToken && !options.organizationId) {
    throw new Error('Access token is required to create an authenticated instance of the SDK. Otherwise, provide organizationId for a guest/anonymous user.');
  }

  if (!options.environment) {
    (options.logger || console).warn('No environment provided, using mypurecloud.com');
    options.environment = 'mypurecloud.com';
  }

  if (ENVIRONMENTS.indexOf(options.environment) === -1) {
    (options.logger || console).warn('Environment is not in the standard list. You may not be able to connect.');
  }
}

/**
 * SDK to interact with PureCloud WebRTC functionality
 */
export default class PureCloudWebrtcSdk extends WildEmitter {

  public logger: ILogger;
  public pendingStream: MediaStream;

  _reduceLogPayload: boolean;
  _accessToken: string;
  _environment: string;
  _wsHost: string;
  _autoConnectSessions: boolean;
  _customIceServersConfig: RTCConfiguration;
  _iceTransportPolicy: RTCIceTransportPolicy;
  _logBuffer: any[];
  _logTimer: NodeJS.Timeout | null;
  _logLevel: string;
  _connected: boolean;
  _streamingConnection: any;
  _pendingSessions: any[];
  _backoffActive: boolean;
  _failedLogAttempts: number;
  _backoff: any;
  _orgDetails: any;
  _personDetails: any;
  _optOutOfTelemetry: any;
  _clientId: string;
  _jwt: string;
  _hasConnected: boolean;
  _refreshTurnServersInterval: NodeJS.Timeout;
  _pendingAudioElement: any;

  get connected (): boolean {
    return !!this._streamingConnection.connected;
  }

  get _sessionManager () {
    return this._streamingConnection._webrtcSessions.jingleJs;
  }

  get isGuest (): boolean {
    return !this._accessToken;
  }

  constructor (options: SdkConstructOptions) {
    super();
    validateOptions(options);

    this._accessToken = options.accessToken;
    this._orgDetails = { id: options.organizationId };
    this._environment = options.environment;
    this._wsHost = options.wsHost;
    this._autoConnectSessions = options.autoConnectSessions !== false;
    this._customIceServersConfig = options.iceServers;
    this._iceTransportPolicy = options.iceTransportPolicy || 'all';

    Object.defineProperty(this, '_clientId', {
      value: uuidv4(),
      writable: false
    });

    setupLogging.call(this, options.logger, options.logLevel);

    // Telemetry for specific events
    // onPendingSession, onSession, onMediaStarted, onSessionTerminated logged in event handlers
    this.on('error', log.bind(this, 'error'));
    this.on('disconnected', log.bind(this, 'error', 'onDisconnected'));
    this.on('cancelPendingSession', log.bind(this, 'warn', 'cancelPendingSession'));
    this.on('handledPendingSession', log.bind(this, 'warn', 'handledPendingSession'));
    this.on('trace', log.bind(this, 'debug'));

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
  public async initialize (opts?: { securityCode?: string }): Promise<void> {
    let fetchInfoPromises: Promise<any>[] = [];
    if (this.isGuest) {
      if (!opts || !opts.securityCode) {
        throw new Error('Security Code is required to initialize the SDK as a guest');
      }
      const getJwt = requestApi.call(this, '/conversations/codes', {
        method: 'post',
        data: {
          organizationId: this._orgDetails.id,
          addCommunicationCode: opts.securityCode
        },
        auth: false
      }).then(({ body }) => {
        this._jwt = body.jwt;
      });

      fetchInfoPromises.push(getJwt);
    } else {
      const getOrg = requestApi.call(this, '/organizations/me')
        .then(({ body }) => {
          this._orgDetails = body;
          log.call(this, 'debug', 'Organization details', body);
        });

      const getPerson = requestApi.call(this, '/users/me')
        .then(({ body }) => {
          this._personDetails = body;
          log.call(this, 'debug', 'Person details', body);
        });

      fetchInfoPromises.push(getOrg);
      fetchInfoPromises.push(getPerson);
    }

    try {
      await Promise.all(fetchInfoPromises);
      await setupStreamingClient.call(this);
      proxyStreamingClientEvents.call(this);
      this.emit('ready');
    } catch (err) {
      rejectErr.call(this, 'Failed to initialize SDK', err);
    }
  }

  /**
   * Start a screen share. Currently, guest is the only supported screen share.
   *  `initialize()` must be called first.
   */
  public startScreenShare (): Promise<void> {
    if (this.isGuest) {
      return startGuestScreenShare.call(this);
    }

    return Promise.reject('Agent screen share is not yet supported');
  }

  /**
   * Accept a pending session based on the passed in ID.
   * @param id string ID of the pending session
   * @param opts object with mediaStream and/or audioElement to attach to session
   */
  public acceptPendingSession (id: string, opts?: { mediaStream ?: MediaStream, audioElement?: HTMLAudioElement}): void {
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
      return Promise.reject(new Error('Unable to end session: must provide session id or conversationId.'));
    }
    let session;
    if (opts.id) {
      session = this._sessionManager.sessions[opts.id];
    } else {
      const sessions = Object.keys(this._sessionManager.sessions).map(k => this._sessionManager.sessions[k]);
      session = sessions.find(s => s.conversationId === opts.conversationId);
    }

    if (!session) {
      return Promise.reject(new Error('Unable to end session: session not connected.'));
    }

    if (!session.conversationId) {
      log.call(this, 'warn', 'Session has no conversationId. Terminating session.');
      session.end();
      return Promise.resolve();
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
      throw err;
    }
  }

  /**
   * Disconnect the streaming connection
   */
  public disconnect (): void {
    this._streamingConnection.disconnect();
  }

  /**
   * Reconnect the streaming connection
   */
  public reconnect (): void {
    this._streamingConnection.reconnect();
  }

  _refreshTurnServers () {
    return this._streamingConnection._webrtcSessions.refreshIceServers()
      .then(services => {
        this.logger.debug('PureCloud SDK refreshed TURN credentials successfully');
      }).catch(err => {
        const errorMessage = 'PureCloud SDK failed to update TURN credentials. The application should be restarted to ensure connectivity is maintained.';
        this.logger.warn(errorMessage, err);
        this.emit('error', { message: errorMessage, error: err });
      });
  }
}
