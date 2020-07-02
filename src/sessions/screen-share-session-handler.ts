import BaseSessionHandler from './base-session-handler';
import { IPendingSession, IStartSessionParams, IJingleSession, IUpdateOutgoingMedia } from '../types/interfaces';
import { SessionTypes, LogLevels, SdkErrorTypes } from '../types/enums';
import { startDisplayMedia, checkAllTracksHaveEnded } from '../media-utils';
import { throwSdkError, parseJwt, isAcdJid } from '../utils';

export default class ScreenShareSessionHandler extends BaseSessionHandler {
  sessionType = SessionTypes.acdScreenShare;

  shouldHandleSessionByJid (jid: string): boolean {
    return isAcdJid(jid);
  }

  // TODO: someday we should do media right before the session accept once we get away from media presence
  async startSession (startParams: IStartSessionParams): Promise<{ conversationId: string }> {
    const { jwt, conversation, sourceCommunicationId } = this.sdk._customerData;

    const jid = parseJwt(jwt).data.jid;
    const opts = {
      jid,
      conversationId: conversation.id,
      sourceCommunicationId: sourceCommunicationId,
      mediaPurpose: SessionTypes.acdScreenShare
    };

    this.log(LogLevels.info, 'starting acd screen share session', opts);

    this.sdk._streamingConnection.webrtcSessions.initiateRtcSession(opts);
    return { conversationId: conversation.id };
  }

  async handlePropose (pendingSession: IPendingSession): Promise<void> {
    await super.handlePropose(pendingSession);
    await this.proceedWithSession(pendingSession);
  }

  onTrackEnd (session: IJingleSession) {
    this.log(LogLevels.debug, 'Track ended');
    if (checkAllTracksHaveEnded(session._screenShareStream)) {
      return this.endSession(session);
    }
  }

  async handleSessionInit (session: IJingleSession): Promise<void> {
    try {
      await super.handleSessionInit(session);
    } catch (err) {
      this.log(LogLevels.error, 'Screen share session init failed');
      await super.endSession(session);
    } finally {
      const stream = await startDisplayMedia();

      session.on('terminated', (session: IJingleSession) => {
        session._screenShareStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      });

      if (!this.sdk.isGuest) {
        throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'Screen share sessions not supported for authenticated users');
      }

      stream.getTracks().forEach((track: MediaStreamTrack) => {
        track.addEventListener('ended', this.onTrackEnd.bind(this, session));
      });
      this.log(LogLevels.debug, 'Adding stream to the session and setting it to _screenShareStream', { sessionId: session.id, conversationId: session.conversationId });

      await this.addMediaToSession(session, stream);

      session._screenShareStream = stream;

      if (!this.sdk._config.autoConnectSessions) {
        // if autoConnectSessions is 'false' and we have a guest, throw an error
        //  guests should auto accept screen share session
        const errMsg = '`autoConnectSession` must be set to "true" for guests';
        this.log(LogLevels.error, errMsg, { sessionId: session.id, conversationId: session.conversationId });
        throwSdkError.call(this.sdk, SdkErrorTypes.generic, errMsg);
      }

      await this.acceptSession(session, { id: session.id });
    }
  }

  public updateOutgoingMedia (session: IJingleSession, options: IUpdateOutgoingMedia): never {
    this.log(LogLevels.warn, 'Cannot update outgoing media for acd screen share sessions', { sessionId: session.id, sessionType: session.sessionType });
    throw throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'Cannot update outgoing media for acd screen share sessions');
  }
}
