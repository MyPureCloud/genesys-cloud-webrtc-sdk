import { pick } from 'lodash';
import { JingleReason } from 'stanza/protocol';

import BaseSessionHandler from './base-session-handler';
import { IPendingSession, IAcceptSessionRequest, ISessionMuteRequest, IConversationParticipant, IExtendedMediaSession } from '../types/interfaces';
import { SessionTypes, SdkErrorTypes } from '../types/enums';
import { attachAudioMedia, logDeviceChange } from '../media/media-utils';
import { requestApi, isSoftphoneJid, createAndEmitSdkError } from '../utils';

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

  async handleSessionInit (session: IExtendedMediaSession): Promise<void> {
    await super.handleSessionInit(session);
    if (this.sdk._config.autoConnectSessions) {
      return this.acceptSession(session, { sessionId: session.id });
    }
  }

  async acceptSession (session: IExtendedMediaSession, params: IAcceptSessionRequest): Promise<any> {
    let stream = params.mediaStream || this.sdk._config.defaults.audioStream;
    if (!stream) {
      this.log('debug', 'No mediaStream provided, starting media', { conversationId: session.conversationId });
      // TODO: this doesn't handle `null` (system defaults)
      stream = await this.sdk.media.startMedia({ audio: params.audioDeviceId || true, session });
      this.log('debug', 'Media started', { conversationId: session.conversationId });
    }
    await this.addMediaToSession(session, stream);
    session._outboundStream = stream;

    const element = params.audioElement || this.sdk._config.defaults.audioElement;
    const ids = { conversationId: session.conversationId, sessionId: session.id };
    if (session.streams.length === 1 && session.streams[0].getTracks().length > 0) {
      session._outputAudioElement = attachAudioMedia(this.sdk, session.streams[0], element, ids);
    } else {
      session.on('peerTrackAdded', (track: MediaStreamTrack, stream: MediaStream) => {
        session._outputAudioElement = attachAudioMedia(this.sdk, stream, element, ids);
      });
    }

    await super.acceptSession(session, params);
    logDeviceChange(this.sdk, session, 'sessionStarted');
  }

  async endSession (session: IExtendedMediaSession): Promise<void> {
    try {
      const participant = await this.getParticipantForSession(session);

      const patchPromise = requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}/participants/${participant.id}`, {
        method: 'patch',
        data: JSON.stringify({ state: 'disconnected' })
      });

      const terminatedPromise = new Promise<JingleReason>((resolve) => {
        session.once('terminated', (reason) => {
          return resolve(reason);
        });
      });

      await Promise.all([patchPromise, terminatedPromise]);
    } catch (err) {
      this.log('error', 'Failed to end session gracefully', { conversationId: session.conversationId, error: err });
      return this.endSessionFallback(session);
    }
  }

  async endSessionFallback (session: IExtendedMediaSession): Promise<void> {
    this.log('info', 'Attempting to end session directly', { sessionId: session.id, conversationId: session.conversationId });
    try {
      await super.endSession(session);
    } catch (err) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to end session directly', { conversationId: session.conversationId, error: err });
    }
  }

  async getParticipantForSession (session: IExtendedMediaSession): Promise<IConversationParticipant> {
    if (!session.pcParticipant) {
      const { body } = await requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}`);
      const participants: IConversationParticipant[] = body.participants.map((p: any) => {
        const participant: IConversationParticipant = pick(p, ['id', 'address', 'purpose', 'state', 'direction', 'muted', 'confined']);
        participant.userId = p.user && p.user.id;
        return participant;
      });

      const participant = participants.find((p) => p.userId === this.sdk._personDetails.id);

      if (!participant) {
        throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to find a participant for session', { conversationId: session.conversationId, sessionId: session.id, sessionType: this.sessionType });
      }

      session.pcParticipant = participant;
    }

    return session.pcParticipant;
  }

  async setAudioMute (session: IExtendedMediaSession, params: ISessionMuteRequest) {
    try {
      this.log('info', 'Muting audio', { conversationId: session.conversationId });
      const participant = await this.getParticipantForSession(session);

      await requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}/participants/${participant.id}`, {
        method: 'patch',
        data: JSON.stringify({ muted: params.mute })
      });
    } catch (err) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to set audioMute', { conversationId: session.conversationId, params, err });
    }
  }
}
