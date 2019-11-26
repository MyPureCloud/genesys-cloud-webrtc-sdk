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

  async handlePropose (pendingSession: IPendingSession): Promise<void> {
    await super.handlePropose(pendingSession);

    if (pendingSession.autoAnswer && !this.sdk._config.disableAutoAnswer) {
      await this.proceedWithSession(pendingSession);
    }
  }

  async handleSessionInit (session: any): Promise<void> {
    await super.handleSessionInit(session);
    if (this.sdk._config.autoConnectSessions) {
      return this.acceptSession(session, { id: session.id });
    }
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

  async endSession (session: any): Promise<void> {
    try {
      const { body } = await requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}`);
      const participant = body.participants
        .find((p: { user?: { id?: string } }) => p.user && p.user.id === this.sdk._personDetails.id);

      const patchPromise = requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}/participants/${participant.id}`, {
        method: 'patch',
        data: JSON.stringify({ state: 'disconnected' })
      });

      const terminatedPromise = new Promise<void>((resolve, reject) => {
        session.once('terminated', (reason) => {
          return resolve(reason);
        });
        session.once('error', error => {
          return reject(error);
        });
      });

      await Promise.all([patchPromise, terminatedPromise]);
    } catch (err) {
      this.log(LogLevels.error, 'Failed to end session gracefully', err);
      return this.endSessionFallback(session);
    }
  }

  async endSessionFallback (session: any): Promise<void> {
    this.log(LogLevels.info, 'Attempting to end session directly', { sessionId: session.id });
    try {
      await super.endSession(session);
    } catch (err) {
      throwSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to end session directly', err);
    }
  }
}
