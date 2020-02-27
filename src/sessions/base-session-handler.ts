import { PureCloudWebrtcSdk } from '../client';
import { log } from '../logging';
import { LogLevels, SessionTypes, SdkErrorTypes } from '../types/enums';
import StatsGatherer from 'webrtc-stats-gatherer';
import { SessionManager } from './session-manager';
import { IPendingSession, IStartSessionParams, IAcceptSessionRequest, ISessionMuteRequest, IJingleSession, IConversationUpdate, IUpdateOutgoingMedia } from '../types/interfaces';
import { checkHasTransceiverFunctionality, startMedia } from '../media-utils';
import { throwSdkError } from '../utils';

type ExtendedHTMLAudioElement = HTMLAudioElement & {
  setSinkId (deviceId: string): Promise<undefined>;
};

export default abstract class BaseSessionHandler {
  removePendingSessionDelay = 1000;

  constructor (protected sdk: PureCloudWebrtcSdk, protected sessionManager: SessionManager) { }

  abstract sessionType: SessionTypes;

  abstract shouldHandleSessionByJid (jid: string): boolean;

  protected log (level: LogLevels, message: any, details?: any): void {
    log.call(this.sdk, level, message, details);
  }

  // by default, do nothing
  handleConversationUpdate (session: IJingleSession, update: IConversationUpdate) {

  }

