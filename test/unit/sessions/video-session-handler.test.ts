import nock = require('nock');
import uuid = require('uuid');

import { SimpleMockSdk, MockSession, MockStream, MockTrack, random } from '../../test-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import { SessionTypes, CommunicationStates, SdkErrorTypes } from '../../../src/types/enums';
import * as mediaUtils from '../../../src/media/media-utils';
import * as utils from '../../../src/utils';
import { IParticipantsUpdate, IExtendedMediaSession, IConversationParticipant } from '../../../src/types/interfaces';
import VideoSessionHandler, { IMediaChangeEvent } from '../../../src/sessions/video-session-handler';
import { ConversationUpdate } from '../../../src/types/conversation-update';

let handler: VideoSessionHandler;
let mockSdk: GenesysCloudWebrtcSdk;
let mockSessionManager: SessionManager;
let userId: string;

beforeEach(() => {
  jest.clearAllMocks();
  nock.cleanAll();
  mockSdk = (new SimpleMockSdk() as any);
  (mockSdk as any).isGuest = true;
  mockSdk._config.autoConnectSessions = true;

  mockSessionManager = new SessionManager(mockSdk);
  handler = new VideoSessionHandler(mockSdk, mockSessionManager);

  userId = random();
  mockSdk._personDetails = { id: userId } as any;
});

describe('shouldHandleSessionByJid', () => {
  it('should rely on isSoftphoneJid', () => {
    jest.spyOn(utils, 'isVideoJid').mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(handler.shouldHandleSessionByJid('sdlkf')).toBeFalsy();
    expect(handler.shouldHandleSessionByJid('sdlfk')).toBeTruthy();
  });
});

describe('findLocalParticipantInConversationUpdate', () => {
  it('should return null if not found', () => {
    expect(handler.findLocalParticipantInConversationUpdate({ id: '1231', participants: [] })).toBe(null);
  });

  it('should return the user', () => {
    const userId = '444kjskdk';
    mockSdk._personDetails = { id: userId } as any;
    const participant1 = {
      id: '7b809e10-fb79-4420-9d5f-69d232ddf490',
      userId: 'dad93e0d-31fa-4fd2-8fc4-d9d3f214ddcf',
      purpose: 'user',
      videos: [
        {
          state: CommunicationStates.connected,
          id: '5e2bf9b8-c9d5-4975-b89b-756b6bd0b3d5',
          context: '5d1130ff978496186c5ce304@conference.test-valve-1ym37mj1kao.orgspan.com',
          audioMuted: false,
          videoMuted: true,
          sharingScreen: false,
          peerCount: 0
        }
      ]
    };

    const local = {
      id: '7sdffs-4420-9d5f-69d232ddf490',
      userId,
      purpose: 'user',
      videos: [
        {
          state: CommunicationStates.connected,
          id: '5e2bf9b855125-b89b-756b6bd0b3d5',
          context: '5d1130ff978496186c5ce304@conference.test-valve-1ym37mj1kao.orgspan.com',
          audioMuted: false,
          videoMuted: true,
          sharingScreen: false,
          peerCount: 0
        }
      ]
    };

    const conversationUpdate = new ConversationUpdate({
      id: 'ff5a3ba2-373b-42c7-912a-5309a2656095',
      participants: [participant1, local]
    });

    const expected = {
      address: null,
      confined: null,
      direction: null,
      id: local.id,
      state: local.videos[0].state,
      purpose: local.purpose,
      userId: local.userId,
      muted: local.videos[0].audioMuted,
      videoMuted: local.videos[0].videoMuted
    };

    expect(handler.findLocalParticipantInConversationUpdate(conversationUpdate)).toEqual(expected);
  });
});

describe('handleConversationUpdate', () => {
  let conversationUpdate: ConversationUpdate;
  let participant1: any;

  beforeEach(() => {
    participant1 = {
      id: '7b809e10-fb79-4420-9d5f-69d232ddf490',
      userId: 'dad93e0d-31fa-4fd2-8fc4-d9d3f214ddcf',
      purpose: 'user',
      videos: [
        {
          state: CommunicationStates.connected,
          id: '5e2bf9b8-c9d5-4975-b89b-756b6bd0b3d5',
          context: '5d1130ff978496186c5ce304@conference.test-valve-1ym37mj1kao.orgspan.com',
          audioMuted: false,
          videoMuted: true,
          sharingScreen: false,
          peerCount: 0
        }
      ]
    };

    conversationUpdate = {
      id: 'ff5a3ba2-373b-42c7-912a-5309a2656095',
      participants: [participant1]
    };

    jest.spyOn(handler, 'findLocalParticipantInConversationUpdate').mockReturnValue(null);
  });

  it('should set the localParticipant on the session', () => {
    const localParticipant = {} as any;
    (handler.findLocalParticipantInConversationUpdate as jest.Mock).mockReturnValue(localParticipant);

    const session = {
      emit: jest.fn()
    };

    handler.handleConversationUpdate(session as any, conversationUpdate);

    expect((session as any).pcParticipant).toBe(localParticipant);
  });

  it('activeParticipants should only include participants with video communications', () => {
    const session = {
      emit: jest.fn()
    };

    // add 2 participants
    const participant2 = JSON.parse(JSON.stringify(participant1));
    participant2.id = '4441k2j1kj412j41l2k4';
    delete participant2.videos;
    const participant3 = JSON.parse(JSON.stringify(participant1));
    participant3.id = 'mgm54m5534l3nl';
    participant3.calls = participant3.videos;
    delete participant3.videos;
    conversationUpdate.participants.push(participant2, participant3);

    handler.handleConversationUpdate(session as any, conversationUpdate);

    expect(session.emit).toHaveBeenCalledTimes(1);

    let emittedUpdate: IParticipantsUpdate = session.emit.mock.calls[0][1];
    expect(emittedUpdate.activeParticipants.length).toEqual(1);
    expect(emittedUpdate.removedParticipants.length).toEqual(0);
  });

  it('should diff added participants', () => {
    const session = {
      emit: jest.fn()
    };

    handler.handleConversationUpdate(session as any, conversationUpdate);

    expect(session.emit).toHaveBeenCalledTimes(1);

    let emittedUpdate: IParticipantsUpdate = session.emit.mock.calls[0][1];
    expect(emittedUpdate.addedParticipants.length).toEqual(1);
    expect(emittedUpdate.addedParticipants[0].participantId).toEqual(participant1.id);
    expect(emittedUpdate.activeParticipants.length).toEqual(1);

    // add 2 participants
    const participant2 = JSON.parse(JSON.stringify(participant1));
    participant2.id = '4441k2j1kj412j41l2k4';
    const participant3 = JSON.parse(JSON.stringify(participant1));
    participant3.id = 'mgm54m5534l3nl';
    conversationUpdate.participants.push(participant2, participant3);

    session.emit.mockReset();
    handler.handleConversationUpdate(session as any, conversationUpdate);
    expect(session.emit).toHaveBeenCalledTimes(1);

    emittedUpdate = session.emit.mock.calls[0][1];
    expect(emittedUpdate.addedParticipants.length).toEqual(2);
    expect(emittedUpdate.removedParticipants.length).toEqual(0);
    expect(emittedUpdate.addedParticipants[0].participantId).toEqual(participant2.id);
    expect(emittedUpdate.activeParticipants.length).toEqual(3);
    expect(emittedUpdate.addedParticipants[1].participantId).toEqual(participant3.id);
  });

  it('should diff removed participants', () => {
    const session = {
      emit: jest.fn()
    };

    // add 2 participants
    const participant2 = JSON.parse(JSON.stringify(participant1));
    participant2.id = '4441k2j1kj412j41l2k4';
    const participant3 = JSON.parse(JSON.stringify(participant1));
    participant3.id = 'mgm54m5534l3nl';
    conversationUpdate.participants.push(participant2, participant3);

    handler.handleConversationUpdate(session as any, conversationUpdate);

    expect(session.emit).toHaveBeenCalledTimes(1);

    let emittedUpdate: IParticipantsUpdate = session.emit.mock.calls[0][1];
    expect(emittedUpdate.activeParticipants.length).toEqual(3);
    expect(emittedUpdate.removedParticipants.length).toEqual(0);

    session.emit.mockReset();

    participant2.videos[0].state = CommunicationStates.disconnected;

    handler.handleConversationUpdate(session as any, conversationUpdate);
    expect(session.emit).toHaveBeenCalledTimes(1);

    emittedUpdate = session.emit.mock.calls[0][1];
    expect(emittedUpdate.activeParticipants.length).toEqual(2);
    expect(emittedUpdate.addedParticipants.length).toEqual(0);
    expect(emittedUpdate.removedParticipants.length).toEqual(1);
    expect(emittedUpdate.removedParticipants[0].participantId).toEqual(participant2.id);
  });
});

