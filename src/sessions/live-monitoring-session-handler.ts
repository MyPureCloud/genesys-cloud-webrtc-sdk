import {
  IPendingSession,
  IExtendedMediaSession,
  IAcceptSessionRequest,
  LiveMonitoringMetadata,
  IUpdateOutgoingMedia,
  IStartLiveMonitoringSessionParams
} from '../types/interfaces';
import BaseSessionHandler from './base-session-handler';
import { SessionTypes, SdkErrorTypes } from '../types/enums';
import {createAndEmitSdkError, isMonitorJid, requestApi} from '../utils';

export class LiveMonitoringSessionHandler extends BaseSessionHandler {
  sessionType = SessionTypes.collaborateVideo;
  private primaryScreenMediaStream?: MediaStream;

  shouldHandleSessionByJid(jid: string): boolean {
    return isMonitorJid(jid);
  }

  handleConversationUpdate(): void {
    /* no-op */
    return;
  }

  async handlePropose (pendingSession: IPendingSession): Promise<void> {
    return this.proceedWithSession(pendingSession);
  }

  async startSession(params: IStartLiveMonitoringSessionParams): Promise<{ conversationId: string }> {
    const primaryScreen = this.identifyPrimaryScreen(params.liveMonitoringMetadata);
    if (!primaryScreen) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.invalid_options, 'No primary screen found in metadata');
    }
    const screenStream = await this.getScreenMediaForPrimary(primaryScreen);
    return this.joinConferenceWithScreen(params.conferenceJid, screenStream);
  }

  private identifyPrimaryScreen(metadata: LiveMonitoringMetadata[]): LiveMonitoringMetadata | null {
    return metadata.find(metadata => metadata.primary) || null;
  }

  private async getScreenMediaForPrimary(primaryScreen: LiveMonitoringMetadata): Promise<MediaStream> {
    try {
      const constraints = {
        video: {
          deviceId: primaryScreen.screenId
        }
      } as DisplayMediaStreamOptions;

      return await window.navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (error) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to get screen media', { error });
    }
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

      // Store screen stream for later use in acceptSession
      this.primaryScreenMediaStream = screenStream;

      return { conversationId: response.data.conversationId };
    } catch (error) {
      screenStream.getTracks().forEach(track => track.stop());
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to join conference', { error });
    }
  }

  async acceptSession(session: IExtendedMediaSession, params: IAcceptSessionRequest): Promise<any> {
    if (!params.screenRecordingMetadatas?.length) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'acceptSession must be called with a `screenRecordingMetadatas` property for live monitoring sessions');
    }

    // Set outbound stream to primary video media stream
    session._outboundStream = this.primaryScreenMediaStream;

    // Add primary screen tracks to session
    for (const track of this.primaryScreenMediaStream.getTracks()) {
      session.pc.addTrack(track);
    }

    this.primaryScreenMediaStream = undefined;

    return super.acceptSession(session, params);
  }

  updateOutgoingMedia(session: IExtendedMediaSession, options: IUpdateOutgoingMedia): never {
    this.log('warn', 'Cannot update outgoing media for live monitoring sessions', { sessionId: session.id, sessionType: session.sessionType });
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'Cannot update outgoing media for live monitoring sessions');
  }
}

export default LiveMonitoringSessionHandler;
