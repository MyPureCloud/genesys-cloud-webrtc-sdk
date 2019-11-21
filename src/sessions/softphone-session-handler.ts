import BaseSessionHandler from './base-session-handler';
import { IPendingSession, IAcceptSessionRequest } from '../types/interfaces';
import { SessionTypes, LogLevels, SdkErrorTypes } from '../types/enums';
import { startAudioMedia, attachAudioMedia } from '../media-utils';
import { requestApi, throwSdkError, isSoftphoneJid } from '../utils';

export default class SoftphoneSessionHandler extends BaseSessionHandler {
  sessionType = SessionTypes.softphone;

  shouldHandleSessionByJid (jid: string): boolean {
    return isSoftphoneJid(jid);
  }

  handlePropose (pendingSession: IPendingSession) {
    super.handlePropose(pendingSession);

    if (pendingSession.autoAnswer && !this.sdk._config.disableAutoAnswer) {
      this.proceedWithSession(pendingSession);
    }
  }

  async handleSessionInit (session: any) {
    await super.handleSessionInit(session);
    if (this.sdk._config.autoConnectSessions) {
      return this.acceptSession(session, { id: session.id });
    }

    // todo: will need to update this to call streamingClient.rtcSessionAccepted
  }

  async acceptSession (session: any, params: IAcceptSessionRequest): Promise<any> {
    let stream = params.mediaStream || this.sdk._config.defaultAudioStream;
    if (!stream) {
      this.log(LogLevels.debug, 'No mediaStream provided, starting media');
      stream = await startAudioMedia();
      this.log(LogLevels.debug, 'Media start');
    }
    this.log(LogLevels.debug, 'Adding media to session');
    this.addMediaToSession(session, stream);
    session._outboundStream = stream;

    const element = params.audioElement || this.sdk._config.defaultAudioElement;

    if (session.streams.length === 1 && session.streams[0].getTracks().length > 0) {
      attachAudioMedia(this.sdk, session.streams[0], element);
    } else {
      session.on('peerStreamAdded', (session, peerStream: MediaStream) => {
        attachAudioMedia(this.sdk, peerStream, element);
      });
    }

    return super.acceptSession(session, params);
  }

  async endSession (session: any) {
    try {
      const { body } = await requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}`);
      const participant = body.participants
        .find((p: { user?: { id?: string } }) => p.user && p.user.id === this.sdk._personDetails.id);

      await requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}/participants/${participant.id}`, {
        method: 'patch',
        data: JSON.stringify({ state: 'disconnected' })
      });
    } catch (err) {
      session.end();
      throwSdkError.call(this.sdk, SdkErrorTypes.http, err.message, err);
    }
  }
}