describe('mediaUpdateEvent', () => {
  let mediaEvent: IMediaChangeEvent;
  let session: any;
  const incomingVideoId = '8a28ff7f-bfe7-4490-b921-0df0dd44bc23';
  const incomingAudioId = '9c10d6bd-6dd8-423c-b317-b64f831f8d48';
  const sendingUser = '2058ab75-7514-4092-b39e-ad2dcb8079a9';
  const otherUser = 'dc432f16-031f-4ffc-a89a-3c291029647f';

  beforeEach(() => {
    mediaEvent = {
      metadata: { CorrelationId: '123' },
      eventBody: {
        id: 'c89f515b-69fb-4730-93f8-dcff24997fec',
        participants: [
          {
            communicationId: 'c1b10be3-51a6-4f3c-b4fc-75834a8115c3',
            userId: sendingUser,
            tracks: [
              {
                id: 'fc61add6-8934-4e97-ac17-9f715ab16449',
                mediaType: 'audio',
                sinks: [incomingAudioId]
              },
              {
                id: '30f1b98c-b272-4df1-bb90-4a91a8db85ec',
                mediaType: 'video',
                sinks: [incomingVideoId]
              }
            ]
          },
          {
            communicationId: 'ca13afab-ac4a-4346-87ac-bb5fa4179df9',
            userId: 'dc432f16-031f-4ffc-a89a-3c291029647f',
            tracks: [
              {
                id: 'a2b940a0-d58a-420d-a923-6923a7402b62',
                mediaType: 'audio',
                sinks: []
              },
              {
                id: '46b8b64f-4743-4f2c-b91f-00bbe680a37f',
                mediaType: 'video',
                sinks: ['52b2fd95-6c13-4e4b-aea9-99eaf7f4661b']
              }
            ]
          }
        ],
        speakers: ['fc61add6-8934-4e97-ac17-9f715ab16449']
      }
    };

    session = {
      pc: {
        remoteDescription: {
          sdp: 'v=0\notherstuff'
        },
        getReceivers: jest.fn().mockReturnValue([
          { track: { kind: 'video', id: incomingVideoId } },
          { track: { kind: 'audio', id: incomingAudioId } }
        ]),
      },
      emit: jest.fn()
    };
  });

  describe('updateParticipantsOnScreen', () => {
    it('should only emit if the onScreenParticipant changes', () => {
      handler.updateParticipantsOnScreen(session, mediaEvent);

      const expected = {
        participants: [
          { userId: sendingUser }
        ]
      };

      expect(session.emit).toHaveBeenCalledWith('activeVideoParticipantsUpdate', expected);
      session.emit.mockReset();

      handler.updateParticipantsOnScreen(session, mediaEvent);
      expect(session.emit).not.toHaveBeenCalled();
    });

    it('should be able to match using the trackId from the sdp (for Firefox)', () => {
      session.pc.getReceivers.mockReturnValue([
        { track: { kind: 'video', id: '{some-firefox-track-id}' } }
      ]);
      jest.spyOn(handler, 'getTrackIdFromSdp').mockReturnValue(incomingVideoId);

      handler.updateParticipantsOnScreen(session, mediaEvent);

      const expected = {
        participants: [
          { userId: sendingUser }
        ]
      };

      expect(session.emit).toHaveBeenCalledWith('activeVideoParticipantsUpdate', expected);
      session.emit.mockReset();
    });

    it('should emit if participantCount has not changed but on screen has', () => {
      handler.updateParticipantsOnScreen(session, mediaEvent);

      const expected = {
        participants: [
          { userId: sendingUser }
        ]
      };

      expect(session.emit).toHaveBeenCalledWith('activeVideoParticipantsUpdate', expected);
      session.emit.mockReset();

      const expected2 = {
        participants: [
          { userId: otherUser }
        ]
      };

      const videoInfo = mediaEvent.eventBody.participants[0].tracks[1];
      videoInfo.sinks = [];

      const otherVideo = mediaEvent.eventBody.participants[1].tracks[1];
      otherVideo.sinks = [incomingVideoId];

      handler.updateParticipantsOnScreen(session, mediaEvent);
      expect(session.emit).toHaveBeenCalledWith('activeVideoParticipantsUpdate', expected2);
      expect(session.emit).toHaveBeenCalled();
    });
  });

  describe('updateSpeakers', () => {
    it('should send out speaker update', () => {
      handler.updateSpeakers(session, mediaEvent);
      expect(session.emit).toHaveBeenCalledWith('speakersUpdate', { speakers: [{ userId: sendingUser }] });
    });

    it('should be able to match using the trackId from the sdp (for Firefox) and send the speaker update', () => {
      session.pc.getReceivers.mockReturnValue([
        { track: { kind: 'audio', id: '{some-firefox-track-id}' } }
      ]);
      jest.spyOn(handler, 'getTrackIdFromSdp').mockReturnValue(incomingAudioId);

      handler.updateSpeakers(session, mediaEvent);
      expect(session.emit).toHaveBeenCalledWith('speakersUpdate', { speakers: [{ userId: sendingUser }] });
    });
  });
});

