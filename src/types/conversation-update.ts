import { CommunicationStates } from './enums';

export class ConversationUpdate {
  id: string;
  participants: Array<
    {
      id: string;
      purpose: string;
      userId: string;
      videos: Array<
        {
          context: string,
          audioMuted: boolean,
          videoMuted: boolean,
          id: string,
          state: CommunicationStates,
          peerCount: number,
          sharingScreen: boolean
        }
      >
      calls: Array<
        {
          id: string,
          state: CommunicationStates,
          muted: boolean,
          confined: boolean,
          held: boolean,
          direction: 'inbound' | 'outbound',
          provider: string
        }
      >
    }
  >;

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types */
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
