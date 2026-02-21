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
  IStartVideoMeetingSessionParams,
  IExtendedMediaSession,
  IStartSoftphoneSessionParams,
  ISessionIdAndConversationId,
  IConversationHeldRequest,
  IPendingSessionActionParams,
  VideoMediaSession,
  IActiveConversationDescription,
  SubscriptionEvent
} from '../types/interfaces';
import { ConversationUpdate } from '../conversations/conversation-update';
import { SessionTypesAsStrings } from 'genesys-cloud-streaming-client';
import { Constants } from 'stanza';
import ScreenRecordingSessionHandler from './screen-recording-session-handler';
import LiveMonitoringSessionHandler from './live-monitoring-session-handler';
import { WebrtcExtensionAPI } from 'genesys-cloud-streaming-client/dist/es/webrtc';

const sessionHandlersToConfigure: any[] = [
  SoftphoneSessionHandler,
  VideoSessionHandler,
  ScreenShareSessionHandler,
  ScreenRecordingSessionHandler,
  LiveMonitoringSessionHandler
];

export class SessionManager {
  sessionHandlers: BaseSessionHandler[];
  /* use conversationId to index to account for persistent connections */
  pendingSessions: IPendingSession[] = [];

  constructor (private sdk: GenesysCloudWebrtcSdk) {
    this.sessionHandlers = sessionHandlersToConfigure.map((ClassDef) => new ClassDef(this.sdk, this));
  }

  private log (level: LogLevels, message: any, details?: any): void {
    this.sdk.logger[level](message, details);
  }

  get webrtcSessions (): WebrtcExtensionAPI {
    return this.sdk._streamingConnection.webrtcSessions;
  }

  async addAllowedSessionType (sessionType: SessionTypes): Promise<void> {
    const handler = this.getSessionHandler({ sessionType });
    return handler.enableHandler();
  }

  async removeAllowedSessionType (sessionType: SessionTypes): Promise<void> {
    const handler = this.getSessionHandler({ sessionType });
    return handler.disableHandler();
  }

  handleConversationUpdate (update: ConversationUpdate): void {
    const sessions = this.getAllSessions();

    /* let each enabled handler process updates */
    this.sessionHandlers
      .filter(handler => !handler.disabled)
      .forEach(handler =>
        handler.handleConversationUpdate(update, sessions.filter(s => s.sessionType === handler.sessionType))
      );
  }

  handleConversationUpdateRaw (update: SubscriptionEvent): void {
    /* let each enabled handler process updates */
    this.sessionHandlers
      .filter(handler => !handler.disabled)
      .forEach(handler =>
        handler.handleConversationUpdateRaw(update)
      );
  }

  getPendingSession (params: { conversationId?: string, sessionId?: string, sessionType?: SessionTypes | SessionTypesAsStrings }): IPendingSession | undefined {
    const session = this.pendingSessions
      .find(s => {
        // if sessionId is provided use that exclusively
        if (params.sessionId) {
          return s.id === params.sessionId;
        }

        let matchesSessionType = true;
        if (params.sessionType) {
          matchesSessionType = s.sessionType === params.sessionType;
        }

        return matchesSessionType && s.conversationId === params.conversationId
      });

    return session;
  }

  removePendingSession (params: ISessionIdAndConversationId | IPendingSession): void {
    const pendingSession = this.getPendingSession(params);

    if (!pendingSession) {
      this.sdk.logger.warn('failed to find pendingSession to remove', params);
      return;
    }

    this.pendingSessions = this.pendingSessions.filter(s => s !== pendingSession);
  }

  getSession (params: { conversationId: string, sessionType?: SessionTypes, searchScreenRecordingSessions?: boolean }): IExtendedMediaSession {

    let sessionTypesToSearch: SessionTypes[];

    if (params.sessionType) {
      sessionTypesToSearch = [params.sessionType];
    } else {
      const sessionTypes = { ...SessionTypes };

      if (!params.searchScreenRecordingSessions) {
        delete sessionTypes[SessionTypes.screenRecording]
      }

      sessionTypesToSearch = Object.values(sessionTypes);
    }

    let session = this.getAllSessions()
      .find((s: IExtendedMediaSession) => sessionTypesToSearch.includes(s.sessionType) && s.conversationId === params.conversationId);

    // search fake/shared softphone sessions
    if (!session && sessionTypesToSearch.includes(SessionTypes.softphone)) {
      const softphoneHandler = this.getSessionHandler({ sessionType: SessionTypes.softphone }) as SoftphoneSessionHandler;

      session = Object.values(softphoneHandler.conversations).find((c) => c.conversationId === params.conversationId)?.session;
    }

    if (!session) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Unable to find session', params);
    }

