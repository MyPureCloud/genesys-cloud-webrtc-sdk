import BaseSessionHandler from './base-session-handler';
import { IPendingSession, IStartSessionParams } from '../types/interfaces';
import { SessionTypes, LogLevels, SdkErrorTypes } from '../types/enums';
import { startDisplayMedia, checkAllTracksHaveEnded } from '../media-utils';
import { throwSdkError, parseJwt, isAcdJid } from '../utils';

export default class ScreenShareSessionHandler extends BaseSessionHandler {
  temporaryOutboundStream: MediaStream;

  sessionType = SessionTypes.acdScreenShare;

  shouldHandleSessionByJid (jid: string): boolean {
    return isAcdJid(jid);
  }

  // TODO: someday we should do media right before the session accept once we get away from media presence
  async startSession (startParams: IStartSessionParams): Promise<void> {
    const { jwt, conversation, sourceCommunicationId } = this.sdk._customerData;

    const stream = await startDisplayMedia();
    const jid = parseJwt(jwt).data.jid;
    const opts = {
      stream,
      jid,
      conversationId: conversation.id,
      sourceCommunicationId: sourceCommunicationId,
      mediaPurpose: SessionTypes.acdScreenShare
    };

    this.sdk._streamingConnection.webrtcSessions.initiateRtcSession(opts);
    this.temporaryOutboundStream = stream;
  }

  handlePropose (pendingSession: IPendingSession) {
    super.handlePropose(pendingSession);
    this.proceedWithSession(pendingSession);
  }

  onTrackEnd (session: any) {
    this.log(LogLevels.debug, 'Track ended');
    if (checkAllTracksHaveEnded(session._outboundStream)) {
      session.end();
    }
  }

  async handleSessionInit (session: any) {
    await super.handleSessionInit(session);

    if (!this.sdk.isGuest) {
      throwSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'Screen share sessions not supported for authenticated users');
    }

    if (this.temporaryOutboundStream) {
      this.temporaryOutboundStream.getTracks().forEach((track: MediaStreamTrack) => {
        track.addEventListener('ended', this.onTrackEnd.bind(this, session));
      });
      this.log(LogLevels.debug, 'temporaryOutboundStream exists. Adding stream to the session and setting it to _outboundStream');

      this.addMediaToSession(session, this.temporaryOutboundStream);

      session._outboundStream = this.temporaryOutboundStream;
      this.temporaryOutboundStream = null;
    } else {
      this.log(LogLevels.warn, 'There is no `temporaryOutboundStream` for guest user');
    }

    if (!this.sdk._config.autoConnectSessions) {
      // if autoConnectSessions is 'false' and we have a guest, throw an error
      //  guests should auto accept screen share session
      const errMsg = '`autoConnectSession` must be set to "true" for guests';
      this.log(LogLevels.error, errMsg);
      throwSdkError.call(this.sdk, SdkErrorTypes.generic, errMsg);
    }

    return this.acceptSession(session, { id: session.id });
  }
}
