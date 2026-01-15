import {SimpleMockSdk, MockSession, MockStream, MockTrack} from '../../test-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import LiveMonitoringSessionHandler from '../../../src/sessions/live-monitoring-session-handler';
import * as utils from '../../../src/utils';
import BaseSessionHandler from "../../../src/sessions/base-session-handler";
import * as mediaUtils from "../../../src/media/media-utils";
import {IExtendedMediaSession, LiveScreenMonitoringSession, VideoMediaSession} from "../../../src";

// Mock MediaStream for tests
(window as any).MediaStream = MockStream;

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
    attachIncomingTrackToElementSpy = jest.spyOn(handler, 'attachIncomingTrackToElement').mockReturnValue({} as HTMLMediaElement);
    startMediaSpy = jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(media);
    session = new MockSession() as any;
  });

  it('should throw if no video element is provided', async () => {
    await expect(handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true, audioElement: document.createElement('audio') })).rejects.toThrowError(/requires a videoElement/);
  });

  it('should use default elements and combine multiple tracks', async () => {
    const video = mockSdk._config.defaults!.videoElement = document.createElement('video');
    const emitSpy = jest.spyOn(session, 'emit');

    const track1 = { id: 'track1', kind: 'video' } as any;
    const track2 = { id: 'track2', kind: 'video' } as any;
    jest.spyOn(session.pc, 'getReceivers').mockReturnValue([
      { track: track1 },
      { track: track2 }
    ] as any);

    await handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true });

    expect(parentHandlerSpy).toHaveBeenCalled();
    expect(video.srcObject).toBeInstanceOf(MediaStream);
    expect((video.srcObject as MediaStream).getTracks()).toHaveLength(2);
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith('incomingMedia');
  });


  it('should handle tracks that arrive later and combine them', async () => {
    const video = document.createElement('video');

    jest.spyOn(session.pc, 'getReceivers').mockReturnValue([]);

    await handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true, videoElement: video });
    expect(parentHandlerSpy).toHaveBeenCalled();
    expect(video.srcObject).toBeFalsy();

    const track1 = { id: 'track1', kind: 'video' } as any;
    const track2 = { id: 'track2', kind: 'video' } as any;

    session.emit('peerTrackAdded', track1);
    expect(video.srcObject).toBeInstanceOf(MockStream);
    expect((video.srcObject as any).getTracks()).toHaveLength(1);

    session.emit('peerTrackAdded', track2);
    expect((video.srcObject as any).getTracks()).toHaveLength(2);
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

    expect(handler._liveMonitoringObserver).toBeFalsy();
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

describe('attachIncomingTrackToElement', () => {
  it('should attach to video element', () => {
    const video = document.createElement('video');

    const track = new MockTrack();
    track.kind = 'video';
    const fakeStream = {};
    jest.spyOn(mediaUtils, 'createNewStreamWithTrack').mockReturnValue(fakeStream as any);

    handler.attachIncomingTrackToElement(track as any, { videoElement: video });

    expect(video.srcObject).toBe(fakeStream);
    expect(video.autoplay).toBeTruthy();
    expect(video.muted).toBeTruthy();
  });
});

describe('acceptSessionForObserver - multiple tracks', () => {
  it('should combine multiple video tracks into single stream', async () => {
    const video = document.createElement('video');
    const session = new MockSession() as any;
    const emitSpy = jest.spyOn(session, 'emit');

    const track1 = { id: 'track1', kind: 'video' } as any;
    const track2 = { id: 'track2', kind: 'video' } as any;
    const track3 = { id: 'track3', kind: 'audio' } as any;

    jest.spyOn(session.pc, 'getReceivers').mockReturnValue([
      { track: track1 },
      { track: track2 },
      { track: track3 }
    ] as any);

    await handler.acceptSessionForObserver(session, {
      conversationId: session.conversationId,
      videoElement: video
    } as any);

    const stream = video.srcObject as MediaStream;
    expect(stream).toBeInstanceOf(MediaStream);
    expect(stream.getTracks()).toHaveLength(3);
    expect(stream.getTracks()).toContain(track1);
    expect(stream.getTracks()).toContain(track2);
    expect(stream.getTracks()).toContain(track3);
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith('incomingMedia');
  });
});
