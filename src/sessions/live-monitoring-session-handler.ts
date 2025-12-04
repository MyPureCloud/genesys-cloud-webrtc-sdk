import { intersection } from 'lodash';
import {
  IPendingSession,
  IExtendedMediaSession,
  IAcceptSessionRequest,
  IUpdateOutgoingMedia,
  LiveScreenMonitoringSession,
  IOnScreenParticipantsUpdate,
  ISpeakersUpdate, IMediaRequestOptions
} from '../types/interfaces';
import BaseSessionHandler from './base-session-handler';
import { SessionTypes, SdkErrorTypes } from '../types/enums';
import {createAndEmitSdkError, isLiveScreenMonitorJid} from '../utils';
import {Constants} from "stanza";
import {createNewStreamWithTrack, logDeviceChange} from '../media/media-utils';

/**
 * Media change event for live monitoring sessions
 */
export interface ILiveMonitoringMediaChangeEvent {
  eventBody: {
    id: string,
    participants: ILiveMonitoringMediaChangeEventParticipant[],
    speakers: string[]
  };
  metadata: {
    CorrelationId: string
  };
}

export interface ILiveMonitoringMediaChangeEventParticipant {
  communicationId: string;
  userId: string;
  tracks: {
    id: string,
    mediaType: 'audio' | 'video',
    sinks?: string[]
  }[];
}

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
    const audioElement = params.audioElement || this.sdk._config.defaults.audioElement;
    const sessionInfo = { conversationId: session.conversationId, sessionId: session.id };
    if (!audioElement) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.invalid_options, 'acceptSession for video requires an audioElement to be provided or in the default config', sessionInfo);
    }

    const videoElement = params.videoElement || this.sdk._config.defaults.videoElement;
    if (!videoElement) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.invalid_options, 'acceptSession for video requires a videoElement to be provided or in the default config', sessionInfo);
    }

    let stream = params.mediaStream;
    if (!stream) {
      const { hasCamera, hasMic } = this.sdk.media.getState();
      const mediaParams: IMediaRequestOptions = {
        audio: this.sdk.media.getValidSdkMediaRequestDeviceId(params.audioDeviceId),
        video: this.sdk.media.getValidSdkMediaRequestDeviceId(params.videoDeviceId),
        session
      };

      if (!hasCamera) {
        mediaParams.video = false;
      }

      if (!hasMic) {
        mediaParams.audio = false;
      }

      stream = await this.sdk.media.startMedia(mediaParams);
    }

    session._outboundStream = stream;
    // If using a JWT, we can't subscribe to the media change events.
    if (!this.sdk._config.jwt) {
      await this.sdk._streamingConnection.notifications.subscribe(`v2.conversations.${session.conversationId}.media`, this.handleMediaChangeEvent.bind(this, session));
    }

    await this.addMediaToSession(session, stream);

    // make sure we have an audio and video sender so we don't have to renego later
    this.setupTransceivers(session);

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
    await this.setInitialMuteStates(session);

    logDeviceChange(this.sdk, session, 'sessionStarted');
  }

  async setInitialMuteStates (session: IExtendedMediaSession): Promise<void> {
    const userId = this.sdk._personDetails.id;

    let videoMute = Promise.resolve();
    let audioMute = Promise.resolve();

    const videoSender = session.pc.getSenders().find((sender) => sender.track && sender.track.kind === 'video');
    if (!videoSender || !videoSender.track.enabled) {
      session.videoMuted = true;
      this.log('info', 'Sending initial video mute', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
      videoMute = session.mute(userId as any, 'video');
    }

    const audioSender = session.pc.getSenders().find((sender) => sender.track && sender.track.kind === 'audio');
    if (!audioSender || !audioSender.track.enabled) {
      session.audioMuted = true;
      this.log('info', 'Sending initial audio mute', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
      audioMute = session.mute(userId as any, 'audio');
    }

    await Promise.all([videoMute, audioMute]);
  }

  setupTransceivers (session: IExtendedMediaSession): void {
    // not supported in edge at time of writing https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTransceiver
    if (!session.pc.addTransceiver) {
      this.log('warn', 'addTransceiver not supported, video experience may be sub optimal', {
        conversationId: session.conversationId,
        sessionId: session.id,
        sessionType: session.sessionType
      });
      return;
    }

    const videoTransceiver = session.pc.getTransceivers().find(transceiver => transceiver.receiver.track && transceiver.receiver.track.kind === 'video');
    if (!videoTransceiver) {
      session.pc.addTransceiver('video', { direction: 'sendrecv' });
    } else {
      videoTransceiver.direction = 'sendrecv';
    }

    const audioTransceiver = session.pc.getTransceivers().find(transceiver => transceiver.receiver.track && transceiver.receiver.track.kind === 'audio');
    if (!audioTransceiver) {
      session.pc.addTransceiver('audio', { direction: 'sendrecv' });
    } else {
      audioTransceiver.direction = 'sendrecv';
    }
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
   * Update participants on screen for live monitoring observers
   */
  updateParticipantsOnScreen(session: LiveScreenMonitoringSession, mediaUpdateEvent: ILiveMonitoringMediaChangeEvent) {
    if (!this.isLiveMonitoringObserver()) {
      return;
    }

    const incomingVideoTrackIds = session.pc.getReceivers()
      .filter((receiver) => receiver.track && receiver.track.kind === 'video')
      .map((receiver) => receiver.track.id);

    const incomingVideoMsidTrackId = this.getTrackIdFromSdp(session.pc.remoteDescription?.sdp, 'video');
    if (incomingVideoMsidTrackId) {
      incomingVideoTrackIds.push(incomingVideoMsidTrackId);
    }

    const onScreenParticipants: Array<{ userId: string }> = [];
    mediaUpdateEvent.eventBody.participants.forEach((updateParticipant: ILiveMonitoringMediaChangeEventParticipant) => {
      const matchingVideoTracks = updateParticipant.tracks
        .filter((track) => track.mediaType === 'video')
        .filter((track) => {
          const intersectingTracks = intersection(track.sinks, incomingVideoTrackIds);
          return intersectingTracks.length;
        });

      if (matchingVideoTracks.length) {
        onScreenParticipants.push({ userId: updateParticipant.userId });
      }
    });

    const update: IOnScreenParticipantsUpdate = {
      participants: onScreenParticipants
    };

    session.emit('activeVideoParticipantsUpdate', update);
  }

  /**
   * Update speakers for live monitoring observers
   */
  updateSpeakers(session: LiveScreenMonitoringSession, mediaUpdateEvent: ILiveMonitoringMediaChangeEvent) {
    if (!this.isLiveMonitoringObserver()) {
      return;
    }

    const incomingAudioTrackIds = session.pc.getReceivers()
      .filter((receiver) => receiver.track && receiver.track.kind === 'audio')
      .map((receiver) => receiver.track.id);

    const incomingAudioMsidTrackId = this.getTrackIdFromSdp(session.pc.remoteDescription?.sdp, 'audio');
    if (incomingAudioMsidTrackId) {
      incomingAudioTrackIds.push(incomingAudioMsidTrackId);
    }

    const speakingParticipants: Array<{ userId: string }> = [];
    mediaUpdateEvent.eventBody.participants.forEach((updateParticipant: ILiveMonitoringMediaChangeEventParticipant) => {
      const matchingAudioTracks = updateParticipant.tracks
        .filter((track) => track.mediaType === 'audio')
        .filter((track) => {
          const intersectingTracks = intersection(track.sinks, incomingAudioTrackIds);
          return intersectingTracks.length;
        });

      if (matchingAudioTracks.length) {
        speakingParticipants.push({ userId: updateParticipant.userId });
      }
    });

    const update: ISpeakersUpdate = {
      speakers: speakingParticipants
    };

    session.emit('speakersUpdate', update);
  }

  /**
   * Handle media change events for live monitoring sessions
   */
  handleMediaChangeEvent(session: LiveScreenMonitoringSession, event: ILiveMonitoringMediaChangeEvent): void {
    this.updateParticipantsOnScreen(session, event);
    this.updateSpeakers(session, event);
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

  /**
   * Parse track ID from SDP for given media type
   */
  getTrackIdFromSdp(sdp: string, kind: 'video' | 'audio'): string {
    return sdp?.split('m=')
      .find(s => s.startsWith(kind))?.split('\n')
      .find(s => s.startsWith('a=msid:'))?.split(' ')[1]?.trim();
  }
}

export default LiveMonitoringSessionHandler;
