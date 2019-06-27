'use strict';

const WildEmitter = require('wildemitter');
const uuidv4 = require('uuid/v4');

const {
  setupStreamingClient,
  proxyStreamingClientEvents
} = require('./client-private');

const {
  requestApi,
  rejectErr
} = require('./utils');

const {
  log,
  setupLogging
} = require('./logging');

const ENVIRONMENTS = [
  'mypurecloud.com',
  'mypurecloud.com.au',
  'mypurecloud.jp',
  'mypurecloud.de',
  'mypurecloud.ie',
  'usw2.pure.cloud'
];

// helper methods
function validateOptions (options) {
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

class PureCloudWebrtcSdk extends WildEmitter {
  constructor (options) {
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

  initialize (opts) {
    let fetchInfoPromises = [];
    if (opts && opts.securityCode) {
      const getJwt = requestApi.call(this, '/conversations/codes', {
        method: 'POST',
        data: {
          organizationId: this._orgDetails.id,
          addCommunicationCode: opts.securityCode
        }
      }).then(info => {
        this._jwt = info.jwt;
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
      })
      .catch(err => {
        rejectErr.call(this, 'Failed to initialize SDK', err);
      });
  }

  get connected () {
    return !!this._streamingConnection.connected;
  }

  get _sessionManager () {
    return this._streamingConnection._webrtcSessions.jingleJs;
  }

  // public API methods
  acceptPendingSession (id) {
    this._streamingConnection.webrtcSessions.acceptRtcSession(id);
  }

  endSession (opts = {}) {
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

  disconnect () {
    this._streamingConnection.disconnect();
  }

  reconnect () {
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

module.exports = PureCloudWebrtcSdk;
