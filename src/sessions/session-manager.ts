import { GenesysCloudWebrtcSdk } from '../client';
import BaseSessionHandler from './base-session-handler';
import SoftphoneSessionHandler from './softphone-session-handler';
import { LogLevels, SessionTypes, SdkErrorTypes } from '../types/enums';
import { createAndEmitSdkError, logPendingSession } from '../utils';
import ScreenShareSessionHandler from './screen-share-session-handler';
import VideoSessionHandler from './video-session-handler';
import {
  IPendingSession,
  ISessionInfo,
  IEndSessionRequest,
  IStartSessionParams,
  IAcceptSessionRequest,
  ISessionMuteRequest,
  IUpdateOutgoingMedia,
  IStartVideoSessionParams,
  IExtendedMediaSession,
  IStartSoftphoneSessionParams,
  ISessionIdAndConversationId,
  IConversationHeldRequest
} from '../types/interfaces';
import { ConversationUpdate } from '../conversations/conversation-update';

const sessionHandlersToConfigure: any[] = [
  SoftphoneSessionHandler,
  VideoSessionHandler,
  ScreenShareSessionHandler
];

export class SessionManager {
  sessionHandlers: BaseSessionHandler[];
  /* use conversationId to index to account for persistent connections */
  pendingSessions: { [conversationId: string]: IPendingSession } = {};
  chain = []; // TODO: remove me

  constructor (private sdk: GenesysCloudWebrtcSdk) {
    this.sessionHandlers = sessionHandlersToConfigure.map((ClassDef) => new ClassDef(this.sdk, this));

    sdk._config.allowedSessionTypes.forEach((sessionType) => {
      this.log('info', 'Allow session type', { sessionType });
      const handler = this.getSessionHandler({ sessionType });
      handler.disabled = false;
    });

    // TODO: take me out
    (window as any).dump = () => console.log(JSON.stringify(this.chain));
  }

  private log (level: LogLevels, message: any, details?: any): void {
    this.sdk.logger[level](message, details);
  }

  get webrtcSessions () {
    return this.sdk._streamingConnection.webrtcSessions;
  }

  get jingle () {
    return this.sdk._streamingConnection._webrtcSessions.jingleJs;
  }

  handleConversationUpdate (update: ConversationUpdate) {
    this.chain.push(update); // TODO: remove me
    this.log('debug', 'conversation event received from hawk', update);

    let wasHandled = false;

    // only handle a conversation update if we can associate it with a session
    const sessions = Object.values(this.jingle.sessions) as IExtendedMediaSession[];
    sessions.forEach((session: IExtendedMediaSession) => {
      const handler = this.getSessionHandler({ sessionType: session.sessionType });
      if (handler.disabled) {
        return;
      }
      wasHandled = true;
      handler.handleConversationUpdate(session, update);
    });

    /* we always want to handle softphone events */
    const softphoneHander = this.getSessionHandler({ sessionType: SessionTypes.softphone }) as SoftphoneSessionHandler;
    /* we always want to make sure we handle conversation events for softphone */
    if (!wasHandled && !softphoneHander.disabled && softphoneHander.getUserParticipantFromConversationEvent(update)) {
      softphoneHander.handleConversationUpdate(null, update);
    }
  }

  getPendingSession (params: ISessionIdAndConversationId): IPendingSession | undefined {
    if (params.conversationId) {
      return this.pendingSessions[params.conversationId];
    }

    if (params.sessionId) {
      const pendingSessions = Object.values(this.pendingSessions).filter(s => s.sessionId === params.sessionId);
      if (pendingSessions.length > 1) {
        this.log('warn', 'retrieving pending session by `sessionId` and there are multiple pendingSessions with the provided `sessionId`. this can have negative side effects. please accept/reject pendingSessions using `conversationId` to avoid conflicts', {
          params,
          foundPendingSession: pendingSessions.map(s => ({ sessionId: s.id, conversationId: s.conversationId }))
        });
        // TODO: get conversation that is not in a connected state

        // finish this – currently the client-private on("cancelIncomingRtcSession") is not getting a conversationId
      }

      return this.pendingSessions[pendingSessions[0]?.conversationId];
    }
  }

