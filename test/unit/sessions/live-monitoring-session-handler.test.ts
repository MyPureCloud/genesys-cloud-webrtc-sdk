import {SimpleMockSdk, MockSession, MockStream, MockTrack} from '../../test-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import LiveMonitoringSessionHandler from '../../../src/sessions/live-monitoring-session-handler';
import * as utils from '../../../src/utils';
import BaseSessionHandler from "../../../src/sessions/base-session-handler";
import * as mediaUtils from "../../../src/media/media-utils";
import {
  LiveScreenMonitoringSession,
} from "../../../src";

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

  it('should auto-accept as target when current user is the fromUserId', async () => {
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(null);
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose').mockResolvedValue(null);

    mockSdk._config.autoAcceptPendingLiveScreenMonitoringRequests = false;
    const pendingSession = { fromUserId: 'user123' } as any;

    await handler.handlePropose(pendingSession);

    expect(handler._liveMonitoringObserver).toBe(false);
    expect(proceedSpy).toHaveBeenCalledWith(pendingSession);
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('should not accept session if not autoAcceptPendingLiveScreenMonitoringRequests and user is not observer', async () => {
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(null);
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose').mockResolvedValue(null);

    mockSdk._config.autoAcceptPendingLiveScreenMonitoringRequests = false;
    const pendingSession = { fromUserId: 'different-user' } as any;

    await handler.handlePropose(pendingSession);

    expect(handler._liveMonitoringObserver).toBe(false);
    expect(proceedSpy).not.toHaveBeenCalled();
    expect(superSpy).toHaveBeenCalledWith(pendingSession);
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

  it('should preserve liveMonitoringObserver flag set in handlePropose', async () => {
    const params = { conversationId: session.conversationId };
    handler._liveMonitoringObserver = true; // Simulate flag set in handlePropose

    await handler.acceptSession(session as any, params);

    expect(handler._liveMonitoringObserver).toBe(true);
    expect(acceptSessionForObserverSpy).toHaveBeenCalledWith(session, params);
    expect(acceptSessionForTargetSpy).not.toHaveBeenCalled();
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
  let session: LiveScreenMonitoringSession;

  beforeEach(() => {
    session = new MockSession() as any;
  });

  it('should throw if no video element is provided', async () => {
    await expect(handler.acceptSession(session, { conversationId: session.conversationId, liveMonitoringObserver: true, audioElement: document.createElement('audio') })).rejects.toThrowError(/requires videoElements array or videoElement/);
  });

  it('should attach mediaStreams to video elements when provided', async () => {
    const video1 = document.createElement('video');
    const video2 = document.createElement('video');
    const videoElements = [video1, video2];

    const stream1 = new MockStream({ video: true }) as any;
    const stream2 = new MockStream({ video: true }) as any;
    const metadata1 = { screenId: 'screen1', trackId: 'track1', originX: 0, originY: 0, resolutionX: 1920, resolutionY: 1080, primary: true };
    const metadata2 = { screenId: 'screen2', trackId: 'track2', originX: 1920, originY: 0, resolutionX: 1920, resolutionY: 1080, primary: false };

    const mediaStreams = [
      { stream: stream1, metadata: metadata1 },
      { stream: stream2, metadata: metadata2 }
    ];

    const emitSpy = jest.spyOn(session, 'emit');

    await handler.acceptSession(session, {
      conversationId: session.conversationId,
      liveMonitoringObserver: true,
      videoElements,
      mediaStreams
    });

    expect(video1.srcObject).toBe(stream1);
    expect(video1.muted).toBe(true);
    expect(video1.autoplay).toBe(true);

    expect(video2.srcObject).toBe(stream2);
    expect(video2.muted).toBe(true);
    expect(video2.autoplay).toBe(true);

    expect(emitSpy).toHaveBeenCalledWith('incomingMedia');
  });

  it('should only attach streams up to the number of available video elements', async () => {
    const video1 = document.createElement('video');
    const videoElements = [video1]; // Only one video element

    const stream1 = new MockStream({ video: true }) as any;
    const stream2 = new MockStream({ video: true }) as any;
    const metadata = { screenId: 'screen1', trackId: 'track1', originX: 0, originY: 0, resolutionX: 1920, resolutionY: 1080, primary: true };

    const mediaStreams = [
      { stream: stream1, metadata },
      { stream: stream2, metadata } // This won't be attached
    ];

    await handler.acceptSession(session, {
      conversationId: session.conversationId,
      liveMonitoringObserver: true,
      videoElements,
      mediaStreams
    });

    expect(video1.srcObject).toBe(stream1);
    // stream2 should not be attached anywhere
  });

  it('should use videoElement field when no videoElements provided ', async () => {
    const videoElement = document.createElement('video');

    const stream1 = new MockStream({ video: true }) as any;
    const stream2 = new MockStream({ video: true }) as any;
    const metadata = { screenId: 'screen1', trackId: 'track1', originX: 0, originY: 0, resolutionX: 1920, resolutionY: 1080, primary: true };

    const mediaStreams = [
      { stream: stream1, metadata },
      { stream: stream2, metadata } // This won't be attached
    ];

    await handler.acceptSession(session, {
      conversationId: session.conversationId,
      liveMonitoringObserver: true,
      videoElement,
      mediaStreams
    });

    expect(videoElement.srcObject).toBe(stream1);
    // stream2 should not be attached anywhere
  });

  it('should use default video element when no videoElements or videoElement provided', async () => {
    const defaultVideo = document.createElement('video');
    mockSdk._config.defaults!.videoElement = defaultVideo;

    const stream = new MockStream({ video: true }) as any;
    const metadata = { screenId: 'screen1', trackId: 'track1', originX: 0, originY: 0, resolutionX: 1920, resolutionY: 1080, primary: true };
    const mediaStreams = [{ stream, metadata }];

    await handler.acceptSession(session, {
      conversationId: session.conversationId,
      liveMonitoringObserver: true,
      mediaStreams
    });

    expect(defaultVideo.srcObject).toBe(stream);
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
