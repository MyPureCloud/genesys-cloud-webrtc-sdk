'use strict';

const WildEmitter = require('wildemitter');

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

    this.logger = options.logger || console;
    this._accessToken = options.accessToken;
    this._environment = options.environment;
    this._autoConnectSessions = options.autoConnectSessions !== false;
    this._customIceServersConfig = options.iceServers;
    this._iceTransportPolicy = options.iceTransportPolicy || 'all';

    this._connected = false;
    this._streamingConnection = null;
  }

  initialize () {
    const getOrg = requestApi.call(this, '/organizations/me')
      .then(({ body }) => {
        this._orgDetails = body;
        this.logger.debug('Organization details', body);
      });

    const getPerson = requestApi.call(this, '/users/me')
      .then(({ body }) => {
        this._personDetails = body;
        this.logger.debug('Person details', body);
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

  // public API methods
  acceptPendingSession (id) {
    this._streamingConnection.acceptRtcSession(id);
  }

  rejectPendingSession (id) {
    this._streamingConnection.rejectRtcSession(id);
  }

  disconnect (id) {
    this._streamingConnection.disconnect();
  }
  // internal methods
}

module.exports = PureCloudWebrtcSdk;
