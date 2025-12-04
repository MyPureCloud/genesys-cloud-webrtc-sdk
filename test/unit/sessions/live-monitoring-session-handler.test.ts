import {SimpleMockSdk, MockSession, MockStream, MockTrack} from '../../test-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import LiveMonitoringSessionHandler from '../../../src/sessions/live-monitoring-session-handler';
import * as utils from '../../../src/utils';
import BaseSessionHandler from "../../../src/sessions/base-session-handler";
import * as mediaUtils from "../../../src/media/media-utils";
import {IExtendedMediaSession, LiveScreenMonitoringSession, VideoMediaSession} from "../../../src";

let handler: LiveMonitoringSessionHandler;
let mockSdk: GenesysCloudWebrtcSdk;
let mockSessionManager: SessionManager;

beforeEach(() => {
  jest.clearAllMocks();
  mockSdk = (new SimpleMockSdk() as any);
  mockSdk._personDetails = {
    id: 'user123',
    name: 'name',
    chat: { jabberId: 'user@example.com' }
  };

  mockSessionManager = new SessionManager(mockSdk);
  handler = new LiveMonitoringSessionHandler(mockSdk, mockSessionManager);
});

describe('shouldHandleSessionByJid', () => {
  it('should return true for monitor jids', () => {
    jest.spyOn(utils, 'isLiveScreenMonitorJid').mockReturnValue(true);
    expect(handler.shouldHandleSessionByJid('livemonitor-123@conference.example.com')).toBeTruthy();
  });

  it('should return false for non-monitor jids', () => {
    jest.spyOn(utils, 'isLiveScreenMonitorJid').mockReturnValue(false);
    expect(handler.shouldHandleSessionByJid('regular-session@example.com')).toBeFalsy();
  });
});

describe('handleConversationUpdate', () => {
  it('should be a no-op', () => {
    expect(() => handler.handleConversationUpdate()).not.toThrow();
  });
});

