import { PureCloudWebrtcSdk } from '../client';
import BaseSessionHandler from './base-session-handler';
import SoftphoneSessionHandler from './softphone-session-handler';
import { log } from '../logging';
import { LogLevels, SessionTypes, SdkErrorTypes } from '../types/enums';
import { IPendingSession, ISessionInfo, IEndSessionRequest, IStartSessionParams, IAcceptSessionRequest } from '../types/interfaces';
import { throwSdkError } from '../utils';
import ScreenShareSessionHandler from './screen-share-session-handler';

const sessionHandlersToConfigure: any[] = [
  SoftphoneSessionHandler,
  ScreenShareSessionHandler
];

export class SessionManager {
  sessionHandlers: BaseSessionHandler[];
  pendingSessions: { [sessionId: string]: IPendingSession } = {};

  constructor (private sdk: PureCloudWebrtcSdk) { }

  private log (level: LogLevels, message: any, details?: any): void {
    log.call(this.sdk, level, message, details);
  }

  get jingle () {
    return this.sdk._streamingConnection._webrtcSessions.jingleJs;
  }

  get webrtcSessions () {
    return this.sdk._streamingConnection.webrtcSessions;
  }

  initSessionHandlers (): void {
    this.sessionHandlers = sessionHandlersToConfigure.map((ClassDef) => new ClassDef(this.sdk, this));
  }

  getPendingSession (params: {sessionId?: string, jid?: string, conversationId?: string, sessionType?: SessionTypes}): IPendingSession {
    if (params.sessionId) {
      return this.pendingSessions[params.sessionId];
    }
    return Object.values(this.pendingSessions).find((session) => session.conversationId === params.conversationId);
  }

  getSession (params: { id?: string, conversationId?: string }): any {
    let session: any;
    if (params.id) {
      session = this.jingle.sessions[params.id];
    } else {
      session = Object.values(this.jingle.sessions).find((s: any) => s.conversationId === params.conversationId);
    }

    if (!session) {
      throwSdkError.call(this.sdk, SdkErrorTypes.session, 'Unable to find session', params);
    }
  }

  removePendingSession (sessionId: string) {
    delete this.pendingSessions[sessionId];
  }

  getSessionHandler (params: { sessionInfo?: ISessionInfo, sessionType?: SessionTypes, jingleSession?: any }): BaseSessionHandler {
    let handler: BaseSessionHandler;
    if (params.sessionType) {
      handler = this.sessionHandlers.find((handler) => handler.getSessionType() === params.sessionType);
    } else {
      const fromJid = (params.sessionInfo && params.sessionInfo.fromJid) || (params.jingleSession && params.jingleSession.peerID);
      handler = this.sessionHandlers.find((handler) => handler.shouldHandleSessionByJid(fromJid));
    }

    if (!handler) {
      throwSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to find session handler for session', params);
    }

    return handler;
  }

  async startSession (startSessionParams: IStartSessionParams) {
    const handler = this.getSessionHandler({ sessionType: startSessionParams.sessionType });

    return handler.startSession(startSessionParams);
  }

  /**
   * Event handler for pending webrtc-sessions.
   * @param this must be called with a PureCloudWebrtcSdk as `this`
   * @param sessionInfo pending webrtc-session info
   */
  onPropose (sessionInfo: ISessionInfo) {
    this.log(LogLevels.info, 'onPendingSession', sessionInfo);

    const existingSession = this.getPendingSession({ conversationId: sessionInfo.conversationId });

    if (existingSession) {
      this.log(LogLevels.info, 'duplicate session invitation, ignoring', sessionInfo);
      return;
    }

    const handler = this.getSessionHandler({ sessionInfo });

    if (!handler) {
      throwSdkError.call(this.sdk, SdkErrorTypes.generic, 'Session handler for pending session could not be identified', sessionInfo);
    }

    const pendingSession: IPendingSession = {
      id: sessionInfo.sessionId,
      autoAnswer: sessionInfo.autoAnswer,
      address: sessionInfo.fromJid.split('@')[0],
      conversationId: sessionInfo.conversationId,
      sessionType: handler.getSessionType()
    };

    this.pendingSessions[pendingSession.id] = pendingSession;

    handler.handlePropose(pendingSession);
  }

  async proceedWithSession (sessionId: string) {
    const pendingSession = this.getPendingSession({ sessionId });

    if (!pendingSession) {
      throwSdkError.call(this.sdk, SdkErrorTypes.session, 'Could not find a pendingSession matching accept params', { sessionId });
    }

    const sessionHandler = this.getSessionHandler({ sessionType: pendingSession.sessionType });

    return sessionHandler.proceedWithSession(pendingSession);
  }

  async onSessionInit (session: any) {
    const sessionHandler = this.getSessionHandler({ jingleSession: session });
    session.sessionType = sessionHandler.getSessionType();
    return sessionHandler.handleSessionInit(session);
  }

  async acceptSession (params: IAcceptSessionRequest): Promise<any> {
    const session = this.getSession({ id: params.id });
    const sessionHandler = this.getSessionHandler({ jingleSession: session });
    return sessionHandler.acceptSession(session, params);
  }

  async endSession (params: IEndSessionRequest) {
    if (!params.id && !params.conversationId) {
      throwSdkError.call(this.sdk, SdkErrorTypes.session, 'Unable to end session: must provide session id or conversationId.');
    }

    const session = this.getSession(params);

    const sessionHandler = this.getSessionHandler({ jingleSession: session });
    return sessionHandler.endSession(session);
  }
}
