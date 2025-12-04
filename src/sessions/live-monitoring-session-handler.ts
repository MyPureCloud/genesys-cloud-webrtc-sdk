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
  _liveMonitoringObserver: boolean = undefined;

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

  async acceptSession(session: LiveScreenMonitoringSession, params: IAcceptSessionRequest): Promise<any> {
    // Store the liveMonitoringObserver flag
    this._liveMonitoringObserver = params.liveMonitoringObserver || false;

    if (this.isLiveMonitoringObserver()) {
      await this.acceptSessionForObserver(session, params)
    } else {
      await this.acceptSessionForTarget(session, params)
    }

    return super.acceptSession(session, params);
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
        this.sdk.logger.info('Adding screen track to live screen monitoring session', { trackId: track.id, label: track.label, conversationId: session.conversationId, sessionType: this.sessionType });
        return session.pc.addTrack(track);
      });
    });
    await addMediaPromise;
  }

  async acceptSessionForObserver(session: LiveScreenMonitoringSession, params: IAcceptSessionRequest) {
    const sessionInfo = { conversationId: session.conversationId, sessionId: session.id };
    const audioElement = params.audioElement || this.sdk._config.defaults.audioElement;
    if (!audioElement) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.invalid_options, 'acceptSession for video requires an audioElement to be provided or in the default config', sessionInfo);
    }

    const videoElement = params.videoElement || this.sdk._config.defaults.videoElement;
    if (!videoElement) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.invalid_options, 'acceptSession for video requires a videoElement to be provided or in the default config', sessionInfo);
    }
    const attachParams = { audioElement, videoElement, volume: this.sdk._config.defaults.audioVolume };

    const handleIncomingTracks = (session: IExtendedMediaSession, tracks: MediaStreamTrack | MediaStreamTrack[]) => {
      if (!Array.isArray(tracks)) tracks = [tracks];

      for (const track of tracks) {
        this.log('info', 'Incoming track', {
          track,
          conversationId: session.conversationId,
          sessionId: session.id,
          sessionType: session.sessionType
        });

        const el = this.attachIncomingTrackToElement(track, attachParams);

        /* if the track was attatched to an audio element, we have an audio track */
        if (el instanceof HTMLAudioElement) {
          session._outputAudioElement = el;
        }
      }

      session.emit('incomingMedia');
    };

    const tracks = session.pc.getReceivers()
      .filter(receiver => receiver.track)
      .map(receiver => receiver.track);

    if (tracks.length) {
      handleIncomingTracks(session, tracks);
    } else {
      session.on('peerTrackAdded', (track: MediaStreamTrack) => {
        handleIncomingTracks(session, track);
      });
    }

    await super.acceptSession(session, params);
  }

  isLiveMonitoringObserver(): boolean {
    return this._liveMonitoringObserver || false;
  }

  async endSession (conversationId: string, session: IExtendedMediaSession, reason?: Constants.JingleReasonCondition): Promise<void> {
    // Prevent the live monitor target from ending the session
    if (!this.isLiveMonitoringObserver()) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, `Live monitoring target cannot end the session`, { conversationId });
    }

    // Allow observers to end their participation
    this._liveMonitoringObserver = undefined
    return super.endSession(conversationId, session, reason);
  }

  updateOutgoingMedia(session: IExtendedMediaSession, options: IUpdateOutgoingMedia): never {
    this.log('warn', 'Cannot update outgoing media for live monitoring sessions', { sessionId: session.id, sessionType: session.sessionType });
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'Cannot update outgoing media for live monitoring sessions');
  }

  /**
   * Attach incoming track to HTML element
   */
  attachIncomingTrackToElement(
    track: MediaStreamTrack,
    { audioElement, videoElement, volume }: { audioElement?: HTMLAudioElement, videoElement?: HTMLVideoElement, volume: number }
  ): HTMLAudioElement | HTMLVideoElement {
    let element = audioElement;

    if (track.kind === 'video') {
      element = videoElement;
      if (element) {
        element.muted = true;
      }
    }

    if (element) {
      element.autoplay = true;
      element.volume = volume / 100;
      element.srcObject = createNewStreamWithTrack(track);
    }

    return element;
  }
}

export default LiveMonitoringSessionHandler;
