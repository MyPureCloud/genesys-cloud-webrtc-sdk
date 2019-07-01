'use strict';

// const WildEmitter = require('wildemitter');
// const uuidv4 = require('uuid/v4');
// const stringify = require('safe-json-stringify');
// const backoff = require('backoff-web');

// const {
//   requestApi,
//   rejectErr,
//   setupStreamingClient,
//   proxyStreamingClientEvents
// } = require('./client-private');

import WildEmitter from 'wildemitter';
import uuidv4 from 'uuid/v4';
import stringify from 'safe-json-stringify';
import backoff from 'backoff-web';

import {
  requestApi,
  rejectErr,
  setupStreamingClient,
  proxyStreamingClientEvents
} from './client-private';

const ENVIRONMENTS = [
  'mypurecloud.com',
  'mypurecloud.com.au',
  'mypurecloud.jp',
  'mypurecloud.de',
  'mypurecloud.ie',
  'usw2.pure.cloud'
];

const LOG_LEVELS = ['debug', 'log', 'info', 'warn', 'error'];
const PAYLOAD_TOO_LARGE = 413;

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

  _reduceLogPayload: boolean;
  _accessToken: any;
  _environment: any;
  _wsHost: any;
  _autoConnectSessions: boolean;
  _customIceServersConfig: any;
  _iceTransportPolicy: any;
  logger: any;
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
  _clientId: any;
  constructor (options) {
    super();
    validateOptions(options);

    this._accessToken = options.accessToken;
    this._environment = options.environment;
    this._wsHost = options.wsHost;
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
    this.on('disconnected', this._log.bind(this, 'error', 'onDisconnected'));
    this.on('cancelPendingSession', this._log.bind(this, 'warn', 'cancelPendingSession'));
    this.on('handledPendingSession', this._log.bind(this, 'warn', 'handledPendingSession'));
    this.on('trace', this._log.bind(this, 'debug'));

    this._connected = false;
    this._streamingConnection = null;
    this._pendingSessions = [];

    // Flags for backoff functionality
    this._backoffActive = false;
    this._failedLogAttempts = 0;
    this._reduceLogPayload = false;
    this._backoff = backoff.exponential({
      randomisationFactor: 0.2,
      initialDelay: 500,
      maxDelay: 5000,
      factor: 2
    });
    this._initializeBackoff();
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

  _initializeBackoff () {
    this._backoff.failAfter(20);

    this._backoff.on('backoff', (number, delay) => {
      this._backoffActive = true;
      return this._sendLogs();
    });

    this._backoff.on('ready', (number, delay) => {
      this._backoff.backoff();
    });

    this._backoff.on('fail', (number, delay) => {
      this._backoffActive = false;
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

  endSession (opts: any = {}) {
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
        } as any);
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

  _log (level, message, details?: any) {
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
      topic: `purecloud-webrtc-sdk`,
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
      if (!this._backoffActive) {
        this._backoff.backoff();
      }
    }, 1000);
  }

  _sendLogs () {
    const traces = this._getLogPayload();
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
    } as any).then(() => {
      this.logger.log('Log data sent successfully');
      this._resetBackoffFlags();
      this._backoff.reset();

      if (this._logBuffer.length) {
        this.logger.log('Data still left in log buffer, preparing to send again');
        this._backoff.backoff();
      }
    }).catch((error) => {
      this._failedLogAttempts++;

      if (error.status === PAYLOAD_TOO_LARGE) {
        this.logger.error(error);

        // If sending a single log is too big, then scrap it and reset backoff
        if (traces.length === 1) {
          this._resetBackoffFlags();
          this._backoff.reset();
          return;
        }

        this._reduceLogPayload = true;
      } else {
        this.logger.error('Failed to post logs to server', traces);
      }

      // Put traces back into buffer in their original order
      const reverseTraces = traces.reverse(); // Reverse traces so they will be unshifted into their original order
      reverseTraces.forEach((log) => this._logBuffer.unshift(log));
    });
  }

  _getLogPayload () {
    let traces;
    if (this._reduceLogPayload) {
      const bufferDivisionFactor = this._failedLogAttempts || 1;
      traces = this._getReducedLogPayload(bufferDivisionFactor);
    } else {
      traces = this._logBuffer.splice(0, this._logBuffer.length);
    }

    return traces;
  }

  _getReducedLogPayload (reduceFactor) {
    const reduceBy = reduceFactor * 2;
    const itemsToGet = Math.floor(this._logBuffer.length / reduceBy) || 1;
    const traces = this._logBuffer.splice(0, itemsToGet);
    return traces;
  }

  _resetBackoffFlags () {
    this._backoffActive = false;
    this._failedLogAttempts = 0;
    this._reduceLogPayload = false;
  }
}

module.exports = PureCloudWebrtcSdk;