  removePendingSession (params: ISessionIdAndConversationId | IPendingSession) {
    const conversationId = params.conversationId || this.getPendingSession(params)?.conversationId;
    delete this.pendingSessions[conversationId];
  }

  getSession (params: ISessionIdAndConversationId): IExtendedMediaSession {
    let session: IExtendedMediaSession;
    if (params.conversationId) {
      const softphoneHanlder = this.getSessionHandler({ sessionType: SessionTypes.softphone }) as SoftphoneSessionHandler;

      session = Object.values(softphoneHanlder.conversations)
        .find((c) => c.conversationId === params.conversationId)
        ?.session;

      session = session || (Object.values(this.jingle.sessions) as IExtendedMediaSession[]).find((s: IExtendedMediaSession) => s.conversationId === params.conversationId);
    } else {
      session = this.jingle.sessions[params.sessionId] as IExtendedMediaSession;
    }

    if (!session) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Unable to find session', params);
    }

    return session;
  }

  getAllActiveSessions (): IExtendedMediaSession[] {
    return Object.values<IExtendedMediaSession>(this.jingle.sessions as { key: IExtendedMediaSession })
      .filter((session: IExtendedMediaSession) => session.state === 'active');
  }

  getAllJingleSessions (): IExtendedMediaSession[] {
    return Object.values<IExtendedMediaSession>(this.jingle.sessions as { key: IExtendedMediaSession });
  }

  getSessionHandler (params: { sessionInfo?: ISessionInfo, sessionType?: SessionTypes, jingleSession?: any }): BaseSessionHandler {
    let handler: BaseSessionHandler;
    if (params.sessionType) {
      handler = this.sessionHandlers.find((handler) => handler.sessionType === params.sessionType);
    } else {
      const fromJid = (params.sessionInfo && params.sessionInfo.fromJid) || (params.jingleSession && params.jingleSession.peerID);

      if (!fromJid) {
        throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'getSessionHandler was called without any identifying information', params);
      }

      handler = this.sessionHandlers.find((handler) => handler.shouldHandleSessionByJid(fromJid));
    }

    if (!handler) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to find session handler for session', params);
    }

    return handler;
  }

  async startSession (startSessionParams: IStartSessionParams | IStartVideoSessionParams | IStartSoftphoneSessionParams): Promise<any> {
    const handler = this.getSessionHandler({ sessionType: startSessionParams.sessionType });

    if (handler.disabled) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Cannot start a session with a disabled session handler', { startSessionParams, allowedSessionTypes: this.sdk._config.allowedSessionTypes });
    }

    return handler.startSession(startSessionParams);
  }

  /**
   * Update the outgoing media for a session.
   *
   * @param options for updating outgoing media
   */
  async updateOutgoingMedia (options: IUpdateOutgoingMedia): Promise<any> {
    const session = options.session || this.getSession({ sessionId: options.sessionId });
    const handler = this.getSessionHandler({ jingleSession: session });

    return handler.updateOutgoingMedia(session, options);
  }

  async updateOutgoingMediaForAllSessions (options?: Pick<IUpdateOutgoingMedia, 'audioDeviceId' | 'videoDeviceId'>): Promise<any> {
    const opts = options || {
      videoDeviceId: this.sdk._config.defaults.videoDeviceId,
      audioDeviceId: this.sdk._config.defaults.audioDeviceId
    };

    const sessions = this.getAllActiveSessions();

    this.log('info', 'Updating outgoing deviceId(s) for all active sessions', {
      sessionInfos: sessions.map(s => ({ sessionId: s.id, conversationId: s.conversationId })),
      videoDeviceId: opts.videoDeviceId,
      audioDeviceId: opts.audioDeviceId
    });

    const promises = sessions.map(session => {
      return this.updateOutgoingMedia({
        session,
        videoDeviceId: opts.videoDeviceId,
        audioDeviceId: opts.audioDeviceId
      });
    });
    return Promise.all(promises);
  }

  updateAudioVolume (volume: number): void {
    const sessions = this.getAllActiveSessions();
    this.log('info', 'Updating volume for all active sessions', {
      sessionInfos: sessions.map(s => ({ sessionId: s.id, conversationId: s.conversationId })),
      volume
    });

    sessions.forEach((session) => {
      const handler = this.getSessionHandler({ jingleSession: session });
      handler.updateAudioVolume(session, volume);
    });
  }

  async updateOutputDeviceForAllSessions (outputDeviceId: string | boolean | null): Promise<any> {
    const sessions = this.getAllActiveSessions().filter(s => s.sessionType !== SessionTypes.acdScreenShare);
    const _outputDeviceId = this.sdk.media.getValidDeviceId('audiooutput', outputDeviceId, ...sessions) || '';
    const ids = sessions.map(s => ({ sessionId: s.id, conversationId: s.conversationId }));

    if (typeof outputDeviceId === 'string' && _outputDeviceId !== outputDeviceId) {
      this.log('warn', 'Output deviceId not found. Not updating output media', { sessions: ids, outputDeviceId });
      return;
    }

    this.log('info', 'Updating output deviceId for all active sessions', {
      sessions: ids,
      outputDeviceId: _outputDeviceId
    });

    const promises = sessions.map(session => {
      const handler = this.getSessionHandler({ jingleSession: session });
      return handler.updateOutputDevice(session, _outputDeviceId);
    });

    return Promise.all(promises);
  }

  /**
   * Event handler for pending webrtc-sessions.
   * @param sessionInfo pending webrtc-session info
   */
  async onPropose (sessionInfo: ISessionInfo): Promise<void> {
    const handler = this.getSessionHandler({ sessionInfo });

    if (handler.disabled) {
      return;
    }

    logPendingSession(this.sdk.logger, 'onPendingSession', sessionInfo);

    const existingSession = this.getPendingSession(sessionInfo);

    if (existingSession) {
      logPendingSession(this.sdk.logger, 'duplicate session invitation, ignoring', sessionInfo);
      return;
    }

    const pendingSession: IPendingSession = {
      id: sessionInfo.sessionId,
      sessionId: sessionInfo.sessionId,
      autoAnswer: sessionInfo.autoAnswer,
      address: sessionInfo.fromJid,
      conversationId: sessionInfo.conversationId,
      persistentConversationId: sessionInfo.persistentConversationId,
      sessionType: handler.sessionType,
      originalRoomJid: sessionInfo.originalRoomJid,
      fromUserId: sessionInfo.fromUserId
    };

    this.pendingSessions[pendingSession.conversationId] = pendingSession;

    await handler.handlePropose(pendingSession);
  }

  /**
   * If we get this event from streaming-client, that means the session was
   *  canceled. We no longer care if it was a persistent connection or not
   *  because streaming-client will only emit events for actual sessions
   *  and not our psuedo-events we emit for persistent connection conversation
   *  events.
   * @param sessionId session id canceled by streaming client
   */
  onCancelPendingSession (sessionId: string, conversationId?: string): void {
    const pendingSession = this.getPendingSession({ sessionId, conversationId });
    if (!pendingSession) {
      return;
    }

    this.sdk.emit('cancelPendingSession', { sessionId, conversationId: pendingSession?.conversationId });
    this.removePendingSession(pendingSession);
  }

  /**
   * If we get this event from streaming-client, that means the session was
   *  canceled. We no longer care if it was a persistent connection or not
   *  because streaming-client will only emit events for actual sessions
   *  and not our psuedo-events we emit for persistent connection conversation
   *  events.
   * @param sessionId session id canceled by streaming client
   */
  onHandledPendingSession (sessionId: string, conversationId?: string): void {
    const pendingSession = this.getPendingSession({ sessionId, conversationId });
    if (!pendingSession) {
      return;
    }

    this.sdk.emit('handledPendingSession', { sessionId, conversationId: pendingSession?.conversationId });
    this.removePendingSession(pendingSession);
  }

  async proceedWithSession (params: ISessionIdAndConversationId): Promise<void> {
    const pendingSession = this.getPendingSession(params);

    if (!pendingSession) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Could not find a pendingSession matching accept params', { params });
    }

    const sessionHandler = this.getSessionHandler({ sessionType: pendingSession.sessionType });

    await sessionHandler.proceedWithSession(pendingSession);
  }

  async rejectPendingSession (params: ISessionIdAndConversationId): Promise<void> {
    const pendingSession = this.getPendingSession(params);

    if (!pendingSession) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Could not find a pendingSession', { params });
    }

    const sessionHandler = this.getSessionHandler({ sessionType: pendingSession.sessionType });

    await sessionHandler.rejectPendingSession(pendingSession);
  }

  async onSessionInit (session: IExtendedMediaSession) {
    const sessionHandler = this.getSessionHandler({ jingleSession: session });

    if (sessionHandler.disabled) {
      return;
    }

    session.sessionType = sessionHandler.sessionType;
    return sessionHandler.handleSessionInit(session);
  }

  async acceptSession (params: IAcceptSessionRequest): Promise<any> {
    if (!params || !params.conversationId) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.invalid_options, 'A conversationId is required for acceptSession');
    }

    const session = this.getSession({ conversationId: params.conversationId });
    const sessionHandler = this.getSessionHandler({ jingleSession: session });
    return sessionHandler.acceptSession(session, params);
  }

  async endSession (params: IEndSessionRequest) {
    if (!params.sessionId && !params.conversationId) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Unable to end session: must provide session id or conversationId.');
    }

    const session = this.getSession(params);

    const sessionHandler = this.getSessionHandler({ jingleSession: session });

    // TODO: this is ugly....
    if (
      params.conversationId &&
      sessionHandler instanceof SoftphoneSessionHandler &&
      sessionHandler.hasActivePersistentConnection() &&
      sessionHandler.persistentConnectionSession === session &&
      sessionHandler.conversations[params.conversationId]
    ) {
      const update = sessionHandler.conversations[params.conversationId];
      session.pcParticipant = update.mostRecentUserParticipant as any;
      session.conversationId = params.conversationId;
      console.debug('doing some fancy magic to find the correct conversationId on the persistent connection');
    }

    return sessionHandler.endSession(session, params.reason);
  }

  async setVideoMute (params: ISessionMuteRequest): Promise<void> {
    const session = this.getSession({ conversationId: params.conversationId });

    const handler = this.getSessionHandler({ sessionType: session.sessionType });
    await handler.setVideoMute(session, params);
  }

  async setAudioMute (params: ISessionMuteRequest): Promise<void> {
    const session = this.getSession({ conversationId: params.conversationId });

    const handler = this.getSessionHandler({ sessionType: session.sessionType });
    await handler.setAudioMute(session, params);
  }

  async setConversationHeld (params: IConversationHeldRequest): Promise<void> {
    const session = this.getSession({ conversationId: params.conversationId });

    const handler = this.getSessionHandler({ sessionType: session.sessionType });
    await handler.setConversationHeld(session, params);
  }

  async validateOutgoingMediaTracks () {
    const sessions = this.getAllActiveSessions();
    const { videoDevices, audioDevices, outputDevices, hasOutputDeviceSupport } = this.sdk.media.getState();
    const updates = new Map<string, { video?: boolean, audio?: boolean }>();
    const promises = [];

    let updateOutputDeviceForAllSessions = false;

    /* find all sessions that ned to be updated */
    for (const session of sessions) {
      const trackIdsToIgnore: string[] = [];
      /* if we have a video session with a screenShareStream */
      if (session._screenShareStream) {
        trackIdsToIgnore.push(...session._screenShareStream.getTracks().map((track) => track.id));
      }

      session.pc.getSenders()
        .filter((sender) => sender.track && !trackIdsToIgnore.includes(sender.track.id))
        .map(s => s.track)
        .forEach(track => {
          /* senders won't be using output devices so we don't need to worry about those */
          const deviceExists = !!(track.kind === 'video' ? videoDevices : audioDevices).find(
            d => d.label === track.label && d.kind.slice(0, 5) === track.kind
          );
          if (deviceExists) {
            this.log('debug', 'sessions outgoing track still has available device',
              { deviceLabel: track.label, kind: track.kind, sessionId: session.id });
            return;
          }

          const currVal: { video?: boolean, audio?: boolean } = updates.get(session.id) || {};
          currVal[track.kind] = true;
          updates.set(session.id, currVal);

          this.log('info', 'session lost media device and will attempt to switch devices',
            { conversationId: session.conversationId, sessionId: session.id, kind: track.kind, deviceLabel: track.label });
        });

      /* check output device */
      if (hasOutputDeviceSupport && session._outputAudioElement) {
        const deviceExists = outputDevices.find(
          d => d.deviceId === session._outputAudioElement.sinkId
        );

        if (!deviceExists) {
          updateOutputDeviceForAllSessions = true;

          this.log('info', 'session lost output device and will attempt to switch device',
            { conversationId: session.conversationId, sessionId: session.id, kind: 'output' });
        }
      }
    }

    /* if there are not sessions to updated, log and we are done */
    if (!updates.size && !updateOutputDeviceForAllSessions) {
      this.log('debug', 'no active sessions have outgoing tracks that need to have the device updated',
        { sessionIds: sessions.map(s => s.id) });
      return;
    }

    /* update the sessions */
    for (const [sessionId, mediaToUpdate] of updates) {
      const opts: IUpdateOutgoingMedia = { sessionId };
      const jingleSession = this.getSession({ sessionId: sessionId });
      const handler = this.getSessionHandler({ jingleSession });

      /* if our video needs to be updated */
      if (mediaToUpdate.video) {
        /* if we have devices, let the sdk figure out which to switch to */
        if (videoDevices.length) {
          opts.videoDeviceId = true;
        } else {
          this.log('warn', 'no available video devices to switch to. setting video to mute for session',
            { conversationId: jingleSession.conversationId, sessionId, kind: 'video' });
          promises.push(
            handler.setVideoMute(jingleSession, { mute: true, conversationId: jingleSession.conversationId })
          );
        }
      }

      /* if our audio needs to be updated */
      if (mediaToUpdate.audio) {
        if (audioDevices.length) {
          opts.audioDeviceId = true;
        } else {
          this.log('warn', 'no available audio devices to switch to. setting audio to mute for session',
            { conversationId: jingleSession.conversationId, sessionId, kind: 'audio' });
          promises.push(
            handler.setAudioMute(jingleSession, { mute: true, conversationId: jingleSession.conversationId })
          );

          const senders = handler.getSendersByTrackType(jingleSession, 'audio')
            .filter((sender) => sender.track);

          senders.forEach((sender) => {
            sender.track.stop();
            promises.push(handler.removeMediaFromSession(jingleSession, sender));
            jingleSession._outboundStream.removeTrack(sender.track);
          });
        }
      }

      /* update outgoing media */
      if (opts.videoDeviceId || opts.audioDeviceId) {
        promises.push(this.sdk.updateOutgoingMedia(opts));
      }
    }

    /* if the output device needs to change, update all sessions */
    if (updateOutputDeviceForAllSessions) {
      promises.push(
        this.updateOutputDeviceForAllSessions(true)
      );
    }

    return Promise.all(promises);
  }
}