describe('handlePropose', () => {
  it('should immediately accept session if autoAcceptPendingLiveScreenMonitoringRequests', async () => {
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(null);
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose').mockResolvedValue(null);

    mockSdk._config.autoAcceptPendingLiveScreenMonitoringRequests = true;
    await handler.handlePropose({} as any);

    expect(proceedSpy).toHaveBeenCalled();
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('should not accept session if not autoAcceptPendingLiveScreenMonitoringRequests', async () => {
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(null);
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose').mockResolvedValue(null);

    mockSdk._config.autoAcceptPendingLiveScreenMonitoringRequests = false;
    await handler.handlePropose({} as any);

    expect(proceedSpy).not.toHaveBeenCalled();
    expect(superSpy).toHaveBeenCalled();
  });
});

describe('acceptSession', () => {
  let session: MockSession;
  let mockStream: MockStream;
  let acceptSessionForObserverSpy: jest.SpyInstance;
  let acceptSessionForTargetSpy: jest.SpyInstance;
  let superAcceptSessionSpy: jest.SpyInstance;

  beforeEach(() => {
    session = new MockSession();
    mockStream = new MockStream({ video: true });
    acceptSessionForObserverSpy = jest.spyOn(handler, 'acceptSessionForObserver').mockResolvedValue(null);
    acceptSessionForTargetSpy = jest.spyOn(handler, 'acceptSessionForTarget').mockResolvedValue(null);
    superAcceptSessionSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession').mockResolvedValue(null);
  });

  it('should call acceptSessionForObserver when liveMonitoringObserver is true', async () => {
    const params = { conversationId: session.conversationId, liveMonitoringObserver: true };

    await handler.acceptSession(session as any, params);

    expect(handler._liveMonitoringObserver).toBe(true);
    expect(acceptSessionForObserverSpy).toHaveBeenCalledWith(session, params);
    expect(acceptSessionForTargetSpy).not.toHaveBeenCalled();
    expect(superAcceptSessionSpy).toHaveBeenCalledWith(session, params);
  });

  it('should call acceptSessionForTarget when liveMonitoringObserver is false', async () => {
    const params = { conversationId: session.conversationId, liveMonitoringObserver: false };

    await handler.acceptSession(session as any, params);

    expect(handler._liveMonitoringObserver).toBe(false);
    expect(acceptSessionForTargetSpy).toHaveBeenCalledWith(session, params);
    expect(acceptSessionForObserverSpy).not.toHaveBeenCalled();
    expect(superAcceptSessionSpy).toHaveBeenCalledWith(session, params);
  });

  it('should default liveMonitoringObserver to false when not provided', async () => {
    const params = { conversationId: session.conversationId };

    await handler.acceptSession(session as any, params);

    expect(handler._liveMonitoringObserver).toBe(false);
    expect(acceptSessionForTargetSpy).toHaveBeenCalledWith(session, params);
    expect(acceptSessionForObserverSpy).not.toHaveBeenCalled();
    expect(superAcceptSessionSpy).toHaveBeenCalledWith(session, params);
  });
});

describe('acceptSessionForTarget', () => {
  it('should throw error if no mediaStream provided', async () => {
    const session = new MockSession();
    await expect(handler.acceptSessionForTarget(session as any, {} as any))
      .rejects.toThrow('Cannot accept live screen monitoring session without providing a media stream');
  });

  it('should set outbound stream and add tracks', async () => {
    const mockStream = new MockStream({ video: true });
    const session = new MockSession();
    const addTrackSpy = jest.fn().mockResolvedValue(null);
    session.pc.addTrack = addTrackSpy;

    const params = { mediaStream: mockStream };
    await handler.acceptSessionForTarget(session as any, params as any);

    expect(session._outboundStream).toBe(mockStream);
    expect(addTrackSpy).toHaveBeenCalledTimes(mockStream.getTracks().length);
  });
});

describe('acceptSessionForObserver', () => {
  let parentHandlerSpy: jest.SpyInstance<Promise<any>>;
  let addMediaToSessionSpy: jest.SpyInstance<Promise<void>>;
  let attachIncomingTrackToElementSpy: jest.SpyInstance<HTMLAudioElement>;
  let startMediaSpy: jest.SpyInstance<Promise<MediaStream>>;
  let initialMutesSpy: jest.SpyInstance<Promise<any>>; /* keep this spy */
  let session: LiveScreenMonitoringSession;
  let media: MediaStream;

  beforeEach(() => {
    media = new MockStream() as any;
    parentHandlerSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession').mockResolvedValue(null);
    addMediaToSessionSpy = jest.spyOn(handler, 'addMediaToSession').mockResolvedValue();
    attachIncomingTrackToElementSpy = jest.spyOn(handler, 'attachIncomingTrackToElement').mockReturnValue({} as HTMLMediaElement);
    startMediaSpy = jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(media);
    initialMutesSpy = jest.spyOn(handler, 'setInitialMuteStates').mockResolvedValue();
    session = new MockSession() as any;
    jest.spyOn(handler, 'setupTransceivers').mockReturnValue();
  });

  it('should throw if no audio element provided', async () => {
    await expect(handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true })).rejects.toThrowError(/requires an audioElement/);
  });

  it('should throw if no video element is provided', async () => {
    await expect(handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true, audioElement: document.createElement('audio') })).rejects.toThrowError(/requires a videoElement/);
  });

  it('should use default elements', async () => {
    const audio = mockSdk._config.defaults!.audioElement = document.createElement('audio');
    const video = mockSdk._config.defaults!.videoElement = document.createElement('video');

    const incomingTrack = {} as any;
    jest.spyOn(session.pc, 'getReceivers').mockReturnValue([{ track: incomingTrack }] as any);

    attachIncomingTrackToElementSpy.mockReturnValue(audio);

    await handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true });

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

    await handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true, audioElement: audio, videoElement: video, mediaStream: stream });

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
    await handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true, audioElement: audio, videoElement: video });
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
    await handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true, audioElement: audio, videoElement: video });
    expect(startMediaSpy).toHaveBeenCalledWith({ video: false, audio: true, session });

    /* with no audio devices */
    setDevices([{ kind: 'videoinput' } as any]);
    await handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true, audioElement: audio, videoElement: video });
    expect(startMediaSpy).toHaveBeenCalledWith({ video: true, audio: false, session });
  });

  it('should subscribe to media change events', async () => {
    const audio = document.createElement('audio');
    const video = document.createElement('video');
    await handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true, audioElement: audio, videoElement: video });

    expect(mockSdk._streamingConnection.notifications.subscribe).toHaveBeenCalled();
  });

  it('should attach tracks later if not available', async () => {
    const audio = document.createElement('audio');
    const video = document.createElement('video');

    attachIncomingTrackToElementSpy.mockReturnValue(audio);

    await handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true, audioElement: audio, videoElement: video });
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

    await handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true, audioElement: audio, videoElement: video });
    expect(attachIncomingTrackToElementSpy).not.toHaveBeenCalled();
    expect(parentHandlerSpy).toHaveBeenCalled();
    expect(startMediaSpy).toHaveBeenCalled();

    const incomingTrack = {} as any;
    session.emit('peerTrackAdded', incomingTrack);

    expect(attachIncomingTrackToElementSpy).toHaveBeenCalledWith(incomingTrack, { videoElement: video, audioElement: audio });
    expect(session._outputAudioElement).toBe(undefined);
  });
});

