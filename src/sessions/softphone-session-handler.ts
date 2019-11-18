import BaseSessionHandler from './base-session-handler';
import { IPendingSession, ISessionInfo, IAcceptPendingSessionRequest, IStartSessionParams } from '../types/interfaces';
import { SessionTypes, LogLevels, SdkErrorTypes } from '../types/enums';
import { startAudioMedia, attachAudioMedia } from '../media-utils';
import { requestApi, throwSdkError, isSoftphoneJid } from '../utils';

export default class SoftphoneSessionHandler extends BaseSessionHandler {
  private pendingMedia: MediaStream;
  private pendingAudioElement: HTMLAudioElement;

  getSessionType () {
    return SessionTypes.softphone;
  }

  shouldHandleSessionByJid (jid: string): boolean {
    return isSoftphoneJid(jid);
  }

  handlePropose (pendingSession: IPendingSession) {
    super.handlePropose(pendingSession);

    // this needs to change once we can distinguish what type of session it is
    if ((pendingSession.autoAnswer && !this.sdk._config.disableAutoAnswer) || this.sdk.isGuest) {
      this.acceptPendingSession(pendingSession);
    }
  }

  acceptPendingSession (session: IPendingSession, params?: IAcceptPendingSessionRequest) {
    if (params && params.mediaStream) {
      this.pendingMedia = params.mediaStream;
    }
    if (params && params.audioElement) {
      this.pendingAudioElement = params.audioElement;
    }

    super.acceptPendingSession(session, params);
  }

  async handleSessionInit (session: any) {
    await super.handleSessionInit(session);
    const stream = await this.getAudioMedia();
    this.log(LogLevels.debug, 'onAudioMediaStarted');
    this.addMediaToSession(session, stream);
    session._outboundStream = stream;

    if (session.streams.length === 1 && session.streams[0].getTracks().length > 0) {
      attachAudioMedia(session.streams[0], this.pendingAudioElement);
    } else {
      session.on('peerStreamAdded', (session, stream) => {
        attachAudioMedia(stream, this.pendingAudioElement);
      });
    }

    this.pendingAudioElement = null;

    if (this.sdk._config.autoConnectSessions) {
      session.accept();
    }
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

  private async getAudioMedia (): Promise<MediaStream> {
    if (this.pendingMedia) {
      return this.pendingMedia;
    }

    return startAudioMedia();
  }
}
