import BaseSessionHandler from './base-session-handler';
import { IPendingSession, IAcceptSessionRequest, ISessionMuteRequest, IConversationParticipant, IJingleSession } from '../types/interfaces';
import { SessionTypes, LogLevels, SdkErrorTypes } from '../types/enums';
import { attachAudioMedia, startMedia } from '../media-utils';
import { requestApi, throwSdkError, isSoftphoneJid } from '../utils';
import { pick } from 'lodash';

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

  async handleSessionInit (session: IJingleSession): Promise<void> {
    await super.handleSessionInit(session);
    if (this.sdk._config.autoConnectSessions) {
      return this.acceptSession(session, { id: session.id });
    }
  }

  async acceptSession (session: IJingleSession, params: IAcceptSessionRequest): Promise<any> {
    let stream = params.mediaStream || this.sdk._config.defaultAudioStream;
    if (!stream) {
      this.log(LogLevels.debug, 'No mediaStream provided, starting media');
      stream = await startMedia({ audio: true });
      this.log(LogLevels.debug, 'Media start');
    }
    this.log(LogLevels.debug, 'Adding media to session');
    await this.addMediaToSession(session, stream);
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

  async endSession (session: IJingleSession): Promise<void> {
    try {
      const participant = await this.getParticipantForSession(session);

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

  async endSessionFallback (session: IJingleSession): Promise<void> {
    this.log(LogLevels.info, 'Attempting to end session directly', { sessionId: session.id });
    try {
      await super.endSession(session);
    } catch (err) {
      throwSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to end session directly', err);
    }
  }

  async getParticipantForSession (session: IJingleSession): Promise<IConversationParticipant> {
    if (!session.pcParticipant) {
      const { body } = await requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}`);
      const participants: IConversationParticipant[] = body.participants.map((p: any) => {
        const participant: IConversationParticipant = pick(p, ['id', 'address', 'purpose', 'state', 'direction', 'muted', 'confined']);
        participant.userId = p.user && p.user.id;
        return participant;
      });

      const participant = participants.find((p) => p.userId === this.sdk._personDetails.id);

      if (!participant) {
        throwSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to find a participant for session', { sessionId: session.id, sessionType: this.sessionType });
      }

      session.pcParticipant = participant;
    }

    return session.pcParticipant;
  }

  async setAudioMute (session: IJingleSession, params: ISessionMuteRequest) {
    try {
      const participant = await this.getParticipantForSession(session);

      await requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}/participants/${participant.id}`, {
        method: 'patch',
        data: JSON.stringify({ muted: params.mute })
      });
    } catch (err) {
      this.log(LogLevels.error, 'Failed to set audioMute', err);
      throwSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to set audioMute', { params, err });
    }
  }
}