describe('startSession', () => {
  it('should post to api', async () => {
    const roomJid = '123@conference.com';

    mockSdk._personDetails = {
      chat: {
        jabberId: 'part1@test.com'
      }
    } as any;

    jest.spyOn(utils, 'requestApi').mockResolvedValue({ body: 'sldk' });
    await handler.startSession({ jid: roomJid, sessionType: SessionTypes.collaborateVideo });

    const expected = JSON.stringify({
      roomId: roomJid,
      participant: {
        address: 'part1@test.com'
      }
    });

    expect(utils.requestApi).toHaveBeenCalledWith('/conversations/videos', { method: 'post', data: expected });
  });

  it('should post to api with an invitee', async () => {
    const roomJid = '123@conference.com';

    mockSdk._personDetails = {
      chat: {
        jabberId: 'part1@test.com'
      }
    } as any;

    jest.spyOn(utils, 'requestApi').mockResolvedValue({ body: 'sldk' });
    await handler.startSession({ jid: roomJid, inviteeJid: 'sndkkf@conference.com', sessionType: SessionTypes.collaborateVideo });

    const expected = JSON.stringify({
      roomId: roomJid,
      participant: {
        address: 'sndkkf@conference.com'
      }
    });

    expect(utils.requestApi).toHaveBeenCalledWith('/conversations/videos', { method: 'post', data: expected });
  });

  it('should log error on failure', async () => {
    const roomJid = '123@conference.com';
    const error = new Error('test');
    jest.spyOn(utils, 'requestApi').mockRejectedValue(error);

    mockSdk._personDetails = {
      chat: {
        jabberId: 'part1@test.com'
      }
    } as any;

    const logSpy = jest.spyOn(mockSdk.logger, 'error');
    await expect(handler.startSession({ jid: roomJid, sessionType: SessionTypes.collaborateVideo })).rejects.toBe(error);

    expect(logSpy).toHaveBeenCalledWith('Failed to request video session', expect.anything());
  });
});

