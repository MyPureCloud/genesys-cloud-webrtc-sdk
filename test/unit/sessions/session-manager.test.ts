import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import { SimpleMockSdk, createPendingSession, MockSession, MockStream, MockTrack } from '../../test-utils';
import { SessionTypes } from '../../../src/types/enums';
import { IUpdateOutgoingMedia, IExtendedMediaSession, ISdkMediaState, VideoMediaSession } from '../../../src/types/interfaces';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import SoftphoneSessionHandler from '../../../src/sessions/softphone-session-handler';
import VideoSessionHandler from '../../../src/sessions/video-session-handler';

let mockSdk: GenesysCloudWebrtcSdk;
let sessionManager: SessionManager;

function updateMockSessions (sessions: any[]) {
  (mockSdk._streamingConnection.webrtcSessions.getAllSessions as jest.Mock).mockReturnValue(sessions);
}

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

describe('addAllowedSessionType', () => {
  it('should enable sessionType', async () => {
    sessionManager = new SessionManager(mockSdk);
    const handler = sessionManager.getSessionHandler({ sessionType: 'softphone' });
    expect(handler.disabled).toBeTruthy();

    await sessionManager.addAllowedSessionType(SessionTypes.softphone);
    expect(handler.disabled).toBeFalsy();
  });
});

describe('removeAllowedSessionType', () => {
  it('should enable sessionType', async () => {
    sessionManager = new SessionManager(mockSdk);
    const handler = sessionManager.getSessionHandler({ sessionType: 'softphone' });
    handler.disabled = false;

    await sessionManager.removeAllowedSessionType(SessionTypes.softphone);
    expect(handler.disabled).toBeTruthy();
  });
});

describe('getPendingSession()', () => {
  it('should find session by conversationId and sessionType', () => {
    const pendingSession1 = createPendingSession();
    pendingSession1.sessionType = SessionTypes.screenRecording;

    const pendingSession2 = { ...pendingSession1, sessionType: SessionTypes.softphone };

    sessionManager.pendingSessions = [ pendingSession1, pendingSession2 ];

    expect(sessionManager.getPendingSession({ conversationId: pendingSession1.conversationId, sessionType: SessionTypes.softphone })).toBe(pendingSession2);
  });

  it('should find session by conversationId', () => {
    const pendingSession1 = createPendingSession();
    const pendingSession2 = createPendingSession();
    sessionManager.pendingSessions = [pendingSession1, pendingSession2];

    expect(sessionManager.getPendingSession({ conversationId: pendingSession1.conversationId })).toBe(pendingSession1);
    expect(sessionManager.getPendingSession({ conversationId: pendingSession2.conversationId })).toBe(pendingSession2);
  });

  it('should fallback to sessionId', () => {
    const pendingSession1 = createPendingSession();
    const pendingSession2 = createPendingSession();
    sessionManager.pendingSessions = [pendingSession1, pendingSession2];

    expect(sessionManager.getPendingSession({ conversationId: 'non-existent', sessionId: pendingSession2.sessionId })).toBe(pendingSession2);
  });
});

