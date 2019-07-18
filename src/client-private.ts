import PureCloudWebrtcSdk from './client';
import StatsGatherer from 'webrtc-stats-gatherer';
import StreamingClient from 'purecloud-streaming-client';
import { log } from './logging';
import { SupportedSdkTypes } from './types/interfaces';
import { parseJwt } from './utils';

declare var window: {
  navigator: {
    mediaDevices: {
      getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    } & MediaDevices;
  } & Navigator;
} & Window;
// The "private methods" of the client class.
// These are all invoked bound to an instance of the class, but are not exposed on the
// instance object.

const PC_AUDIO_EL_CLASS = '__pc-webrtc-inbound';
const PC_SCREEN_SHARE_EL_CLASS = '__pc-webrtc-screen-share';
let temporaryOutboundStream: MediaStream;

export async function setupStreamingClient (this: PureCloudWebrtcSdk, type: SupportedSdkTypes = 'softphone'): Promise<void> {
  if (this._streamingConnection) {
    this.logger.warn('Existing streaming connection detected. Disconnecting and creating a new connection.');
    await this._streamingConnection.disconnect();
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

  await connection.connect();
  this.emit('connected', { reconnect: this._hasConnected });
  log.call(this, 'info', 'PureCloud streaming client connected', { reconnect: this._hasConnected });
  this._hasConnected = true;
  // refresh turn servers every 6 hours
  this._refreshTurnServersInterval = setInterval(this._refreshTurnServers.bind(this), 6 * 60 * 60 * 1000);
  const e = await connection.webrtcSessions.refreshIceServers();
  log.call(this, 'info', 'PureCloud streaming client ready for WebRTC calls');
}

export function proxyStreamingClientEvents (this: PureCloudWebrtcSdk) {
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

export async function startGuestScreenShare (this: PureCloudWebrtcSdk): Promise<void> {
  const stream = await startDisplayMedia.call(this);
  const jid = parseJwt(this._jwt).data.jid;
  this._streamingConnection.webrtcSessions.initiateRtcSession({
    stream,
    jid,
    mediaPurpose: 'screenshare'
  });
  // Should we attach the video stream on the guest's DOM?
  // attachScreenShareMedia.call(this, stream);
  temporaryOutboundStream = stream;
}

function getDefaultChromeConstraints (): MediaStreamConstraints {
  if (window.navigator.mediaDevices.getDisplayMedia) {
    return {
      audio: false,
      video: {
        displaySurface: 'monitor'
      }
    } as MediaStreamConstraints;
  }
  return {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        maxWidth: window.screen.width,
        maxHeight: window.screen.height,
        maxFrameRate: 15
      }
    }
  } as MediaStreamConstraints;
}

function startDisplayMedia (this: PureCloudWebrtcSdk): Promise<MediaStream> {
  if (window.navigator.getDisplayMedia) {
    return window.navigator.getDisplayMedia({ video: true });
  } else if (window.navigator.mediaDevices.getDisplayMedia) {
    return window.navigator.mediaDevices.getDisplayMedia({ video: true });
  } else {
    return window.navigator.mediaDevices.getUserMedia({ video: { mediaSource: 'screen' } as any });
    // Not sure what to do here. If this is for chrome, should we check the browser first?
    // return window.navigator.mediaDevices.getUserMedia(getDefaultChromeConstraints());
  }
}

function startAudioMedia (this: PureCloudWebrtcSdk): Promise<MediaStream> {
  return this.pendingStream
    ? Promise.resolve(this.pendingStream)
    : window.navigator.mediaDevices.getUserMedia({ audio: true });
}

function createScreenShareElement (): HTMLVideoElement {
  const existing = document.querySelector(`video.${PC_SCREEN_SHARE_EL_CLASS}`);
  if (existing) {
    return existing as HTMLVideoElement;
  }
  const video = document.createElement('video');
  video.classList.add(PC_SCREEN_SHARE_EL_CLASS);
  document.body.append(video);
  return video;
}

function attachScreenShareMedia (this: PureCloudWebrtcSdk, stream: MediaStream): void {
  let videoElement: HTMLVideoElement;
  videoElement = createScreenShareElement();
  videoElement.autoplay = true;
  (videoElement.style as any) = 'visibility: hidden';
  videoElement.srcObject = stream;
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

function attachMedia (this: PureCloudWebrtcSdk, stream: MediaStream) {
  let audioElement;
  if (this._pendingAudioElement) {
    audioElement = this._pendingAudioElement;
  } else {
    audioElement = createMediaElement();
  }
  audioElement.autoplay = true;
  audioElement.srcObject = stream;
}

function onSession (this: PureCloudWebrtcSdk, session): void {
  try {
    log.call(this, 'info', 'onSession', session);
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

  // if authenticated and sdkType is softphone then we have an agent
  if (this._sdkType === 'softphone' && this._accessToken) {
    startAudioMedia.call(this).then(stream => { // tslint:disable-line
      log.call(this, 'debug', 'onAudioMediaStarted');
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
    // if authenitcation is jwt (meaning guest/annoyomous) and sdkType is screenshare
    // then we are sharing our screen
  } else if (this._sdkType === 'screenshare' && this._jwt) {
    log.call(this, 'debug', 'sdkType is \'screenshare\' and there is a jwt');
    if (temporaryOutboundStream) {
      log.call(this, 'debug', 'temporaryOutboundStream exists. Adding stream to the session and setting it to _outboundStream');
      session.addStream(temporaryOutboundStream);
      session._outboundStream = temporaryOutboundStream;
      temporaryOutboundStream = null;
    }

    /* don't attach? or should we and then hide it?
      if (session.streams.length === 1 && session.streams[0].getTracks().length > 0) {
        attachScreenShareMedia.call(this, session.streams[0]);
      } else {
        session.on('peerStreamAdded', (session, stream) => {
          attachScreenShareMedia.call(this, stream);
        });
      }
    */

    // always accept since we are the ones who initiated the session
    session.accept();

    session.on('terminated', (session, reason) => {
      log.call(this, 'info', 'onSessionTerminated', { conversationId: session.conversationId, reason });
      if (session._outboundStream) {
        session._outboundStream.getTracks().forEach(t => t.stop());
      }
      this.emit('sessionEnded', session, reason);
    });
    this.emit('sessionStarted', session);

    // if we don't have a matching combination
  } else {
    let errorMessage = `Unsupported media type and/or user in purecloud-webrtc-sdk. SdkType: ${this._sdkType}. Guest user: ${!!this._jwt}. Authenticated user: ${!!this._accessToken}`;
    let err = new Error(errorMessage);
    this.logger.error(errorMessage);
    this.emit('error', { message: errorMessage, error: err });
  }
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
