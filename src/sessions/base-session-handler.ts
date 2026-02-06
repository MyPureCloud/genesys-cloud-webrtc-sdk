import { JingleReason } from 'stanza/protocol';
import { Constants } from 'stanza';
import { ILogMessageOptions } from 'genesys-cloud-client-logger';

import { GenesysCloudWebrtcSdk } from '../client';
import { LogLevels, SessionTypes, SdkErrorTypes } from '../types/enums';
import { SessionManager } from './session-manager';
import { checkHasTransceiverFunctionality, logDeviceChange } from '../media/media-utils';
import { createAndEmitSdkError, delay, requestApi } from '../utils';
import { ConversationUpdate } from '../conversations/conversation-update';
import {
  IPendingSession,
  IStartSessionParams,
  IAcceptSessionRequest,
  ISessionMuteRequest,
  IExtendedMediaSession,
  IUpdateOutgoingMedia,
  IConversationHeldRequest,
  IActiveConversationDescription,
  SubscriptionEvent,
} from '../types/interfaces';

type ExtendedHTMLAudioElement = HTMLAudioElement & {
  setSinkId (deviceId: string): Promise<undefined>;
};

export default abstract class BaseSessionHandler {
  disabled = true;
  abstract sessionType: SessionTypes;

  constructor (protected sdk: GenesysCloudWebrtcSdk, protected sessionManager: SessionManager) {
    this.sdk.on("sessionEnded", (session, reason) => {
      if (session.sessionType !== this.sessionType) {
        return;
      }

      this.log("info", "sessionEnded event received", {
        sessionId: session.id,
        conversationId: session.conversationId,
        sessionType: session.sessionType,
        reason
      });
    });
  }

  abstract shouldHandleSessionByJid (jid: string): boolean;

  abstract handleConversationUpdate (update: ConversationUpdate, sessions: IExtendedMediaSession[]): void;

  handleConversationUpdateRaw (update: SubscriptionEvent): void {
    this.sdk.emit('conversationUpdateRaw', update);
  }

  protected log (level: LogLevels, message: any, details?: any, logOptions?: ILogMessageOptions): void {
    this.sdk.logger[level].call(this.sdk.logger, message, details, logOptions);
  }

  async enableHandler () {
    this.disabled = false;
  }

  async disableHandler () {
    this.disabled = true;
  }

  getActiveConversations (): IActiveConversationDescription[] {
    return this.sessionManager.getAllActiveSessions()
      .filter(session => session.sessionType === this.sessionType)
      .map(session => ({ conversationId: session.conversationId, sessionId: session.id, sessionType: this.sessionType }));
  }