describe('handleConversationUpdate', () => {
  it('should find all session that match the sessionType and call the associated handlers', () => {
    const conversationId = 'convoid123';
    const session1 = {
      conversationId,
      sessionType: SessionTypes.collaborateVideo
    };

    const session2 = {
      conversationId: 'convoId does not matter, but this is the wrong sessionType',
      sessionType: SessionTypes.softphone
    };

    const session3 = {
      conversationId,
      sessionType: SessionTypes.collaborateVideo
    };

    updateMockSessions([session1, session2, session3]);

    const spy = jest.fn();
    const fakeHandler = { handleConversationUpdate: spy, sessionType: SessionTypes.collaborateVideo };
    sessionManager.sessionHandlers = [fakeHandler] as any;

    const fakeUpdate = {
      id: conversationId
    };
    sessionManager.handleConversationUpdate(fakeUpdate as any);
    expect(spy).toBeCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(fakeUpdate, [session1, session3]);
  });

  it('should not pass update to handler if the handler is disabled', async () => {
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

    updateMockSessions([session1, session2, session3]);

    const spy = jest.fn();
    const fakeHandler = { handleConversationUpdate: spy, disabled: true };
    sessionManager.sessionHandlers = [fakeHandler] as any;

    const fakeUpdate = {
      id: conversationId
    };
    sessionManager.handleConversationUpdate(fakeUpdate as any);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('getSession', () => {
  let session1: any;
  let session2: any;
  let sessionsObj: any;

  beforeEach(() => {
    session1 = new MockSession(SessionTypes.softphone);
    session2 = new MockSession(SessionTypes.softphone);

    sessionsObj = { [session1.sid]: session1, [session2.sid]: session2 };

    updateMockSessions([session1, session2]);
  });

  it('should get session by sessionType and conversationId', () => {
    const session1 = {
      sessionTypes: SessionTypes.screenRecording,
      conversationId: 'convo1'
    };

    const session2 = {
      sessionType: SessionTypes.acdScreenShare,
      conversationId: 'convo1'
    };

    jest.spyOn(sessionManager, 'getAllSessions').mockReturnValue([session1, session2] as any);

    expect(sessionManager.getSession({ conversationId: 'convo1', sessionType: SessionTypes.acdScreenShare })).toBe(session2);
  });

  it('should ignore screen recording session', () => {
    const session1 = {
      sessionTypes: SessionTypes.screenRecording,
      conversationId: 'convo1'
    };

    const session2 = {
      sessionType: SessionTypes.acdScreenShare,
      conversationId: 'convo1'
    };

    jest.spyOn(sessionManager, 'getAllSessions').mockReturnValue([session1, session2] as any);

    expect(sessionManager.getSession({ conversationId: 'convo1' })).toBe(session2);
  });

  it('should not ignore screen recording session', () => {
    const session1 = {
      sessionType: SessionTypes.screenRecording,
      conversationId: 'convo1'
    };

    const session2 = {
      sessionType: SessionTypes.acdScreenShare,
      conversationId: 'convo1'
    };

    jest.spyOn(sessionManager, 'getAllSessions').mockReturnValue([session1, session2] as any);

    expect(sessionManager.getSession({ conversationId: 'convo1', searchScreenRecordingSessions: true })).toBe(session1);
  });

  it('should get softphone session by conversationStates', () => {
    const softphoneHandler = {
      sessionType: SessionTypes.softphone,
      conversations: {
        [session1.conversationId]: {
          session: session1,
          conversationId: session1.conversationId
        }
      }
    };

    /* mock like jingleJs doesn't have any sessions */
    delete sessionsObj[session1.sid];
    delete sessionsObj[session2.sid];
    sessionManager.sessionHandlers = [softphoneHandler as any];

    expect(sessionManager.getSession({ conversationId: session1.conversationId })).toBe(session1);
  });

  it('should get session by conversationId', () => {
    expect(sessionManager.getSession({ conversationId: session1.conversationId })).toBe(session1);
    expect(sessionManager.getSession({ conversationId: session2.conversationId })).toBe(session2);
  });

  it('should throw if the conversationState on the softphoneHandler does not have a session', () => {
    const softphoneHandler = {
      sessionType: SessionTypes.softphone,
      conversations: {
        [session1.conversationId]: {
          conversationId: session1.conversationId
        }
      }
    };

    /* mock like jingleJs doesn't have any sessions */
    updateMockSessions([]);
    sessionManager.sessionHandlers = [softphoneHandler as any];

    expect(() => sessionManager.getSession({ conversationId: session1.conversationId })).toThrowError(/Unable to find session/);
  });

  it('should throw is no session is found', () => {
    expect(() => sessionManager.getSession({ conversationId: 'fakeId' })).toThrowError(/Unable to find session/);
  });
});

describe('getSessionBySessionId', () => {
  it('should find session by sessionId', () => {
    const sessions = [ { id: 'session1' }, { id: 'session2' } ];
    jest.spyOn(sessionManager, 'getAllSessions').mockReturnValue(sessions as any);
    expect(sessionManager.getSessionBySessionId('session2')).toBe(sessions[1]);
  });
});

describe('removePendingSession()', () => {
  it('should remove pending session by conversationId', () => {
    const pendingSession1 = createPendingSession();
    const pendingSession2 = createPendingSession();
    sessionManager.pendingSessions = [ pendingSession1, pendingSession2 ];

    sessionManager.removePendingSession({ conversationId: pendingSession1.conversationId });

    expect(sessionManager.pendingSessions.length).toBe(1);
    expect(sessionManager.pendingSessions[0]).toBe(pendingSession2);
  });

  it('should warn if a session is not found', () => {
    const spy = jest.spyOn(sessionManager['sdk'].logger, 'warn');

    sessionManager.removePendingSession({ conversationId: 'non-existent' });
    expect(spy).toHaveBeenCalled();
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
    Object.defineProperty(sessionManager['sdk'], 'connected', { get: () => true });
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const mockParams = { sessionType: SessionTypes.softphone };
    await sessionManager.startSession(mockParams);
    expect(mockHandler.startSession).toHaveBeenCalledWith(mockParams);
  });

  it('should throw if trying to start a disabled session type', async () => {
    const mockHandler: any = {
      startSession: jest.fn(),
      disabled: true
    };
    Object.defineProperty(sessionManager['sdk'], 'connected', { get: () => true });
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const mockParams = { sessionType: SessionTypes.softphone };
    await expect(sessionManager.startSession(mockParams)).rejects.toThrowError(/disabled session/);
    expect(mockHandler.startSession).not.toHaveBeenCalledWith(mockParams);
  });

  it('should throw if trying to start a session without streaming client connected', async () => {
    const mockHandler: any = {
      startSession: jest.fn(),
      disabled: false
    };
    Object.defineProperty(sessionManager['sdk'], 'connected', { get: () => false });
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const mockParams = { sessionType: SessionTypes.softphone };
    await expect(sessionManager.startSession(mockParams)).rejects.toThrowError(/streaming client/);
    expect(mockHandler.startSession).not.toHaveBeenCalledWith(mockParams);
  })
});

describe('onPropose', () => {
  it('should add pendingSession and call handlePropose on session handler with pending session', async () => {
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue(undefined);

    const mockHandler: any = {
      handlePropose: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const sessionInfo = createPendingSession();
    await sessionManager.onPropose(sessionInfo);

    expect(mockHandler.handlePropose).toHaveBeenCalled();
    expect(sessionManager.pendingSessions.find(s => s.conversationId === sessionInfo.conversationId)).toBeTruthy();
  });

  it('should ignore if pendingSession already exists', async () => {
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue({} as any);

    const mockHandler: any = {
      handlePropose: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const sessionInfo = createPendingSession();

    await sessionManager.onPropose(sessionInfo);

    expect(mockHandler.handlePropose).not.toHaveBeenCalled();
  });

  it('should update session info and ignore propose if pending session already exists and sessionIds do not match', async () => {
    const mockHandler: any = {
      handlePropose: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const sessionInfo = createPendingSession();
    const existingSession = createPendingSession();
    sessionManager.pendingSessions = [existingSession];
    existingSession.conversationId = sessionInfo.conversationId

    await sessionManager.onPropose(sessionInfo);

    expect(sessionManager.pendingSessions[0].sessionId). toEqual(sessionInfo.sessionId);
    expect(mockHandler.handlePropose).not.toHaveBeenCalled();
    expect(mockSdk.logger.info).toHaveBeenCalledWith(
      expect.stringContaining(`found an existingSession matching propose's conversationId, updating existingSession.sessionId to match`),
      expect.any(Object));
    });

    it('should ignore if pendingSession already exists and sessionIds DO match', async () => {
      const mockHandler: any = {
        handlePropose: jest.fn()
      };
      jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

      const sessionInfo = createPendingSession();
      sessionManager.pendingSessions = [sessionInfo];

      await sessionManager.onPropose(sessionInfo);

      expect(mockHandler.handlePropose).not.toHaveBeenCalled();
      });

  it('should ignore if sessionHandler is disabled', async () => {
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue({} as any);

    const mockHandler: any = {
      handlePropose: jest.fn(),
      disabled: true
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const sessionInfo = createPendingSession();

    await sessionManager.onPropose(sessionInfo);

    expect(mockHandler.handlePropose).not.toHaveBeenCalled();
  });
});

describe('proceedWithSession', () => {
  it('should throw if no pending session', async () => {
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue(undefined);

    const mockHandler: any = {
      proceedWithSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const sessionInfo = createPendingSession();
    await expect(sessionManager.proceedWithSession({ conversationId: sessionInfo.conversationId })).rejects.toThrowError(/Could not find a pendingSession/);

    expect(mockHandler.proceedWithSession).not.toHaveBeenCalled();
  });

  it('should call proceedWithSession on the session handler', async () => {
    const pendingSession: any = {};
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    const mockHandler: any = {
      proceedWithSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    await sessionManager.proceedWithSession({ conversationId: 'asldkfj' });

    expect(mockHandler.proceedWithSession).toHaveBeenCalled();
  });
});

describe('rejectPendingSession', () => {
  it('should throw if no pending session', async () => {
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue(undefined);

    const mockHandler: any = {
      rejectPendingSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const sessionInfo = createPendingSession();
    await expect(sessionManager.rejectPendingSession({ conversationId: sessionInfo.conversationId })).rejects.toThrowError(/Could not find a pendingSession/);

    expect(mockHandler.rejectPendingSession).not.toHaveBeenCalled();
  });

  it('should call rejectPendingSession on the session handler', async () => {
    const pendingSession: any = {};
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    const mockHandler: any = {
      rejectPendingSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    await sessionManager.rejectPendingSession({ conversationId: 'asldkfj' });

    expect(mockHandler.rejectPendingSession).toHaveBeenCalled();
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

  it('should not call handleSessionInit for disabled session handlers', async () => {
    const session: any = {};

    const mockHandler: any = {
      sessionType: SessionTypes.acdScreenShare,
      handleSessionInit: jest.fn(),
      disabled: true
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    await sessionManager.onSessionInit(session);

    expect(mockHandler.handleSessionInit).not.toHaveBeenCalled();
  });
});

describe('onCancelPendingSession()', () => {
  it('should do nothing if it did not find a pending session', () => {
    mockSdk.on('cancelPendingSession', () => {
      fail('should not emit this event');
    });
    sessionManager.onCancelPendingSession('does not exist');
  });

  it('should emit and remove pending session', () => {
    const pendingSession = createPendingSession();

    sessionManager.pendingSessions = [pendingSession];

    mockSdk.on('cancelPendingSession', ({ sessionId, conversationId }) => {
      // not an async event
      expect(sessionId).toBe(pendingSession.sessionId);
      expect(conversationId).toBe(pendingSession.conversationId);
    });

    sessionManager.onCancelPendingSession(pendingSession.sessionId, pendingSession.conversationId);
  });
});

describe('onHandledPendingSession()', () => {
  it('should do nothing if it did not find a pending session', () => {
    mockSdk.on('cancelPendingSession', () => {
      fail('should not emit this event');
    });
    sessionManager.onCancelPendingSession('does not exist');
  });

  it('should emit and remove pending session', () => {
    const pendingSession = createPendingSession();

    sessionManager.pendingSessions = [pendingSession];

    mockSdk.on('handledPendingSession', ({ sessionId, conversationId }) => {
      // not an async event
      expect(sessionId).toBe(pendingSession.sessionId);
      expect(conversationId).toBe(pendingSession.conversationId);
    });

    sessionManager.onHandledPendingSession(pendingSession.sessionId, pendingSession.conversationId);
  });
});

describe('setConversationHeld()', () => {
  it('should proxy to handler', async () => {
    const session = new MockSession();
    jest.spyOn(sessionManager, 'getSession').mockReturnValue(session as any);

    const fakeHandler = { setConversationHeld: jest.fn() };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(fakeHandler as any);

    const params = { conversationId: '1', held: true };
    await sessionManager.setConversationHeld(params);

    expect(fakeHandler.setConversationHeld).toHaveBeenCalledWith(session, params);
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

    await sessionManager.acceptSession({ conversationId: 'asdf' });

    expect(mockHandler.acceptSession).toHaveBeenCalled();
  });

  it('should throw if called without a sessionId', async () => {
    await expect(sessionManager.acceptSession({} as any)).rejects.toThrowError(/A conversationId is required for acceptSession/);
  });

  it('should do nothing if session was already accepted', async () => {
    const session: any = {
      _alreadyAccepted: true
    };

    const mockHandler: any = {
      sessionType: SessionTypes.acdScreenShare,
      acceptSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);
    jest.spyOn(sessionManager, 'getSession').mockReturnValue(session);

    await sessionManager.acceptSession({ conversationId: 'asdf' });

    expect(mockHandler.acceptSession).not.toHaveBeenCalled();
  });
});

describe('endSession', () => {
  it('should call endSession on the session handler', async () => {
    const session: any = {};

    const mockHandler: any = {
      sessionType: SessionTypes.acdScreenShare,
      endSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);
    jest.spyOn(sessionManager, 'getSession').mockReturnValue(session);

    await sessionManager.endSession({ conversationId: '123' });

    expect(mockHandler.endSession).toHaveBeenCalled();
  });

  it('should throw if no conversationId in params', async () => {
    await expect(sessionManager.endSession({ sessionId: 'not-good-enough' } as any)).rejects.toThrowError(/must provide a conversationId/);
  });
});

describe('forceTerminateSession', () => {
  it('should call forceTerminateSession on the session handler', async () => {
    const session: any = { id: 'mySessionId' };

    const mockHandler: any = {
      sessionType: SessionTypes.softphone,
      endSession: jest.fn(),
      forceEndSession: jest.fn()
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);
    jest.spyOn(sessionManager, 'getAllSessions').mockReturnValue([session]);

    await sessionManager.forceTerminateSession('mySessionId');

    expect(mockHandler.forceEndSession).toHaveBeenCalledWith(session, undefined);
  });

  it('should throw if session not found', async () => {
    jest.spyOn(sessionManager, 'getAllSessions').mockReturnValue([]);
    await expect(sessionManager.forceTerminateSession('unknownSessionId')).rejects.toThrow();
  });
});

describe('setVideoMute', () => {
  it('should proxy to handler', async () => {
    const spy = jest.fn();
    const fakeHandler = { setVideoMute: spy };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(fakeHandler as any);

    const fakeSession = {} as any;
    jest.spyOn(sessionManager, 'getSession').mockReturnValue(fakeSession);

    const params = { conversationId: '1', mute: true };
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

    const params = { conversationId: '1', mute: true };
    await sessionManager.setAudioMute(params);

    expect(spy).toHaveBeenCalledWith(fakeSession, params);
  });
});

describe('getAllActiveSessions()', () => {
  it('should return all active sessions as an array', () => {
    const sessionsObject = {
      'session-1': { id: 'session-1', state: 'active' },
      'session-2': { id: 'session-2', state: 'active' },
      'session-3': { id: 'session-3', state: 'new' },
    };
    const expectedArray = [sessionsObject['session-1'], sessionsObject['session-2']];

    updateMockSessions(Object.values(sessionsObject));

    expect(sessionManager.getAllActiveSessions()).toEqual(expectedArray);
  });
});

describe('getAllSessions()', () => {
  it('should return all active sessions as an array', () => {
    const sessionsObject = {
      'session-1': { id: 'session-1', state: 'active' },
      'session-2': { id: 'session-2', state: 'active' }
    };
    const expectedArray = [sessionsObject['session-1'], sessionsObject['session-2']];

    updateMockSessions(Object.values(sessionsObject));

    expect(sessionManager.getAllSessions()).toEqual(expectedArray);
  });
});

describe('updateOutgoingMedia()', () => {
  it('should call the handler to updateOutgoingMedia with the passed in session', async () => {
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

  it('should find the session by id and call the handler to updateOutgoingMedia', async () => {
    const session = {} as any;
    const options: IUpdateOutgoingMedia = { conversationId: 'abc123', videoDeviceId: 'deviceId' };

    const getSessionSpy = jest.spyOn(sessionManager, 'getSession').mockReturnValue(session);
    const mockSessionHandler = { updateOutgoingMedia: jest.fn() };
    const getSessionHandlerSpy = jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockSessionHandler as any);

    await sessionManager.updateOutgoingMedia(options);

    expect(getSessionSpy).toHaveBeenCalledWith({ conversationId: 'abc123' });
    expect(getSessionHandlerSpy).toHaveBeenCalledWith({ jingleSession: session });
    expect(mockSessionHandler.updateOutgoingMedia).toHaveBeenCalledWith(session, options);
  });
});

describe('updateOutgoingMediaForAllSessions()', () => {
  it('should use sdk default devices if no opts are provided', async () => {
    const sessions = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const videoDeviceId = 'video-device';
    const audioDeviceId = 'audio-device';

    mockSdk._config.defaults!.audioDeviceId = audioDeviceId;
    mockSdk._config.defaults!.videoDeviceId = videoDeviceId;

    jest.spyOn(sessionManager, 'getAllActiveSessions').mockReturnValue(sessions as any);
    jest.spyOn(sessionManager, 'updateOutgoingMedia').mockResolvedValue(undefined);

    await sessionManager.updateOutgoingMediaForAllSessions();

    expect(sessionManager.getAllActiveSessions).toHaveBeenCalled();
    expect(mockSdk.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Updating outgoing deviceId(s) for all active sessions'),
      expect.any(Object));

    sessions.forEach(session => {
      expect(sessionManager.updateOutgoingMedia).toHaveBeenCalledWith({ session, videoDeviceId, audioDeviceId });
    });
  });

  it('should call the handler to updateOutgoingMedia for all sessions', async () => {
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
  it('should log and return if outputDeviceId cannot be found', async () => {
    const outputDeviceId = 'device-id';
    const screenShareSession = new MockSession(SessionTypes.acdScreenShare);
    const videoSession = new MockSession(SessionTypes.collaborateVideo);

    jest.spyOn(mockSdk.media, 'getValidDeviceId').mockReturnValue(undefined);
    jest.spyOn(sessionManager, 'getAllActiveSessions').mockReturnValue([screenShareSession, videoSession] as any);
    jest.spyOn(sessionManager, 'getSessionHandler');

    await sessionManager.updateOutputDeviceForAllSessions(outputDeviceId);

    expect(mockSdk.media.getValidDeviceId).toHaveBeenCalledWith('audiooutput', outputDeviceId, videoSession);
    expect(sessionManager.getSessionHandler).not.toHaveBeenCalled();
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Output deviceId not found. Not updating output media'),
      {
        sessions: [{ conversationId: videoSession.conversationId, sessionId: videoSession.id, sessionType: SessionTypes.collaborateVideo }],
        outputDeviceId
      }
    );
  });

  it('should call the handler to update all active, non-screenshare sessions', async () => {
    const outputDeviceId = 'device-id';
    const sessions = [
      new MockSession(SessionTypes.collaborateVideo),
      new MockSession(SessionTypes.softphone),
      new MockSession(SessionTypes.acdScreenShare),
    ];
    const mockSessionHandler = { updateOutputDevice: jest.fn() };

    jest.spyOn(mockSdk.media, 'getValidDeviceId').mockReturnValue(outputDeviceId);
    jest.spyOn(sessionManager, 'getAllActiveSessions').mockReturnValue(sessions as any);
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockSessionHandler as any);

    await sessionManager.updateOutputDeviceForAllSessions(outputDeviceId);

    expect(mockSdk.media.getValidDeviceId).toHaveBeenCalledWith('audiooutput', outputDeviceId, sessions[0], sessions[1]);

    sessions
      .filter(session => session.sessionType !== SessionTypes.acdScreenShare)
      .forEach(session => {
        expect(sessionManager.getSessionHandler).toHaveBeenCalledWith({ jingleSession: session });
        expect(mockSessionHandler.updateOutputDevice).toHaveBeenCalledWith(session, outputDeviceId);
      });
  });
});

describe('validateOutgoingMediaTracks()', () => {
  let sessions: IExtendedMediaSession[];
  let mockSessionHandler: BaseSessionHandler;
  let testDevices: MediaDeviceInfo[];
  let mediaState: ISdkMediaState;
  let mockGetAllSessions: jest.SpyInstance<IExtendedMediaSession[]>;
  let mockGetSessionById: jest.SpyInstance<IExtendedMediaSession | undefined>;
  let mockGetSessionHandler: jest.SpyInstance<BaseSessionHandler>;
  let setMediaStateDevices: typeof mockSdk.media['setDevices'];

  beforeEach(() => {
    mockSessionHandler = {
      setVideoMute: jest.fn().mockResolvedValue(null),
      setAudioMute: jest.fn().mockResolvedValue(null),
      getSendersByTrackType: jest.fn().mockImplementation((session: MockSession, kind) =>
        session.peerConnection.getSenders().filter(s => s.track && s.track.kind === kind)),
      removeMediaFromSession: jest.fn().mockResolvedValue(null),
    } as any;

    sessions = [
      new MockSession() as any
    ];
    testDevices = [
      /* audioDevices */
      { deviceId: 'device#1', groupId: 'group#1', kind: 'audioinput', label: 'Device #1' } as any,
      { deviceId: 'device#2', groupId: 'group#2', kind: 'audioinput', label: 'Device #2' } as any,
      /* videoDevices */
      { deviceId: 'device#3', groupId: 'group#3', kind: 'videoinput', label: 'Device #3' } as any,
      { deviceId: 'device#4', groupId: 'group#4', kind: 'videoinput', label: 'Device #4' } as any
    ];

    setMediaStateDevices = mockSdk.media['setDevices'].bind(mockSdk.media);

    mockGetAllSessions = jest.spyOn(sessionManager, 'getAllActiveSessions').mockReturnValue(sessions);
    setMediaStateDevices(testDevices);
    mediaState = mockSdk.media.getState();

    mockGetSessionById = jest.spyOn(sessionManager, 'getSessionBySessionId').mockImplementation((id) => sessions.find(s => s.id === id));
    mockGetSessionHandler = jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockSessionHandler as any);
  });

  it('should ignore the screen share stream on the session', async () => {
    const screenShareStream = new MockStream({ video: true });
    const mockTrack = new MockTrack('video', mediaState.videoDevices[0].label);
    const session = sessions[0];

    (session as VideoMediaSession)._screenShareStream = screenShareStream as any;
    session.peerConnection['_addSender'](mockTrack); /* this is a mock PC */

    await sessionManager.validateOutgoingMediaTracks();

    expect(mockSdk.logger.debug).toHaveBeenCalledWith(
      'no active sessions have outgoing tracks that need to have the device updated',
      { sessionIds: sessions.map(s => s.id) }
    );

    /* other generic mocks called */
    expect(mockGetAllSessions).toBeCalled();
  });

  it('should not update the session if the media did not get lost', async () => {
    const mockTrack = new MockTrack('video', mediaState.videoDevices[0].label);
    const session = sessions[0];
    session.sessionType = SessionTypes.softphone
    session.peerConnection['_addSender'](mockTrack); /* this is a mock PC */

    await sessionManager.validateOutgoingMediaTracks();

    expect(mockSdk.logger.debug).toHaveBeenCalledWith(
      'sessions outgoing track still has available device',
      { deviceLabel: mockTrack.label, kind: mockTrack.kind, sessionId: session.id, conversationId: session.conversationId, sessionType: SessionTypes.softphone }
    );
  });

  it('should update video media on all sessions if the device was lost', async () => {
    const mockVideoTrack = new MockTrack('video', mediaState.videoDevices[0].label);
    const mockAudioTrack = new MockTrack('audio', mediaState.audioDevices[0].label);

    const session = sessions[0];
    session.peerConnection['_addSender'](mockVideoTrack); /* this is a mock PC */
    session.peerConnection['_addSender'](mockAudioTrack);

    /* video device is lost */
    const newDevices = testDevices.filter(d => d.label !== mediaState.videoDevices[0].label);
    setMediaStateDevices(newDevices);

    mockSdk.logger.warn['mockReset']();
    Object.defineProperty(sessionManager, 'jingle', { get: () => ({ sessions: {} })})
    await sessionManager.validateOutgoingMediaTracks();

    /* logs correctly */
    expect(mockSdk.logger.info).toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { conversationId: session.conversationId, sessionId: session.id, kind: mockVideoTrack.kind, deviceLabel: mockVideoTrack.label }
    );
    expect(mockSdk.logger.info).not.toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { conversationId: session.conversationId, sessionId: session.id, kind: mockAudioTrack.kind, deviceLabel: mockAudioTrack.label }
    );

    /* updates with the new devices */
    expect(mockSdk.updateOutgoingMedia).toHaveBeenCalledWith({ videoDeviceId: true, session });

    /* other generic mocks called */
    expect(mockGetSessionById).toBeCalled();
    expect(mockGetSessionHandler).toBeCalled();
  });

  it('should update audio media on all sessions if the device was lost', async () => {
    const mockVideoTrack = new MockTrack('video', mediaState.videoDevices[0].label);
    const mockAudioTrack = new MockTrack('audio', mediaState.audioDevices[0].label);

    const session = sessions[0];
    session.peerConnection['_addSender'](mockVideoTrack); /* this is a mock PC */
    session.peerConnection['_addSender'](mockAudioTrack);

    /* audio device is lost */
    const newDevices = testDevices.filter(d => d.label !== mediaState.audioDevices[0].label);
    setMediaStateDevices(newDevices);

    mockSdk.logger.warn['mockReset']();
    await sessionManager.validateOutgoingMediaTracks();

    /* logs correctly */
    expect(mockSdk.logger.info).not.toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { conversationId: session.conversationId, sessionId: session.id, kind: mockVideoTrack.kind, deviceLabel: mockVideoTrack.label }
    );
    expect(mockSdk.logger.info).toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { conversationId: session.conversationId, sessionId: session.id, kind: mockAudioTrack.kind, deviceLabel: mockAudioTrack.label }
    );

    /* updates with the new devices */
    expect(mockSdk.updateOutgoingMedia).toHaveBeenCalledWith({ audioDeviceId: true, session });
  });

  it('should mute the media type if there is no device to switch to', async () => {
    const mockVideoTrack = new MockTrack('video', mediaState.videoDevices[0].label);
    const mockAudioTrack = new MockTrack('audio', mediaState.videoDevices[0].label);

    const session = sessions[0];
    session.peerConnection['_addSender'](mockVideoTrack); /* this is a mock PC */
    session.peerConnection['_addSender'](mockAudioTrack);
    session._outboundStream = { removeTrack: jest.fn() } as any;

    /* all devices are removed (none available to switch to) */
    setMediaStateDevices([]);

    await sessionManager.validateOutgoingMediaTracks();

    /* logs correctly */
    expect(mockSdk.logger.info).toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { conversationId: session.conversationId, sessionId: session.id, kind: mockVideoTrack.kind, deviceLabel: mockVideoTrack.label }
    );
    expect(mockSdk.logger.info).toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { conversationId: session.conversationId, sessionId: session.id, kind: mockAudioTrack.kind, deviceLabel: mockAudioTrack.label }
    );
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(
      'no available audio devices to switch to. setting audio to mute for session',
      { conversationId: session.conversationId, sessionId: session.id, kind: 'audio' }
    );
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(
      'no available video devices to switch to. setting video to mute for session',
      { conversationId: session.conversationId, sessionId: session.id, kind: 'video' }
    );

    /* mutes the session and does not update media (since there is none to update to) */
    expect(mockSessionHandler.getSendersByTrackType).toBeCalled();
    expect(mockSdk.updateOutgoingMedia).not.toHaveBeenCalled();
    expect(mockSessionHandler.setVideoMute).toHaveBeenCalledWith(session, { mute: true, conversationId: session.conversationId });
    expect(mockSessionHandler.setAudioMute).toHaveBeenCalledWith(session, { mute: true, conversationId: session.conversationId });

    /* should also remove audio tracks because setAudioMute does not remove them (setVideoMute does) */
    const expectedSender = session.peerConnection.getSenders().find(s => s.track === mockAudioTrack as any);
    expect(mockSessionHandler.removeMediaFromSession).toHaveBeenCalledWith(session, expectedSender);
    expect(mockAudioTrack.stop).toHaveBeenCalled();
    expect(session._outboundStream!.removeTrack).toHaveBeenCalledWith(mockAudioTrack);
  });

  it('should attempt to update output device if lost', async () => {
    const mockOutputElement = { sinkId: 'some-device-id' };
    const session = sessions[0];
    session._outputAudioElement = mockOutputElement as any;

    setMediaStateDevices([
      { deviceId: 'some-device-id', kind: 'audiooutput' } as MediaDeviceInfo
    ]);

    mockSdk.media['setStateAndEmit']({ hasOutputDeviceSupport: true }, 'state');
    jest.spyOn(sessionManager, 'updateOutputDeviceForAllSessions').mockResolvedValue(null);

    await sessionManager.validateOutgoingMediaTracks();

    /* device exists, does not update */
    expect(mockSdk.logger.info).not.toHaveBeenCalledWith(
      'session lost output device and will attempt to switch device',
      { conversationId: session.conversationId, sessionId: session.id, kind: 'output' }
    );
    expect(sessionManager.updateOutputDeviceForAllSessions).not.toHaveBeenCalled();

    /* device does not exist, attempt to switch */
    setMediaStateDevices([]);
    await sessionManager.validateOutgoingMediaTracks();

    expect(mockSdk.logger.info).toHaveBeenCalledWith(
      'session lost output device and will attempt to switch device',
      { conversationId: session.conversationId, sessionId: session.id, kind: 'output' }
    );
    expect(sessionManager.updateOutputDeviceForAllSessions).toHaveBeenCalled();
  });
});

describe('updateAudioVolume', () => {
  it('should call the handler to update all sessions, non-screenshare sessions', async () => {
    const sessions = [
      new MockSession(SessionTypes.collaborateVideo),
      new MockSession(SessionTypes.softphone)
    ];
    const mockSessionHandler = { updateAudioVolume: jest.fn() };

    jest.spyOn(sessionManager, 'getAllActiveSessions').mockReturnValue(sessions as any);
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockSessionHandler as any);

    sessionManager.updateAudioVolume(63);

    sessions
      .forEach(session => {
        expect(sessionManager.getSessionHandler).toHaveBeenCalledWith({ jingleSession: session });
        expect(mockSessionHandler.updateAudioVolume).toHaveBeenCalledWith(session, 63);
      });
  });

  describe('addOrReplaceTrackOnSession', () => {
    it('should call the handler to update session', () => {
      const session = new MockSession(SessionTypes.collaborateVideo) as any;
      const track = {
        applyConstraints: jest.fn(),
        getConstraints: jest.fn(),
        getSettings: jest.fn().mockReturnValue({
          width: 1920,
          height: 1080
        }),
        stop: jest.fn()
      } as unknown as MediaStreamTrack;
      const mockSessionHandler = { addReplaceTrackToSession: jest.fn() };
      jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockSessionHandler as any);
      sessionManager.addOrReplaceTrackOnSession(track, session);
      expect(sessionManager.getSessionHandler).toHaveBeenCalledWith({ jingleSession: session });
      expect(mockSessionHandler.addReplaceTrackToSession).toHaveBeenCalledWith(session, track);
    })
  })
});

describe('getAllActiveConversations', () => {
  it('should return a concat\'d list of conversations', () => {
    sessionManager.sessionHandlers = [
      {
        getActiveConversations: () => [
          { sessionId: 'session1', sessionType: SessionTypes.softphone, conversationId: 'convo1' },
          { sessionId: 'session2', sessionType: SessionTypes.softphone, conversationId: 'convo2' }
        ]
      } as unknown as SoftphoneSessionHandler,
      {
        getActiveConversations: () => [
          { sessionId: 'session3', sessionType: SessionTypes.softphone, conversationId: 'convo3' },
          { sessionId: 'session4', sessionType: SessionTypes.softphone, conversationId: 'convo4' }
        ]
      } as unknown as VideoSessionHandler
    ];

    expect(sessionManager.getAllActiveConversations().length).toEqual(4);
  });
});
