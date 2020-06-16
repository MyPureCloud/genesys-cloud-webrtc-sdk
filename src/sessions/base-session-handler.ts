import StatsGatherer from 'webrtc-stats-gatherer';

import { PureCloudWebrtcSdk } from '../client';
import { LogLevels, SessionTypes, SdkErrorTypes } from '../types/enums';
import { SessionManager } from './session-manager';
import { IPendingSession, IStartSessionParams, IAcceptSessionRequest, ISessionMuteRequest, IJingleSession, IUpdateOutgoingMedia, IJingleReason } from '../types/interfaces';
import { checkHasTransceiverFunctionality, startMedia } from '../media-utils';
import { throwSdkError } from '../utils';
import { ConversationUpdate } from '../types/conversation-update';
import browserama from 'browserama';

type ExtendedHTMLAudioElement = HTMLAudioElement & {
  setSinkId (deviceId: string): Promise<undefined>;
};

export default abstract class BaseSessionHandler {
  removePendingSessionDelay = 1000;
  disabled = true;
  abstract sessionType: SessionTypes;

  constructor (protected sdk: PureCloudWebrtcSdk, protected sessionManager: SessionManager) { }

  abstract shouldHandleSessionByJid (jid: string): boolean;

  protected log (level: LogLevels, message: any, details?: any): void {
    this.sdk.logger[level].call(this.sdk.logger, message, details);
  }

  handleConversationUpdate (session: IJingleSession, update: ConversationUpdate) {
    this.log(LogLevels.info, 'conversation update received', { conversationId: session.conversationId, update });
  }

