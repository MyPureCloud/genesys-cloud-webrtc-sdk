import { SimpleMockSdk, MockSession, createPendingSession, MockStream, MockTrack, random, getMockConversation, PARTICIPANT_ID, USER_ID, mockGetConversationApi, mockPatchConversationApi, createNock } from '../../test-utils';
import { PureCloudWebrtcSdk } from '../../../src/client';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import { SessionTypes } from '../../../src/types/enums';
import * as mediaUtils from '../../../src/media-utils';
import { SessionManager } from '../../../src/sessions/session-manager';

class TestableBaseSessionHandler extends BaseSessionHandler {
  sessionType: SessionTypes;
  shouldHandleSessionByJid (jid: string): boolean {
    return false;
  }
}

let handler: TestableBaseSessionHandler;
let mockSdk: PureCloudWebrtcSdk;
let mockSessionManager: SessionManager;

beforeEach(() => {
  jest.clearAllMocks();
  mockSdk = (new SimpleMockSdk() as any);
  (mockSdk as any).isGuest = true;
  mockSdk._config.autoConnectSessions = true;

  mockSessionManager = new SessionManager(mockSdk);
  handler = new TestableBaseSessionHandler(mockSdk, mockSessionManager);
});

describe('startSession', () => {
  it('should throw since startSession should be overridden by implementing class', async () => {
    await expect(handler.startSession({ sessionType: SessionTypes.softphone })).rejects.toThrowError(/can only be started using the purecloud api/);
  });
});

describe('handlePropose', () => {
  it('should emit pending session', async () => {
    const spy = jest.fn();
    mockSdk.on('pendingSession', spy);

    const pendingSession = createPendingSession(SessionTypes.acdScreenShare);
    await handler.handlePropose(pendingSession);

    expect(spy).toHaveBeenCalled();
  });
});

describe('proceedWithSession', () => {
  it('should call acceptRtcSession', async () => {
    const pendingSession = createPendingSession();
    await handler.proceedWithSession(pendingSession);

    expect(mockSessionManager.webrtcSessions.acceptRtcSession).toHaveBeenCalledWith(pendingSession.id);
  });
});

describe('handleSessionInit', () => {
  it('should set conversationId on existing pendingSession and emit sessionStarted', async () => {
    const session = new MockSession();
    session.conversationId = null;

    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    const eventSpy = jest.fn();
    mockSdk.on('sessionStarted', eventSpy);

    await handler.handleSessionInit(session);

    expect(mockSdk._streamingConnection.webrtcSessions.rtcSessionAccepted).toHaveBeenCalled();
    expect(session.conversationId).toEqual(pendingSession.conversationId);
    expect(eventSpy).toHaveBeenCalled();
    expect(session._statsGatherer).toBeTruthy();
  });

  it('should set up stats listener', async () => {
    const session = new MockSession();
    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    await handler.handleSessionInit(session);

    const spy: jest.Mock = mockSdk.logger.info as any;
    spy.mockReset();

    const fakeData = {};
    session._statsGatherer.emit('stats', fakeData);

    const logCall = spy.mock.calls[0];
    expect(logCall[0]).toContain('session:stats');
    expect(logCall[1].conversationId).toBe(session.conversationId);
  });

  it('should set up traces listener', async () => {
    const session = new MockSession();
    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    await handler.handleSessionInit(session);

    const spy: jest.Mock = mockSdk.logger.warn as any;
    spy.mockReset();

    const fakeData = {};
    session._statsGatherer.emit('traces', fakeData);

    const logCall = spy.mock.calls[0];
    expect(logCall[0]).toContain('session:trace');
    expect(logCall[1].conversationId).toBe(session.conversationId);
  });

  it('should set up change:active listener', async () => {
    const session = new MockSession();
    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    await handler.handleSessionInit(session);

    jest.spyOn(session._statsGatherer, 'collectInitialConnectionStats');

    const spy: jest.Mock = mockSdk.logger.info as any;
    spy.mockReset();

    session.emit('change:active', session, true);

    const logCall = spy.mock.calls[0];
    expect(logCall[0]).toContain('change:active');

    const { conversationId, sid, active } = logCall[1];
    expect(conversationId).toBe(session.conversationId);
    expect(sid).toBe(session.id);
    expect(active).toBeTruthy();
    expect(session._statsGatherer.collectInitialConnectionStats).toHaveBeenCalled();
  });

  it('should not collectInitialStats if not active', async () => {
    const session = new MockSession();
    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    await handler.handleSessionInit(session);

    jest.spyOn(session._statsGatherer, 'collectInitialConnectionStats');

    const spy: jest.Mock = mockSdk.logger.info as any;
    spy.mockReset();

    session.emit('change:active', session, false);

    const logCall = spy.mock.calls[0];
    expect(logCall[0]).toContain('change:active');

    const { conversationId, sid, active } = logCall[1];
    expect(conversationId).toBe(session.conversationId);
    expect(sid).toBe(session.id);
    expect(active).toBeFalsy();
    expect(session._statsGatherer.collectInitialConnectionStats).not.toHaveBeenCalled();
  });

  it('should set up terminated listener', async () => {
    const session = new MockSession();
    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    const spy = jest.spyOn(handler, 'onSessionTerminated');
    await handler.handleSessionInit(session);

    session.emit('terminated', session, true);
    expect(spy).toHaveBeenCalled();
  });
});

