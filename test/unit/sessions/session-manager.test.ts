import { PureCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import { SimpleMockSdk, createPendingSession, MockSession, createSessionInfo } from '../../test-utils';
import { SessionTypes } from '../../../src/types/enums';
import { IUpdateOutgoingMedia } from '../../../src/types/interfaces';
import * as mediaUtils from '../../../src/media-utils';

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

describe('handleConversationUpdate', () => {
  it('should find all session that match the conversationId and call the associated handlers', () => {
    const conversationId = 'convoid123';
    const session1 = {
      conversationId
    };

    const session2 = {
      conversationId: 'not this one'
    };

    const session3 = {
      conversationId
    };

    mockSdk._streamingConnection._webrtcSessions.jingleJs = {
      sessions: {
        1: session1,
        2: session2,
        3: session3
      }
    };

    const spy = jest.fn();
    const fakeHandler = { handleConversationUpdate: spy };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(fakeHandler as any);

    const fakeUpdate = {
      id: conversationId
    };
    sessionManager.handleConversationUpdate(fakeUpdate as any);
    expect(spy).toBeCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(session1, fakeUpdate);
    expect(spy).toHaveBeenCalledWith(session3, fakeUpdate);
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
    await expect(sessionManager.acceptSession({} as any)).rejects.toThrowError(/sessionId is required/);
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

describe('setVideoMute', () => {
  it('should proxy to handler', async () => {
    const spy = jest.fn();
    const fakeHandler = { setVideoMute: spy };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(fakeHandler as any);

    const fakeSession = {} as any;
    jest.spyOn(sessionManager, 'getSession').mockReturnValue(fakeSession);

    const params = { id: '1', mute: true };
    await sessionManager.setVideoMute(params);

    expect(spy).toHaveBeenCalledWith(fakeSession, params);
  });
});

describe('setAudioMute', () => {
  it('should proxy to handler', async () => {
    const spy = jest.fn();
    const fakeHandler = { setAudioMute: spy };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(fakeHandler as any);

    const fakeSession = {} as any;
    jest.spyOn(sessionManager, 'getSession').mockReturnValue(fakeSession);

    const params = { id: '1', mute: true };
    await sessionManager.setAudioMute(params);

    expect(spy).toHaveBeenCalledWith(fakeSession, params);
  });
});

describe('getAllActiveSessions()', () => {
  test('should return all active sessions as an array', () => {
    const sessionsObject = {
      'session-1': { id: 'session-1', active: true },
      'session-2': { id: 'session-2', active: true },
      'session-3': { id: 'session-3', active: false },
    };
    const expectedArray = [sessionsObject['session-1'], sessionsObject['session-2']];

    mockSdk._streamingConnection._webrtcSessions.jingleJs = { sessions: sessionsObject };
    expect(sessionManager.getAllActiveSessions()).toEqual(expectedArray);
  });
});

describe('updateOutgoingMedia()', () => {
  test('should call the handler to updateOutgoingMedia with the passed in session', async () => {
    const session = {} as any;
    const options: IUpdateOutgoingMedia = { session, videoDeviceId: 'deviceId' };

    const getSessionSpy = jest.spyOn(sessionManager, 'getSession');
    const mockSessionHandler = { updateOutgoingMedia: jest.fn() };
    const getSessionHandlerSpy = jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockSessionHandler as any);

    await sessionManager.updateOutgoingMedia(options);

    expect(getSessionSpy).not.toHaveBeenCalled();
    expect(getSessionHandlerSpy).toHaveBeenCalledWith({ jingleSession: session });
    expect(mockSessionHandler.updateOutgoingMedia).toHaveBeenCalledWith(session, options);
  });

  test('should find the session by id and call the handler to updateOutgoingMedia', async () => {
    const session = {} as any;
    const options: IUpdateOutgoingMedia = { sessionId: 'abc123', videoDeviceId: 'deviceId' };

    const getSessionSpy = jest.spyOn(sessionManager, 'getSession').mockReturnValue(session);
    const mockSessionHandler = { updateOutgoingMedia: jest.fn() };
    const getSessionHandlerSpy = jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockSessionHandler as any);

    await sessionManager.updateOutgoingMedia(options);

    expect(getSessionSpy).toHaveBeenCalledWith({ id: 'abc123' });
    expect(getSessionHandlerSpy).toHaveBeenCalledWith({ jingleSession: session });
    expect(mockSessionHandler.updateOutgoingMedia).toHaveBeenCalledWith(session, options);
  });
});

describe('updateOutgoingMediaForAllSessions()', () => {
  test('should call the handler to updateOutgoingMedia for all sessions', async () => {
    const sessions = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const videoDeviceId = 'video-device';
    const audioDeviceId = 'audio-device';

    jest.spyOn(sessionManager, 'getAllActiveSessions').mockReturnValue(sessions as any);
    jest.spyOn(sessionManager, 'updateOutgoingMedia').mockResolvedValue(undefined);

    await sessionManager.updateOutgoingMediaForAllSessions({ videoDeviceId, audioDeviceId });

    expect(sessionManager.getAllActiveSessions).toHaveBeenCalled();
    expect(mockSdk.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Updating outgoing deviceId(s) for all active sessions'),
      expect.any(Object));

    sessions.forEach(session => {
      expect(sessionManager.updateOutgoingMedia).toHaveBeenCalledWith({ session, videoDeviceId, audioDeviceId });
    });
  });
});

describe('updateOutputDeviceForAllSessions()', () => {
  test('should log and return if outputDeviceId cannot be found', async () => {
    const outputDeviceId = 'device-id';
    jest.spyOn(mediaUtils, 'getValidDeviceId').mockResolvedValue(undefined);
    jest.spyOn(sessionManager, 'getAllActiveSessions');

    await sessionManager.updateOutputDeviceForAllSessions(outputDeviceId);

    expect(mediaUtils.getValidDeviceId).toHaveBeenCalledWith(mockSdk, 'audiooutput', outputDeviceId);
    expect(sessionManager.getAllActiveSessions).not.toHaveBeenCalled();
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Output deviceId not found. Not updating output media'),
      { outputDeviceId }
    );
  });

  test('should call the handler to update all active, non-screenshare sessions', async () => {
    const outputDeviceId = 'device-id';
    const sessions = [
      { id: '1', sessionType: SessionTypes.collaborateVideo },
      { id: '2', sessionType: SessionTypes.softphone },
      { id: '3', sessionType: SessionTypes.acdScreenShare }
    ];
    const mockSessionHandler = { updateOutputDevice: jest.fn() };

    jest.spyOn(mediaUtils, 'getValidDeviceId').mockResolvedValue(outputDeviceId);
    jest.spyOn(sessionManager, 'getAllActiveSessions').mockReturnValue(sessions as any);
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockSessionHandler as any);

    await sessionManager.updateOutputDeviceForAllSessions(outputDeviceId);

    expect(mediaUtils.getValidDeviceId).toHaveBeenCalledWith(mockSdk, 'audiooutput', outputDeviceId);
    expect(sessionManager.getAllActiveSessions).toHaveBeenCalled();

    sessions
      .filter(session => session.sessionType !== SessionTypes.acdScreenShare)
      .forEach(session => {
        expect(sessionManager.getSessionHandler).toHaveBeenCalledWith({ jingleSession: session });
        expect(mockSessionHandler.updateOutputDevice).toHaveBeenCalledWith(session, outputDeviceId);
      });
  });
});
