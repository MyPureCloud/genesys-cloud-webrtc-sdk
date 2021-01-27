import { differenceBy, intersection } from 'lodash';

import {
  IPendingSession,
  IAcceptSessionRequest,
  ISessionMuteRequest,
  IExtendedMediaSession,
  IParticipantUpdate,
  IParticipantsUpdate,
  IOnScreenParticipantsUpdate,
  ISpeakersUpdate,
  IConversationParticipant,
  IMediaRequestOptions,
  IStartVideoSessionParams
} from '../types/interfaces';
import BaseSessionHandler from './base-session-handler';
import { SessionTypes, SdkErrorTypes, CommunicationStates } from '../types/enums';
import { createNewStreamWithTrack, logDeviceChange } from '../media/media-utils';
import { createAndEmitSdkError, requestApi, isVideoJid, isPeerVideoJid } from '../utils';
import { ConversationUpdate } from '../types/conversation-update';

/**
 * speakers is an array of audio track ids sending audio
 */
export interface IMediaChangeEvent {
  eventBody: {
    id: string,
    participants: IMediaChangeEventParticipant[],
    speakers: string[]
  };
  metadata: {
    CorrelationId: string
  };
}

/**
 * sinks represents outgoing paths for this track. For example, if we have a track that looks like { id: "1", mediaType: "audio", sinks: ["a", "b"] }
 * then we know that the audio of track "1" can be heard on tracks "a" and "b". Another way to say this is whichever participants are receiving
 * tracks "a" or "b" are hearing this participant
 */
export interface IMediaChangeEventParticipant {
  communicationId: string;
  userId: string;
  tracks: {
    id: string,
    mediaType: 'audio' | 'video',
    sinks?: string[]
  }[];
}

export default class VideoSessionHandler extends BaseSessionHandler {
  requestedSessions: { [roomJid: string]: boolean } = {};

  sessionType = SessionTypes.collaborateVideo;

  shouldHandleSessionByJid (jid: string): boolean {
    return isVideoJid(jid);
  }

  findLocalParticipantInConversationUpdate (conversationUpdate: ConversationUpdate): IConversationParticipant {
    const participant = conversationUpdate.participants.find((p) => p.userId === this.sdk._personDetails.id);

    if (!participant) {
      this.log('warn', 'Failed to find current user in the conversation update');
      return null;
    }

    return {
      address: null,
      confined: null,
      direction: null,
      id: participant.id,
      state: participant.videos[0].state,
      purpose: participant.purpose,
      userId: participant.userId,
      muted: participant.videos[0].audioMuted,
      videoMuted: participant.videos[0].videoMuted
    };
  }

  handleConversationUpdate (session: IExtendedMediaSession, conversationUpdate: ConversationUpdate): void {
    super.handleConversationUpdate(session, conversationUpdate);
    session.pcParticipant = this.findLocalParticipantInConversationUpdate(conversationUpdate);

    const activeVideoParticipants: IParticipantUpdate[] = conversationUpdate.participants
      .filter((pcParticipant) => {
        if (!pcParticipant.videos || !pcParticipant.videos.length) {
          return false;
        }

        return pcParticipant.videos.find((video) => video.state === CommunicationStates.connected);
      })
      .map((pcParticipant) => {
        const activeVideo = pcParticipant.videos.find((video) => video.state === CommunicationStates.connected);

        const participantUpdate: IParticipantUpdate = {
          participantId: pcParticipant.id,
          userId: pcParticipant.userId,
          audioMuted: activeVideo.audioMuted,
          videoMuted: activeVideo.videoMuted,
          sharingScreen: activeVideo.sharingScreen
        };

        return participantUpdate;
      });

    const lastUpdate: IParticipantsUpdate = session._lastParticipantsUpdate || {} as any;
    const lastActiveParticipants = lastUpdate.activeParticipants || [];

    const addedParticipants = differenceBy(activeVideoParticipants, lastActiveParticipants, 'participantId');
    const removedParticipants = differenceBy(lastActiveParticipants, activeVideoParticipants, 'participantId');

    const update: IParticipantsUpdate = {
      activeParticipants: activeVideoParticipants,
      addedParticipants,
      removedParticipants,
      conversationId: conversationUpdate.id
    };

    session._lastParticipantsUpdate = update;
    session.emit('participantsUpdate', update);
  }

