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
  let mockVideoTrack1: MockTrack;
  let mockVideoTrack2: MockTrack;
  let mockAudioTrack: MockTrack;
  let createNewStreamSpy: jest.SpyInstance;

  beforeEach(() => {
    session = new MockSession() as any;
    mockVideoTrack1 = new MockTrack('video');
    mockVideoTrack2 = new MockTrack('video');
    mockAudioTrack = new MockTrack('audio');
    createNewStreamSpy = jest.spyOn(mediaUtils, 'createNewStreamWithTrack').mockReturnValue(new MockStream() as any);
  });

  it('should throw if no video element is provided', async () => {
    await expect(handler.acceptSessionForObserver(session, { audioElement: document.createElement('audio') } as any))
      .rejects.toThrowError(/requires videoElements array or videoElement/);
  });

  it('should process existing video tracks and attach to video elements', async () => {
    const video1 = document.createElement('video');
    const video2 = document.createElement('video');
    const video3 = document.createElement('video');
    const videoElements = [video1, video2, video3];

    // Mock receivers with video tracks
    const mockReceivers = [
      { track: mockVideoTrack1 },
      { track: mockVideoTrack2 },
      { track: mockAudioTrack } // Should be filtered out
    ];
    session.pc.getReceivers = jest.fn().mockReturnValue(mockReceivers);

    const emitSpy = jest.spyOn(session, 'emit');
    const logSpy = jest.spyOn(handler, 'log' as any);

    await handler.acceptSessionForObserver(session, { videoElements } as any);

    // Should create streams for video tracks only
    expect(createNewStreamSpy).toHaveBeenCalledTimes(2);
    expect(createNewStreamSpy).toHaveBeenCalledWith(mockVideoTrack1);
    expect(createNewStreamSpy).toHaveBeenCalledWith(mockVideoTrack2);

    // Each video track should attach to one video element sequentially
    expect(video1.srcObject).toBeDefined();
    expect(video1.muted).toBe(true);
    expect(video1.autoplay).toBe(true);
    expect(video2.srcObject).toBeDefined();
    expect(video2.muted).toBe(true);
    expect(video2.autoplay).toBe(true);
    expect(video3.srcObject).toBeUndefined(); // Third element unused

    expect(emitSpy).toHaveBeenCalledWith('incomingMedia');
    expect(emitSpy).toHaveBeenCalledTimes(2); // Once per video track
    expect(logSpy).toHaveBeenCalledWith('info', expect.stringContaining('Accepting live screen monitoring session as observer'));
  });

  it('should handle less than maximum video elements gracefully', async () => {
    const video1 = document.createElement('video');
    const videoElements = [video1]; // Only one video element for two tracks

    const mockReceivers = [
      { track: mockVideoTrack1 },
      { track: mockVideoTrack2 }
    ];
    session.pc.getReceivers = jest.fn().mockReturnValue(mockReceivers);

    const emitSpy = jest.spyOn(session, 'emit');

    await handler.acceptSessionForObserver(session, { videoElements } as any);

    // Only first track should be attached since we only have one video element
    expect(video1.srcObject).toBeDefined();
    expect(video1.muted).toBe(true);
    expect(video1.autoplay).toBe(true);

    // Both tracks should still emit incomingMedia events
    expect(emitSpy).toHaveBeenCalledTimes(2);
    expect(createNewStreamSpy).toHaveBeenCalledTimes(1);
  });

  it('should use videoElement field when no videoElements provided', async () => {
    const videoElement = document.createElement('video');

    const mockReceivers = [{ track: mockVideoTrack1 }];
    session.pc.getReceivers = jest.fn().mockReturnValue(mockReceivers);

    const emitSpy = jest.spyOn(session, 'emit');

    await handler.acceptSessionForObserver(session, { videoElement } as any);

    expect(videoElement.srcObject).toBeDefined();
    expect(videoElement.muted).toBe(true);
    expect(videoElement.autoplay).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith('incomingMedia');
    expect(createNewStreamSpy).toHaveBeenCalledWith(mockVideoTrack1);
  });

  it('should use default video element when no videoElements or videoElement provided', async () => {
    const defaultVideo = document.createElement('video');
    mockSdk._config.defaults!.videoElement = defaultVideo;

    const mockReceivers = [{ track: mockVideoTrack1 }];
    session.pc.getReceivers = jest.fn().mockReturnValue(mockReceivers);

    const emitSpy = jest.spyOn(session, 'emit');

    await handler.acceptSessionForObserver(session, {} as any);

    expect(defaultVideo.srcObject).toBeDefined();
    expect(defaultVideo.muted).toBe(true);
    expect(defaultVideo.autoplay).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith('incomingMedia');
    expect(createNewStreamSpy).toHaveBeenCalledWith(mockVideoTrack1);
  });

  it('should handle case with no video tracks', async () => {
    const video1 = document.createElement('video');
    const videoElements = [video1];

    // Mock receivers with no video tracks
    const mockReceivers = [
      { track: mockAudioTrack },
      { track: null } // Receiver without track
    ];
    session.pc.getReceivers = jest.fn().mockReturnValue(mockReceivers);

    const emitSpy = jest.spyOn(session, 'emit');

    await handler.acceptSessionForObserver(session, { videoElements } as any);

    expect(createNewStreamSpy).not.toHaveBeenCalled();
    expect(video1.srcObject).toBeUndefined();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should log appropriate messages during processing', async () => {
    const video1 = document.createElement('video');
    const video2 = document.createElement('video');
    const video3 = document.createElement('video');
    const videoElements = [video1, video2, video3];

    const mockReceivers = [{ track: mockVideoTrack1 }];
    session.pc.getReceivers = jest.fn().mockReturnValue(mockReceivers);

    const logSpy = jest.spyOn(handler, 'log' as any);

    await handler.acceptSessionForObserver(session, { videoElements } as any);

    expect(logSpy).toHaveBeenCalledWith('info',
      expect.stringContaining('Accepting live screen monitoring session as observer with 3 available video elements for 1 receivers with 1 video tracks')
    );
    expect(logSpy).toHaveBeenCalledWith('info',
      expect.stringContaining('Attached stream to video element at index 0'),
      expect.objectContaining({ streamId: expect.any(String) })
    );
  });

  it('should work correctly with sufficient video elements for multiple tracks', async () => {
    const video1 = document.createElement('video');
    const video2 = document.createElement('video');
    const video3 = document.createElement('video');
    const video4 = document.createElement('video');
    const videoElements = [video1, video2, video3, video4];

    const mockReceivers = [
      { track: mockVideoTrack1 },
      { track: mockVideoTrack2 }
    ];
    session.pc.getReceivers = jest.fn().mockReturnValue(mockReceivers);

    const emitSpy = jest.spyOn(session, 'emit');
    const logSpy = jest.spyOn(handler, 'log' as any);

    await handler.acceptSessionForObserver(session, { videoElements } as any);

    // Each track should attach to one video element sequentially
    expect(video1.srcObject).toBeDefined(); // Track 1
    expect(video2.srcObject).toBeDefined(); // Track 2
    expect(video3.srcObject).toBeUndefined(); // Unused
    expect(video4.srcObject).toBeUndefined(); // Unused

    expect(emitSpy).toHaveBeenCalledTimes(2);
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
