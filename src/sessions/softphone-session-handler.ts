import { pick } from 'lodash';
import { JingleReason } from 'stanza/protocol';

import BaseSessionHandler from './base-session-handler';
import { IPendingSession, IAcceptSessionRequest, ISessionMuteRequest, IConversationParticipant, IExtendedMediaSession, IUpdateOutgoingMedia, IStartSoftphoneSessionParams } from '../types/interfaces';
import { SessionTypes, SdkErrorTypes } from '../types/enums';
import { attachAudioMedia, logDeviceChange, createUniqueAudioMediaElement } from '../media/media-utils';
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
      this.log('debug', 'No mediaStream provided, starting media', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
      stream = await this.sdk.media.startMedia({
        audio: this.sdk.media.getValidSdkMediaRequestDeviceId(params.audioDeviceId),
        session
      });
      this.log('debug', 'Media started', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
    }
    await this.addMediaToSession(session, stream);
    session._outboundStream = stream;

    const ids = { conversationId: session.conversationId, sessionId: session.id };
    const volume = this.sdk._config.defaults.audioVolume;

    let element = params.audioElement || this.sdk._config.defaults.audioElement;

    /* if we aren't given an element, then we need to setup our own, unique one (per session), then tear it down on terminate */
    if (!element) {
      element = createUniqueAudioMediaElement();
      session.once('terminated', () => {
        if (session._outputAudioElement === element) {
          this.log('debug', 'session ended and was using a unique audio element. removing from DOM', { sessionId: session.id, conversationId: session.conversationId, sessionType: session.sessionType });
          session._outputAudioElement.parentNode.removeChild(session._outputAudioElement);
        }
      });
    }

    if (session.streams.length === 1 && session.streams[0].getTracks().length > 0) {
      session._outputAudioElement = attachAudioMedia(this.sdk, session.streams[0], volume, element, ids);
    } else {
      session.on('peerTrackAdded', (_track: MediaStreamTrack, stream: MediaStream) => {
        session._outputAudioElement = attachAudioMedia(this.sdk, stream, volume, element, ids);
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
    this.log('info', 'Attempting to end session directly', { sessionId: session.id, conversationId: session.conversationId, sessionType: session.sessionType });
    try {
      await super.endSession(session);
    } catch (error) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to end session directly', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType, error });
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

      // it's possible for a userId to be associated with multiple participants
      let participantsForUser = participants.filter((p) => p.userId === this.sdk._personDetails.id);
      let participant: IConversationParticipant;

      if (participantsForUser.length === 1) {
        participant = participantsForUser[0];
      } else if (participantsForUser.length > 1) {
        participantsForUser = participantsForUser.filter(p => p.state === 'connected');

        // this shouldn't ever happen, but just in case
        if (participantsForUser.length !== 1) {
          throw createAndEmitSdkError.call(
            this.sdk,
            SdkErrorTypes.generic,
            'Failed to find a connected participant for user on conversation',
            {
              conversationId: session.conversationId,
              sessionId: session.id,
              sessionType: this.sessionType,
              userId: this.sdk._personDetails.id
            });
        }

        participant = participantsForUser[0];
      }

      if (!participant) {
        throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to find a participant for session', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
      }

      session.pcParticipant = participant;
    }

    return session.pcParticipant;
  }

  async setAudioMute (session: IExtendedMediaSession, params: ISessionMuteRequest) {
    try {
      this.log('info', 'Muting audio', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
      const participant = await this.getParticipantForSession(session);

      await requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}/participants/${participant.id}`, {
        method: 'patch',
        data: JSON.stringify({ muted: params.mute })
      });
    } catch (error) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to set audioMute', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType, params, error });
    }
  }

  // since softphone sessions will *never* have video, we set the videoDeviceId to undefined so we don't spin up the camera
  async updateOutgoingMedia (session: IExtendedMediaSession, options: IUpdateOutgoingMedia): Promise<any> {
    const newOptions: IUpdateOutgoingMedia = { ...options, videoDeviceId: undefined };
    return super.updateOutgoingMedia(session, newOptions);
  }

  async startSession (params: IStartSoftphoneSessionParams): Promise<{ id: string, selfUri: string }> {
    this.log('info', 'Creating softphone call from SDK', { conversationIds: params.conversationIds, sessionType: this.sessionType });
    const response = await requestApi.call(this.sdk, `/conversations/calls`, {
      method: 'post',
      data: JSON.stringify(params)
    });
    return { id: response.body.id, selfUri: response.body.selfUri };
  }
}