    return session;
  }

  getSessionBySessionId (sessionId: string): IExtendedMediaSession {
    return this.getAllSessions().find(s => s.id === sessionId);
  }

  getAllActiveSessions (): IExtendedMediaSession[] {
    return this.webrtcSessions.getAllSessions()
      .filter((session) => session.state === 'active') as IExtendedMediaSession[];
  }

  getAllActiveConversations (): IActiveConversationDescription[] {
    return [].concat(...this.sessionHandlers.map(handler => handler.getActiveConversations()));
  }

  getAllSessions (): IExtendedMediaSession[] {
    return this.webrtcSessions.getAllSessions() as IExtendedMediaSession[];
  }

  getSessionHandler (params: { sessionInfo?: ISessionInfo, sessionType?: SessionTypes | SessionTypesAsStrings, jingleSession?: any }): BaseSessionHandler {
    let handler: BaseSessionHandler;
    if (params.sessionType || params.sessionInfo?.sessionType) {
      handler = this.sessionHandlers.find((handler) => handler.sessionType == (params.sessionType || params.sessionInfo?.sessionType));
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

  async startSession (startSessionParams: IStartSessionParams | IStartVideoSessionParams | IStartVideoMeetingSessionParams | IStartSoftphoneSessionParams): Promise<any> {
    if (!this.sdk.connected) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'A session cannot be started as streaming client is not yet connected', { sessionType: startSessionParams.sessionType });
    }
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
    const session = options.session || this.getSession({ conversationId: options.conversationId });
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
      sessionInfos: sessions.map(s => ({ sessionId: s.id, conversationId: s.conversationId, sessionType: s.sessionType })),
      videoDeviceId: opts.videoDeviceId,
      audioDeviceId: opts.audioDeviceId
    });

    const promises = sessions.map(session => {
      return this.updateOutgoingMedia({
        session,
        ...opts
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
    const ids = sessions.map(s => ({ sessionId: s.id, conversationId: s.conversationId, sessionType: s.sessionType }));

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

  async addOrReplaceTrackOnSession (track: MediaStreamTrack, session: IExtendedMediaSession): Promise<void> {
    const handler = this.getSessionHandler({ jingleSession: session });
    await handler.addReplaceTrackToSession(session, track);
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

    const { conversationId, sessionType } = sessionInfo;
    const existingSession = this.getPendingSession({ conversationId, sessionType });

    if (existingSession) {
      if (existingSession.sessionId !== sessionInfo.sessionId) {
        this.log('info', `found an existingSession matching propose's conversationId, updating existingSession.sessionId to match`,
          { existingSessionId: existingSession.sessionId, proposeSessionId: sessionInfo.sessionId, conversationId: sessionInfo.conversationId});
        existingSession.sessionId = sessionInfo.sessionId;
        existingSession.id = sessionInfo.id;

        if (existingSession.accepted) {
          this.log('info', `updated existingSession was already accepted, "proceeding" again`, { sessionId: sessionInfo.sessionId, conversationId: sessionInfo.conversationId });
          return handler.proceedWithSession(existingSession);
        }
      }
      logPendingSession(this.sdk.logger, 'duplicate session invitation, ignoring', sessionInfo);
      return;
    }

    const pendingSession: IPendingSession = {
      id: sessionInfo.sessionId,
      sessionId: sessionInfo.sessionId,
      autoAnswer: sessionInfo.autoAnswer,
      conversationId: sessionInfo.conversationId,
      sessionType: handler.sessionType,
      originalRoomJid: sessionInfo.originalRoomJid,
      fromUserId: sessionInfo.fromUserId,
      toJid: sessionInfo.toJid,
      fromJid: sessionInfo.fromJid,
      privAnswerMode: sessionInfo.privAnswerMode,
      meetingId: sessionInfo.meetingId
    };

    this.pendingSessions.push(pendingSession);

    await handler.handlePropose(pendingSession);
  }

  /**
   * If we get this event from streaming-client, that means the session was
   *  canceled. We no longer care if it was a LA of 1 session or not
   *  because streaming-client will only emit events for actual sessions
   *  and not our psuedo-events we emit for LA of 1 conversation
   *  events.
   * @param sessionId session id canceled by streaming client
   */
  onCancelPendingSession (sessionId: string, conversationId?: string): void {
    const pendingSession = this.getPendingSession({ sessionId, conversationId });
    if (!pendingSession) {
      return;
    }

    this.sdk.emit('cancelPendingSession', { sessionId, conversationId: pendingSession.conversationId });
    this.removePendingSession(pendingSession);
  }

  /**
   * If we get this event from streaming-client, that means the session was
   *  canceled. We no longer care if it was a LA of 1 session or not
   *  because streaming-client will only emit events for actual sessions
   *  and not our psuedo-events we emit for LA of 1 conversation
   *  events.
   * @param sessionId session id canceled by streaming client
   */
  onHandledPendingSession (sessionId: string, conversationId?: string): void {
    const pendingSession = this.getPendingSession({ sessionId, conversationId });
    if (!pendingSession) {
      return;
    }

    this.sdk.emit('handledPendingSession', { sessionId, conversationId: pendingSession.conversationId });
    this.removePendingSession(pendingSession);
  }

  async proceedWithSession (params: IPendingSessionActionParams): Promise<void> {
    const pendingSession = this.getPendingSession(params);

    if (!pendingSession) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Could not find a pendingSession matching accept params', { params });
    }

    const sessionHandler = this.getSessionHandler({ sessionType: pendingSession.sessionType });

    await sessionHandler.proceedWithSession(pendingSession);
  }

  async rejectPendingSession (params: IPendingSessionActionParams): Promise<void> {
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

    const session = this.getSession({ conversationId: params.conversationId, sessionType: params.sessionType, searchScreenRecordingSessions: true });

    if (session._alreadyAccepted) {
      this.log('info', 'acceptSession called for session that was already accepted, not accepting again.', { sessionId: session.id, conversationId: session.conversationId });
      return;
    }

    session._alreadyAccepted = true;

    const sessionHandler = this.getSessionHandler({ jingleSession: session });
    return sessionHandler.acceptSession(session, params);
  }

  async endSession (params: IEndSessionRequest) {
    const conversationId = params.conversationId;
    if (!conversationId) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Unable to end session: must provide a conversationId.');
    }

    const session = this.getSession(params);

    const sessionHandler = this.getSessionHandler({ jingleSession: session });

    return sessionHandler.endSession(conversationId, session, params.reason);
  }

  async forceTerminateSession (sessionId: string, reason?: Constants.JingleReasonCondition) {
    const session = this.getAllSessions().find((s: IExtendedMediaSession) => s.id === sessionId);

    if (!session) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to find session by sessionId', { sessionId });
    }

    const handler = this.getSessionHandler({ sessionType: session.sessionType });
    return handler.forceEndSession(session, reason);
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
      if ((session as VideoMediaSession)._screenShareStream) {
        trackIdsToIgnore.push(...(session as VideoMediaSession)._screenShareStream.getTracks().map((track) => track.id));
      }

      session.peerConnection.getSenders()
        .filter((sender) => sender.track && !trackIdsToIgnore.includes(sender.track.id))
        .map(s => s.track)
        .forEach(track => {
          /* senders won't be using output devices so we don't need to worry about those */
          const deviceExists = !!(track.kind === 'video' ? videoDevices : audioDevices).find(
            d => d.label === track.label && d.kind.slice(0, 5) === track.kind
          );
          if (deviceExists) {
            this.log('debug', 'sessions outgoing track still has available device',
              { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType, kind: track.kind, deviceLabel: track.label });
            return;
          }

          const currVal: { video?: boolean, audio?: boolean } = updates.get(session.id) || {};
          currVal[track.kind] = true;
          updates.set(session.id, currVal);

          this.log('info', 'session lost media device and will attempt to switch devices',
            { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType, kind: track.kind, deviceLabel: track.label });
        });

      /* check output device */
      if (hasOutputDeviceSupport && session._outputAudioElement) {
        const deviceExists = outputDevices.find(
          d => d.deviceId === session._outputAudioElement.sinkId
        );

        if (!deviceExists) {
          updateOutputDeviceForAllSessions = true;

          this.log('info', 'session lost output device and will attempt to switch device',
            { conversationId: session.conversationId, sessionId: session.id, kind: 'output', sessionType: session.sessionType });
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
      const jingleSession = this.getSessionBySessionId(sessionId)
      const opts: IUpdateOutgoingMedia = { session: jingleSession };
      const handler = this.getSessionHandler({ jingleSession });

      /* if our video needs to be updated */
      if (mediaToUpdate.video) {
        /* if we have devices, let the sdk figure out which to switch to */
        if (videoDevices.length) {
          opts.videoDeviceId = true;
        } else {
          this.log('warn', 'no available video devices to switch to. setting video to mute for session',
            { conversationId: jingleSession.conversationId, sessionId, kind: 'video', sessionType: jingleSession.sessionType });
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
            { conversationId: jingleSession.conversationId, sessionId, kind: 'audio', sessionType: jingleSession.sessionType });
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
