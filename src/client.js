'use strict';

const WildEmitter = require('wildemitter');
const uuidv4 = require('uuid/v4');
const stringify = require('safe-json-stringify');

const {
  requestApi,
  rejectErr,
  setupStreamingClient,
  proxyStreamingClientEvents
} = require('./client-private');

const ENVIRONMENTS = [
  'mypurecloud.com',
  'mypurecloud.com.au',
  'mypurecloud.jp',
  'mypurecloud.de',
  'mypurecloud.ie'
];

const LOG_LEVELS = ['debug', 'log', 'info', 'warn', 'error'];

// helper methods
function validateOptions (options) {
  if (!options) {
    throw new Error('Options required to create an instance of the SDK');
  }

  if (!options.accessToken) {
    throw new Error('Access token is required to create an instance of the SDK');
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
    this._environment = options.environment;
    this._autoConnectSessions = options.autoConnectSessions !== false;
    this._customIceServersConfig = options.iceServers;
    this._iceTransportPolicy = options.iceTransportPolicy || 'all';

    Object.defineProperty(this, '_clientId', {
      value: uuidv4(),
      writable: false
    });

    this.logger = options.logger || console;
    this._logBuffer = [];
    this._logTimer = null;
    if (LOG_LEVELS.indexOf(options.logLevel) === -1) {
      if (options.logLevel) {
        this.logger.warn(`Invalid log level: '${options.logLevel}'. Default 'info' will be used instead.`);
      }
      this._logLevel = 'info';
    } else {
      this._logLevel = options.logLevel;
    }

    // Telemetry for specific events
    // onPendingSession, onSession, onMediaStarted, onSessionTerminated logged in event handlers
    this.on('error', this._log.bind(this, 'error'));
    this.on('disconnected', this._log.bind(this, 'error'));
    this.on('cancelPendingSession', this._log.bind(this, 'warn'));
    this.on('handledPendingSession', this._log.bind(this, 'warn'));
    this.on('trace', this._log.bind(this, 'debug'));

    this._connected = false;
    this._streamingConnection = null;
    this._pendingSessions = [];
  }

  initialize () {
    const getOrg = requestApi.call(this, '/organizations/me')
      .then(({ body }) => {
        this._orgDetails = body;
        this._log('debug', 'Organization details', body);
      });

    const getPerson = requestApi.call(this, '/users/me')
      .then(({ body }) => {
        this._personDetails = body;
        this._log('debug', 'Person details', body);
      });

    return Promise.all([getOrg, getPerson])
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
    return this._streamingConnection._controllers.webrtcController.sessionManager;
  }

  // public API methods
  acceptPendingSession (id) {
    this._streamingConnection.acceptRtcSession(id);
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
      this._log('warn', 'Session has no conversationId. Terminating session.');
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
    this._streamingConnection.requestExternalServices('turn', (err, services) => {
      if (err) {
        const errorMessage = 'PureCloud SDK failed to update TURN credentials. The application should be restarted to ensure connectivity is maintained.';
        this.logger.warn(errorMessage, err);
        this.emit('error', { message: errorMessage, error: err });
      } else {
        this.logger.debug('PureCloud SDK refreshed TURN credentials successfully');
      }
    });
  }

  _log (level, message, details) {
    // immediately log it locally
    this.logger[level](message, details);

    // ex: if level is debug and config is warn, then debug is less than warn, don't push
    if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(this._logLevel)) {
      return;
    }

    if (this._optOutOfTelemetry) {
      return;
    }

    const log = {
      clientTime: new Date().toISOString(),
      clientId: this._clientId,
      message,
      details
    };
    const logContainer = {
      topic: `purecloud-webrtc-sdk.${this._clientId}`,
      level: level.toUpperCase(),
      message: stringify(log)
    };
    this._logBuffer.push(logContainer);
    this._notifyLogs(); // debounced _sendLogs
  }

  _notifyLogs () {
    if (this._logTimer) {
      clearTimeout(this._logTimer);
    }
    this._logTimer = setTimeout(() => {
      this._sendLogs();
    }, 1000);
  }

  _sendLogs () {
    const traces = this._logBuffer.splice(0, this._logBuffer.lenth);
    const payload = {
      app: {
        appId: 'webrtc-sdk',
        appVersion: '[AIV]{version}[/AIV]' // injected by webpack auto-inject-version
      },
      traces
    };
    return requestApi.call(this, '/diagnostics/trace', {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      data: JSON.stringify(payload)
    }).catch(() => {
      this.logger.error('Failed to post logs to server', traces);
    });
  }
}

module.exports = PureCloudWebrtcSdk;
