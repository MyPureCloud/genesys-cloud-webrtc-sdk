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

  it('should set outbound stream and add tracks with individual streams', async () => {
    const mockStream = new MockStream({ video: true });
    const session = new MockSession();
    const addTrackSpy = jest.fn().mockResolvedValue(null);
    const createNewStreamSpy = jest.spyOn(mediaUtils, 'createNewStreamWithTrack').mockReturnValue(new MockStream() as any);
    session.pc.addTrack = addTrackSpy;

    const params = { mediaStream: mockStream };
    await handler.acceptSessionForTarget(session as any, params as any);

    expect(session._outboundStream).toBe(mockStream);
    expect(createNewStreamSpy).toHaveBeenCalledTimes(mockStream.getTracks().length);
    expect(addTrackSpy).toHaveBeenCalledTimes(mockStream.getTracks().length);
    // Verify addTrack is called with both track and stream
    mockStream.getTracks().forEach((track, index) => {
      expect(addTrackSpy).toHaveBeenNthCalledWith(index + 1, track, expect.any(MockStream));
    });
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

  it('should set up ontrack event handler for incoming streams', async () => {
    const video1 = document.createElement('video');
    const video2 = document.createElement('video');
    const videoElements = [video1, video2];

    const mockStream1 = new MockStream({ video: true }) as any;
    const mockStream2 = new MockStream({ video: true }) as any;
    const emitSpy = jest.spyOn(session, 'emit');

    await handler.acceptSession(session, {
      conversationId: session.conversationId,
      liveMonitoringObserver: true,
      videoElements
    });

    // Verify ontrack handler is set
    expect(session.pc.ontrack).toBeDefined();

    // Simulate track events
    session.pc.ontrack({ streams: [mockStream1] } as any);
    session.pc.ontrack({ streams: [mockStream2] } as any);

    expect(video1.srcObject).toBe(mockStream1);
    expect(video1.muted).toBe(true);
    expect(video1.autoplay).toBe(true);

    expect(video2.srcObject).toBe(mockStream2);
    expect(video2.muted).toBe(true);
    expect(video2.autoplay).toBe(true);

    expect(emitSpy).toHaveBeenCalledWith('incomingMedia');
    expect(emitSpy).toHaveBeenCalledTimes(2);
  });

  it('should only attach streams up to the number of available video elements', async () => {
    const video1 = document.createElement('video');
    const videoElements = [video1]; // Only one video element

    const mockStream1 = new MockStream({ video: true }) as any;
    const mockStream2 = new MockStream({ video: true }) as any;

    await handler.acceptSession(session, {
      conversationId: session.conversationId,
      liveMonitoringObserver: true,
      videoElements
    });

    // Simulate track events
    session.pc.ontrack({ streams: [mockStream1] } as any);
    session.pc.ontrack({ streams: [mockStream2] } as any);

    expect(video1.srcObject).toBe(mockStream1);
    // Second stream should not be attached since no more video elements
  });

  it('should use videoElement field when no videoElements provided', async () => {
    const videoElement = document.createElement('video');
    const mockStream = new MockStream({ video: true }) as any;

    await handler.acceptSession(session, {
      conversationId: session.conversationId,
      liveMonitoringObserver: true,
      videoElement
    });

    // Simulate track event
    session.pc.ontrack({ streams: [mockStream] } as any);

    expect(videoElement.srcObject).toBe(mockStream);
  });

  it('should use default video element when no videoElements or videoElement provided', async () => {
    const defaultVideo = document.createElement('video');
    mockSdk._config.defaults!.videoElement = defaultVideo;
    const mockStream = new MockStream({ video: true }) as any;

    await handler.acceptSession(session, {
      conversationId: session.conversationId,
      liveMonitoringObserver: true
    });

    // Simulate track event
    session.pc.ontrack({ streams: [mockStream] } as any);

    expect(defaultVideo.srcObject).toBe(mockStream);
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