  async startSession (sessionStartParams: IStartSessionParams): Promise<any> {
    throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, `sessionType ${sessionStartParams.sessionType} can only be started using the purecloud api`, { sessionStartParams });
  }

  async handlePropose (pendingSession: IPendingSession): Promise<any> {
    this.sdk.emit('pendingSession', pendingSession);
  }

  async proceedWithSession (session: IPendingSession): Promise<any> {
    this.sessionManager.webrtcSessions.acceptRtcSession(session.id);
  }

  async handleSessionInit (session: IJingleSession): Promise<any> {
    try {
      this.log(LogLevels.info, 'onSession', session);
    } catch (e) {
      // don't let log errors ruin a session
    }

    session.id = session.sid;
    this.sdk._streamingConnection.webrtcSessions.rtcSessionAccepted(session.id);
    const pendingSession = this.sessionManager.getPendingSession(session.id);
    if (pendingSession) {
      session.conversationId = pendingSession.conversationId;
    }
    this.sessionManager.removePendingSession(session.id);

    session._statsGatherer = new StatsGatherer(session.pc, {
      session: session.sid,
      conference: session.conversationId
    });

    session._statsGatherer.on('stats', (data: any) => {
      data.conversationId = session.conversationId;
      this.log(LogLevels.info, 'session:stats', data);
    });

    session._statsGatherer.on('traces', (data: any) => {
      data.conversationId = session.conversationId;
      this.log(LogLevels.warn, 'session:trace', data);
    });

    session.on('change:active', (session: IJingleSession, active: boolean) => {
      if (active) {
        session._statsGatherer.collectInitialConnectionStats();
      }
      this.log(LogLevels.info, 'change:active', { active, conversationId: session.conversationId, sid: session.sid });
    });

    session.on('terminated', this.onSessionTerminated.bind(this));
    this.sdk.emit('sessionStarted', session);
  }

  onSessionTerminated (session: IJingleSession, reason: any): void {
    this.log(LogLevels.info, 'onSessionTerminated', { conversationId: session.conversationId, reason });
    if (session._outboundStream) {
      session._outboundStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    }
    this.sdk.emit('sessionEnded', session, reason);
  }

  async acceptSession (session: IJingleSession, params: IAcceptSessionRequest): Promise<any> {
    return session.accept();
  }

  async endSession (session: IJingleSession) {
    return new Promise<void>((resolve, reject) => {
      session.once('terminated', (reason) => {
        resolve(reason);
      });
      session.once('error', error => reject(error));
      session.end();
    });
  }

  async setVideoMute (session: IJingleSession, params: ISessionMuteRequest): Promise<any> {
    throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, `Video mute not supported for sessionType ${session.sessionType}`, { params });
  }

  async setAudioMute (session: IJingleSession, params: ISessionMuteRequest): Promise<any> {
    throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, `Audio mute not supported for sessionType ${session.sessionType}`, { params });
  }

  // TODO: doc
  //  this functionality needs to be similar to client.updateDefaultDevices
  //  `null` === system default
  //  {string} === deviceId
  async updateOutgoingMedia (session: IJingleSession, options: IUpdateOutgoingMedia): Promise<any> {

    if (typeof options.videoDeviceId === undefined && typeof options.audioDeviceId === undefined) {
      this.log(LogLevels.warn, 'Options are not valid to update outgoing media', { videoDeviceId: options.videoDeviceId, audioDeviceId: options.audioDeviceId });
      throwSdkError.call(this.sdk, SdkErrorTypes.invalid_options, 'Options not valid to update outgoing media');
    }
    // if they provide a stream, we kill all media and use their stream's tracks
    // if they provide a videoDeviceId (string|null), then we update the video track(s)
    //  same for audio

    const updateVideo = options.stream || options.videoDeviceId !== undefined;
    const updateAudio = options.stream || options.audioDeviceId !== undefined;

    const stream: MediaStream = options.stream || await startMedia(this.sdk, {
      audio: options.audioDeviceId === null ? true : options.audioDeviceId,
      video: options.videoDeviceId === null ? true : options.videoDeviceId
    });

    const outboundStream = session._outboundStream;
    const destroyMediaPromises: Promise<any>[] = [];
    const trackIdsToIgnore = [];
    const trackKindsToIgnore = [(!updateVideo && 'video'), (!updateAudio && 'audio')].filter(Boolean);

    /* if we have a video session */
    if (session._screenShareStream) {
      trackIdsToIgnore.push(...session._screenShareStream.getTracks().map((track) => track.id));
    }
    // if we aren't updating a media type, leave the existing track alone
    if (!updateAudio) trackKindsToIgnore.push('audio');
    if (!updateVideo) trackKindsToIgnore.push('video');

    const senders = session.pc.getSenders()
      .filter((sender) =>
        sender.track &&
        (!trackIdsToIgnore.includes(sender.track.id) ||
          !trackKindsToIgnore.includes(sender.track.kind))
      );

    senders.forEach(sender => {
      sender.track.stop();
      destroyMediaPromises.push(sender.replaceTrack(null));
      if (outboundStream) {
        outboundStream.removeTrack(sender.track);
      }
    });

    await Promise.all(destroyMediaPromises);

    const newMediaPromises: Promise<any>[] = [];
    stream.getTracks().forEach(track => {
      newMediaPromises.push(session.addTrack(track));
      if (outboundStream) {
        outboundStream.addTrack(track);
      }
    });

    return Promise.all(newMediaPromises);
  }

  async updateOutputDevice (session: IJingleSession, deviceId: string): Promise<undefined> {
    const el: ExtendedHTMLAudioElement = session._outputAudioElement as ExtendedHTMLAudioElement;

    if (!el) {
      this.log(LogLevels.warn, 'Cannot update audio output because there is no attached audio element to the session', { sessionId: session.id });
      return;
    }

    if (typeof el.setSinkId === 'undefined') {
      const err = 'Cannot set sink id in unsupported browser';
      this.log(LogLevels.warn, err);
      throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, err);
    }

    this.log(LogLevels.info, 'Setting output deviceId', { deviceId });
    return el.setSinkId(deviceId);
  }

  /**
   * Add new media to a session. Will attempt to use tracksBasedActions if possible.
   * @param session jingle media session
   * @param stream local MediaStream to add to session
   * @param allowLegacyStreamBasedActionsFallback if false, an error will be thrown if track based actions are not supported
   */
  async addMediaToSession (session: IJingleSession, stream: MediaStream, allowLegacyStreamBasedActionsFallback: boolean = true): Promise<void> {
    const promises: any[] = [];
    if (checkHasTransceiverFunctionality()) {
      this.log(LogLevels.info, 'Using track based actions');
      stream.getTracks().forEach(t => {
        this.log(LogLevels.debug, 'Adding track to session', t);
        promises.push(session.addTrack(t));
      });
    } else if (allowLegacyStreamBasedActionsFallback) {
      this.log(LogLevels.info, 'Using stream based actions.');
      this.log(LogLevels.debug, 'Adding stream to session', stream);
      promises.push(session.addStream(stream));
    } else {
      const errMsg = 'Track based actions are required for this session but the client is not capable';
      throwSdkError.call(this.sdk, SdkErrorTypes.generic, errMsg);
    }

    await Promise.all(promises);
  }

  removeMediaFromSession (session: IJingleSession, track: MediaStreamTrack): Promise<void> {
    return session.removeTrack(track);
  }
}
