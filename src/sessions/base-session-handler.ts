import { JingleReason } from 'stanza/protocol';

import { GenesysCloudWebrtcSdk } from '../client';
import { LogLevels, SessionTypes, SdkErrorTypes } from '../types/enums';
import { SessionManager } from './session-manager';
import { checkHasTransceiverFunctionality, logDeviceChange } from '../media/media-utils';
import { createAndEmitSdkError } from '../utils';
import { ConversationUpdate } from '../types/conversation-update';
import {
  IPendingSession,
  IStartSessionParams,
  IAcceptSessionRequest,
  ISessionMuteRequest,
  IExtendedMediaSession,
  IUpdateOutgoingMedia
} from '../types/interfaces';

type ExtendedHTMLAudioElement = HTMLAudioElement & {
  setSinkId (deviceId: string): Promise<undefined>;
};

export default abstract class BaseSessionHandler {
  removePendingSessionDelay = 1000;
  disabled = true;
  abstract sessionType: SessionTypes;

  constructor (protected sdk: GenesysCloudWebrtcSdk, protected sessionManager: SessionManager) { }

  abstract shouldHandleSessionByJid (jid: string): boolean;

  protected log (level: LogLevels, message: any, details?: any): void {
    this.sdk.logger[level].call(this.sdk.logger, message, details);
  }

  handleConversationUpdate (session: IExtendedMediaSession, update: ConversationUpdate) {
    this.log('info', 'conversation update received', { conversationId: session.conversationId, update });
  }

