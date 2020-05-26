import { differenceBy, intersection } from 'lodash';

import {
  IPendingSession,
  IAcceptSessionRequest,
  ISessionMuteRequest,
  IJingleSession,
  IParticipantUpdate,
  IParticipantsUpdate,
  IOnScreenParticipantsUpdate,
  ISpeakersUpdate,
  IConversationParticipant,
  IMediaRequestOptions,
  IStartVideoSessionParams
} from '../types/interfaces';
import BaseSessionHandler from './base-session-handler';
import { SessionTypes, LogLevels, SdkErrorTypes, CommunicationStates } from '../types/enums';
import { createNewStreamWithTrack, startMedia, startDisplayMedia, getEnumeratedDevices } from '../media-utils';
import { throwSdkError, requestApi, isVideoJid, isPeerVideoJid } from '../utils';
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
      this.log(LogLevels.warn, 'Failed to find current user in the conversation update');
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

  handleConversationUpdate (session: IJingleSession, conversationUpdate: ConversationUpdate): void {
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

  updateParticipantsOnScreen (session: IJingleSession, mediaUpdateEvent: IMediaChangeEvent) {
    const incomingVideoTrackIds = session.pc.getReceivers()
      .filter((receiver) => receiver.track && receiver.track.kind === 'video')
      .map((receiver) => receiver.track.id);

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

  updateSpeakers (session: IJingleSession, mediaUpdateEvent: IMediaChangeEvent) {
    const incomingVideoTrackIds = session.pc.getReceivers()
      .filter((receiver) => receiver.track && receiver.track.kind === 'audio')
      .map((receiver) => receiver.track.id);

    const speakingParticipants: Array<{ userId: string }> = [];
    mediaUpdateEvent.eventBody.participants.forEach((updateParticipant: IMediaChangeEventParticipant) => {
      const matchingAudioTracks = updateParticipant.tracks
        .filter((track) => track.mediaType === 'audio')
        .filter((track) => {
          const intersectingTracks = intersection(track.sinks, incomingVideoTrackIds);
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
      this.log(LogLevels.error, 'Failed to request video session', err);
      return Promise.reject(err);
    }
  }

  async handlePropose (pendingSession: IPendingSession): Promise<void> {
    // if we requested the session dont emit a pending session
    if (this.requestedSessions[pendingSession.originalRoomJid]) {
      this.log(LogLevels.debug, 'Propose received for requested video session, accepting automatically', pendingSession);
      delete this.requestedSessions[pendingSession.originalRoomJid];
      await this.proceedWithSession(pendingSession);
      return;
    }

    if (isPeerVideoJid(pendingSession.address)) {
      this.log(LogLevels.info, 'Propose received for incoming peer video', pendingSession);
    } else {
      this.log(LogLevels.debug, 'Propose received for a video session that is not a peer session and wasn\'t started by this client, ignoring.', pendingSession);
      return;
    }
    await super.handlePropose(pendingSession);
  }

  async handleSessionInit (session: IJingleSession): Promise<any> {
    session.startScreenShare = this.startScreenShare.bind(this, session);
    session.stopScreenShare = this.stopScreenShare.bind(this, session);
    session.pinParticipantVideo = this.pinParticipantVideo.bind(this, session);

    return super.handleSessionInit(session);
  }

  // doc: acceptSession requires a video and audio element either provided or default
  async acceptSession (session: IJingleSession, params: IAcceptSessionRequest): Promise<any> {
    const audioElement = params.audioElement || this.sdk._config.defaultAudioElement;
    if (!audioElement) {
      throwSdkError.call(this.sdk, SdkErrorTypes.invalid_options, 'acceptSession for video requires an audioElement to be provided or in the default config', { conversationId: session.conversationId });
    }

    const videoElement = params.videoElement || this.sdk._config.defaultVideoElement;
    if (!videoElement) {
      throwSdkError.call(this.sdk, SdkErrorTypes.invalid_options, 'acceptSession for video requires a videoElement to be provided or in the default config', { conversationId: session.conversationId });
    }

    let stream = params.mediaStream;
    if (!stream) {
      const devices = await getEnumeratedDevices(this.sdk);
      const mediaParams: IMediaRequestOptions = {
        audio: params.audioDeviceId || true,
        video: params.videoDeviceId || true
      };

      if (!devices.videoDevices.length) {
        mediaParams.video = false;
      }

      if (!devices.audioDevices.length) {
        mediaParams.audio = false;
      }

      stream = await startMedia(this.sdk, mediaParams);
    }

    session._outboundStream = stream;

    await this.sdk._streamingConnection.notifications.subscribe(`v2.conversations.${session.conversationId}.media`, this.handleMediaChangeEvent.bind(this, session));

    await this.addMediaToSession(session, stream, false);

    // make sure we have an audio and video sender so we don't have to renego later
    this.setupTransceivers(session);

    const attachParams = { audioElement, videoElement };
    if (session.tracks.length) {
      session.tracks.forEach((track) => {
        this.log(LogLevels.info, 'Incoming track', { track, conversationId: session.conversationId });
        const el = this.attachIncomingTrackToElement(track, attachParams);
        if (el instanceof HTMLAudioElement) session._outputAudioElement = el;
      });
      session.emit('incomingMedia');
    } else {
      session.on('peerTrackAdded', (session: IJingleSession, track: MediaStreamTrack) => {
        this.log(LogLevels.info, 'Incoming track', { track, conversationId: session.conversationId });
        const el = this.attachIncomingTrackToElement(track, attachParams);
        if (el instanceof HTMLAudioElement) session._outputAudioElement = el;
        session.emit('incomingMedia');
      });
    }

    await super.acceptSession(session, params);
    this.setInitialMuteStates(session);
  }

  setInitialMuteStates (session: IJingleSession): void {
    const userId = this.sdk._personDetails.id;

    const videoSender = session.pc.getSenders().find((sender) => sender.track && sender.track.kind === 'video');
    if (!videoSender || !videoSender.track.enabled) {
      session.videoMuted = true;
      this.log(LogLevels.info, 'Sending initial video mute', { conversationId: session.conversationId });
      session.mute(userId, 'video');
    }

    const audioSender = session.pc.getSenders().find((sender) => sender.track && sender.track.kind === 'audio');
    if (!audioSender || !audioSender.track.enabled) {
      session.audioMuted = true;
      this.log(LogLevels.info, 'Sending initial audio mute', { conversationId: session.conversationId });
      session.mute(userId, 'audio');
    }
  }

  setupTransceivers (session: IJingleSession) {
    // not supported in edge at time of writing https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTransceiver
    if (!session.pc.pc.addTransceiver) {
      this.log(LogLevels.warn, 'addTransceiver not supported, video experience may be sub optimal', { conversationId: session.conversationId });
      return;
    }

    const videoTransceiver = session.pc.pc.getTransceivers().find(transceiver => transceiver.receiver.track && transceiver.receiver.track.kind === 'video');
    if (!videoTransceiver) {
      session.pc.pc.addTransceiver('video', { direction: 'sendrecv' });
    } else {
      videoTransceiver.direction = 'sendrecv';
    }

    const audioTransceiver = session.pc.pc.getTransceivers().find(transceiver => transceiver.receiver.track && transceiver.receiver.track.kind === 'audio');
    if (!audioTransceiver) {
      session.pc.pc.addTransceiver('audio', { direction: 'sendrecv' });
    } else {
      audioTransceiver.direction = 'sendrecv';
    }
  }

  async endSession (session: IJingleSession) {
    await this.sdk._streamingConnection.notifications.unsubscribe(`v2.conversations.${session.conversationId}.media`);
    await super.endSession(session);
    session.pc.getSenders().map((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });
  }

  async setVideoMute (session: IJingleSession, params: ISessionMuteRequest, skipServerUpdate?: boolean) {
    const replayMuteRequest = !!session.videoMuted === !!params.mute;

    if (replayMuteRequest) {
      this.log(LogLevels.warn, 'Replaying video mute request since the local state already matches the requested state', { conversationId: session.conversationId });
    }

    const userId = this.sdk._personDetails.id;

    // if we are going to mute, we need to remove/end the existing camera track
    if (params.mute) {
      // we don't want videoMute to affect screen share so we need to ignore senders that contain a screen share track
      const trackIdsToIgnore = [];
      if (session._screenShareStream) {
        trackIdsToIgnore.push(...session._screenShareStream.getTracks().map((track) => track.id));
      }

      const senders = this.getSendersByTrackType(session, 'video')
        .filter((sender) => !trackIdsToIgnore.includes(sender.track.id));

      if (!senders.length) {
        this.log(LogLevels.warn, 'Unable to find any video tracks to mute', { sessionId: session.id, conversationId: session.conversationId });
        return;
      }

      // remove track from sender and outbound stream referrence
      const promises = [];
      senders.forEach((sender) => {
        this.log(LogLevels.info, 'Ending track because of video mute request', { trackId: sender.track.id, conversationId: session.conversationId });
        sender.track.stop();
        promises.push(this.removeMediaFromSession(session, sender.track));
        session._outboundStream.removeTrack(sender.track);
      });

      await Promise.all(promises);

      if (!skipServerUpdate) {
        session.mute(userId, 'video');
      }

      // if we are unmuting, we need to get a new camera track and add that to the session
    } else {
      this.log(LogLevels.info, 'Creating new video track', { conversationId: session.conversationId });

      // look for a device to use, else use default
      const stream = await startMedia(this.sdk, { video: params.unmuteDeviceId === undefined ? true : params.unmuteDeviceId });

      // add track to session
      await this.addMediaToSession(session, stream, false);

      // add sync track to local outbound referrence
      session._outboundStream.addTrack(stream.getVideoTracks()[0]);

      if (!skipServerUpdate) {
        session.unmute(userId, 'video');
      }
    }

    session.videoMuted = !!params.mute;
  }

  async setAudioMute (session: IJingleSession, params: ISessionMuteRequest) {
    const replayMuteRequest = !!session.audioMuted === !!params.mute;

    // if conversation is already muted, we wont get an update so dont wait for one
    if (replayMuteRequest) {
      this.log(LogLevels.warn, 'Replaying audio mute request since the local state already matches the requested state', { conversationId: session.conversationId });
    }

    const userId = this.sdk._personDetails.id;

    const outgoingTracks = this.getSendersByTrackType(session, 'audio').map(sender => sender.track);

    outgoingTracks.forEach((track) => {
      this.log(LogLevels.info, `${params.mute ? 'Muting' : 'Unmuting'} audio track`, { trackId: track.id, conversationId: session.conversationId });
      track.enabled = !params.mute;
    });

    if (params.mute) {
      if (!outgoingTracks.length) {
        this.log(LogLevels.warn, 'Unable to find any outgoing audio tracks to mute', { sessionId: session.id, conversationId: session.conversationId });
      } else {
        session.mute(userId, 'audio');
      }
    } else {
      // make sure there's audio to unmute. if not, create it.
      if (!outgoingTracks.length) {
        this.log(LogLevels.info, 'No outoing audio to unmute, creating and adding media to session', { sessionId: session.id, conversationId: session.conversationId });

        // if params.unmuteDeviceId is `undefined`, use sdk defaults
        const stream = await startMedia(this.sdk, { audio: params.unmuteDeviceId === undefined ? true : params.unmuteDeviceId });
        await this.addMediaToSession(session, stream, false);
      }

      session.unmute(userId, 'audio');
    }

    session.audioMuted = !!params.mute;

    // if they passed in an unmute device id, we will switch to that device (if we unmuted audio)
    if (params.unmuteDeviceId !== undefined && !session.audioMuted) {
      this.log(LogLevels.info, 'switching mic device', { sessionId: session.id, conversationId: session.conversationId });

      await this.sdk.updateOutgoingMedia({ audioDeviceId: params.unmuteDeviceId });
    }
  }

  handleMediaChangeEvent (session: IJingleSession, event: IMediaChangeEvent) {
    this.updateParticipantsOnScreen(session, event);
    this.updateSpeakers(session, event);
  }

  async startScreenShare (session: IJingleSession) {
    session._resurrectVideoOnScreenShareEnd = !session.videoMuted;
    try {
      this.log(LogLevels.info, 'Starting screen media', { sessionId: session.id, conversationId: session.conversationId });

      const stream = await startDisplayMedia();
      if (!session.videoMuted) {
        await this.setVideoMute(session, { id: session.id, mute: true }, true);
      }

      stream.getTracks().forEach((track: MediaStreamTrack) => {
        track.addEventListener('ended', this.stopScreenShare.bind(this, session));
      });

      session._screenShareStream = stream;
      await this.addMediaToSession(session, stream, false);
      this.sessionManager.webrtcSessions.notifyScreenShareStart(session);
    } catch (err) {
      if (!err) {
        return this.log(LogLevels.info, 'screen selection cancelled', { conversationId: session.conversationId });
      }

      throwSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to start screen share', { conversationId: session.conversationId, error: err });
    }
  }

  async stopScreenShare (session: IJingleSession) {
    if (!session._screenShareStream) {
      this.log(LogLevels.error, 'No screen share stream to stop', { conversationId: session.conversationId });
      return;
    }

    session._screenShareStream.getTracks().forEach(async (track) => {
      track.stop();
      await this.removeMediaFromSession(session, track);
    });

    if (session._resurrectVideoOnScreenShareEnd) {
      this.log(LogLevels.info, 'Restarting video track', { conversationId: session.conversationId });
      await this.setVideoMute(session, { id: session.id, mute: false }, true);
    }

    this.sessionManager.webrtcSessions.notifyScreenShareStop(session);
  }

  async pinParticipantVideo (session: IJingleSession, participantId?: string) {
    if (!session.pcParticipant) {
      throwSdkError.call(this.sdk, SdkErrorTypes.session, 'Unable to pin participant video. Local participant is unknown.', { conversation: session.conversationId, participantId });
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

      this.log(LogLevels.info, 'Pinning video for participant', { conversationId: session.conversationId, participantId });
    } else {
      this.log(LogLevels.info, 'Unpinning all participants', { conversationId: session.conversationId, participantId });
    }

    try {
      await requestApi.call(this.sdk, uri, { method, data });
      session.emit('pinnedParticipant', { participantId: participantId || null });
    } catch (err) {
      throwSdkError.call(this.sdk, SdkErrorTypes.generic, 'Request to pin video failed', { conversationId: session.conversationId, error: err });
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
}