describe('handlePropose', () => {
  it('should handle requested sessions automatically', async () => {
    const previouslyRequestedJid = '123@conference.com';
    handler.requestedSessions[previouslyRequestedJid] = true;

    const parentHandler = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose');
    jest.spyOn(handler, 'proceedWithSession').mockResolvedValue({});

    await handler.handlePropose({
      id: '1241241',
      sessionType: SessionTypes.collaborateVideo,
      address: previouslyRequestedJid,
      autoAnswer: false,
      conversationId: '141241241',
      originalRoomJid: previouslyRequestedJid
    });

    expect(handler.proceedWithSession).toHaveBeenCalled();
    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('should not emit session if not requested and its a conference', async () => {
    const jid = '123@conference.com';

    jest.spyOn(handler, 'proceedWithSession').mockResolvedValue({});

    const emitSpy = jest.fn();

    mockSdk.once('pendingSession', emitSpy);

    await handler.handlePropose({
      id: '1241241',
      sessionType: SessionTypes.collaborateVideo,
      address: jid,
      autoAnswer: false,
      conversationId: '141241241',
      originalRoomJid: jid
    });

    expect(handler.proceedWithSession).not.toHaveBeenCalled();
    expect(mockSdk.logger.debug).toHaveBeenCalledWith(expect.stringMatching(/Propose received.*ignoring/), expect.anything());
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should not emit session if peer request and the requestor is current user and not requested by this client', async () => {
    const jid = 'peer-123@conference.com';

    jest.spyOn(handler, 'proceedWithSession').mockResolvedValue({});

    const emitSpy = jest.fn();

    mockSdk.once('pendingSession', emitSpy);

    await handler.handlePropose({
      id: '1241241',
      fromUserId: userId,
      sessionType: SessionTypes.collaborateVideo,
      address: jid,
      autoAnswer: false,
      conversationId: '141241241',
      originalRoomJid: jid
    });

    expect(handler.proceedWithSession).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should emit session if peer request', async () => {
    const jid = 'peer-123@conference.com';

    jest.spyOn(handler, 'proceedWithSession').mockResolvedValue({});

    const emitSpy = jest.fn();

    mockSdk.once('pendingSession', emitSpy);

    await handler.handlePropose({
      id: '1241241',
      sessionType: SessionTypes.collaborateVideo,
      address: jid,
      autoAnswer: false,
      conversationId: '141241241',
      originalRoomJid: jid
    });

    expect(handler.proceedWithSession).not.toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalled();
  });
});

describe('handleSessionInit', () => {
  it('should decorate the session', async () => {
    const parentHandler = jest.spyOn(BaseSessionHandler.prototype, 'handleSessionInit').mockResolvedValue(null);
    const session: IExtendedMediaSession = {} as any;

    await handler.handleSessionInit(session);

    expect(parentHandler).toHaveBeenCalled();
    expect(session.startScreenShare).toEqual(expect.any(Function));
    expect(session.stopScreenShare).toEqual(expect.any(Function));
  });
});

describe('acceptSession', () => {
  let parentHandlerSpy: jest.SpyInstance<Promise<any>>;
  let addMediaToSessionSpy: jest.SpyInstance<Promise<void>>;
  let attachIncomingTrackToElementSpy: jest.SpyInstance<HTMLAudioElement>;
  let startMediaSpy: jest.SpyInstance<Promise<MediaStream>>;
  let initialMutesSpy: jest.SpyInstance<Promise<any>>; /* keep this spy */
  let session: IExtendedMediaSession;
  let media: MediaStream;

  beforeEach(() => {
    media = new MockStream() as any;
    parentHandlerSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession').mockResolvedValue(null);
    addMediaToSessionSpy = jest.spyOn(handler, 'addMediaToSession').mockResolvedValue(null);
    attachIncomingTrackToElementSpy = jest.spyOn(handler, 'attachIncomingTrackToElement').mockReturnValue({} as HTMLMediaElement);
    startMediaSpy = jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(media);
    initialMutesSpy = jest.spyOn(handler, 'setInitialMuteStates').mockResolvedValue(null);
    session = new MockSession() as any;
    jest.spyOn(handler, 'setupTransceivers').mockReturnValue();
  });

  it('should throw if no audio element provided', async () => {
    await expect(handler.acceptSession(session, { sessionId: session.id })).rejects.toThrowError(/requires an audioElement/);
  });

  it('should throw if no video element is provided', async () => {
    await expect(handler.acceptSession(session, { sessionId: session.id, audioElement: document.createElement('audio') })).rejects.toThrowError(/requires a videoElement/);
  });

  it('should use default elements', async () => {
    const audio = mockSdk._config.defaults.audioElement = document.createElement('audio');
    const video = mockSdk._config.defaults.videoElement = document.createElement('video');

    const incomingTrack = {} as any;
    jest.spyOn(session.pc, 'getReceivers').mockReturnValue([{ track: incomingTrack }] as any);

    attachIncomingTrackToElementSpy.mockReturnValue(audio);

    await handler.acceptSession(session, { sessionId: session.id });

    expect(parentHandlerSpy).toHaveBeenCalled();
    expect(attachIncomingTrackToElementSpy).toHaveBeenCalledWith(incomingTrack, { videoElement: video, audioElement: audio });
    expect(session._outputAudioElement).toBe(audio);
  });

  it('should use provided stream and elements', async () => {
    const audio = document.createElement('audio');
    const video = document.createElement('video');
    const stream = new MockStream() as any;

    const incomingTrack = {} as any;
    jest.spyOn(session.pc, 'getReceivers').mockReturnValue([{ track: incomingTrack }] as any);

    session.emit = jest.fn();

    await handler.acceptSession(session, { sessionId: session.id, audioElement: audio, videoElement: video, mediaStream: stream });

    expect(addMediaToSessionSpy).toHaveBeenCalledWith(session, stream);
    expect(session._outboundStream).toBe(stream);
    expect(startMediaSpy).not.toHaveBeenCalled();
    expect(parentHandlerSpy).toHaveBeenCalled();
    expect(attachIncomingTrackToElementSpy).toHaveBeenCalledWith(incomingTrack, { videoElement: video, audioElement: audio });
    expect(session.emit).toHaveBeenCalledWith('incomingMedia');
  });

  it('should create media', async () => {
    const audio = document.createElement('audio');
    const video = document.createElement('video');
    await handler.acceptSession(session, { sessionId: session.id, audioElement: audio, videoElement: video });
    expect(session._outboundStream).toBeTruthy();
    expect(parentHandlerSpy).toHaveBeenCalled();
    expect(startMediaSpy).toHaveBeenCalled();
  });

  it('should only create media if there are available devices', async () => {
    const audio = document.createElement('audio');
    const video = document.createElement('video');
    const setDevices = (devices: any[]) => mockSdk.media['setDevices'](devices);

    /* with no video devices */
    setDevices([{ kind: 'audioinput' } as any]);
    await handler.acceptSession(session, { sessionId: session.id, audioElement: audio, videoElement: video });
    expect(startMediaSpy).toHaveBeenCalledWith({ video: false, audio: true, session });

    /* with no audio devices */
    setDevices([{ kind: 'videoinput' } as any]);
    await handler.acceptSession(session, { sessionId: session.id, audioElement: audio, videoElement: video });
    expect(startMediaSpy).toHaveBeenCalledWith({ video: true, audio: false, session });
  });

  it('should subscribe to media change events', async () => {
    const audio = document.createElement('audio');
    const video = document.createElement('video');
    await handler.acceptSession(session, { sessionId: session.id, audioElement: audio, videoElement: video });

    expect(mockSdk._streamingConnection.notifications.subscribe).toHaveBeenCalled();
  });

  it('should attach tracks later if not available', async () => {
    const audio = document.createElement('audio');
    const video = document.createElement('video');

    attachIncomingTrackToElementSpy.mockReturnValue(audio);

    await handler.acceptSession(session, { sessionId: session.id, audioElement: audio, videoElement: video });
    expect(attachIncomingTrackToElementSpy).not.toHaveBeenCalled();
    expect(parentHandlerSpy).toHaveBeenCalled();
    expect(startMediaSpy).toHaveBeenCalled();

    const incomingTrack = {} as any;

    session.emit('peerTrackAdded', incomingTrack);

    expect(attachIncomingTrackToElementSpy).toHaveBeenCalledWith(incomingTrack, { videoElement: video, audioElement: audio });
    expect(session._outputAudioElement).toBe(audio);
  });

  it('should not attach the _outputAudioElement if it is not of type HTMLAudioElement', async () => {
    const audio = document.createElement('audio');
    const video = document.createElement('video');

    attachIncomingTrackToElementSpy.mockReturnValue(video);

    await handler.acceptSession(session, { sessionId: session.id, audioElement: audio, videoElement: video });
    expect(attachIncomingTrackToElementSpy).not.toHaveBeenCalled();
    expect(parentHandlerSpy).toHaveBeenCalled();
    expect(startMediaSpy).toHaveBeenCalled();

    const incomingTrack = {} as any;
    session.emit('peerTrackAdded', incomingTrack);

    expect(attachIncomingTrackToElementSpy).toHaveBeenCalledWith(incomingTrack, { videoElement: video, audioElement: audio });
    expect(session._outputAudioElement).toBe(undefined);
  });
});

describe('setInitialMuteStates', () => {
  let session: IExtendedMediaSession;
  let audioSender;
  let videoSender;
  beforeEach(() => {
    session = new MockSession() as any;
    audioSender = { track: { kind: 'audio', enabled: true } };
    videoSender = { track: { kind: 'video', enabled: true } };
  });

  it('should mute video', async () => {
    session.pc.getSenders = jest.fn().mockReturnValue([audioSender, videoSender]);
    videoSender.track.enabled = false;

    await handler.setInitialMuteStates(session);

    expect(session.mute).toHaveBeenCalledTimes(1);
    expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'video');

    (session.mute as jest.Mock).mockReset();

    videoSender.track = null;
    await handler.setInitialMuteStates(session);

    expect(session.mute).toHaveBeenCalledTimes(1);
    expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'video');

    (session.mute as jest.Mock).mockReset();

    (session.pc.getSenders as jest.Mock).mockReturnValue([audioSender]);
    await handler.setInitialMuteStates(session);

    expect(session.mute).toHaveBeenCalledTimes(1);
    expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'video');
  });

  it('should mute audio', async () => {
    session.pc.getSenders = jest.fn().mockReturnValue([audioSender, videoSender]);
    audioSender.track.enabled = false;

    await handler.setInitialMuteStates(session);

    expect(session.mute).toHaveBeenCalledTimes(1);
    expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'audio');

    (session.mute as jest.Mock).mockReset();

    audioSender.track = null;
    await handler.setInitialMuteStates(session);

    expect(session.mute).toHaveBeenCalledTimes(1);
    expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'audio');

    (session.mute as jest.Mock).mockReset();

    (session.pc.getSenders as jest.Mock).mockReturnValue([videoSender]);
    await handler.setInitialMuteStates(session);

    expect(session.mute).toHaveBeenCalledTimes(1);
    expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'audio');
  });

  it('should mute audio and video', async () => {
    session.pc.getSenders = jest.fn().mockReturnValue([audioSender, videoSender]);
    audioSender.track.enabled = false;
    videoSender.track.enabled = false;

    await handler.setInitialMuteStates(session);

    expect(session.mute).toHaveBeenCalledTimes(2);
    expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'audio');
    expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'video');
  });

  it('should not mute audio or video', async () => {
    session.pc.getSenders = jest.fn().mockReturnValue([audioSender, videoSender]);
    await handler.setInitialMuteStates(session);
    expect(session.mute).not.toHaveBeenCalled();
  });
});

