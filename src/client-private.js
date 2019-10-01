// The "private methods" of the client class.
// These are all invoked bound to an instance of the class, but are not exposed on the
// instance object.

const request = require('superagent');
const StatsGatherer = require('webrtc-stats-gatherer');

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
  this.emit('error', message, details);
  throw error;
}

function setupStreamingClient () {
  const connectionOptions = {
    carrierPigeon: false,
    fetchGroupsOnConnect: false,
    fetchRosterOnConnect: false,
    focusV2: true,
    roomsV2: true,
    signalIceConnected: true,
    jidResource: 'purecloud-webrtc-sdk',
    rtcSessionSurvivability: true,
    authKey: this._accessToken,
    jid: this._personDetails.chat.jabberId,
    iceTransportPolicy: this._iceTransportPolicy,
    host: `https://realtime.${this._environment}`
  };

  this._log('debug', 'Streaming client WebSocket connection options', connectionOptions);
  this._hasConnected = false;

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
      connection.on('connect', () => {
        this.emit('connected', { reconnect: this._hasConnected });
        this._log('info', 'PureCloud streaming client connected', { reconnect: this._hasConnected });
        this._hasConnected = true;
      });
      connection.on('rtcIceServers', () => {
        this._log('info', 'PureCloud streaming client ready for WebRTC calls');
        resolve();
      });

      // refresh turn servers every 6 hours
      this._refreshTurnServersInterval = setInterval(this._refreshTurnServers.bind(this), 6 * 60 * 60 * 1000);
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

function getSafeIdentifier (identifier) {
  return `call-${identifier}`;
}

function getMediaElement (sid) {
  const safeIdentifier = getSafeIdentifier(sid);
  return document.querySelector(`.${PC_AUDIO_EL_CLASS}${safeIdentifier}`);
}

function createMediaElement (identifier) {
  const existing = getMediaElement(identifier);
  if (existing) {
    return existing;
  }
  const audio = document.createElement('audio');
  audio.classList.add(PC_AUDIO_EL_CLASS, getSafeIdentifier(identifier));
  audio.style = 'visibility: hidden';

  document.body.append(audio);
  return audio;
}

function cleanupMediaElement (identifier) {
  const elem = getMediaElement(identifier);
  if (elem) {
    this._log('info', 'Removing media element', { identifier });
    elem.parentNode.removeChild(elem);
  }
}

function attachMedia (stream, sessionId) {
  let audioElement;
  if (this._pendingAudioElement) {
    audioElement = this._pendingAudioElement;
  } else {
    audioElement = createMediaElement(sessionId);
  }

  if (audioElement.srcObject) {
    this._log('warn', 'Attaching media to an audio element that already has a srcObject. This can result is audio issues.');
  }

  audioElement.autoplay = true;
  audioElement.srcObject = stream;
}

function onSession (session) {
  try {
    this._log('info', 'onSession', { id: session.sid });
  } catch (e) {
    // don't let log errors ruin a session
  }

  session.id = session.sid;
  const pendingSessionInfo = this._pendingSessions[session.id];
  if (pendingSessionInfo) {
    session.conversationId = pendingSessionInfo.conversationId;
  }
  this._pendingSessions[session.id] = null;

  session._statsGatherer = new StatsGatherer(session.pc, {
    session: session.sid,
    conference: session.conversationId
  });
  session._statsGatherer.on('stats', (data) => {
    data.conversationId = session.conversationId;
    this._log('info', 'session:stats', data);
  });
  session._statsGatherer.on('traces', (data) => {
    data.conversationId = session.conversationId;
    this._log('warn', 'session:trace', data);
  });
  session.on('change:active', (session, active) => {
    if (active) {
      session._statsGatherer.collectInitialConnectionStats();
    }
    this._log('info', 'change:active', { active, conversationId: session.conversationId, sid: session.sid });
  });

  startMedia.call(this).then(stream => {
    this._log('debug', 'onMediaStarted');
    session.addStream(stream);
    session._outboundStream = stream;

    if (session.streams.length === 1 && session.streams[0].getTracks().length > 0) {
      attachMedia.call(this, session.streams[0], session.sid);
    } else {
      session.on('peerStreamAdded', (session, stream) => {
        attachMedia.call(this, stream, session.sid);
      });
    }

    if (this._autoConnectSessions) {
      session.accept();
    }

    session.on('terminated', (session, reason) => {
      this._log('info', 'onSessionTerminated', { conversationId: session.conversationId, reason });
      if (session._outboundStream) {
        session._outboundStream.getTracks().forEach(t => t.stop());
      }

      cleanupMediaElement.call(this, session.sid);
      this.emit('sessionEnded', session, reason);
    });
    this.emit('sessionStarted', session);
  });
}

function onPendingSession (sessionInfo) {
  this._log('info', 'onPendingSession', sessionInfo);
  const sessionEvent = {
    id: sessionInfo.sessionId,
    autoAnswer: sessionInfo.autoAnswer,
    address: sessionInfo.fromJid.split('@')[0],
    conversationId: sessionInfo.conversationId
  };

  const existingSessionId = Object.keys(this._pendingSessions).find(k => {
    const session = this._pendingSessions[k];
    return session && session.conversationId === sessionInfo.conversationId;
  });

  if (existingSessionId) {
    this._log('info', 'duplicate session invitation, ignoring', sessionInfo);
    return;
  }

  this.emit('pendingSession', sessionEvent);

  this._pendingSessions[sessionEvent.id] = sessionEvent;
  setTimeout(() => {
    this._pendingSessions[sessionEvent.id] = null;
  }, 1000);

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
  on('cancelIncomingRtcSession', session => this.emit('cancelPendingSession', session));
  on('handledIncomingRtcSession', session => this.emit('handledPendingSession', session));
  on('traceRtcSession', this.emit.bind(this, 'trace'));

  // other events
  on('error', this.emit.bind(this, 'error'));
  on('disconnect', () => this.emit('disconnected', 'Streaming API connection disconnected'));
  on('rtcIceServers', replaceIceServers.bind(this));
}

module.exports = {
  buildUri,
  requestApi,
  rejectErr,
  setupStreamingClient,
  proxyStreamingClientEvents
};
