import PureCloudWebrtcSdk from './client';
import StatsGatherer from 'webrtc-stats-gatherer';
import StreamingClient from 'purecloud-streaming-client';
import browserama from 'browserama';
import { log } from './logging';
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

/**
 * Establish the connection with the streaming client.
 *  Must be called after construction _before_ the SDK is used.
 * @param this must be called with a PureCloudWebrtcSdk as `this`
 */
export async function setupStreamingClient (this: PureCloudWebrtcSdk): Promise<void> {
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
  await connection.webrtcSessions.refreshIceServers();
  log.call(this, 'info', 'PureCloud streaming client ready for WebRTC calls');
}

/**
 * Set up proxy for streaming client events
 * @param this must be called with a PureCloudWebrtcSdk as `this`
 */
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

/**
 * Start a guest screen share
 * @param this must be called with a PureCloudWebrtcSdk as `this`
 */
export async function startGuestScreenShare (this: PureCloudWebrtcSdk): Promise<void> {
  const stream = await startDisplayMedia.call(this);
  const jid = parseJwt(this._jwt).data.jid;
  this._streamingConnection.webrtcSessions.initiateRtcSession({
    stream,
    jid,
    mediaPurpose: 'screenshare'
  });
  temporaryOutboundStream = stream;
}

function hasGetDisplayMedia (): boolean {
  return !!(window.navigator && window.navigator.mediaDevices && window.navigator.mediaDevices.getDisplayMedia);
}

function getScreenShareConstraints (): MediaStreamConstraints {
  if (browserama.isChromeOrChromium) {
    if (hasGetDisplayMedia()) {
      return {
        audio: false,
        video: true // || { displaySurface: 'monitor' }
      };
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
      } as MediaTrackConstraints
    };

  } else { /* if not chrome */
    return {
      audio: false,
      video: {
        mediaSource: 'window'
      } as MediaTrackConstraints
    };
  }
}

/**
 * Get the screen media
 * @param this must be called with a PureCloudWebrtcSdk as `this`
 */
function startDisplayMedia (this: PureCloudWebrtcSdk): Promise<MediaStream> {
  const constraints = getScreenShareConstraints();

  if (hasGetDisplayMedia()) {
    return window.navigator.mediaDevices.getDisplayMedia(constraints);
  }

  return window.navigator.mediaDevices.getUserMedia(constraints);
}

/**
 * Get the audio media
 * @param this must be called with a PureCloudWebrtcSdk as `this`
 */
function startAudioMedia (this: PureCloudWebrtcSdk): Promise<MediaStream> {
  return this.pendingStream
    ? Promise.resolve(this.pendingStream)
    : window.navigator.mediaDevices.getUserMedia({ audio: true });
}

/**
 * NOT IN USE: This function will create a video element to attach the
 *  screen share media to. This may be taken out. See `attachScreenShareMedia()`
 */
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

/**
 * This function will be used once agent screen share is supported.
 *  It may need a video element (or div) to be passed in to attach the
 *  stream to.
 * @param this must be called with a PureCloudWebrtcSdk as `this`
 * @param stream for the shared screen
 */
function attachScreenShareMedia (this: PureCloudWebrtcSdk, stream: MediaStream): void {
  let videoElement: HTMLVideoElement;
  videoElement = createScreenShareElement();
  videoElement.autoplay = true;
  videoElement.srcObject = stream;
}

/**
 * Select or create the `audio.__pc-webrtc-inbound` element
 */
function createAudioMediaElement (): HTMLAudioElement {
  const existing = document.querySelector(`audio.${PC_AUDIO_EL_CLASS}`);
  if (existing) {
    return existing as HTMLAudioElement;
  }
  const audio = document.createElement('audio');
  audio.classList.add(PC_AUDIO_EL_CLASS);
  (audio.style as any) = 'visibility: hidden';

  document.body.append(audio);
  return audio;
}

/**
 * Attach an audio stream to the audio element
 * @param this must be called with a PureCloudWebrtcSdk as `this`
 * @param stream audio stream to attach
 */
function attachAudioMedia (this: PureCloudWebrtcSdk, stream: MediaStream) {
  let audioElement: HTMLAudioElement;
  if (this._pendingAudioElement) {
    audioElement = this._pendingAudioElement;
  } else {
    audioElement = createAudioMediaElement();
  }
  audioElement.autoplay = true;
  audioElement.srcObject = stream;
}

/**
 * Event handler for incoming webrtc-sessions.
 * @param this must be called with a PureCloudWebrtcSdk as `this`
 * @param session incoming webrtc-session
 */
async function onSession (this: PureCloudWebrtcSdk, session): Promise<void> {
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

  if (!this.isGuest) { /* authenitcated user */
    // Need to add logic here to determine the type of session
    // Currently, we always assume agents can only have softphone session in the sdk
    const stream = await startAudioMedia.call(this);
    log.call(this, 'debug', 'onAudioMediaStarted');
    session.addStream(stream);
    session._outboundStream = stream;

    if (session.streams.length === 1 && session.streams[0].getTracks().length > 0) {
      attachAudioMedia.call(this, session.streams[0]);
    } else {
      session.on('peerStreamAdded', (session, stream) => {
        attachAudioMedia.call(this, stream);
      });
    }
  } else { /* unauthenitcated user */
    log.call(this, 'debug', 'user is a guest');
    if (temporaryOutboundStream) {
      log.call(this, 'debug', 'temporaryOutboundStream exists. Adding stream to the session and setting it to _outboundStream');
      session.addStream(temporaryOutboundStream);
      session._outboundStream = temporaryOutboundStream;
      temporaryOutboundStream = null;
    }
  }

  // This may need to change for guests as more functionality is added
  if (this._autoConnectSessions) {
    session.accept();
  }

  session.on('terminated', (session, reason) => {
    log.call(this, 'info', 'onSessionTerminated', { conversationId: session.conversationId, reason });
    if (session._outboundStream) {
      session._outboundStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    }
    this.emit('sessionEnded', session, reason);
  });
  this.emit('sessionStarted', session);
}

/**
 * Event handler for pending webrtc-sessions.
 * @param this must be called with a PureCloudWebrtcSdk as `this`
 * @param sessionInfo pending webrtc-session info
 */
function onPendingSession (this: PureCloudWebrtcSdk, sessionInfo) {
  log.call(this, 'info', 'onPendingSession', sessionInfo);
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
    log.call(this, 'info', 'duplicate session invitation, ignoring', sessionInfo);
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