describe('setupTransceivers', () => {
  let session: IExtendedMediaSession;
  let addTransceiverSpy: jest.Mock;
  let getTransceiversSpy: jest.Mock;
  let videoTransceiver: RTCRtpTransceiver;
  let audioTransceiver: RTCRtpTransceiver;

  beforeEach(() => {
    addTransceiverSpy = jest.fn();
    getTransceiversSpy = jest.fn();

    session = new MockSession() as any;
    session.pc = {
      addTransceiver: addTransceiverSpy,
      getTransceivers: getTransceiversSpy
    } as any;

    videoTransceiver = {
      sender: null,
      receiver: {
        track: {
          kind: 'video'
        }
      }
    } as any;

    audioTransceiver = {
      sender: null,
      receiver: {
        track: {
          kind: 'audio'
        }
      }
    } as any;
  });

  it('should do nothing if addTransceiver does not exist', () => {
    delete session.pc.addTransceiver;

    handler.setupTransceivers(session);

    expect(getTransceiversSpy).not.toHaveBeenCalled();
  });

  it('should do nothing if video and audio transceivers already exist', () => {
    getTransceiversSpy.mockReturnValue([videoTransceiver, audioTransceiver]);
    handler.setupTransceivers(session);

    expect(addTransceiverSpy).not.toHaveBeenCalled();
  });

  it('should add video transceiver', () => {
    getTransceiversSpy.mockReturnValue([audioTransceiver]);
    handler.setupTransceivers(session);

    expect(addTransceiverSpy).toHaveBeenCalledWith('video', { direction: 'sendrecv' });
    expect(addTransceiverSpy).toHaveReturnedTimes(1);
  });

  it('should add audio transceiver', () => {
    getTransceiversSpy.mockReturnValue([videoTransceiver]);
    handler.setupTransceivers(session);

    expect(addTransceiverSpy).toHaveBeenCalledWith('audio', { direction: 'sendrecv' });
    expect(addTransceiverSpy).toHaveReturnedTimes(1);
  });
});

describe('endSession', () => {
  it('should end session and stop all tracks', async () => {
    const baseSpy = jest.spyOn(BaseSessionHandler.prototype, 'endSession').mockResolvedValue(null);

    const session = new MockSession() as any;

    const track1 = new MockTrack();
    const track2 = new MockTrack();

    session.pc.getSenders = () => [{ track: track1 }, { track: track2 }, { track: null }];

    await handler.endSession(session);

    expect(baseSpy).toHaveBeenCalled();
    expect(mockSdk._streamingConnection.notifications.unsubscribe).toHaveBeenCalled();
    expect(track1.stop).toHaveBeenCalled();
    expect(track2.stop).toHaveBeenCalled();
  });
});

