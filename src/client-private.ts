import PureCloudWebrtcSdk from './client';

// The "private methods" of the client class.
// These are all invoked bound to an instance of the class, but are not exposed on the
// instance object.

import StatsGatherer from 'webrtc-stats-gatherer';
import StreamingClient from 'purecloud-streaming-client';
import { log } from './logging';

const PC_AUDIO_EL_CLASS = '__pc-webrtc-inbound';

function setupStreamingClient (this: PureCloudWebrtcSdk): Promise<void> {
  if (this._streamingConnection) {
    this.logger.warn('Existing streaming connection detected. Disconnecting and creating a new connection.');
    this._streamingConnection.disconnect();
  }

  const connectionOptions: any = {
    signalIceConnected: true,
    iceTransportPolicy: this._iceTransportPolicy,
    host: this._wsHost || `wss://streaming.${this._environment}`,
    apiHost: this._environment,
    logger: this.logger
  };

  if (this._personDetails) {
    connectionOptions.jid = this._personDetails.chat.jabberId;
  }

  if (this._accessToken) {
    connectionOptions.authToken = this._accessToken;
  }

  if (this._jwt) {
    connectionOptions.jwt = this._jwt;
  }

  log.call(this, 'debug', 'Streaming client WebSocket connection options', connectionOptions);
  this._hasConnected = false;

  const connection = new StreamingClient(connectionOptions);
  this._streamingConnection = connection;
  return connection.connect()
    .then(() => {
      this.emit('connected', { reconnect: this._hasConnected });
      log.call(this, 'info', 'PureCloud streaming client connected', { reconnect: this._hasConnected });
      this._hasConnected = true;
      // refresh turn servers every 6 hours
      this._refreshTurnServersInterval = setInterval(this._refreshTurnServers.bind(this), 6 * 60 * 60 * 1000);
      return connection.webrtcSessions.refreshIceServers();
    })
    .then(e => {
      log.call(this, 'info', 'PureCloud streaming client ready for WebRTC calls');
    });
}

function startMedia (this: PureCloudWebrtcSdk) {
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
  (audio.style as any) = 'visibility: hidden';

  document.body.append(audio);
  return audio;
}

function attachMedia (this: PureCloudWebrtcSdk, stream) {
  let audioElement;
  if (this._pendingAudioElement) {
    audioElement = this._pendingAudioElement;
  } else {
    audioElement = createMediaElement();
  }
  audioElement.autoplay = true;
  audioElement.srcObject = stream;
}

function onSession (this: PureCloudWebrtcSdk, session) {
  try {
    log.call(this, 'info', 'onSession', { id: session.sid });
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
    log.call(this, 'info', 'session:stats', data);
  });
  session._statsGatherer.on('traces', (data) => {
    data.conversationId = session.conversationId;
    log.call(this, 'warn', 'session:trace', data);
  });
  session.on('change:active', (session, active) => {
    if (active) {
      session._statsGatherer.collectInitialConnectionStats();
    }
    log.call(this, 'info', 'change:active', { active, conversationId: session.conversationId, sid: session.sid });
  });

  startMedia.call(this).then(stream => { // tslint:disable-line
    log.call(this, 'debug', 'onMediaStarted');
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

    session.on('terminated', (session, reason) => {
      log.call(this, 'info', 'onSessionTerminated', { conversationId: session.conversationId, reason });
      if (session._outboundStream) {
        session._outboundStream.getTracks().forEach(t => t.stop());
      }
      this.emit('sessionEnded', session, reason);
    });
    this.emit('sessionStarted', session);
  });
}

function onPendingSession (this: PureCloudWebrtcSdk, sessionInfo) {
  log.call(this, 'info', 'onPendingSession', sessionInfo);
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

function proxyStreamingClientEvents (this: PureCloudWebrtcSdk) {
  // webrtc events
  const on = this._streamingConnection.webrtcSessions.on.bind(this._streamingConnection);
  on('requestIncomingRtcSession', onPendingSession.bind(this));
  on('incomingRtcSession', onSession.bind(this));
  on('rtcSessionError', this.emit.bind(this, 'error'));
  on('cancelIncomingRtcSession', session => this.emit('cancelPendingSession', session));
  on('handledIncomingRtcSession', session => this.emit('handledPendingSession', session));
  on('traceRtcSession', this.emit.bind(this, 'trace'));

  // other events
  this._streamingConnection.on('error', this.emit.bind(this, 'error'));
  this._streamingConnection.on('disconnected', () => this.emit('disconnected', 'Streaming API connection disconnected'));
}

export {
  setupStreamingClient,
  proxyStreamingClientEvents
};
