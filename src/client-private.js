// The "private methods" of the client class.
// These are all invoked bound to an instance of the class, but are not exposed on the
// instance object.

const request = require('superagent');

const PC_AUDIO_EL_CLASS = '__pc-webrtc-inbound';

function buildUri (path, version = 'v2') {
  path = path.replace(/^\/+|\/+$/g, ''); // trim leading/trailing /
  return `https://api.${this._environment}/api/${version}/${path}`;
}

function buildAssetUri (path) {
  path = path.replace(/^\/+|\/+$/g, ''); // trim leading/trailing /
  return `https://apps.${this._environment}/${path}`;
}

function requestApi (path, { method, data, version, contentType } = {}) {
  let response = request[method || 'get'](buildUri.call(this, path, version))
    .set('Authorization', `Bearer ${this._accessToken}`)
    .type(contentType || 'json');

  return response.send(data); // trigger request
}

function rejectErr (message, details) {
  const error = new Error(message);
  error.details = details;
  this.logger.error(message, details);
  this.emit('error', details);
  throw error;
}

function setupStreamingClient () {
  const connectionOptions = {
    carrierPigeon: false,
    fetchGroupsOnConnect: false,
    fetchRosterOnConnect: false,
    focusV2: true,
    signalIceConnected: true,
    jidResource: 'purecloud-webrtc-sdk',
    rtcSessionSurvivability: true,
    authKey: this._accessToken,
    jid: this._personDetails.chat.jabberId,
    iceTransportPolicy: this._iceTransportPolicy,
    host: `https://realtime.${this._environment}`
  };

  this.logger.debug('Streaming client WebSocket connection options', connectionOptions);

  return new Promise((resolve) => {
    const staticAssetUri = buildAssetUri.call(this, '/static-realtime-js/realtime.js');
    const realtimeScript = document.createElement('script');
    realtimeScript.type = 'text/javascript';
    realtimeScript.async = true;
    realtimeScript.src = staticAssetUri;
    realtimeScript.onerror = (error) => {
      rejectErr.call(this, 'Failed to load PureCloud streaming client script', error);
    };
    realtimeScript.addEventListener('load', () => {
      const connection = new window.Realtime(connectionOptions);

      this._streamingConnection = connection;
      connection.on('connected', () => {
        this.logger.log('PureCloud streaming client connected');
      });
      connection.on('rtcIceServers', () => {
        this.logger.log('PureCloud streaming client ready for WebRTC calls');
        resolve();
      });
      connection.connect();
    });

    const head = document.head;
    head.appendChild(realtimeScript);
  });
}

function startMedia () {
  return this.pendingStream
    ? Promise.resolve(this.pendingStream)
    : window.navigator.mediaDevices.getUserMedia({ audio: true });
}

function createMediaElement () {
  const existing = document.querySelector(`.${PC_AUDIO_EL_CLASS}`);
  if (existing) {
    return existing;
  }
  const audio = document.createElement('audio');
  audio.classList.add(PC_AUDIO_EL_CLASS);
  audio.style = 'visibility: hidden';

  document.body.append(audio);
  return audio;
}

function attachMedia (stream) {
  let audioElement;
  if (this._pendingAudioElement) {
    audioElement = this._pendingAudioElement;
  } else {
    audioElement = createMediaElement();
  }
  audioElement.autoplay = true;
  audioElement.srcObject = stream;
}

function onSession (session) {
  this.logger.log('session', session);

  session.id = session.sid;
  const pendingSessionInfo = this._pendingSessions[session.id];
  if (pendingSessionInfo) {
    session.conversationId = pendingSessionInfo.conversationId;
  }
  this._pendingSessions[session.id] = null;

  startMedia.call(this).then(stream => {
    this.logger.log('got media', stream);
    session.addStream(stream);
    session._outboundStream = stream;

    if (session.streams.length === 1 && session.streams[0].getTracks().length > 0) {
      attachMedia.call(this, session.streams[0]);
    } else {
      session.on('peerStreamAdded', (session, stream) => {
        attachMedia.call(this, stream);
      });
    }

    if (this._autoConnectSessions) {
      session.accept();
    }

    session.on('terminated', reason => {
      if (session._outboundStream) {
        session._outboundStream.getTracks().forEach(t => t.stop());
      }
      this.emit('sessionEnded', reason);
    });
    this.emit('sessionStarted', session);
  });
}

function onPendingSession (sessionInfo) {
  this.logger.log('pending session', sessionInfo);
  const sessionEvent = {
    id: sessionInfo.sessionId,
    autoAnswer: sessionInfo.autoAnswer,
    address: sessionInfo.fromJid.split('@')[0],
    conversationId: sessionInfo.conversationId
  };
  this.emit('pendingSession', sessionEvent);

  this._pendingSessions[sessionEvent.id] = sessionEvent;

  if (sessionInfo.autoAnswer) {
    this.acceptPendingSession(sessionInfo.sessionId);
  }
}

function replaceIceServers () {
  if (!this._customIceServersConfig) {
    return;
  }
  this._streamingConnection.sessionManager.iceServers = this._customIceServersConfig;
}

function proxyStreamingClientEvents () {
  // webrtc events
  const on = this._streamingConnection.on.bind(this._streamingConnection);
  on('requestIncomingRtcSession', onPendingSession.bind(this));
  on('incomingRtcSession', onSession.bind(this));
  on('rtcSessionError', this.emit.bind(this, 'error'));
  on('cancelIncomingRtcSession', session => this.emit('cancelPendingSession', session.id));
  on('handledIncomingRtcSession', session => this.emit('handledPendingSession', session.id));
  on('traceRtcSession', this.emit.bind(this, 'trace'));

  // other events
  on('error', this.emit.bind(this, 'error'));
  on('disconnected', () => this.emit('disconnected', 'Streaming API connection disconnected'));
  on('rtcIceServers', replaceIceServers.bind(this));
}

module.exports = {
  buildUri,
  requestApi,
  rejectErr,
  setupStreamingClient,
  proxyStreamingClientEvents
};