describe('setVideoMute', () => {
  let session: IExtendedMediaSession;

  beforeEach(() => {
    jest.spyOn(handler, 'removeMediaFromSession').mockResolvedValue(null);
    session = new MockSession() as any;
  });

  it('mute: should not stop screen tracks', async () => {
    session._screenShareStream = new MockStream({ video: true }) as any;
    const track = session._screenShareStream.getTracks()[0];
    const outbound = new MockStream();
    outbound._tracks = [new MockTrack('audio')];
    session._outboundStream = outbound as any;

    jest.spyOn(handler, 'getSendersByTrackType').mockReturnValue([
      { track }
    ] as any);

    await handler.setVideoMute(session, { sessionId: session.id, mute: true });

    expect(track.stop).not.toHaveBeenCalled();
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unable to find outbound camera'), expect.any(Object));
  });

  it('mute: should do nothing if there are no video tracks to mute', async () => {
    jest.spyOn(handler, 'getSendersByTrackType').mockReturnValue([] as any);

    const outbound = new MockStream();
    outbound._tracks = [new MockTrack('audio')];
    session._outboundStream = outbound as any;

    await handler.setVideoMute(session, { sessionId: session.id, mute: true });

    expect(mockSdk.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unable to find outbound camera'), expect.any(Object));
  });

  it('mute: should mute video track when there is no screen track and remove track from outboundStream', async () => {
    const track = new MockTrack() as any;

    const outbound = new MockStream();
    jest.spyOn(outbound, 'removeTrack');
    outbound._tracks = [track];
    session._outboundStream = outbound as any;

    jest.spyOn(handler, 'getSendersByTrackType').mockReturnValue([
      { track }
    ] as any);

    await handler.setVideoMute(session, { sessionId: session.id, mute: true });

    expect(track.stop).toHaveBeenCalled();
    expect(outbound.removeTrack).toHaveBeenCalledWith(track);
    expect(handler.removeMediaFromSession).toHaveBeenCalled();
    expect(session.mute).toHaveBeenCalledWith(userId, 'video');
    expect(session.videoMuted).toBeTruthy();
  });

  it('mute: should end track even if there is no sender', async () => {
    const track = new MockTrack() as any;

    const outbound = new MockStream();
    jest.spyOn(outbound, 'removeTrack');
    outbound._tracks = [track];
    session._outboundStream = outbound as any;

    jest.spyOn(handler, 'getSendersByTrackType').mockReturnValue([] as any);

    await handler.setVideoMute(session, { sessionId: session.id, mute: true });

    expect(track.stop).toHaveBeenCalled();
    expect(outbound.removeTrack).toHaveBeenCalledWith(track);
    expect(handler.removeMediaFromSession).not.toHaveBeenCalled();
    expect(session.mute).toHaveBeenCalledWith(userId, 'video');
    expect(session.videoMuted).toBeTruthy();
  });

  it('mute: should respect skipServerUpdate param', async () => {
    const track = new MockTrack() as any;

    jest.spyOn(handler, 'getSendersByTrackType').mockReturnValue([
      { track }
    ] as any);

    session._outboundStream = {
      removeTrack: jest.fn(),
      getVideoTracks: jest.fn().mockReturnValue([track])
    } as any;

    await handler.setVideoMute(session, { sessionId: session.id, mute: true }, true);

    expect(track.stop).toHaveBeenCalled();
    expect(handler.removeMediaFromSession).toHaveBeenCalled();
    expect(session.mute).not.toHaveBeenCalled();
    expect(session.videoMuted).toBeTruthy();
  });

  it('unmute: should respect skipServerUpdate param', async () => {
    const stream = new MockStream(true);
    const spy = jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(stream as any);
    jest.spyOn(handler, 'addMediaToSession').mockResolvedValue(null);

    session._outboundStream = {
      addTrack: jest.fn()
    } as any;

    await handler.setVideoMute(session, { sessionId: session.id, mute: false }, true);

    expect(spy).toHaveBeenCalled();
    expect(session.unmute).not.toHaveBeenCalled();
    expect(session.mute).not.toHaveBeenCalled();
    expect(session.videoMuted).toBeFalsy();
  });

  it('unmute: should add new media to session', async () => {
    const stream = new MockStream(true);
    const spy = jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(stream as any);
    jest.spyOn(handler, 'addMediaToSession').mockResolvedValue(null);

    session._outboundStream = {
      addTrack: jest.fn()
    } as any;

    await handler.setVideoMute(session, { sessionId: session.id, mute: false });

    expect(spy).toHaveBeenCalledWith({ video: true, session });
    expect(session._outboundStream.addTrack).toHaveBeenCalledWith(stream.getTracks()[0]);
    expect(session.unmute).toHaveBeenCalledWith(userId, 'video');
    expect(session.mute).not.toHaveBeenCalled();
    expect(session.videoMuted).toBeFalsy();
  });

  it('unmute: should use unmuteDeviceId to request media', async () => {
    const unmuteDeviceId = 'device-id';
    const stream = new MockStream(true);
    const spy = jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(stream as any);
    jest.spyOn(handler, 'addMediaToSession').mockResolvedValue(null);

    session._outboundStream = {
      addTrack: jest.fn()
    } as any;

    await handler.setVideoMute(session, { sessionId: session.id, mute: false, unmuteDeviceId });

    expect(spy).toHaveBeenCalledWith({ video: unmuteDeviceId, session });
    expect(session._outboundStream.addTrack).toHaveBeenCalledWith(stream.getTracks()[0]);
    expect(session.unmute).toHaveBeenCalledWith(userId, 'video');
    expect(session.mute).not.toHaveBeenCalled();
    expect(session.videoMuted).toBeFalsy();
  });
});

describe('setAudioMute', () => {
  let session: IExtendedMediaSession;

  beforeEach(() => {
    jest.spyOn(handler, 'removeMediaFromSession').mockResolvedValue(null);
    session = new MockSession() as any;
  });

  it('should mute audio', async () => {
    const track = new MockTrack() as any;
    track.enabled = true;

    jest.spyOn(handler, 'getSendersByTrackType').mockReturnValue([
      { track }
    ] as any);

    await handler.setAudioMute(session, { sessionId: session.id, mute: true });

    expect(session.mute).toHaveBeenCalledWith(userId, 'audio');
    expect(session.audioMuted).toBeTruthy();
    expect(track.enabled).toBeFalsy();
  });

  it('should update local state but not server if there is no media to mute', async () => {
    jest.spyOn(handler, 'getSendersByTrackType').mockReturnValue([] as any);

    await handler.setAudioMute(session, { sessionId: session.id, mute: true });

    expect(session.mute).not.toHaveBeenCalled();
    expect(session.audioMuted).toBeTruthy();
  });

  it('should unmute audio', async () => {
    const track = new MockTrack() as any;
    track.enabled = false;

    jest.spyOn(handler, 'getSendersByTrackType').mockReturnValue([
      { track }
    ] as any);

    jest.spyOn(mockSdk.media, 'startMedia');

    await handler.setAudioMute(session, { sessionId: session.id, mute: false });

    expect(mockSdk.media.startMedia).not.toHaveBeenCalled();
    expect(session.unmute).toHaveBeenCalledWith(userId, 'audio');
    expect(session.audioMuted).toBeFalsy();
    expect(track.enabled).toBeTruthy();
  });

  it('should create media when unmuting if audio does not exist', async () => {
    jest.spyOn(handler, 'getSendersByTrackType').mockReturnValue([] as any);

    const track = {};
    const media = { getAudioTracks: jest.fn().mockReturnValue([track]) } as any;
    jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(media);
    jest.spyOn(handler, 'addReplaceTrackToSession').mockResolvedValue(null);

    await handler.setAudioMute(session, { sessionId: session.id, mute: false });

    expect(mockSdk.media.startMedia).toHaveBeenCalledWith({ audio: true, session });
    expect(handler.addReplaceTrackToSession).toHaveBeenCalledWith(session, track);
    expect(session.unmute).toHaveBeenCalledWith(userId, 'audio');
    expect(session.audioMuted).toBeFalsy();
  });

  it('should create media with passed in unmuteDeviceId when unmuting if audio does not exist', async () => {
    const unmuteDeviceId = 'device-id';

    jest.spyOn(handler, 'getSendersByTrackType').mockReturnValue([] as any);
    const track = {};
    const media = { getAudioTracks: jest.fn().mockReturnValue([track]) } as any;
    jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(media);
    jest.spyOn(handler, 'addReplaceTrackToSession').mockResolvedValue(null);

    await handler.setAudioMute(session, { sessionId: session.id, mute: false, unmuteDeviceId });

    expect(mockSdk.media.startMedia).toHaveBeenCalledWith({ audio: unmuteDeviceId, session });
    expect(handler.addReplaceTrackToSession).toHaveBeenCalledWith(session, track);
    expect(mockSdk.updateOutgoingMedia).toHaveBeenCalledWith({ audioDeviceId: unmuteDeviceId });
    expect(session.unmute).toHaveBeenCalledWith(userId, 'audio');
    expect(session.audioMuted).toBeFalsy();
  });
});

describe('handleMediaChangeEvent', () => {
  it('should update on-screen and speakers', () => {
    jest.spyOn(handler, 'updateParticipantsOnScreen').mockReturnValue(null);
    jest.spyOn(handler, 'updateSpeakers').mockReturnValue(null);

    handler.handleMediaChangeEvent(new MockSession() as any, {} as any);

    expect(handler.updateParticipantsOnScreen).toHaveBeenCalled();
    expect(handler.updateSpeakers).toHaveBeenCalled();
  });
});

describe('getSendersByTrackType', () => {
  it('should only return senders with a track and matching the track type', () => {
    const track1 = { track: { kind: 'audio' } };
    const track2 = { track: { kind: 'audio' } };
    const session = new MockSession();
    (session.pc as any).getSenders = () => [
      track1,
      { track: null },
      { track: { kind: 'video' } },
      { track: null },
      track2
    ];

    const senders = handler.getSendersByTrackType(session as any, 'audio');

    expect(senders.length).toBe(2);
    expect(senders).toContain(track1);
    expect(senders).toContain(track2);
  });
});

describe('startScreenShare', () => {
  let displayMediaSpy: jest.SpyInstance<Promise<MediaStream>>;
  let videoMuteSpy: jest.SpyInstance<Promise<void>>;
  let addReplaceTrackToSession: jest.SpyInstance<Promise<any>>;
  let session: IExtendedMediaSession;

  beforeEach(() => {
    displayMediaSpy = jest.spyOn(mockSdk.media, 'startDisplayMedia').mockResolvedValue(new MockStream({ video: true }) as any);
    videoMuteSpy = jest.spyOn(handler, 'setVideoMute').mockResolvedValue();
    addReplaceTrackToSession = jest.spyOn(handler, 'addReplaceTrackToSession').mockResolvedValue();
    session = new MockSession() as any;
  });

  it('should start media and mute video if it is not already muted', async () => {
    await handler.startScreenShare(session);

    expect(displayMediaSpy).toHaveBeenCalled();
    expect(videoMuteSpy).toHaveBeenCalled();
    expect(addReplaceTrackToSession).toHaveBeenCalled();
    expect(mockSessionManager.webrtcSessions.notifyScreenShareStart).toHaveBeenCalled();
  });

  it('should not mute video if already muted', async () => {
    session.videoMuted = true;
    await handler.startScreenShare(session);

    expect(displayMediaSpy).toHaveBeenCalled();
    expect(videoMuteSpy).not.toHaveBeenCalled();
    expect(addReplaceTrackToSession).toHaveBeenCalled();
    expect(mockSessionManager.webrtcSessions.notifyScreenShareStart).toHaveBeenCalled();
  });

  it('should throw if screen share failed to start', async () => {
    const error = new Error('fake');
    displayMediaSpy.mockRejectedValue(error);

    await expect(handler.startScreenShare(session)).rejects.toThrowError(/Failed to start screen share/);
  });

  it('should log message if rejected and no error', async () => {
    displayMediaSpy.mockRejectedValue(null);
    const logSpy = jest.spyOn(mockSdk.logger, 'info');

    await handler.startScreenShare(session);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('screen selection cancelled'), {
      conversationId: session.conversationId,
      sessionId: session.id
    });
  });
});