  updateParticipantsOnScreen (session: IExtendedMediaSession, mediaUpdateEvent: IMediaChangeEvent) {
    const incomingVideoTrackIds = session.pc.getReceivers()
      .filter((receiver) => receiver.track && receiver.track.kind === 'video')
      .map((receiver) => receiver.track.id);

    /**
     * Firefox messes the trackIds up from what is actually in the sdp offer.
     * Need to pull it from the offer to accurately match the track.sinks
     */
    const incomingVideoMsidTrackId = this.getTrackIdFromSdp(session.pc.remoteDescription.sdp, 'video');

    if (incomingVideoMsidTrackId) {
      incomingVideoTrackIds.push(incomingVideoMsidTrackId);
    }

    const onScreenParticipants: Array<{ userId: string }> = [];
    mediaUpdateEvent.eventBody.participants.forEach((updateParticipant: IMediaChangeEventParticipant) => {
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

    const lastUpdate: IOnScreenParticipantsUpdate = session._lastOnScreenUpdate || { participants: [] } as any;

    // send out an update if the onScreenParticipants count or items changed
    if (lastUpdate.participants.length === onScreenParticipants.length) {
      const changed = differenceBy(lastUpdate.participants, onScreenParticipants, 'userId').length ||
        differenceBy(lastUpdate.participants, onScreenParticipants, 'userId').length;

      if (!changed) {
        return;
      }
    }

    const update: IOnScreenParticipantsUpdate = {
      participants: onScreenParticipants
    };

    session._lastOnScreenUpdate = update;
    session.emit('activeVideoParticipantsUpdate', update);
  }

  updateSpeakers (session: IExtendedMediaSession, mediaUpdateEvent: IMediaChangeEvent) {
    const incomingAudioTrackIds = session.pc.getReceivers()
      .filter((receiver) => receiver.track && receiver.track.kind === 'audio')
      .map((receiver) => receiver.track.id);

    /**
     * Firefox messes the trackIds up from what is actually in the sdp offer.
     * Need to pull it from the offer to accurately match the track.sinks
     */
    const incomingAudioMsidTrackId = this.getTrackIdFromSdp(session.pc.remoteDescription.sdp, 'audio');

    if (incomingAudioMsidTrackId) {
      incomingAudioTrackIds.push(incomingAudioMsidTrackId);
    }

    const speakingParticipants: Array<{ userId: string }> = [];
    mediaUpdateEvent.eventBody.participants.forEach((updateParticipant: IMediaChangeEventParticipant) => {
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

  // triggers a propose from the backend
  async startSession (startParams: IStartVideoSessionParams): Promise<{ conversationId: string }> {
    let participant: { address: string };

    if (startParams.inviteeJid) {
      participant = { address: startParams.inviteeJid };
    } else {
      participant = { address: this.sdk._personDetails.chat.jabberId };
    }

    const data = JSON.stringify({
      roomId: startParams.jid,
      participant
    });

    this.requestedSessions[startParams.jid] = true;

    try {
      const response = await requestApi.call(this.sdk, `/conversations/videos`, {
        method: 'post',
        data
      });

      return { conversationId: response.body.conversationId };
    } catch (err) {
      delete this.requestedSessions[startParams.jid];
      this.log('error', 'Failed to request video session', err);
      return Promise.reject(err);
    }
  }

  async handlePropose (pendingSession: IPendingSession): Promise<void> {
    // if we requested the session dont emit a pending session
    if (this.requestedSessions[pendingSession.originalRoomJid]) {
      this.log('debug', 'Propose received for requested video session, accepting automatically', pendingSession);
      delete this.requestedSessions[pendingSession.originalRoomJid];
      await this.proceedWithSession(pendingSession);
      return;
    }

    if (isPeerVideoJid(pendingSession.address)) {
      if (pendingSession.fromUserId === this.sdk._personDetails.id) {
        this.log('info', 'Propose received for session which was initiated by a different client for this user. Ignoring.', pendingSession);
        return;
      }

      this.log('info', 'Propose received for incoming peer video', pendingSession);
    } else {
      this.log('debug', 'Propose received for a video session that is not a peer session and wasn\'t started by this client, ignoring.', pendingSession);
      return;
    }
    await super.handlePropose(pendingSession);
  }

  async handleSessionInit (session: IExtendedMediaSession): Promise<any> {
    session.startScreenShare = this.startScreenShare.bind(this, session);
    session.stopScreenShare = this.stopScreenShare.bind(this, session);
    session.pinParticipantVideo = this.pinParticipantVideo.bind(this, session);

    return super.handleSessionInit(session);
  }

  async acceptSession (session: IExtendedMediaSession, params: IAcceptSessionRequest): Promise<any> {
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
      // TODO: this doesn't handle `null` (system defaults)
      const mediaParams: IMediaRequestOptions = {
        audio: params.audioDeviceId || true,
        video: params.videoDeviceId || true,
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

    await this.sdk._streamingConnection.notifications.subscribe(`v2.conversations.${session.conversationId}.media`, this.handleMediaChangeEvent.bind(this, session));

    await this.addMediaToSession(session, stream);

    // make sure we have an audio and video sender so we don't have to renego later
    this.setupTransceivers(session);

    const attachParams = { audioElement, videoElement };

    const handleIncomingTracks = (session: IExtendedMediaSession, tracks: MediaStreamTrack | MediaStreamTrack[]) => {
      if (!Array.isArray(tracks)) tracks = [tracks];

      for (const track of tracks) {
        this.log('info', 'Incoming track', {
          track,
          conversationId: session.conversationId,
          sessionId: session.id
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
      this.log('info', 'Sending initial video mute', { conversationId: session.conversationId, sessionId: session.id });
      videoMute = session.mute(userId as any, 'video');
    }

    const audioSender = session.pc.getSenders().find((sender) => sender.track && sender.track.kind === 'audio');
    if (!audioSender || !audioSender.track.enabled) {
      session.audioMuted = true;
      this.log('info', 'Sending initial audio mute', { conversationId: session.conversationId, sessionId: session.id });
      audioMute = session.mute(userId as any, 'audio');
    }

    await Promise.all([videoMute, audioMute]);
  }

  setupTransceivers (session: IExtendedMediaSession) {
    // not supported in edge at time of writing https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTransceiver
    if (!session.pc.addTransceiver) {
      this.log('warn', 'addTransceiver not supported, video experience may be sub optimal', {
        conversationId: session.conversationId,
        sessionId: session.id
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

  async endSession (session: IExtendedMediaSession) {
    await this.sdk._streamingConnection.notifications.unsubscribe(`v2.conversations.${session.conversationId}.media`);
    await super.endSession(session);
    session.pc.getSenders().forEach(sender => sender.track && sender.track.stop());
  }

  async setVideoMute (session: IExtendedMediaSession, params: ISessionMuteRequest, skipServerUpdate?: boolean) {
    const replayMuteRequest = !!session.videoMuted === !!params.mute;

    if (replayMuteRequest) {
      this.log('warn', 'Replaying video mute request since the local state already matches the requested state', {
        conversationId: session.conversationId,
        sessionId: session.id
      });
    }

    const userId = this.sdk._personDetails.id;

    // if we are going to mute, we need to remove/end the existing camera track
    if (params.mute) {
      // get the first video track
      const track = session._outboundStream.getVideoTracks().find(t => t);

      if (!track) {
        this.log('warn', 'Unable to find outbound camera track', { sessionId: session.id, conversationId: session.conversationId });
      } else {
        const sender = this.getSendersByTrackType(session, 'video')
          .find((sender) => sender.track && sender.track.id === track.id);

        if (sender) {
          await this.removeMediaFromSession(session, sender);
        }

        track.stop();
        session._outboundStream.removeTrack(track);
      }

      if (!skipServerUpdate) {
        await session.mute(userId as any, 'video');
      }

      // if we are unmuting, we need to get a new camera track and add that to the session
    } else {
      this.log('info', 'Creating new video track', { conversationId: session.conversationId, sessionId: session.id });

      // look for a device to use, else use default
      const videoDeviceConstraint = params.unmuteDeviceId === undefined ? true : params.unmuteDeviceId;

      logDeviceChange(this.sdk, session, 'unmutingVideo', {
        requestedVideoDeviceId: videoDeviceConstraint
      });

      const track = (
        await this.sdk.media.startMedia({ video: videoDeviceConstraint, session })
      ).getVideoTracks()[0];

      logDeviceChange(this.sdk, session, 'changingDevices', {
        toVideoTrack: track,
        requestedVideoDeviceId: videoDeviceConstraint
      });

      // add track to session
      await this.addReplaceTrackToSession(session, track);

      logDeviceChange(this.sdk, session, 'successfullyChangedDevices');

      // add sync track to local outbound referrence
      session._outboundStream.addTrack(track);

      if (!skipServerUpdate) {
        await session.unmute(userId as any, 'video');
      }
    }

    session.videoMuted = !!params.mute;
  }

  async setAudioMute (session: IExtendedMediaSession, params: ISessionMuteRequest) {
    const replayMuteRequest = !!session.audioMuted === !!params.mute;

    // if conversation is already muted, we wont get an update so dont wait for one
    if (replayMuteRequest) {
      this.log('warn', 'Replaying audio mute request since the local state already matches the requested state', { conversationId: session.conversationId });
    }

    const userId = this.sdk._personDetails.id;

    const outgoingTracks = this.getSendersByTrackType(session, 'audio').map(sender => sender.track);

    outgoingTracks.forEach((track) => {
      this.log('info', `${params.mute ? 'Muting' : 'Unmuting'} audio track`, {
        trackId: track.id,
        conversationId: session.conversationId,
        sessionId: session.id
      });
      track.enabled = !params.mute;
    });

    if (params.mute) {
      if (!outgoingTracks.length) {
        this.log('warn', 'Unable to find any outgoing audio tracks to mute', { sessionId: session.id, conversationId: session.conversationId });
      } else {
        await session.mute(userId as any, 'audio');
      }
    } else {
      // make sure there's audio to unmute. if not, create it.
      if (!outgoingTracks.length) {
        this.log('info', 'No outoing audio to unmute, creating and adding media to session', { sessionId: session.id, conversationId: session.conversationId });

        // if params.unmuteDeviceId is `undefined`, use sdk defaults
        const track = (
          await this.sdk.media.startMedia({ audio: params.unmuteDeviceId === undefined ? true : params.unmuteDeviceId, session })
        ).getAudioTracks()[0];
        await this.addReplaceTrackToSession(session, track);
      }

      await session.unmute(userId as any, 'audio');
    }

    session.audioMuted = !!params.mute;

    // if they passed in an unmute device id, we will switch to that device (if we unmuted audio)
    if (params.unmuteDeviceId !== undefined && !session.audioMuted) {
      this.log('info', 'switching mic device', { sessionId: session.id, conversationId: session.conversationId });

      await this.sdk.updateOutgoingMedia({ audioDeviceId: params.unmuteDeviceId });
    }
  }

  handleMediaChangeEvent (session: IExtendedMediaSession, event: IMediaChangeEvent) {
    this.updateParticipantsOnScreen(session, event);
    this.updateSpeakers(session, event);
  }

  async startScreenShare (session: IExtendedMediaSession) {
    session._resurrectVideoOnScreenShareEnd = !session.videoMuted;
    try {
      this.log('info', 'Starting screen media', { sessionId: session.id, conversationId: session.conversationId });

      const stream = await this.sdk.media.startDisplayMedia();
      session._screenShareStream = stream;

      await this.addReplaceTrackToSession(session, stream.getVideoTracks()[0]);

      if (!session.videoMuted) {
        await this.setVideoMute(session, { sessionId: session.id, mute: true }, true);
      }

      stream.getTracks().forEach((track: MediaStreamTrack) => {
        track.addEventListener('ended', this.stopScreenShare.bind(this, session));
      });

      this.sessionManager.webrtcSessions.notifyScreenShareStart(session);
    } catch (err) {
      if (!err) {
        return this.log('info', 'screen selection cancelled', { conversationId: session.conversationId, sessionId: session.id });
      }

      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to start screen share', {
        conversationId: session.conversationId,
        sessionId: session.id,
        error: err
      });
    }
  }

  async stopScreenShare (session: IExtendedMediaSession): Promise<void> {
    if (!session._screenShareStream) {
      this.log('error', 'No screen share stream to stop', { conversationId: session.conversationId, sessionId: session.id });
      return;
    }

    const track = session._screenShareStream.getVideoTracks()[0];
    const sender = session.pc.getSenders().find(sender => sender.track && sender.track.id === track.id);

    if (session._resurrectVideoOnScreenShareEnd) {
      this.log('info', 'Restarting video track', { conversationId: session.conversationId, sessionId: session.id });
      await this.setVideoMute(session, { sessionId: session.id, mute: false }, true);
    } else {
      await sender.replaceTrack(null);
    }

    track.stop();

    this.sessionManager.webrtcSessions.notifyScreenShareStop(session);
  }

  async pinParticipantVideo (session: IExtendedMediaSession, participantId?: string) {
    if (!session.pcParticipant) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Unable to pin participant video. Local participant is unknown.', {
        conversation: session.conversationId,
        sessionId: session.id,
        participantId
      });
    }

    const uri = `/conversations/videos/${session.conversationId}/participants/${session.pcParticipant.id}/pin`;

    // default to unpin
    let method = 'delete';
    let data: string;

    if (participantId) {
      method = 'post';
      data = JSON.stringify({
        targetParticipantId: participantId,
        streamType: 'video'
      });

      this.log('info', 'Pinning video for participant', {
        conversationId: session.conversationId,
        sessionId: session.id,
        participantId
      });
    } else {
      this.log('info', 'Unpinning all participants', {
        conversationId: session.conversationId,
        sessionId: session.id,
        participantId
      });
    }

    try {
      await requestApi.call(this.sdk, uri, { method, data });
      session.emit('pinnedParticipant', { participantId: participantId || null });
    } catch (err) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Request to pin video failed', {
        conversationId: session.conversationId,
        sessionId: session.id,
        error: err
      });
    }
  }

  attachIncomingTrackToElement (
    track: MediaStreamTrack,
    { audioElement, videoElement }: { audioElement?: HTMLAudioElement, videoElement?: HTMLVideoElement }
  ): HTMLAudioElement | HTMLVideoElement {
    let element = audioElement;

    if (track.kind === 'video') {
      element = videoElement;
      element.muted = true;
    }

    element.autoplay = true;
    element.srcObject = createNewStreamWithTrack(track);
    return element;
  }

  /**
   * Parse the trackId from a passed in SDP for a given media type
   *
   * SDP will look like:
   * ```
   * // global stuff...
   * m=audio 1 UDP/TLS/RTP/SAVPF 96
   * // info about the audio offer...
   * a=msid:cbf2ec37-5e50-4ac4-9ae7-1d1dc4508071 19d58781-f708-4945-be91-2758052273bd
   * m=video 1 UDP/TLS/RTP/SAVPF 97 98
   * // info about the video offer...
   * a=msid:cbf2ec37-5e50-4ac4-9ae7-1d1dc4508071 1e3d9e8b-d407-47ee-8dcf-6b5912889a28
   * ```
   *
   * `m=` acts as the delimiter for each audio/video track in the offer
   * `a=misd:{ID for the media stream} {ID for the media track (this is what we will look for)}
   *
   * @param sdp to parse
   * @param kind media type to look for
   */
  getTrackIdFromSdp (sdp: string, kind: 'video' | 'audio'): string {
    return sdp?.split('m=')
      .find(s => s.startsWith(kind))?.split('\n')
      .find(s => s.startsWith('a=msid:'))?.split(' ')[1]?.trim();
  }
}
