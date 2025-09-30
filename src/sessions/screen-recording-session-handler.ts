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
import { createAndEmitSdkError, getBareJid, isPeerConnectionDisconnected, isScreenRecordingJid, requestApiWithRetry } from '../utils';
import { filter, fromEvent, take, takeWhile } from 'rxjs';

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
    // We really only want to ignore the error handling (because that should never execute), but putting an ignore closer to that line doesn't properly ignore it
    /* istanbul ignore next */
    fromEvent(session.peerConnection, 'connectionstatechange')
      .pipe(
        takeWhile(() => {
          return !isPeerConnectionDisconnected(session.peerConnection.connectionState);
        }),
        filter(() => {
          return session.peerConnection.connectionState === 'connected';
        }),
        take(1)
      ).subscribe({
        next: async () => await this.updateScreenRecordingMetadatas(session, metadatas),
        error: (e) => this._logSubscriptionError(e)
      });
  }

  /* istanbul ignore next */
  _logSubscriptionError(e: unknown) {
    // This is for testing thrown exceptions with an RXJS subscription
  }

  async endSession (conversationId: string, session: IExtendedMediaSession, reason?: Constants.JingleReasonCondition): Promise<void> {
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, `sessionType ${this.sessionType} must be ended remotely`, { conversationId });
  }

  updateOutgoingMedia (session: IExtendedMediaSession,  options: IUpdateOutgoingMedia): never {
    this.log('warn', 'Cannot update outgoing media for screen recording sessions', { sessionId: session.id, sessionType: session.sessionType });
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'Cannot update outgoing media for screen recording sessions');
  }

  private updateScreenRecordingMetadatas (session: ScreenRecordingMediaSession, metadatas: ScreenRecordingMetadata[]) {
    this.log('info', 'sending screen metadatas', { conversationId: session.conversationId, sessionId: session.id, metadatas })
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

    return requestApiWithRetry
      .call(this.sdk, url, {
        method: 'post',
        authToken: accessToken || jwt,
        data,
      })
      .promise.then(() => {
        this.log('info', 'Screen recording metadata sent.', {
          conversationId: session.conversationId,
          sessionId: session.id,
          metadatas,
        });
      })
      .catch((e) => {
        this.log('error', 'Failed to send screen recording metadata.', {
          error: e,
          conversationId: session.conversationId,
          sessionId: session.id,
          metadatas,
        });
        throw e;
      });
  }
}

export default ScreenRecordingSessionHandler;