describe('stopScreenShare', () => {
  let videoMuteSpy;
  let removeMediaSpy;
  let session;

  beforeEach(() => {
    videoMuteSpy = jest.spyOn(handler, 'setVideoMute').mockResolvedValue();
    removeMediaSpy = jest.spyOn(handler, 'removeMediaFromSession').mockResolvedValue();
    session = new MockSession();
  });

  it('should do nothing if there is no active screen share', async () => {
    session._screenShareStream = null;

    await handler.stopScreenShare(session);

    expect(videoMuteSpy).not.toHaveBeenCalled();
    expect(removeMediaSpy).not.toHaveBeenCalled();
    expect(mockSessionManager.webrtcSessions.notifyScreenShareStop).not.toHaveBeenCalled();
  });

  it('should stop screen share tracks and unmute video if resurrectVideoOnScreenShareEnd', async () => {
    session._resurrectVideoOnScreenShareEnd = true;
    session._screenShareStream = new MockStream({ video: true });

    await handler.stopScreenShare(session);

    expect(videoMuteSpy).toHaveBeenCalled();
    expect(session._screenShareStream._tracks[0].stop).toHaveBeenCalled();
    expect(mockSessionManager.webrtcSessions.notifyScreenShareStop).toHaveBeenCalled();
  });

  it('should not unmute video if not resurrect', async () => {
    session.resurrectVideoOnScreenShareEnd = false;
    session._screenShareStream = new MockStream({ video: true });

    const replaceSpy = jest.fn();
    jest.spyOn(session.pc, 'getSenders').mockReturnValue([{ track: session._screenShareStream._tracks[0], replaceTrack: replaceSpy }]);

    await handler.stopScreenShare(session);

    expect(videoMuteSpy).not.toHaveBeenCalled();
    expect(session._screenShareStream._tracks[0].stop).toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalled();
    expect(mockSessionManager.webrtcSessions.notifyScreenShareStop).toHaveBeenCalled();
  });
});

