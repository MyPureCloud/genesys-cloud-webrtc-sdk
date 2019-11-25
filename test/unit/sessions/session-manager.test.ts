import { PureCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import { SimpleMockSdk, createPendingSession, MockSession, createSessionInfo } from '../../test-utils';
import { SessionTypes } from '../../../src/types/enums';

let mockSdk: PureCloudWebrtcSdk;
let sessionManager: SessionManager;

beforeEach(() => {
  jest.clearAllMocks();
  mockSdk = (new SimpleMockSdk() as any);
  (mockSdk as any).isGuest = true;
  mockSdk._config.autoConnectSessions = true;

  sessionManager = new SessionManager(mockSdk);
});

it('webrtcSessions should map to the sdk webrtcSession', () => {
  const webrtcSessions = mockSdk._streamingConnection.webrtcSessions;

  expect(sessionManager.webrtcSessions).toBe(webrtcSessions);
});

describe('getPendingSession', () => {
  it('should find session by sessionId', () => {
    const pendingSession1 = createPendingSession();
    const pendingSession2 = createPendingSession();
    sessionManager.pendingSessions[pendingSession1.id] = pendingSession1;
    sessionManager.pendingSessions[pendingSession2.id] = pendingSession2;

    expect(sessionManager.getPendingSession(pendingSession1.id)).toBe(pendingSession1);
    expect(sessionManager.getPendingSession(pendingSession2.id)).toBe(pendingSession2);
  });
});

describe('getSession', () => {
  let session1: any;
  let session2: any;

  beforeEach(() => {
    session1 = new MockSession();
    session2 = new MockSession();

    mockSdk._streamingConnection._webrtcSessions.jingleJs = {
      sessions: { [session1.sid]: session1, [session2.sid]: session2 }
    };
  });

  it('should get session by sessionId', () => {
    expect(sessionManager.getSession({ id: session1.id })).toBe(session1);
    expect(sessionManager.getSession({ id: session2.id })).toBe(session2);
  });

  it('should get session by conversationId', () => {
    expect(sessionManager.getSession({ conversationId: session1.conversationId })).toBe(session1);
    expect(sessionManager.getSession({ conversationId: session2.conversationId })).toBe(session2);
  });

  it('should throw is no session is found', () => {
    expect(() => sessionManager.getSession({ id: 'fakeId' })).toThrowError(/Unable to find session/);
  });
});

describe('removePendingSession', () => {
  it('should remove pending session by sessionId', () => {
    const pendingSession1 = createPendingSession();
    const pendingSession2 = createPendingSession();
    sessionManager.pendingSessions[pendingSession1.id] = pendingSession1;
    sessionManager.pendingSessions[pendingSession2.id] = pendingSession2;

    expect(Object.values(sessionManager.pendingSessions).length).toBe(2);

    sessionManager.removePendingSession(pendingSession1.id);

    expect(Object.values(sessionManager.pendingSessions).length).toBe(1);
    expect(sessionManager.pendingSessions[pendingSession1.id]).toBeUndefined();
  });
});

describe('getSessionHandler', () => {
  let mockHandler: any;
  beforeEach(() => {
    mockHandler = {
      shouldHandleSessionByJid: jest.fn()
    };

    sessionManager.sessionHandlers = [mockHandler];
  });

  it('should get by sessionType', () => {
    mockHandler.sessionType = SessionTypes.softphone;
    const handler = sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    expect(handler).toBe(mockHandler);
  });

  it('should get by sessionInfo jid', () => {
    (mockHandler.shouldHandleSessionByJid as jest.Mock).mockReturnValue(true);
    const jid = 'lsdkfjsdjk';
    const sessionInfo: any = {
      fromJid: jid
    };
    const handler = sessionManager.getSessionHandler({ sessionInfo });

    expect(handler).toBe(mockHandler);
    expect(mockHandler.shouldHandleSessionByJid).toHaveBeenCalledWith(jid);
  });

  it('should get by jingleSession peerID', () => {
    (mockHandler.shouldHandleSessionByJid as jest.Mock).mockReturnValue(true);
    const jid = '555kjsdjf';
    const jingleSession: any = {
      peerID: jid
    };
    const handler = sessionManager.getSessionHandler({ jingleSession });

    expect(handler).toBe(mockHandler);
    expect(mockHandler.shouldHandleSessionByJid).toHaveBeenCalledWith(jid);
  });

  it('should throw if no identifying params provided', () => {
    expect(() => sessionManager.getSessionHandler({})).toThrowError(/getSessionHandler was called/);
  });

  it('should throw if handler not found', () => {
    (mockHandler.shouldHandleSessionByJid as jest.Mock).mockReturnValue(false);
    const jid = '555kjsdjf';
    const jingleSession: any = {
      peerID: jid
    };

    expect(() => sessionManager.getSessionHandler({ jingleSession })).toThrowError(/Failed to find/);
  });
});

describe('startSession', () => {
  it('should call startSession on the session handler', async () => {
    const mockHandler: any = {
      startSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const mockParams = { sessionType: SessionTypes.softphone };
    await sessionManager.startSession(mockParams);
    expect(mockHandler.startSession).toHaveBeenCalledWith(mockParams);
  });
});

describe('onPropose', () => {
  it('should add pendingSession and call handlePropose on session handler with pending session', async () => {
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue(null);

    const mockHandler: any = {
      handlePropose: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const sessionInfo = createSessionInfo();
    await sessionManager.onPropose(sessionInfo);

    expect(mockHandler.handlePropose).toHaveBeenCalled();
    expect(sessionManager.pendingSessions[sessionInfo.sessionId]).toBeTruthy();
  });

  it('should ignore if pendingSession already exists', async () => {
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue({} as any);

    const mockHandler: any = {
      handlePropose: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const sessionInfo = createSessionInfo();

    await sessionManager.onPropose(sessionInfo);

    expect(mockHandler.handlePropose).not.toHaveBeenCalled();
  });
});

describe('proceedWithSession', () => {
  it('should throw if no pending session', async () => {
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue(null);

    const mockHandler: any = {
      proceedWithSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const sessionInfo = createSessionInfo();
    await expect(sessionManager.proceedWithSession(sessionInfo.sessionId)).rejects.toThrowError(/Could not find a pendingSession/);

    expect(mockHandler.proceedWithSession).not.toHaveBeenCalled();
  });

  it('should call proceedWithSession on the session handler', async () => {
    const pendingSession: any = {};
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    const mockHandler: any = {
      proceedWithSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    await sessionManager.proceedWithSession('asldkfj');

    expect(mockHandler.proceedWithSession).toHaveBeenCalled();
  });
});

describe('onSessionInit', () => {
  it('should call handleSessionInit for the session handler and set the sessionType on the session', async () => {
    const session: any = {};

    const mockHandler: any = {
      sessionType: SessionTypes.acdScreenShare,
      handleSessionInit: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    await sessionManager.onSessionInit(session);

    expect(mockHandler.handleSessionInit).toHaveBeenCalled();
    expect(session.sessionType).toEqual(SessionTypes.acdScreenShare);
  });
});

describe('acceptSession', () => {
  it('should call acceptSession for the session handler and set the sessionType on the session', async () => {
    const session: any = {};

    const mockHandler: any = {
      sessionType: SessionTypes.acdScreenShare,
      acceptSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);
    jest.spyOn(sessionManager, 'getSession').mockReturnValue(session);

    await sessionManager.acceptSession({ id: 'asdf' });

    expect(mockHandler.acceptSession).toHaveBeenCalled();
  });

  it('should throw if called without a sessionId', async () => {
    await expect(sessionManager.acceptSession({ } as any)).rejects.toThrowError(/sessionId is required/);
  });
});

describe('endSession', () => {
  it('should call acceptSession for the session handler and set the sessionType on the session', async () => {
    const session: any = {};

    const mockHandler: any = {
      sessionType: SessionTypes.acdScreenShare,
      endSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);
    jest.spyOn(sessionManager, 'getSession').mockReturnValue(session);

    await sessionManager.endSession({ id: '123' });

    expect(mockHandler.endSession).toHaveBeenCalled();
  });

  it('should throw if no id or conversationId in params', async () => {
    await expect(sessionManager.endSession({})).rejects.toThrowError(/must provide session id or conversationId/);
  });
});
