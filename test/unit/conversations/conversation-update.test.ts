import { ConversationUpdate } from '../../../src/conversations/conversation-update';

describe('ConversationUpdate', () => {
  describe('mapsParticipants', () => {
    it('should map videos & calls to empty arrays if there are none', () => {
      const update = {
        participants: [
          { id: 'asdf', purpose: 'to eat cake', userId: '1...2....3.....CAKE-TIME!' }
        ]
      };

      const conversationUpdate = new ConversationUpdate(update);

      expect(conversationUpdate.participants[0]).toEqual({
        ...update.participants[0],
        videos: [],
        calls: []
      });
    });

    it('should pluck only needed video props', () => {
      const video = {
        id: 'geroge-washington',
        state: 'Virginia',
        context: { status: '1st Presendent of the USA' },
        audioMuted: false,
        videoMuted: true,
        peerCount: 12,
        sharingScreen: false,
        randomFacts: [
          'he did not have a middle name',
          'he was an honorary citizen of France',
          'he never chopped down that cherry tree'
        ],
        isShouting: false
      };
      const update = {
        participants: [
          { id: 'asdf', purpose: 'to eat cake', userId: '1...2....3.....CAKE-TIME!', videos: [video] }
        ]
      };
      const expectedVideo = { ...video };
      delete expectedVideo.randomFacts;
      delete expectedVideo.isShouting;

      const conversationUpdate = new ConversationUpdate(update);

      expect(conversationUpdate.participants[0]).toEqual({
        ...update.participants[0],
        videos: [expectedVideo],
        calls: []
      });
    });

    it('should pluck only needed call props', () => {
      const call = {
        id: 'geroge-washington',
        state: 'Virginia',
        muted: true,
        confined: true,
        held: false,
        direction: 'outbound',
        provider: 'United States of America',
        randomFacts: [
          'he did not have a middle name',
          'he was an honorary citizen of France',
          'he never chopped down that cherry tree'
        ],
        isShouting: false
      };
      const update = {
        participants: [
          { id: 'asdf', purpose: 'to eat cake', userId: '1...2....3.....CAKE-TIME!', calls: [call] }
        ]
      };
      const expectedCall = { ...call };
      delete expectedCall.randomFacts;
      delete expectedCall.isShouting;

      const conversationUpdate = new ConversationUpdate(update);

      expect(conversationUpdate.participants[0]).toEqual({
        ...update.participants[0],
        videos: [],
        calls: [expectedCall]
      });
    });
  });
});