  async startSession (sessionStartParams: IStartSessionParams): Promise<any> {
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, `sessionType ${sessionStartParams.sessionType} can only be started using the genesys cloud api`, { sessionStartParams });
  }

  async handlePropose (pendingSession: IPendingSession): Promise<any> {
    pendingSession.sessionType = this.sessionType;
    this.log('info', 'handling propose', { pendingSession });
    this.sdk.emit('pendingSession', pendingSession);
  }

  async proceedWithSession (session: IPendingSession): Promise<any> {
    this.log('info', 'proceeding with proposed session', { conversationId: session.conversationId, sessionId: session.id });
    this.sessionManager.webrtcSessions.acceptRtcSession(session.id);
  }

  async rejectPendingSession (session: IPendingSession): Promise<any> {
    this.log('info', 'rejecting propose', { conversationId: session.conversationId });
    this.sessionManager.webrtcSessions.rejectRtcSession(session.id);
  }

  async handleSessionInit (session: IExtendedMediaSession): Promise<any> {
    session.id = session.sid;

    const pendingSession = this.sessionManager.getPendingSession(session.id);
    if (pendingSession) {
      session.conversationId = session.conversationId || pendingSession.conversationId;
      session.fromUserId = pendingSession.fromUserId;
      session.originalRoomJid = pendingSession.originalRoomJid;
    }
    this.sessionManager.removePendingSession(session.id);

    try {
      this.log('info', 'handling session init', { sessionId: session.id, conversationId: session.conversationId });
    } catch (e) {
      // don't let log errors ruin a session
    }

    this.sdk._streamingConnection.webrtcSessions.rtcSessionAccepted(session.id);

    session.pc.addEventListener('negotiationneeded', this._warnNegotiationNeeded.bind(this, session));

    session.on('connectionState' as any, (state: string) => {
      this.log('info', 'connection state change', { state, conversationId: session.conversationId, sid: session.sid });
    });

    session.on('terminated', this.onSessionTerminated.bind(this, session));
    this.sdk.emit('sessionStarted', session);
  }

  onSessionTerminated (session: IExtendedMediaSession, reason: JingleReason): void {
    this.log('info', 'handling session terminated', { conversationId: session.conversationId, reason, sessionId: session.id });
    session._outboundStream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    session._screenShareStream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    this.sdk.emit('sessionEnded', session, reason);
  }

  async acceptSession (session: IExtendedMediaSession, params: IAcceptSessionRequest): Promise<any> {
    const logExtras: any = {
      sessionType: session.sessionType,
      conversationId: session.conversationId,
      sessionId: session.id,
      params
    };
    const outputDeviceId = this.sdk._config.defaults.outputDeviceId || '';
    const isSupported = this.sdk.media.getState().hasOutputDeviceSupport;

    /* if we have an audio element _and_ are in a supported browser */
    if (session._outputAudioElement && isSupported) {
      /* tslint:disable-next-line:no-floating-promises */
      (session._outputAudioElement as ExtendedHTMLAudioElement).setSinkId(outputDeviceId);
      logExtras.hasOutputDeviceSupport = isSupported;
      logExtras.outputDeviceId = outputDeviceId;
    }

    this.log('info', 'accepting session', logExtras);
    return session.accept();
  }

  async endSession (session: IExtendedMediaSession): Promise<void> {
    this.log('info', 'ending session', { conversationId: session.conversationId });

    return new Promise<void>((resolve) => {
      session.once('terminated', (reason) => {
        resolve();
      });
      session.end();
    });
  }

  async setVideoMute (session: IExtendedMediaSession, params: ISessionMuteRequest): Promise<any> {
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, `Video mute not supported for sessionType ${session.sessionType}`, {
      conversationId: session.conversationId,
      sessionId: session.id,
      params
    });
  }

  async setAudioMute (session: IExtendedMediaSession, params: ISessionMuteRequest): Promise<any> {
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, `Audio mute not supported for sessionType ${session.sessionType}`, {
      conversationId: session.conversationId,
      sessionId: session.id,
      params
    });
  }

  /**
   * Update the outgoing media for a session.
   *
   * @param session to update
   * @param options for updating outgoing media
   */
  async updateOutgoingMedia (session: IExtendedMediaSession, options: IUpdateOutgoingMedia): Promise<any> {
    logDeviceChange(this.sdk, session, 'calledToChangeDevices', {
      requestedNewMediaStream: options.stream,
      requestedVideoDeviceId: options.videoDeviceId,
      requestedAudioDeviceId: options.audioDeviceId
    });

    if (!options.stream &&
      (typeof options.videoDeviceId === 'undefined' && typeof options.audioDeviceId === 'undefined')) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.invalid_options, 'Options are not valid to update outgoing media', {
        videoDeviceId: options.videoDeviceId,
        audioDeviceId: options.audioDeviceId,
        conversationId: session.conversationId,
        sessionId: session.id
      });
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

    /*
      stop media first because FF does not allow more than one audio/video track
      AND stop the media in case we are using system default because chrome will not let you switch
      system default devices _while_ you have an active media track with the old system default
    */
    let fromVideoTrack: MediaStreamTrack;
    let fromAudioTrack: MediaStreamTrack;

    senders.forEach(sender => {
      if (sender.track.kind === 'video') {
        fromVideoTrack = sender.track;
      } else {
        fromAudioTrack = sender.track;
      }
      sender.track.stop();
      destroyMediaPromises.push(sender.replaceTrack(null));
    });

    await Promise.all(destroyMediaPromises);

    if (!stream) {
      try {
        stream = await this.sdk.media.startMedia({
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
          let audioMute = Promise.resolve();
          let videoMute = Promise.resolve();

          const userId = this.sdk._personDetails.id;
          if (updateAudio) {
            this.log('warn', 'User denied media permissions. Sending mute for audio', { sessionId: session.id, conversationId: session.conversationId });
            audioMute = session.mute(userId as any, 'audio');
          }
          if (updateVideo) {
            this.log('warn', 'User denied media permissions. Sending mute for video', { sessionId: session.id, conversationId: session.conversationId });
            videoMute = session.mute(userId as any, 'video');
          }

          await Promise.all([audioMute, videoMute]);
        }
        /* don't need to emit this error because `startMedia()` did */
        throw e;
      }
    }

    /* if our session has video on mute, make sure our stream does not have a video track (mainly checking any passed in stream)  */
    stream.getTracks().forEach(track => {
      if (session.videoMuted && track.kind === 'video') {
        this.log('warn', 'Not using video track from stream because the session has video on mute', {
          trackId: track.id,
          sessionId: session.id,
          conversationId: session.conversationId
        });
        track.stop();
        stream.removeTrack(track);
      }
    });

    /* just in case the system default is changing, we need to tell this log function what was the
      previous device being used (since it won't show up in the enumerated device list anymore) */
    logDeviceChange(this.sdk, session, 'changingDevices', {
      fromVideoTrack: fromVideoTrack,
      fromAudioTrack: fromAudioTrack,
      toVideoTrack: stream.getVideoTracks()[0],
      toAudioTrack: stream.getAudioTracks()[0]
    });

    const newMediaPromises: Promise<any>[] = stream.getTracks().map(async track => {
      await this.addReplaceTrackToSession(session, track);
      outboundStream.addTrack(track);

      /* if we are switching audio devices, we need to check mute state (video is checked earlier) */
      if (track.kind === 'audio' && session.audioMuted) {
        await this.sdk.setAudioMute({ sessionId: session.id, mute: true, unmuteDeviceId: options.audioDeviceId });
      }
    });

    await Promise.all(newMediaPromises);

    /* prune tracks not being sent */
    session._outboundStream.getTracks().forEach((track) => {
      const hasSender = session.pc.getSenders().find((sender) => sender.track && sender.track.id === track.id);

      if (!hasSender) {
        track.stop();
        session._outboundStream.removeTrack(track);
      }
    });
    logDeviceChange(this.sdk, session, 'successfullyChangedDevices');
  }

  async updateOutputDevice (session: IExtendedMediaSession, deviceId: string): Promise<void> {
    logDeviceChange(this.sdk, session, 'calledToChangeDevices', { requestedOutputDeviceId: deviceId });
    const el: ExtendedHTMLAudioElement = session._outputAudioElement as ExtendedHTMLAudioElement;

    if (!el) {
      this.log('warn', 'Cannot update audio output because there is no attached audio element to the session', { sessionId: session.id, conversationId: session.conversationId });
      return;
    }

    if (typeof el.setSinkId === 'undefined') {
      const err = 'Cannot set sink id in unsupported browser';
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, err, { conversationId: session.conversationId, sessionId: session.id });
    }

    logDeviceChange(this.sdk, session, 'changingDevices', { requestedOutputDeviceId: deviceId });
    return el.setSinkId(deviceId).then(() => logDeviceChange(this.sdk, session, 'successfullyChangedDevices'));
  }

  /**
   * Add new media to a session. Will attempt to use tracksBasedActions if possible.
   * @param session jingle media session
   * @param stream local MediaStream to add to session
   * @param allowLegacyStreamBasedActionsFallback if false, an error will be thrown if track based actions are not supported
   */
  async addMediaToSession (session: IExtendedMediaSession, stream: MediaStream): Promise<void> {
    const promises: any[] = [];
    if (checkHasTransceiverFunctionality()) {
      this.log('info', 'Using track based actions', { conversationId: session.conversationId });
      stream.getTracks().forEach(t => {
        this.log('debug', 'Adding track to session', { track: t, conversationId: session.conversationId });
        promises.push(session.pc.addTrack(t));
      });
    } else {
      const errMsg = 'Track based actions are required for this session but the client is not capable';
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, errMsg, { conversationId: session.conversationId });
    }

    await Promise.all(promises);
  }

  /**
   * Will try and replace a track of the same kind if possible, otherwise it will add the track
   */
  async addReplaceTrackToSession (session: IExtendedMediaSession, track: MediaStreamTrack): Promise<void> {
    // find a sender with the same kind of track
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

  _warnNegotiationNeeded (session: IExtendedMediaSession): void {
    this.log('error', 'negotiation needed and not supported', { conversationId: session.conversationId, sessionId: session.id });
  }

  removeMediaFromSession (session: IExtendedMediaSession, sender: RTCRtpSender): Promise<void> {
    this.log('debug', 'Removing track from session', { sender, conversationId: session.conversationId, sessionId: session.id });
    return sender.replaceTrack(null);
  }

  getSendersByTrackType (session: IExtendedMediaSession, kind: 'audio' | 'video'): RTCRtpSender[] {
    return session.pc.getSenders().filter(sender => {
      return sender.track && sender.track.kind === kind;
    });
  }
}