  async startSession (sessionStartParams: IStartSessionParams): Promise<any> {
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, `sessionType ${sessionStartParams.sessionType} can only be started using the genesys cloud api`, { sessionStartParams });
  }

  async handlePropose (pendingSession: IPendingSession): Promise<any> {
    pendingSession.sessionType = this.sessionType;
    this.sdk.emit('pendingSession', pendingSession);
  }

  async proceedWithSession (session: IPendingSession): Promise<any> {
    this.sessionManager.webrtcSessions.acceptRtcSession(session.id);
  }

  async rejectPendingSession (session: IPendingSession): Promise<any> {
    this.sessionManager.webrtcSessions.rejectRtcSession(session.id);
  }

  async handleSessionInit (session: IExtendedMediaSession): Promise<any> {
    const pendingSession = this.sessionManager.getPendingSession(session);
    if (pendingSession) {
      session.conversationId = session.conversationId || pendingSession.conversationId;
      session.fromUserId = pendingSession.fromUserId;
      session.originalRoomJid = pendingSession.originalRoomJid;
    }

    try {
      this.log('info', 'received webrtc session', { sessionId: session.id, conversationId: session.conversationId, sessionType: session.sessionType });
    } catch (e) {
      // don't let log errors ruin a session
    }

    this.sdk._streamingConnection.webrtcSessions.rtcSessionAccepted(session.id);

    session.peerConnection.addEventListener('negotiationneeded', this._warnNegotiationNeeded.bind(this, session));

    const boundVisibilityHandler = this.handleVisibilityChange.bind(this, session);
    session._visibilityHandler = boundVisibilityHandler;
    document.addEventListener('visibilitychange', boundVisibilityHandler);

    session.on('connectionState' as any, (state: string) => {
      this.log('info', 'connection state change', { state, conversationId: session.conversationId, sid: session.id, sessionType: session.sessionType });
      /* Emit sessionInterrupted when the connection is interrupted so that consuming apps can inform users (e.g. Volt). */
      if (state === 'interrupted') {
        this.sdk.emit('sessionInterrupted', { sessionId: session.id, sessionType: session.sessionType, conversationId: session.conversationId });
      }

      /* If the RTCPeerConnection is in a 'failed' state, it is a state of finality and we need to clean up the session. */
      if (state === 'failed') {
        this.log('warn', 'RTCPeerConnection failed. Cleaning up session.', { state, conversationId: session.conversationId, sid: session.id, sessionType: session.sessionType });
        this.forceEndSession(session, Constants.JingleReasonCondition.FailedTransport);
      }
    });

    session.on('terminated', this.onSessionTerminated.bind(this, session));

    if (!session.reinvite) {
      session._emittedSessionStarteds = {[session.conversationId]: true};
      this.sdk.emit('sessionStarted', session);
    }
  }

    /**
   * This is somewhat of a hack unfortunately. If the peer connection dies while the computer is sleeping, the peer connection
   * does not send connection updates so the session has no idea the session is dead. We do get a visibility change event
   * however, so we can use that as a manual queue to check the state of the peer connection and clean it up if needed.
   */
  private handleVisibilityChange (session: IExtendedMediaSession) {
    if (document.visibilityState === 'visible') {
      this.checkPeerConnectionState(session);
    }
  }

  checkPeerConnectionState (session: IExtendedMediaSession): void {
    const sessionState = session.state;
    const peerConnectionState = session.peerConnection.connectionState;
    if (sessionState === 'active' && peerConnectionState === 'closed') {
      this.log('warn', 'peer connection state does not match session state. cleaning up.', { sessionState, peerConnectionState, conversationId: session.conversationId, sid: session.id, sessionType: session.sessionType });
      this.onSessionTerminated(session, { condition: Constants.JingleReasonCondition.Gone });
    }
  }

  onSessionTerminated (session: IExtendedMediaSession, reason: JingleReason): void {
    this.endTracks(session._outboundStream);
    this.endTracks(session._screenShareStream);
    if (session._visibilityHandler) {
      document.removeEventListener('visibilitychange', session._visibilityHandler);
    }
    this.sdk.emit('sessionEnded', session, reason);
  }

  async acceptSession (session: IExtendedMediaSession, params: IAcceptSessionRequest): Promise<any> {
    const logExtras: any = {
      sessionType: session.sessionType,
      conversationId: session.conversationId,
      sessionId: session.id,
      params
    };

    /* clean up log params */
    const keysNotToFilter = ['conversationId', 'sessionType', 'screenRecordingMetadatas'] as Array<keyof IAcceptSessionRequest>;

    /* we only want to mask params that actually exist */
    Object.keys(logExtras.params)
      .filter(key => !keysNotToFilter.includes(key as keyof IAcceptSessionRequest) && params[key])
      .forEach(key => logExtras.params[key] = {});

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

  async forceEndSession (session: IExtendedMediaSession, reason?: Constants.JingleReasonCondition): Promise<void> {
    this.log('info', 'ending session', { sessionId: session.id, sessionConversationId: session.conversationId, reason, sessionType: session.sessionType });

    return new Promise<void>((resolve) => {
      session.once('terminated', () => {
        resolve();
      });
      return session.end(reason);
    });
  }

  async endSession (conversationId: string, session: IExtendedMediaSession, reason?: Constants.JingleReasonCondition): Promise<void> {
    return this.forceEndSession(session, reason);
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

  async setConversationHeld (session: IExtendedMediaSession, params: IConversationHeldRequest): Promise<any> {
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, `Setting conversation on "hold" not supported for sessionType ${session.sessionType}`, {
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

    const outboundStream = session._outboundStream;
    const destroyMediaPromises: Promise<any>[] = [];
    const trackIdsToIgnore: string[] = [];
    const trackKindsToIgnore: string[] = [];
    const senderTracks = session.peerConnection.getSenders()
      .filter(s => s.track && s.track.readyState === 'live' && !s.track.muted)
      .map(s => s.track);


    let updateVideo = options.videoDeviceId !== undefined && options.videoDeviceId !== false && !session.videoMuted;
    let updateAudio = options.audioDeviceId !== undefined && options.audioDeviceId !== false;
    let stream: MediaStream = options.stream;

    const loggableOptions: any = { ...options };
    loggableOptions.session = options.session && { sessionId: options.session.id };

    /* make sure we don't request the same media that is already active on the session */
    senderTracks.forEach(track => {
      const deviceInUseByTrack = this.sdk.media.findCachedDeviceByTrackLabelAndKind(track);

      if (updateAudio && track.kind.substring(0, 5) === 'audio' && deviceInUseByTrack?.deviceId === options.audioDeviceId) {
        this.log('info',
          'Request to update existing media on session with the same deviceId that is already in use. Not requesting same media', {
          options: loggableOptions,
          conversationId: session.conversationId,
          sessionId: session.id,
          trackInUse: { kind: track.kind, label: track.label },
          deviceInUseByTrack
        });
        updateAudio = false;
      }

      if (updateVideo && track.kind.substring(0, 5) === 'video' && deviceInUseByTrack?.deviceId === options.videoDeviceId) {
        this.log('info',
          'Request to update existing media on session with the same deviceId that is already in use. Not requesting same media', {
          options: loggableOptions,
          conversationId: session.conversationId,
          sessionId: session.id,
          trackInUse: { kind: track.kind, label: track.label },
          deviceInUseByTrack
        });
        updateVideo = false;
      }
    });

    /*
      if we aren't updating a media type, leave the existing track(s) alone
      also true if our video is on mute, we don't need to touch it
    */
    if (options.stream || !updateAudio) trackKindsToIgnore.push('audio');
    if (options.stream || !updateVideo) trackKindsToIgnore.push('video');

    /* if we have a video session */
    if (session._screenShareStream) {
      trackIdsToIgnore.push(...session._screenShareStream.getTracks().map((track) => track.id));
    }

    const senders = session.peerConnection.getSenders()
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

    const newStartMediaContraints = {
      audio: updateAudio && options.audioDeviceId,
      video: updateVideo && options.videoDeviceId,
      session
    };

    /* Allow null because it is the system default. If false or undefined, do not request media. */
    if (!stream && (updateAudio || updateVideo)) {
      try {
        stream = await this.sdk.media.startMedia(newStartMediaContraints);
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
            this.log('warn', 'User denied media permissions. Sending mute for audio', { sessionId: session.id, conversationId: session.conversationId, sessionType: session.sessionType });
            audioMute = session.mute(userId as any, 'audio');
          }
          if (updateVideo) {
            this.log('warn', 'User denied media permissions. Sending mute for video', { sessionId: session.id, conversationId: session.conversationId, sessionType: session.sessionType });
            videoMute = session.mute(userId as any, 'video');
          }

          await Promise.all([audioMute, videoMute]);
        }
        /* don't need to emit this error because `startMedia()` did */
        throw e;
      }
    }

    /* If new media is not started, stream is undefined and there are no tracks. */
    if (stream) {
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
          await this.sdk.setAudioMute({ conversationId: session.conversationId, mute: true, unmuteDeviceId: options.audioDeviceId });
        }
      });

      await Promise.all(newMediaPromises);
    }

    /* prune tracks not being sent */
    session._outboundStream.getTracks().forEach((track) => {
      const hasSender = session.peerConnection.getSenders().find((sender) => sender.track && sender.track.id === track.id);

      if (!hasSender) {
        this.endTracks(track);
        session._outboundStream.removeTrack(track);
      }
    });
    logDeviceChange(this.sdk, session, 'successfullyChangedDevices');
  }

  updateAudioVolume (session: IExtendedMediaSession, volume: number) {
    const element = session._outputAudioElement;
    if (!element) {
      return;
    }

    // DOMElement volume should be between 0 and 1
    element.volume = (volume / 100);
  }

  async updateOutputDevice (session: IExtendedMediaSession, deviceId: string): Promise<void> {
    logDeviceChange(this.sdk, session, 'calledToChangeDevices', { requestedOutputDeviceId: deviceId });
    const el: ExtendedHTMLAudioElement = session._outputAudioElement as ExtendedHTMLAudioElement;

    if (!el) {
      this.log('warn', 'Cannot update audio output because there is no attached audio element to the session', { sessionId: session.id, conversationId: session.conversationId, sessionType: session.sessionType });
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
      this.log('info', 'Using track based actions', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
      const senders = session.peerConnection.getSenders();

      stream.getTracks().forEach(t => {
        // if the track is already on the session we shouldn't add it again
        const trackAlreadyOnSession = senders.length && senders.find(sender => sender.track === t);

        if (trackAlreadyOnSession) {
          return this.log('info', 'Attempted to add track to the session which was already there, skipping', { track: t, conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
        }

        this.log('debug', 'Adding track to session', { track: t, conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
        promises.push(session.peerConnection.addTrack(t));
      });
    } else {
      const errMsg = 'Track based actions are required for this session but the client is not capable';
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, errMsg, { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
    }

    await Promise.all(promises);
  }

  async waitForSessionConnected (session: IExtendedMediaSession): Promise<undefined> {
    if (session.connectionState === 'connected') {
      return;
    }

    return new Promise((resolve) => {
      const handler = (connectionState) => {
        if (connectionState === 'connected') {
          resolve(undefined);
          session.off('connectionState', handler);
        }
      };

      session.on('connectionState', handler);
    });
  }

  /**
   * Will try and replace a track of the same kind if possible, otherwise it will add the track
   */
  async addReplaceTrackToSession (session: IExtendedMediaSession, track: MediaStreamTrack): Promise<void> {
    // we need to wait for the session to be stable before we add/replace tracks or we could end up in a renego state
    // if tranceiver is recvonly and `starting` state, we need to wait until it transitions to `connected`
    if (session.connectionState === 'starting') {
      await this.waitForSessionConnected(session);
    }

    // find a transceiver with the same kind of track
    const transceiver = session.peerConnection.getTransceivers().find(t => {
      return t.receiver.track?.kind === track.kind || t.sender.track?.kind === track.kind;
    });

    let sender: RTCRtpSender;

    if (transceiver) {
      await transceiver.sender.replaceTrack(track);
      sender = transceiver.sender;
    } else {
      // the stream parameter is documented as *optional* but it is not so we will just provide a fake one
      await session.addTrack(track, new MediaStream());
      sender = session.peerConnection.getSenders().find(sender => sender.track && sender.track.id === track.id);
    }

    if (sender.track.kind === 'audio') {
      return;
    }

    return this.applyTrackConstraints(sender);
  }

  // we want to apply track constraints but in safari specifically for screen share streams the settings don't immediately populate
  // if the settings have a zero height or width, we will wait and retry one time. If the settings are still zeroed we will just give up
  private async applyTrackConstraints (sender: RTCRtpSender, attempt = 1): Promise<void> {
    const { height, width, frameRate } = sender.track.getSettings();

    if (!height || !width) {
      if (attempt > 1) {
        this.log('debug', 'Not applying video track constraints due to zero height or width track setting', { height, width });
        return;
      }

      this.log('debug', 'Zero height or width track setting, will retry after wait time', { height, width });
      await delay(300);
      return this.applyTrackConstraints(sender, attempt + 1);
    }

    this.log('debug', 'Applying video track constraints from settings', { height, width });
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
    this.log('error', 'negotiation needed and not supported', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
  }

  removeMediaFromSession (session: IExtendedMediaSession, sender: RTCRtpSender): Promise<void> {
    this.log('debug', 'Removing track from session', { sender, conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
    return sender.replaceTrack(null);
  }

  getSendersByTrackType (session: IExtendedMediaSession, kind: 'audio' | 'video'): RTCRtpSender[] {
    return session.peerConnection.getSenders().filter(sender => {
      return sender.track && sender.track.kind === kind;
    });
  }

  getReceiversByTrackType (session: IExtendedMediaSession, kind: 'audio' | 'video'): RTCRtpReceiver[] {
    return session.peerConnection.getReceivers().filter(receiver => {
      return receiver.track && receiver.track.kind === kind;
    });
  }

  endTracks (streamOrTrack?: MediaStream | MediaStreamTrack): void {
    if (!streamOrTrack) return;

    let tracks = (streamOrTrack instanceof MediaStream) ? streamOrTrack.getTracks() : [streamOrTrack];

    /* if we have live default audio, we don't want to end it */
    const defaultAudio = (this.sdk._config.defaults.audioStream?.getAudioTracks() || [])
      .filter(t => t && t.readyState === 'live');

    if (defaultAudio.length) {
      tracks = tracks.filter(track => !defaultAudio.find(audioTrack => audioTrack.id === track.id));
    }

    tracks.forEach(t => t.stop());
  }

  async fetchConversationStateFromApi (conversationId: string): Promise<ConversationUpdate> {
    const { data } = await requestApi.call(this.sdk, `/conversations/${conversationId}`);
    if (data) {
      return new ConversationUpdate(data);
    }
  }
}
