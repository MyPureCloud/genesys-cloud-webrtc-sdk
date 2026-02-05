import {
  IPendingSession,
  IExtendedMediaSession,
  IAcceptSessionRequest,
  IUpdateOutgoingMedia,
  LiveScreenMonitoringSession,
} from '../types/interfaces';
import BaseSessionHandler from './base-session-handler';
import { SessionTypes, SdkErrorTypes } from '../types/enums';
import {createAndEmitSdkError, isLiveScreenMonitorJid} from '../utils';
import {Constants} from "stanza";
import {createNewStreamWithTrack} from '../media/media-utils';

export class LiveMonitoringSessionHandler extends BaseSessionHandler {
  sessionType = SessionTypes.liveScreenMonitoring;
  _liveMonitoringObserver: boolean = false;

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

    // Auto-accept if current user is the target (fromUserId matches current user)
    if (pendingSession.fromUserId === this.sdk._personDetails?.id) {
      this._liveMonitoringObserver = false;
      return this.proceedWithSession(pendingSession);
    }

    // if not auto accepting sessions, emit this event for the consumer to accept
    await super.handlePropose(pendingSession);
  }

  async acceptSession(session: LiveScreenMonitoringSession, params: IAcceptSessionRequest): Promise<void> {
    // Store the liveMonitoringObserver flag (use existing flag if already set in handlePropose)
    this._liveMonitoringObserver = this._liveMonitoringObserver || params.liveMonitoringObserver || false;

    if (this._liveMonitoringObserver) {
      await this.acceptSessionForObserver(session, params)
    } else {
      await this.acceptSessionForTarget(session, params)
    }

    await super.acceptSession(session, params);
  }

  async acceptSessionForTarget(session: LiveScreenMonitoringSession, params: IAcceptSessionRequest) {
    if (!params.mediaStream) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, `Cannot accept live screen monitoring session without providing a media stream`, { conversationId: session.conversationId, sessionType: this.sessionType });
    }

    // Set outbound stream to primary video media stream for monitoring targets
    session._outboundStream = params.mediaStream;

    let addMediaPromise: Promise<any> = Promise.resolve();
    params.mediaStream.getTracks().forEach((track) => {
      addMediaPromise = addMediaPromise.then(() => {
        const trackStream = createNewStreamWithTrack(track);
        this.sdk.logger.info('Adding screen track to live screen monitoring session', { streamId: trackStream.id, trackId: track.id, label: track.label, conversationId: session.conversationId, sessionType: this.sessionType });
        return session.pc.addTrack(track, trackStream);
      });
    });
    await addMediaPromise;
  }

  async acceptSessionForObserver(session: LiveScreenMonitoringSession, params: IAcceptSessionRequest) {
    const videoElements = params.videoElements || (params.videoElement ? [params.videoElement] : [this.sdk._config.defaults.videoElement].filter(Boolean));
    const sessionInfo = { conversationId: session.conversationId, sessionId: session.id };

    if (!videoElements.length) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.invalid_options,
        'acceptSession for live monitoring observer requires videoElements array or videoElement to be provided or in the default config',
        sessionInfo);
    }

    const tracks = session.pc.getReceivers()
      .filter(receiver => receiver.track)
      .map(receiver => receiver.track)
      .filter(track => track.kind === 'video');

    this.log('info', `Accepting live screen monitoring session as observer with ${videoElements.length} available video elements for ${session.pc.getReceivers().length} receivers with ${tracks.length} video tracks`);

    let videoElementIndex = 0;
    for (const track of tracks) {
      if (videoElementIndex < videoElements.length) {
        const stream = createNewStreamWithTrack(track);
        const videoElement = videoElements[videoElementIndex];
        videoElement.muted = true;
        videoElement.autoplay = true;
        videoElement.srcObject = stream;
        this.log('info', `Attached stream to video element at index ${videoElementIndex}`, {
          streamId: videoElement.srcObject?.id,
          track: track,
          ...sessionInfo,
        });
        videoElementIndex++;
      }
      session.emit('incomingMedia');
    }
  }

  async endSession (conversationId: string, session: IExtendedMediaSession, reason?: Constants.JingleReasonCondition): Promise<void> {
    // Prevent the live monitor target from ending the session
    if (!this._liveMonitoringObserver) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, `Live monitoring target cannot end the session`, { conversationId });
    }

    // Allow observers to end their participation
    this._liveMonitoringObserver = false
    return super.endSession(conversationId, session, reason);
  }

  updateOutgoingMedia(session: IExtendedMediaSession, options: IUpdateOutgoingMedia): never {
    this.log('warn', 'Cannot update outgoing media for live monitoring sessions', { sessionId: session.id, sessionType: session.sessionType });
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'Cannot update outgoing media for live monitoring sessions');
  }
}

export default LiveMonitoringSessionHandler;