  async startSession (sessionStartParams: IStartSessionParams): Promise<any> {
    throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, `sessionType ${sessionStartParams.sessionType} can only be started using the purecloud api`, { sessionStartParams });
  }

  async handlePropose (pendingSession: IPendingSession): Promise<any> {
    pendingSession.sessionType = this.sessionType;
    this.log(LogLevels.info, 'handling propose', { pendingSession });
    this.sdk.emit('pendingSession', pendingSession);
  }

  async proceedWithSession (session: IPendingSession): Promise<any> {
    this.log(LogLevels.info, 'proceeding with proposed session', { conversationId: session.conversationId });
    this.sessionManager.webrtcSessions.acceptRtcSession(session.id);
  }

  async rejectPendingSession (session: IPendingSession): Promise<any> {
    this.log(LogLevels.info, 'rejecting propose', { conversationId: session.conversationId });
    this.sessionManager.webrtcSessions.rejectRtcSession(session.id);
  }

  async handleSessionInit (session: IJingleSession): Promise<any> {
    session.id = session.sid;

    const pendingSession = this.sessionManager.getPendingSession(session.id);
    if (pendingSession) {
      session.conversationId = session.conversationId || pendingSession.conversationId;
    }
    this.sessionManager.removePendingSession(session.id);

    try {
      this.log(LogLevels.info, 'handling session init', { sessionId: session.id, conversationId: session.conversationId });
    } catch (e) {
      // don't let log errors ruin a session
    }

    this.sdk._streamingConnection.webrtcSessions.rtcSessionAccepted(session.id);

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

    session.pc.pc.onnegotiationneeded = this._warnNegotiationNeeded.bind(this, session);

    session.on('change:active', (session: IJingleSession, active: boolean) => {
      if (active) {
        session._statsGatherer.collectInitialConnectionStats();
      }
      this.log(LogLevels.info, 'change:active', { active, conversationId: session.conversationId, sid: session.sid });
    });

    session.on('terminated', this.onSessionTerminated.bind(this));
    this.sdk.emit('sessionStarted', session);
  }

  onSessionTerminated (session: IJingleSession, reason: IJingleReason): void {
    this.log(LogLevels.info, 'handling session terminated', { conversationId: session.conversationId, reason });
    if (session._outboundStream) {
      session._outboundStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    }
    this.sdk.emit('sessionEnded', session, reason);
  }

  async acceptSession (session: IJingleSession, params: IAcceptSessionRequest): Promise<any> {
    this.log(LogLevels.info, 'accepting session', { conversationId: session.conversationId, params });
    return session.accept();
  }

  async endSession (session: IJingleSession) {
    this.log(LogLevels.info, 'ending session', { conversationId: session.conversationId });

    return new Promise<void>((resolve, reject) => {
      session.once('terminated', (reason) => {
        resolve(reason);
      });
      session.once('error', error => {
        try {
          // this will always throw, but we also want to reject the promise
          throwSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to terminate session', { conversationId: session.conversationId, error });
        } catch (e) {
          reject(error);
        }
      });
      session.end();
    });
  }

  async setVideoMute (session: IJingleSession, params: ISessionMuteRequest): Promise<any> {
    throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, `Video mute not supported for sessionType ${session.sessionType}`, { conversationId: session.conversationId, params });
  }

  async setAudioMute (session: IJingleSession, params: ISessionMuteRequest): Promise<any> {
    throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, `Audio mute not supported for sessionType ${session.sessionType}`, { conversationId: session.conversationId, params });
  }

  /**
   * Update the outgoing media for a session.
   *
   * @param session to update
   * @param options for updating outgoing media
   */
  async updateOutgoingMedia (session: IJingleSession, options: IUpdateOutgoingMedia): Promise<any> {
    this.log(LogLevels.info, 'updating outgoing media', {
      conversationId: session.conversationId,
      sessionId: session.id,
      streamId: options.stream ? options.stream.id : undefined,
      videoDeviceId: options.videoDeviceId,
      audioDeviceId: options.audioDeviceId
    });

    if (!options.stream &&
      (typeof options.videoDeviceId === 'undefined' && typeof options.audioDeviceId === 'undefined')) {
      this.log(LogLevels.warn, 'Options are not valid to update outgoing media', { videoDeviceId: options.videoDeviceId, audioDeviceId: options.audioDeviceId, conversationId: session.conversationId });
      throwSdkError.call(this.sdk, SdkErrorTypes.invalid_options, 'Options not valid to update outgoing media');
    }

    const updateVideo = (options.stream || options.videoDeviceId !== undefined) && !session.videoMuted;
    const updateAudio = options.stream || options.audioDeviceId !== undefined;
    let stream: MediaStream = options.stream;

    const outboundStream = session._outboundStream;
    const destroyMediaPromises: Promise<any>[] = [];
    const trackIdsToIgnore = [];
    const trackKindsToIgnore = [];

    /* if we have a video session */
    if (session._screenShareStream) {
      trackIdsToIgnore.push(...session._screenShareStream.getTracks().map((track) => track.id));
    }
    /*
      if we aren't updating a media type, leave the existing track(s) alone
      also true if our video is on mute, we don't need to touch it
    */
    if (!updateAudio) trackKindsToIgnore.push('audio');
    if (!updateVideo) trackKindsToIgnore.push('video');

    const senders = session.pc.getSenders()
      .filter((sender) =>
        sender.track &&
        !(
          trackIdsToIgnore.includes(sender.track.id) ||
          trackKindsToIgnore.includes(sender.track.kind)
        )
      );

    /* stop media first because FF does not allow more than one audio/video track */
    if (browserama.isFirefox) {
      senders.forEach(sender => {
        sender.track.stop();
        destroyMediaPromises.push(sender.replaceTrack(null));
      });
    }

    await Promise.all(destroyMediaPromises);

    if (!stream) {
      try {
        stream = await startMedia(this.sdk, {
          audio: options.audioDeviceId,
          /* if video is muted, we don't want to request it */
          video: !session.videoMuted && options.videoDeviceId,
          session
        });
      } catch (e) {
        /*
          In FF, if the user does not grant us permissions for the new media,
          we need to update the mute states on the session. The implementing
          app will need to handle the error and react appropriately
        */
        if (e.name === 'NotAllowedError') {
          /*
            at this point, there is no active media so we just need to tell the server we are muted
            realistically, the implementing app should kick them out of the conference
          */
          const userId = this.sdk._personDetails.id;
          if (updateAudio) {
            this.log(LogLevels.warn, 'User denied media permissions. Sending mute for audio', { sessionId: session.id, conversationId: session.conversationId });
            session.mute(userId, 'audio');
          }
          if (updateVideo) {
            this.log(LogLevels.warn, 'User denied media permissions. Sending mute for video', { sessionId: session.id, conversationId: session.conversationId });
            session.mute(userId, 'video');
          }
        }
        throw e;
      }
    }

    /* if our session has video on mute, make sure our stream does not have a video track (mainly checking any passed in stream)  */
    stream.getTracks().forEach(track => {
      if (session.videoMuted && track.kind === 'video') {
        this.log(LogLevels.warn, 'Not using video track from stream because the session has video on mute', { trackId: track.id, sessionId: session.id, conversationId: session.conversationId });
        track.stop();
        stream.removeTrack(track);
      }
    });

    const newMediaPromises: Promise<any>[] = stream.getTracks().map(async track => {
      await this.addReplaceTrackToSession(session, track);
      outboundStream.addTrack(track);

      /* if we are switching audio devices, we need to check mute state (video is checked earlier) */
      if (track.kind === 'audio' && session.audioMuted) {
        await this.sdk.setAudioMute({ id: session.id, mute: true, unmuteDeviceId: options.audioDeviceId });
      }
    });

    /* prune tracks not being sent */
    session._outboundStream.getTracks().forEach((track) => {
      const hasSender = session.pc.getSenders().find((sender) => sender.track && sender.track.id === track.id);

      if (!hasSender) {
        track.stop();
        session._outboundStream.removeTrack(track);
      }
    });

    return Promise.all(newMediaPromises);
  }

  async updateOutputDevice (session: IJingleSession, deviceId: string): Promise<undefined> {
    const el: ExtendedHTMLAudioElement = session._outputAudioElement as ExtendedHTMLAudioElement;

    if (!el) {
      this.log(LogLevels.warn, 'Cannot update audio output because there is no attached audio element to the session', { sessionId: session.id, conversationId: session.conversationId });
      return;
    }

    if (typeof el.setSinkId === 'undefined') {
      const err = 'Cannot set sink id in unsupported browser';
      throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, err, { conversationId: session.conversationId, sessionId: session.id });
    }

    this.log(LogLevels.info, 'Setting output deviceId', { deviceId, conversationId: session.conversationId, sessionId: session.id });
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
      this.log(LogLevels.info, 'Using track based actions', { conversationId: session.conversationId });
      stream.getTracks().forEach(t => {
        this.log(LogLevels.debug, 'Adding track to session', { track: t, conversationId: session.conversationId });
        promises.push(session.addTrack(t));
      });
    } else if (allowLegacyStreamBasedActionsFallback) {
      this.log(LogLevels.info, 'Using stream based actions.', { conversationId: session.conversationId });
      this.log(LogLevels.debug, 'Adding stream to session', { stream, conversationId: session.conversationId });
      promises.push(session.addStream(stream));
    } else {
      const errMsg = 'Track based actions are required for this session but the client is not capable';
      throwSdkError.call(this.sdk, SdkErrorTypes.generic, errMsg, { conversationId: session.conversationId });
    }

    await Promise.all(promises);
  }

  /**
   * Will try and replace a track of the same kind if possible, otherwise it will add the track
   */
  async addReplaceTrackToSession (session: IJingleSession, track: MediaStreamTrack): Promise<void> {
    let sender = session.pc.getSenders().find(sender => sender.track && sender.track.kind === track.kind);

    if (sender) {
      await sender.replaceTrack(track);
    } else {
      await session.addTrack(track);
      sender = session.pc.getSenders().find(sender => sender.track && sender.track.id === track.id);
    }

    if (sender.track.kind === 'audio') {
      return;
    }

    const { height, width, frameRate } = sender.track.getSettings();
    await sender.track.applyConstraints({
      width: {
        ideal: width
      },
      height: {
        ideal: height
      },
      frameRate: {
        ideal: frameRate
      }
    });
  }

  _warnNegotiationNeeded (session: IJingleSession): void {
    this.log(LogLevels.error, 'negotiation needed and not supported', { conversationId: session.conversationId });
  }

  removeMediaFromSession (session: IJingleSession, track: MediaStreamTrack): Promise<void> {
    this.log(LogLevels.debug, 'Removing track from session', { track, conversationId: session.conversationId });
    return session.removeTrack(track);
  }

  getSendersByTrackType (session: IJingleSession, kind: 'audio' | 'video'): RTCRtpSender[] {
    return session.pc.getSenders().filter(sender => {
      return sender.track && sender.track.kind === kind;
    });
  }
}
