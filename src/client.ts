import WildEmitter from 'wildemitter';
import uuidv4 from 'uuid/v4';
import { setupStreamingClient, proxyStreamingClientEvents, startGuestScreenShare } from './client-private';
import { requestApi, rejectErr } from './utils';
import { log, setupLogging } from './logging';
import { SdkConstructOptions, ILogger, SupportedSdkTypes } from './types/interfaces';

const ENVIRONMENTS = [
  'mypurecloud.com',
  'mypurecloud.com.au',
  'mypurecloud.jp',
  'mypurecloud.de',
  'mypurecloud.ie',
  'usw2.pure.cloud'
];

// helper methods
function validateOptions (options: SdkConstructOptions) {
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
  _sdkType: SupportedSdkTypes;
  _guest: boolean;

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
    this._sdkType = options.sdkType || 'softphone';
    this._guest = !options.accessToken;

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

  public initialize (opts?: { securityCode?: string }): Promise<void> {
    let fetchInfoPromises: Promise<any>[] = [];
    if (this._guest) {
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

    return Promise.all(fetchInfoPromises)
      .then(() => {
        return setupStreamingClient.call(this);
      })
      .then(() => {
        return proxyStreamingClientEvents.call(this);
      })
      .then(() => {
        this.emit('ready');
        // if we are a guest and sdkType is screenshare, then we have to kick off
        // the rtc session by getting the user's display stream
        if (this._guest && this._sdkType === 'screenshare') {
          return startGuestScreenShare.call(this);
        }
      })
      .catch(err => {
        rejectErr.call(this, 'Failed to initialize SDK', err);
      });
  }

  get connected (): boolean {
    return !!this._streamingConnection.connected;
  }

  get _sessionManager () {
    return this._streamingConnection._webrtcSessions.jingleJs;
  }

  get isGuest (): boolean {
    return this._guest;
  }

  get sdkType (): SupportedSdkTypes {
    return this._sdkType;
  }

  // public API methods
  public acceptPendingSession (id: string) {
    this._streamingConnection.webrtcSessions.acceptRtcSession(id);
  }

  public endSession (opts: { id?: string, conversationId?: string } = {}) {
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
    return requestApi.call(this, `/conversations/calls/${session.conversationId}`)
      .then(({ body }) => {
        const participant = body.participants
          .find(p => p.user && p.user.id === this._personDetails.id);
        return requestApi.call(this, `/conversations/calls/${session.conversationId}/participants/${participant.id}`, {
          method: 'patch',
          data: JSON.stringify({ state: 'disconnected' })
        });
      })
      .catch(err => {
        session.end();
        throw err;
      });
  }

  public disconnect (): void {
    this._streamingConnection.disconnect();
  }

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
