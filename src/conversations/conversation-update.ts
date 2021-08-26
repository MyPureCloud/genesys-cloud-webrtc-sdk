import { IConversationParticipantFromEvent } from '../types/interfaces';

export class ConversationUpdate {
  id: string;
  participants: Array<IConversationParticipantFromEvent>;

  constructor (rawUpdate: any) {
    this.id = rawUpdate.id;
    this.participants = rawUpdate.participants.map((p) => {
      const videos = p.videos ? p.videos.map((video) => ({
        context: video.context,
        audioMuted: video.audioMuted,
        videoMuted: video.videoMuted,
        id: video.id,
        state: video.state,
        peerCount: video.peerCount,
        sharingScreen: video.sharingScreen
      })) : [];

      const calls = p.calls ? p.calls.map((call) => ({
        id: call.id,
        state: call.state,
        muted: call.muted,
        confined: call.confined,
        held: call.held,
        direction: call.direction,
        provider: call.provider
      })) : [];

      return {
        id: p.id,
        purpose: p.purpose,
        userId: p.userId,
        videos,
        calls
      };
    });
  }
}