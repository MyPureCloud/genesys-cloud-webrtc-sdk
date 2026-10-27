/* eslint @typescript-eslint/no-explicit-any: "off" */
import {
  SimpleMockSdk,
  MockSession,
  flushPromises
} from '../test-utils';
import { GenesysCloudWebrtcSdk, SessionTypes } from '../../src';
import { SdkErrorTypes } from '../../src/types/enums';
import { SessionManager } from '../../src/sessions/session-manager';
import VideoSessionHandler from '../../src/sessions/video-session-handler';
import ScreenShareSessionHandler from '../../src/sessions/screen-share-session-handler';
import ScreenRecordingSessionHandler from '../../src/sessions/screen-recording-session-handler';
import LiveMonitoringSessionHandler from '../../src/sessions/live-monitoring-session-handler';

/**
 * Integration tests for the four session handlers that had 0% branch coverage.
 * Each is instantiated REAL with a SimpleMockSdk + real SessionManager; only
 * external systems (HTTP, streaming webrtcSessions) are faked.
 *
 * Focus is the negative branches each handler enforces: "not supported"
 * guards, missing-media/element validation, API-failure rethrows, and the
 * auto-accept propose decision branches.
 */
describe('Session handler coverage (integration)', () => {
  let mockSdk: GenesysCloudWebrtcSdk;
  let sessionManager: SessionManager;

  beforeEach(() => {
    mockSdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtcSdk;
    mockSdk._personDetails = { id: 'USER_GUID', chat: { jabberId: 'me@genesys.com' } } as any;
    sessionManager = new SessionManager(mockSdk);
  });

  afterEach(() => jest.restoreAllMocks());

  /* ───────────────── ScreenShare ───────────────── */
  describe('ScreenShareSessionHandler', () => {
    let handler: ScreenShareSessionHandler;
    beforeEach(() => { handler = new ScreenShareSessionHandler(mockSdk, sessionManager); });

    it('routesAcdJidToThisHandler', () => {
      expect(handler.shouldHandleSessionByJid('acd-123@conference.com')).toBe(true);
      expect(handler.shouldHandleSessionByJid('peer-123@conference.com')).toBe(false);
    });

    it('throwsNotSupportedOnUpdateOutgoingMedia', () => {
      const session = new MockSession(SessionTypes.acdScreenShare);
      expect(() => handler.updateOutgoingMedia(session as any, {} as any))
        .toThrow(expect.objectContaining({ type: SdkErrorTypes.not_supported }));
    });
  });

  /* ───────────────── ScreenRecording ───────────────── */
  describe('ScreenRecordingSessionHandler', () => {
    let handler: ScreenRecordingSessionHandler;
    beforeEach(() => { handler = new ScreenRecordingSessionHandler(mockSdk, sessionManager); });

    it('routesScreenRecordingJidToThisHandler', () => {
      expect(handler.shouldHandleSessionByJid('screenrecording-1@conf.com')).toBe(true);
      expect(handler.shouldHandleSessionByJid('acd-1@conf.com')).toBe(false);
    });

    it('throwsSessionErrorWhenAcceptingWithoutMediaStream', async () => {
      const session = new MockSession(SessionTypes.screenRecording);
      await expect(
        handler.acceptSession(session as any, {} as any)
      ).rejects.toHaveProperty('type', SdkErrorTypes.session);
    });

    it('throwsNotSupportedWhenAcceptingWithoutMetadatas', async () => {
      const session = new MockSession(SessionTypes.screenRecording);
      await expect(
        handler.acceptSession(session as any, { mediaStream: {} as any } as any)
      ).rejects.toHaveProperty('type', SdkErrorTypes.not_supported);
    });

    it('throwsNotSupportedWhenEndingLocally', async () => {
      const session = new MockSession(SessionTypes.screenRecording);
      await expect(
        handler.endSession('conv-1', session as any)
      ).rejects.toHaveProperty('type', SdkErrorTypes.not_supported);
    });

    it('throwsNotSupportedOnUpdateOutgoingMedia', () => {
      const session = new MockSession(SessionTypes.screenRecording);
      expect(() => handler.updateOutgoingMedia(session as any, {} as any))
        .toThrow(expect.objectContaining({ type: SdkErrorTypes.not_supported }));
    });

    it('autoAcceptsProposeWhenConfigured', async () => {
      mockSdk._config.autoAcceptPendingScreenRecordingRequests = true;
      const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(undefined as any);
      await handler.handlePropose({ id: 's1', conversationId: 'c1' } as any);
      expect(proceedSpy).toHaveBeenCalled();
    });

    it('emitsPendingSessionWhenNotAutoAccepting', async () => {
      mockSdk._config.autoAcceptPendingScreenRecordingRequests = false;
      const superPropose = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'handlePropose').mockResolvedValue(undefined as any);
      await handler.handlePropose({ id: 's1', conversationId: 'c1' } as any);
      expect(superPropose).toHaveBeenCalled();
    });
  });

  /* ───────────────── LiveMonitoring ───────────────── */
  describe('LiveMonitoringSessionHandler', () => {
    let handler: LiveMonitoringSessionHandler;
    beforeEach(() => { handler = new LiveMonitoringSessionHandler(mockSdk, sessionManager); });

    it('routesLiveMonitorJidToThisHandler', () => {
      expect(handler.shouldHandleSessionByJid('livemonitor-1@conf.com')).toBe(true);
      expect(handler.shouldHandleSessionByJid('acd-1@conf.com')).toBe(false);
    });

    it('throwsNotSupportedWhenTargetEndsSession', async () => {
      handler._liveMonitoringObserver = false;
      const session = new MockSession(SessionTypes.liveScreenMonitoring);
      await expect(
        handler.endSession('conv-1', session as any)
      ).rejects.toHaveProperty('type', SdkErrorTypes.not_supported);
    });

    it('allowsObserverToEndSession', async () => {
      handler._liveMonitoringObserver = true;
      const session = new MockSession(SessionTypes.liveScreenMonitoring);
      const superEnd = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'endSession').mockResolvedValue(undefined as any);
      await handler.endSession('conv-1', session as any);
      expect(superEnd).toHaveBeenCalled();
    });

    it('throwsSessionErrorWhenTargetAcceptsWithoutMediaStream', async () => {
      const session = new MockSession(SessionTypes.liveScreenMonitoring);
      await expect(
        handler.acceptSessionForTarget(session as any, {} as any)
      ).rejects.toHaveProperty('type', SdkErrorTypes.session);
    });

    it('throwsInvalidOptionsWhenObserverAcceptsWithoutVideoElements', async () => {
      const session = new MockSession(SessionTypes.liveScreenMonitoring);
      session.pc.getReceivers = jest.fn().mockReturnValue([]) as any;
      await expect(
        handler.acceptSessionForObserver(session as any, {} as any)
      ).rejects.toHaveProperty('type', SdkErrorTypes.invalid_options);
    });

    it('throwsNotSupportedOnUpdateOutgoingMedia', () => {
      const session = new MockSession(SessionTypes.liveScreenMonitoring);
      expect(() => handler.updateOutgoingMedia(session as any, {} as any))
        .toThrow(expect.objectContaining({ type: SdkErrorTypes.not_supported }));
    });

    it('autoAcceptsProposeWhenTargetIsCurrentUser', async () => {
      const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(undefined as any);
      await handler.handlePropose({ id: 's1', conversationId: 'c1', fromUserId: 'USER_GUID' } as any);
      expect(proceedSpy).toHaveBeenCalled();
      expect(handler._liveMonitoringObserver).toBe(false);
    });
  });

  /* ───────────────── Video ───────────────── */
  describe('VideoSessionHandler', () => {
    let handler: VideoSessionHandler;
    beforeEach(() => { handler = new VideoSessionHandler(mockSdk, sessionManager); });

    it('routesVideoJidToThisHandler', () => {
      expect(handler.shouldHandleSessionByJid('peer-1@conference.com')).toBe(true);
      expect(handler.shouldHandleSessionByJid('acd-1@conf.com')).toBe(false);
    });

    /* Video start-session HTTP flows are covered BLACK-BOX against a real mock
     * server in video-http.test.ts. */

    it('autoAcceptsProposeForRequestedSession', async () => {
      handler.requestedSessions['room-jid'] = true;
      const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(undefined as any);
      await handler.handlePropose({ id: 's1', conversationId: 'c1', originalRoomJid: 'room-jid' } as any);
      expect(proceedSpy).toHaveBeenCalled();
    });

    it('ignoresPeerVideoProposeStartedByAnotherClientForSameUser', async () => {
      const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(undefined as any);
      const superPropose = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'handlePropose').mockResolvedValue(undefined as any);
      await handler.handlePropose({
        id: 's1', conversationId: 'c1', originalRoomJid: 'x',
        fromJid: 'peer-1@conference.com', fromUserId: 'USER_GUID'
      } as any);
      expect(proceedSpy).not.toHaveBeenCalled();
      expect(superPropose).not.toHaveBeenCalled();
    });

    it('throwsSessionErrorWhenPinningWithUnknownLocalParticipant', async () => {
      const session = new MockSession(SessionTypes.collaborateVideo);
      (session as any).pcParticipant = null;
      await expect(
        handler.pinParticipantVideo(session as any, 'target-1')
      ).rejects.toHaveProperty('type', SdkErrorTypes.session);
      await flushPromises();
    });
  });
});
