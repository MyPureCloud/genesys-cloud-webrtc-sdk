import { Constants } from 'stanza';
import {
  IPendingSession,
  IExtendedMediaSession,
  ScreenRecordingMediaSession,
  IAcceptSessionRequest,
  ScreenRecordingMetadata,
  IUpdateOutgoingMedia
} from '../types/interfaces';
import BaseSessionHandler from './base-session-handler';
import { SessionTypes, SdkErrorTypes } from '../types/enums';
import { createAndEmitSdkError, getBareJid, isPeerConnectionDisconnected, isScreenRecordingJid, requestApi } from '../utils';
import { first, fromEvent, takeWhile } from 'rxjs';

export class ScreenRecordingSessionHandler extends BaseSessionHandler {
  requestedSessions: { [roomJid: string]: boolean } = {};

  sessionType = SessionTypes.screenRecording;

  shouldHandleSessionByJid (jid: string): boolean {
    return isScreenRecordingJid(jid);
  }

  handleConversationUpdate(): void {
    /* no-op */
    return;
  }

  async handlePropose (pendingSession: IPendingSession): Promise<void> {
    if (this.sdk._config.autoAcceptPendingScreenRecordingRequests) {
      return this.proceedWithSession(pendingSession);
    }

    // if not auto accepting sessions, emit this event for the consumer to accept
    await super.handlePropose(pendingSession);
  }

  async acceptSession (session: ScreenRecordingMediaSession, params: IAcceptSessionRequest): Promise<any> {
    const mediaStream = params.mediaStream;

    if (!mediaStream) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, `Cannot accept screen recording session without providing a media stream`, { conversationId: session.conversationId, sessionType: this.sessionType });
    }

    if (!params.screenRecordingMetadatas?.length) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'acceptSession must be called with a `screenRecordingMetadatas` property for screen recording sessions');
    }

    session._outboundStream = mediaStream;

    let addMediaPromise: Promise<any> = Promise.resolve();
    mediaStream.getTracks().forEach((track) => {
      addMediaPromise = addMediaPromise.then(() => {
        this.sdk.logger.info('Adding screen track to session', { trackId: track.id, label: track.label, conversationId: session.conversationId, sessionType: this.sessionType });
        return session.pc.addTrack(track);
      });
    });

    await addMediaPromise;

    this.sendMetadataWhenSessionConnects(session, params.screenRecordingMetadatas)
    await super.acceptSession(session, params);
  }

  private sendMetadataWhenSessionConnects (session: ScreenRecordingMediaSession, metadatas: ScreenRecordingMetadata[]) {
    fromEvent(session.peerConnection, 'connectionstatechange')
      .pipe(
        takeWhile(() => {
          return !isPeerConnectionDisconnected(session.peerConnection.connectionState);
        }),
        first(() => {
          return session.peerConnection.connectionState === 'connected';
        })
      ).subscribe(async () => {
        await this.updateScreenRecordingMetadatas(session, metadatas);
      });
  }

  async endSession (conversationId: string, session: IExtendedMediaSession, reason?: Constants.JingleReasonCondition): Promise<void> {
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, `sessionType ${this.sessionType} must be ended remotely`, { conversationId });
  }

  updateOutgoingMedia (session: IExtendedMediaSession,  options: IUpdateOutgoingMedia): never {
    this.log('warn', 'Cannot update outgoing media for screen recording sessions', { sessionId: session.id, sessionType: session.sessionType });
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'Cannot update outgoing media for screen recording sessions');
  }

  private updateScreenRecordingMetadatas (session: ScreenRecordingMediaSession, metadatas: ScreenRecordingMetadata[]) {
    this.log('debug', 'sending screen metadatas', { conversationId: session.conversationId, sessionId: session.id, metadatas })
    metadatas.forEach((meta) => {
      // adding any here because I don't want to add this to the public interface
      (meta as any)._trackId = meta.trackId;

      const transceiver = session.pc.getTransceivers()
        .find((transceiver) => transceiver.sender.track?.id === meta.trackId);

      if (!transceiver) {
        this.log('warn', 'Failed to find transceiver for screen recording track', { conversationId: session.conversationId, sessionId: session.id, trackId: meta.trackId });
        return;
      }

      meta.trackId = transceiver.mid;
    });

    const data = JSON.stringify({
      participantJid: getBareJid(this.sdk),
      metaData: metadatas,
      roomId: session.originalRoomJid,
      conversationId: session.conversationId
    });

    let url = '/recordings/screensessions/metadata';
    const { accessToken, jwt } = this.sdk._config;
    if (this.sdk.isJwtAuth) {
      url += '/backgroundassistant';
    }

    return requestApi.call(this.sdk, url, {
      method: 'post',
      authToken: accessToken || jwt,
      data
    });
  }
}

export default ScreenRecordingSessionHandler;
