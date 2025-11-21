import {
  IPendingSession,
  IExtendedMediaSession,
  IAcceptSessionRequest,
  IUpdateOutgoingMedia,
} from '../types/interfaces';
import BaseSessionHandler from './base-session-handler';
import { SessionTypes, SdkErrorTypes } from '../types/enums';
import {createAndEmitSdkError, isLiveScreenMonitorJid, requestApi} from '../utils';
import {Constants} from "stanza";

export class LiveMonitoringSessionHandler extends BaseSessionHandler {
  sessionType = SessionTypes.liveScreenMonitoring;

  shouldHandleSessionByJid(jid: string): boolean {
    return isLiveScreenMonitorJid(jid);
  }

  handleConversationUpdate(): void {
    /* no-op */
    return;
  }

  async handlePropose (pendingSession: IPendingSession): Promise<void> {
    if (this.sdk._config.autoAcceptPendingLiveScreenMonitoringRequests) {
      return this.proceedWithSession(pendingSession);
    }

    // if not auto accepting sessions, emit this event for the consumer to accept
    await super.handlePropose(pendingSession);
  }

  private async joinConferenceWithScreen(conferenceJid: string, screenStream: MediaStream): Promise<{ conversationId: string }> {
    const data = JSON.stringify({
      roomId: conferenceJid,
      participant: { address: this.sdk._personDetails.chat.jabberId }
    });

    try {
      const response = await requestApi.call(this.sdk, '/conversations/videos', {
        method: 'post',
        data
      });

      return { conversationId: response.data.conversationId };
    } catch (error) {
      screenStream.getTracks().forEach(track => track.stop());
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to join conference', { error });
    }
  }

  async acceptSession(session: IExtendedMediaSession, params: IAcceptSessionRequest): Promise<any> {
    if (!params.mediaStream) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, `Cannot accept screen recording session without providing a media stream`, { conversationId: session.conversationId, sessionType: this.sessionType });
    }

    if (!params.screenRecordingMetadatas?.length) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'acceptSession must be called with a `screenRecordingMetadatas` property for live screen monitoring sessions');
    }
    await this.joinConferenceWithScreen(session.originalRoomJid, params.mediaStream);

    // Set outbound stream to primary video media stream
    session._outboundStream = params.mediaStream;

    let addMediaPromise: Promise<any> = Promise.resolve();
    params.mediaStream.getTracks().forEach((track) => {
      addMediaPromise = addMediaPromise.then(() => {
        this.sdk.logger.info('Adding screen track to session', { trackId: track.id, label: track.label, conversationId: session.conversationId, sessionType: this.sessionType });
        return session.pc.addTrack(track);
      });
    });
    await addMediaPromise;

    return super.acceptSession(session, params);
  }

  async endSession (conversationId: string, session: IExtendedMediaSession, reason?: Constants.JingleReasonCondition): Promise<void> {
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, `sessionType ${this.sessionType} must be ended remotely`, { conversationId });
  }

  updateOutgoingMedia(session: IExtendedMediaSession, options: IUpdateOutgoingMedia): never {
    this.log('warn', 'Cannot update outgoing media for live monitoring sessions', { sessionId: session.id, sessionType: session.sessionType });
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'Cannot update outgoing media for live monitoring sessions');
  }
}

export default LiveMonitoringSessionHandler;