describe('onSessionTerminated', () => {
  it('should clean up outboundStream and emit sessionEnded', () => {
    const session = new MockSession();
    const stream = session._outboundStream = new MockStream();

    const spy = jest.fn();
    mockSdk.on('sessionEnded', spy);

    handler.onSessionTerminated(session, 'success');

    expect(stream._tracks[0].stop).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });
});

describe('acceptSession', () => {
  it('should call session.accept', async () => {
    const session = new MockSession();
    await handler.acceptSession(session, { id: session.id });
    expect(session.accept).toHaveBeenCalled();
  });
});

describe('endSession', () => {
  it('should call session.end', async () => {
    const session = new MockSession();
    const promise = handler.endSession(session);
    session.emit('terminated');
    await promise;
    expect(session.end).toHaveBeenCalled();
  });

  it('should reject with error', async () => {
    const session = new MockSession();
    const promise = handler.endSession(session);
    const fakeErr = new Error('fake');
    session.emit('error', fakeErr);
    await expect(promise).rejects.toThrow();
    expect(session.end).toHaveBeenCalled();
  });
});

describe('addMediatoSession', () => {
  it('should add by tracks if has tranceiver functionality', () => {
    const stream = new MockStream();
    jest.spyOn(mediaUtils, 'checkHasTransceiverFunctionality').mockReturnValue(true);

    const mockSession = {
      addTrack: jest.fn(),
      addStream: jest.fn()
    };

    handler.addMediaToSession(mockSession, stream as any);

    expect(mockSession.addTrack).toHaveBeenCalled();
    expect(mockSession.addStream).not.toHaveBeenCalled();
  });

  it('should use streams if doesn\'t have transceivers and legacyFallback is enabled', () => {
    const stream = new MockStream();
    jest.spyOn(mediaUtils, 'checkHasTransceiverFunctionality').mockReturnValue(false);

    const mockSession = {
      addTrack: jest.fn(),
      addStream: jest.fn()
    };

    handler.addMediaToSession(mockSession, stream as any);

    expect(mockSession.addTrack).not.toHaveBeenCalled();
    expect(mockSession.addStream).toHaveBeenCalled();
  });

  it('should throw if no tranceivers and legacy fallback not allowed', () => {
    const stream = new MockStream();
    jest.spyOn(mediaUtils, 'checkHasTransceiverFunctionality').mockReturnValue(false);

    const mockSession = {
      addTrack: jest.fn(),
      addStream: jest.fn()
    };

    expect(() => handler.addMediaToSession(mockSession, stream as any, false)).toThrowError(/Track based actions are required/);
    expect(mockSession.addTrack).not.toHaveBeenCalled();
    expect(mockSession.addStream).not.toHaveBeenCalled();
  });
});