describe('attachIncomingTrackToElement', () => {
  it('should attach to audio element', () => {
    const audio = document.createElement('audio');
    const video = document.createElement('video');

    const track = new MockTrack();
    track.kind = 'audio';
    const fakeStream = {};
    jest.spyOn(mediaUtils, 'createNewStreamWithTrack').mockReturnValue(fakeStream as any);

    handler.attachIncomingTrackToElement(track as any, { audioElement: audio, videoElement: video });

    expect(audio.srcObject).toBe(fakeStream);
    expect(video.srcObject).toBeUndefined();
    expect(audio.autoplay).toBeTruthy();
    expect(audio.muted).toBeFalsy();
  });

  it('should attach to video element', () => {
    const audio = document.createElement('audio');
    const video = document.createElement('video');

    const track = new MockTrack();
    track.kind = 'video';
    const fakeStream = {};
    jest.spyOn(mediaUtils, 'createNewStreamWithTrack').mockReturnValue(fakeStream as any);

    handler.attachIncomingTrackToElement(track as any, { audioElement: audio, videoElement: video });

    expect(video.srcObject).toBe(fakeStream);
    expect(audio.srcObject).toBeUndefined();
    expect(video.autoplay).toBeTruthy();
    expect(video.muted).toBeTruthy();
  });
});

describe('pinParticipantVideo', () => {
  let videoMuteSpy;
  let removeMediaSpy;
  let session;
  let localParticipant: IConversationParticipant;

  beforeEach(() => {
    videoMuteSpy = jest.spyOn(handler, 'setVideoMute').mockResolvedValue();
    removeMediaSpy = jest.spyOn(handler, 'removeMediaFromSession').mockResolvedValue();
    session = new MockSession();
    localParticipant = {
      address: null,
      confined: null,
      direction: null,
      id: uuid(),
      state: CommunicationStates.connected,
      purpose: 'user',
      userId: uuid(),
      muted: false,
      videoMuted: false
    };
  });

  it('should throw if no local participant', async () => {
    await expect(handler.pinParticipantVideo(session, '123')).rejects.toThrowError(/Unable to pin participant video/);
  });

  it('should throw if request fails', async () => {
    const errorSpy = jest.spyOn(utils, 'createAndEmitSdkError');
    const fakeErr = { message: 'someError' };
    jest.spyOn(utils, 'requestApi').mockRejectedValue(fakeErr);

    const eventSpy = jest.fn();
    session.on('pinnedParticipant', eventSpy);
    session.pcParticipant = { id: 'fake' };
    const targetParticipcant = '123jid';
    await expect(handler.pinParticipantVideo(session, targetParticipcant)).rejects.toThrowError();

    expect(eventSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(SdkErrorTypes.generic, 'Request to pin video failed', {
      conversationId: session.conversationId,
      sessionId: session.id,
      error: fakeErr
    });
  });

  it('should pin participant', async () => {
    const targetParticipcant = '123jid';
    session.pcParticipant = localParticipant;
    jest.spyOn(utils, 'requestApi').mockResolvedValue({});
    const eventSpy = jest.fn();
    session.on('pinnedParticipant', eventSpy);
    await handler.pinParticipantVideo(session, targetParticipcant);

    const expectedParams = {
      data: JSON.stringify({ targetParticipantId: targetParticipcant, streamType: 'video' }),
      method: 'post'
    };
    expect(utils.requestApi).toHaveBeenCalledWith(expect.anything(), expectedParams);
    expect(eventSpy).toHaveBeenCalledWith({ participantId: targetParticipcant });
  });

  it('should unpin participant', async () => {
    session.pcParticipant = localParticipant;
    jest.spyOn(utils, 'requestApi').mockResolvedValue({});
    const eventSpy = jest.fn();
    session.on('pinnedParticipant', eventSpy);
    await handler.pinParticipantVideo(session, null);

    const expectedParams = {
      method: 'delete'
    };
    expect(utils.requestApi).toHaveBeenCalledWith(expect.anything(), expectedParams);
    expect(eventSpy).toHaveBeenCalledWith({ participantId: null });
  });
});

describe('getTrackIdFromSdp()', () => {
  it('should return `undefined` for bad sdps', () => {
    let sdp: string;
    /* no sdp */
    expect(handler.getTrackIdFromSdp(sdp, 'audio')).toBe(undefined);

    /* no delimiters */
    sdp = 'v=0';
    expect(handler.getTrackIdFromSdp(sdp, 'audio')).toBe(undefined);

    /* no requested media type */
    sdp = `v=0
m=video 1 UDP/TLS/RTP/SAVPF 96
a=msid:cbf2ec37-5e50-4ac4-9ae7-1d1dc4508071 19d58781-f708-4945-be91-2758052273bd`;
    expect(handler.getTrackIdFromSdp(sdp, 'audio')).toBe(undefined);

    /* no msid */
    sdp = `v=0
m=audio 1 UDP/TLS/RTP/SAVPF 96`;
    expect(handler.getTrackIdFromSdp(sdp, 'audio')).toBe(undefined);

    /* no track */
    sdp = `v=0
m=audio 1 UDP/TLS/RTP/SAVPF 96
a=msid:cbf2ec37-5e50-4ac4-9ae7-1d1dc4508071`;
    expect(handler.getTrackIdFromSdp(sdp, 'audio')).toBe(undefined);
  });

  it('should return the trackId for a given media type', () => {
    const trackId = '19d58781-f708-4945-be91-2758052273bd';
    const sdp = `v=0
m=audio 1 UDP/TLS/RTP/SAVPF 96
a=msid:cbf2ec37-5e50-4ac4-9ae7-1d1dc4508071 ${trackId} `; /* should trim this blank space */
    expect(handler.getTrackIdFromSdp(sdp, 'audio')).toBe(trackId);
  });
});