describe('isLiveMonitoringObserver', () => {
  it('should return true when session has _liveMonitoringObserver set to true', () => {
    handler._liveMonitoringObserver = true;
    expect(handler.isLiveMonitoringObserver()).toBe(true);
  });

  it('should return false when session has _liveMonitoringObserver set to false', () => {
    handler._liveMonitoringObserver = false;
    expect(handler.isLiveMonitoringObserver()).toBe(false);
  });

  it('should return false when session has no _liveMonitoringObserver property', () => {
    handler._liveMonitoringObserver = undefined;
    expect(handler.isLiveMonitoringObserver()).toBe(false);
  });
});

describe('setInitialMuteStates', () => {
  let session: IExtendedMediaSession;
  let audioSender;
  let videoSender;
  beforeEach(() => {
    session = new MockSession() as any;
    audioSender = { track: { kind: 'audio', enabled: true } };
    videoSender = { track: { kind: 'video', enabled: true, id: 'camera-track-1' } };
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
    delete (session.pc as any).addTransceiver;

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
  it('should throw an error when monitoring target tries to end the session', async () => {
    const session = { _liveMonitoringObserver: false } as any;
    handler._liveMonitoringObserver = false;
    await expect(handler.endSession('conversation123', session)).rejects.toThrow('Live monitoring target cannot end the session');
  });

  it('should allow monitoring observers to end the session', async () => {
    const superSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'endSession').mockResolvedValue(null);
    const session = { _liveMonitoringObserver: true } as any;
    handler._liveMonitoringObserver = true;

    await handler.endSession('conversation123', session);

    expect(handler._liveMonitoringObserver).toBeUndefined();
    expect(superSpy).toHaveBeenCalledWith('conversation123', session, undefined);
  });
});

describe('updateOutgoingMedia', () => {
  it('should throw not supported error', () => {
    const session = new MockSession();
    const options = { videoDeviceId: 'device1' };
    const logSpy = jest.spyOn(handler, 'log' as any);

    expect(() => handler.updateOutgoingMedia(session as any, options as any))
      .toThrow('Cannot update outgoing media for live monitoring sessions');

    expect(logSpy).toHaveBeenCalledWith('warn',
      'Cannot update outgoing media for live monitoring sessions',
      { sessionId: session.id, sessionType: session.sessionType }
    );
  });
});

describe('updateParticipantsOnScreen', () => {
  it('should return early if not observer', () => {
    handler._liveMonitoringObserver = false;
    const session = new MockSession();
    const event = { eventBody: { participants: [] } } as any;

    const result = handler.updateParticipantsOnScreen(session as any, event);
    expect(result).toBeUndefined();
  });

  it('should emit activeVideoParticipantsUpdate with matching participants', () => {
    handler._liveMonitoringObserver = true;
    const session = new MockSession();
    session.pc.getReceivers = jest.fn().mockReturnValue([
      { track: { kind: 'video', id: 'video-track-1' } }
    ]);
    session.pc.remoteDescription = { sdp: 'm=video\na=msid:stream video-track-2' };
    session.emit = jest.fn();

    const getTrackIdSpy = jest.spyOn(handler, 'getTrackIdFromSdp').mockReturnValue('video-track-2');

    const event = {
      eventBody: {
        participants: [{
          userId: 'user1',
          tracks: [{
            mediaType: 'video' as const,
            sinks: ['video-track-1']
          }]
        }]
      }
    };

    handler.updateParticipantsOnScreen(session as any, event as any);

    expect(session.emit).toHaveBeenCalledWith('activeVideoParticipantsUpdate', {
      participants: [{ userId: 'user1' }]
    });
  });
});

describe('updateSpeakers', () => {
  it('should return early if not observer', () => {
    handler._liveMonitoringObserver = false;
    const session = new MockSession();
    const event = { eventBody: { participants: [] } } as any;

    const result = handler.updateSpeakers(session as any, event);
    expect(result).toBeUndefined();
  });

  it('should emit speakersUpdate with matching participants', () => {
    handler._liveMonitoringObserver = true;
    const session = new MockSession();
    session.pc.getReceivers = jest.fn().mockReturnValue([
      { track: { kind: 'audio', id: 'audio-track-1' } }
    ]);
    session.pc.remoteDescription = { sdp: 'm=audio\na=msid:stream audio-track-2' };
    session.emit = jest.fn();

    const getTrackIdSpy = jest.spyOn(handler, 'getTrackIdFromSdp').mockReturnValue('audio-track-2');

    const event = {
      eventBody: {
        participants: [{
          userId: 'user1',
          tracks: [{
            mediaType: 'audio' as const,
            sinks: ['audio-track-1']
          }]
        }]
      }
    };

    handler.updateSpeakers(session as any, event as any);

    expect(session.emit).toHaveBeenCalledWith('speakersUpdate', {
      speakers: [{ userId: 'user1' }]
    });
  });
});

describe('handleMediaChangeEvent', () => {
  it('should call updateParticipantsOnScreen and updateSpeakers', () => {
    const session = new MockSession();
    const event = { eventBody: { participants: [] } } as any;

    const updateParticipantsSpy = jest.spyOn(handler, 'updateParticipantsOnScreen').mockImplementation();
    const updateSpeakersSpy = jest.spyOn(handler, 'updateSpeakers').mockImplementation();

    handler.handleMediaChangeEvent(session as any, event);

    expect(updateParticipantsSpy).toHaveBeenCalledWith(session, event);
    expect(updateSpeakersSpy).toHaveBeenCalledWith(session, event);
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

    handler.attachIncomingTrackToElement(track as any, { audioElement: audio, volume: 45, videoElement: video });

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

    handler.attachIncomingTrackToElement(track as any, { audioElement: audio, volume: 44, videoElement: video });

    expect(video.srcObject).toBe(fakeStream);
    expect(audio.srcObject).toBeUndefined();
    expect(video.autoplay).toBeTruthy();
    expect(video.muted).toBeTruthy();
  });
});

describe('getTrackIdFromSdp', () => {
  it('should extract video track ID from SDP', () => {
    const sdp = 'm=video 9 UDP/TLS/RTP/SAVPF 96\na=msid:stream video-track-123\n';
    const result = handler.getTrackIdFromSdp(sdp, 'video');
    expect(result).toBe('video-track-123');
  });

  it('should extract audio track ID from SDP', () => {
    const sdp = 'm=audio 9 UDP/TLS/RTP/SAVPF 111\na=msid:stream audio-track-456\n';
    const result = handler.getTrackIdFromSdp(sdp, 'audio');
    expect(result).toBe('audio-track-456');
  });

  it('should return undefined for invalid SDP', () => {
    const result = handler.getTrackIdFromSdp('invalid sdp', 'video');
    expect(result).toBeUndefined();
  });

  it('should return undefined for missing media type', () => {
    const sdp = 'm=audio 9 UDP/TLS/RTP/SAVPF 111\na=msid:stream audio-track-456\n';
    const result = handler.getTrackIdFromSdp(sdp, 'video');
    expect(result).toBeUndefined();
  });
});
