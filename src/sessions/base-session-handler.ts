import { PureCloudWebrtcSdk } from '../client';
import { log } from '../logging';
import { LogLevels, SessionTypes, SdkErrorTypes } from '../types/enums';
import StatsGatherer from 'webrtc-stats-gatherer';
import { SessionManager } from './session-manager';
import { IPendingSession, IAcceptPendingSessionRequest, IStartSessionParams } from '../types/interfaces';
import { checkHasTransceiverFunctionality } from '../media-utils';
import { throwSdkError } from '../utils';

export default abstract class BaseSessionHandler {
  constructor (protected sdk: PureCloudWebrtcSdk, protected sessionManager: SessionManager) {}

  abstract getSessionType (): SessionTypes;

  protected log (level: LogLevels, message: any, details?: any): void {
    log.call(this.sdk, level, message, details);
  }

  abstract shouldHandleSessionByJid (jid: string): boolean;

  shouldHandleSessionByType (sessionType: SessionTypes): boolean {
    return this.getSessionType() === sessionType;
  }

  handleConversationUpdate (update: { session: any, update: any }) { }

  async startSession (sessionStartParams: IStartSessionParams): Promise<any> {
    throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, `sessionType ${sessionStartParams.sessionType} can only be started using the purecloud api`, { sessionStartParams });
  }

  handlePropose (pendingSession: IPendingSession) {
    this.sdk.emit('pendingSession', pendingSession);

    setTimeout(() => {
      this.sessionManager.removePendingSession(pendingSession.id);
    }, 1000);
  }

  acceptPendingSession (session: IPendingSession, params?: IAcceptPendingSessionRequest) {
    this.sessionManager.webrtcSessions.acceptRtcSession(session.id);
  }

  async handleSessionInit (session: any) {
    try {
      this.log(LogLevels.info, 'onSession', session);
    } catch (e) {
      // don't let log errors ruin a session
    }

    session.id = session.sid;
    const pendingSession = this.sessionManager.getPendingSession(session.id);
    if (pendingSession) {
      session.conversationId = pendingSession.conversationId;
    }
    this.sessionManager.removePendingSession(session.id);

    session._statsGatherer = new StatsGatherer(session.pc, {
      session: session.sid,
      conference: session.conversationId
    });

    session._statsGatherer.on('stats', (data) => {
      data.conversationId = session.conversationId;
      this.log(LogLevels.info, 'session:stats', data);
    });

    session._statsGatherer.on('traces', (data) => {
      data.conversationId = session.conversationId;
      this.log(LogLevels.warn, 'session:trace', data);
    });

    session.on('change:active', (session, active) => {
      if (active) {
        session._statsGatherer.collectInitialConnectionStats();
      }
      this.log(LogLevels.info, 'change:active', { active, conversationId: session.conversationId, sid: session.sid });
    });

    session.on('terminated', (session, reason) => {
      this.log(LogLevels.info, 'onSessionTerminated', { conversationId: session.conversationId, reason });
      if (session._outboundStream) {
        session._outboundStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      }
      this.sdk.emit('sessionEnded', session, reason);
    });
    this.sdk.emit('sessionStarted', session);
  }

  async endSession (session: any) {
    session.end();
  }

  /**
   * Add new media to a session. Will attempt to use tracksBasedActions if possible.
   * @param session jingle media session
   * @param stream local MediaStream to add to session
   * @param allowLegacyStreamBasedActionsFallback if false, an error will be thrown if track based actions are not supported
   */
  addMediaToSession (session, stream: MediaStream, allowLegacyStreamBasedActionsFallback: boolean = true) {
    if (checkHasTransceiverFunctionality()) {
      this.log(LogLevels.info, 'Using track based actions');
      stream.getTracks().forEach(t => {
        this.log(LogLevels.debug, 'Adding track to session', t);
        session.addTrack(t);
      });
    } else if (allowLegacyStreamBasedActionsFallback) {
      this.log(LogLevels.info, 'Using stream based actions.');
      this.log(LogLevels.debug, 'Adding stream to session', stream);
      session.addStream(stream);
    } else {
      const errMsg = 'Track based actions are required for this session but the client is not capable';
      throwSdkError.call(this.sdk, SdkErrorTypes.generic, errMsg);
    }
  }
}
