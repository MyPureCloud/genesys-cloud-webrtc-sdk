import { PureCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import { SimpleMockSdk, createPendingSession, MockSession, createSessionInfo, MockStream, MockTrack } from '../../test-utils';
import { SessionTypes } from '../../../src/types/enums';
import { IUpdateOutgoingMedia, IJingleSession, IEnumeratedDevices } from '../../../src/types/interfaces';
import * as mediaUtils from '../../../src/media-utils';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';

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

describe('allowedSessionTypes', () => {
  it('should only enabled allowed session types', () => {
    mockSdk._config.allowedSessionTypes = [SessionTypes.collaborateVideo];
    sessionManager = new SessionManager(mockSdk);
    sessionManager.sessionHandlers.forEach((handler) => {
      expect(handler.disabled).toEqual(handler.sessionType !== SessionTypes.collaborateVideo);
    });
    expect.assertions(3);
  });
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

    mockSdk._streamingConnection._webrtcSessions.jingleJs = {
      sessions: {
        1: session1,
        2: session2,
        3: session3
      }
    };

    const spy = jest.fn();
    const fakeHandler = { handleConversationUpdate: spy, disabled: true };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(fakeHandler as any);

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

  it('should throw if trying to start a disabled session type', async () => {
    const mockHandler: any = {
      startSession: jest.fn(),
      disabled: true
    };
    jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockHandler);

    const mockParams = { sessionType: SessionTypes.softphone };
    await expect(sessionManager.startSession(mockParams)).rejects.toThrowError(/disabled session/);
    expect(mockHandler.startSession).not.toHaveBeenCalledWith(mockParams);
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

  it('should ignore if sessionHandler is disabled', async () => {
    jest.spyOn(sessionManager, 'getPendingSession').mockReturnValue({} as any);

    const mockHandler: any = {
      handlePropose: jest.fn(),
      disabled: true
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

describe('validateOutgoingMediaTracks()', () => {
  let sessions: IJingleSession[];
  let devices: IEnumeratedDevices;
  let mockSessionHandler: BaseSessionHandler;

  let mockGetAllSessions: jest.SpyInstance<IJingleSession[]>;
  let mockGetEnumeratedDevices: jest.SpyInstance<Promise<IEnumeratedDevices>>;
  let mockGetSession: jest.SpyInstance<IJingleSession>;
  let mockGetSessionHandler: jest.SpyInstance<BaseSessionHandler>;

  beforeEach(() => {
    mockSessionHandler = {
      setVideoMute: jest.fn().mockResolvedValue(null),
      setAudioMute: jest.fn().mockResolvedValue(null),
      getSendersByTrackType: jest.fn().mockImplementation((session: MockSession, kind) =>
        session.pc.getSenders().filter(s => s.track && s.track.kind === kind)),
      removeMediaFromSession: jest.fn().mockResolvedValue(null),
    } as any;

    sessions = [
      new MockSession() as any
    ];
    devices = {
      audioDevices: [
        { deviceId: 'device#1', groupId: 'group#1', kind: 'audioinput', label: 'Device #1' } as any,
        { deviceId: 'device#2', groupId: 'group#2', kind: 'audioinput', label: 'Device #2' } as any
      ],
      videoDevices: [
        { deviceId: 'device#3', groupId: 'group#3', kind: 'videoinput', label: 'Device #3' } as any,
        { deviceId: 'device#4', groupId: 'group#4', kind: 'videoinput', label: 'Device #4' } as any
      ],
      outputDevices: []
    };

    mockGetAllSessions = jest.spyOn(sessionManager, 'getAllActiveSessions').mockReturnValue(sessions);
    mockGetEnumeratedDevices = jest.spyOn(mediaUtils, 'getEnumeratedDevices').mockResolvedValue(devices);

    mockGetSession = jest.spyOn(sessionManager, 'getSession').mockImplementation(({ id }) => sessions.find(s => s.id === id));
    mockGetSessionHandler = jest.spyOn(sessionManager, 'getSessionHandler').mockReturnValue(mockSessionHandler as any);
  });

  it('should ignore the screen share stream on the session', async () => {
    const screenShareStream = new MockStream({ video: true });
    const mockTrack = new MockTrack('video', devices.videoDevices[0].label);
    const session = sessions[0];

    session._screenShareStream = screenShareStream as any;
    session.pc['_addSender'](mockTrack); /* this is a mock PC */

    await sessionManager.validateOutgoingMediaTracks();

    expect(mockSdk.logger.debug).toHaveBeenCalledWith(
      'no active sessions have outgoing tracks that need to have the device updated',
      { sessionIds: sessions.map(s => s.id) }
    );

    /* other generic mocks called */
    expect(mockGetAllSessions).toBeCalled();
    expect(mockGetEnumeratedDevices).toBeCalled();
  });

  it('should not update the session if the media did not get lost', async () => {
    const mockTrack = new MockTrack('video', devices.videoDevices[0].label);
    const session = sessions[0];
    session.pc['_addSender'](mockTrack); /* this is a mock PC */

    await sessionManager.validateOutgoingMediaTracks();

    expect(mockSdk.logger.info).toHaveBeenCalledWith(
      'sessions outgoing track still has available device',
      { deviceLabel: mockTrack.label, kind: mockTrack.kind, sessionId: session.id }
    );
  });

  it('should update video media on all sessions if the device was lost', async () => {
    const mockVideoTrack = new MockTrack('video', devices.videoDevices[0].label);
    const mockAudioTrack = new MockTrack('audio', devices.audioDevices[0].label);

    const session = sessions[0];
    session.pc['_addSender'](mockVideoTrack); /* this is a mock PC */
    session.pc['_addSender'](mockAudioTrack);

    /* device is removed */
    devices.videoDevices = devices.videoDevices.slice(1);

    mockSdk.logger.warn['mockReset']();
    await sessionManager.validateOutgoingMediaTracks();

    /* logs correctly */
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { sessionId: session.id, kind: mockVideoTrack.kind, deviceLabel: mockVideoTrack.label }
    );
    expect(mockSdk.logger.warn).not.toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { sessionId: session.id, kind: mockAudioTrack.kind, deviceLabel: mockAudioTrack.label }
    );

    /* updates with the new devices */
    expect(mockSdk.updateOutgoingMedia).toHaveBeenCalledWith({ videoDeviceId: true, sessionId: session.id });

    /* other generic mocks called */
    expect(mockGetSession).toBeCalled();
    expect(mockGetSessionHandler).toBeCalled();
  });

  it('should update audio media on all sessions if the device was lost', async () => {
    const mockVideoTrack = new MockTrack('video', devices.videoDevices[0].label);
    const mockAudioTrack = new MockTrack('audio', devices.audioDevices[0].label);

    const session = sessions[0];
    session.pc['_addSender'](mockVideoTrack); /* this is a mock PC */
    session.pc['_addSender'](mockAudioTrack);

    /* device is removed */
    devices.audioDevices = devices.audioDevices.slice(1);

    mockSdk.logger.warn['mockReset']();
    await sessionManager.validateOutgoingMediaTracks();

    /* logs correctly */
    expect(mockSdk.logger.warn).not.toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { sessionId: session.id, kind: mockVideoTrack.kind, deviceLabel: mockVideoTrack.label }
    );
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { sessionId: session.id, kind: mockAudioTrack.kind, deviceLabel: mockAudioTrack.label }
    );

    /* updates with the new devices */
    expect(mockSdk.updateOutgoingMedia).toHaveBeenCalledWith({ audioDeviceId: true, sessionId: session.id });
  });

  it('should mute the media type if there is no device to switch to', async () => {
    const mockVideoTrack = new MockTrack('video', devices.videoDevices[0].label);
    const mockAudioTrack = new MockTrack('audio', devices.videoDevices[0].label);

    const session = sessions[0];
    session.pc['_addSender'](mockVideoTrack); /* this is a mock PC */
    session.pc['_addSender'](mockAudioTrack);
    session._outboundStream = { removeTrack: jest.fn() } as any;

    /* all devices are removed (none available to switch to) */
    devices.videoDevices = [];
    devices.audioDevices = [];

    await sessionManager.validateOutgoingMediaTracks();

    /* logs correctly */
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { sessionId: session.id, kind: mockVideoTrack.kind, deviceLabel: mockVideoTrack.label }
    );
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(
      'session lost media device and will attempt to switch devices',
      { sessionId: session.id, kind: mockAudioTrack.kind, deviceLabel: mockAudioTrack.label }
    );
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(
      'no available audio devices to switch to. setting audio to mute for session',
      { sessionId: session.id, kind: 'audio' }
    );
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(
      'no available video devices to switch to. setting video to mute for session',
      { sessionId: session.id, kind: 'video' }
    );

    /* mutes the session and does not update media (since there is none to update to) */
    expect(mockSessionHandler.getSendersByTrackType).toBeCalled();
    expect(mockSdk.updateOutgoingMedia).not.toHaveBeenCalled();
    expect(mockSessionHandler.setVideoMute).toHaveBeenCalledWith(session, { mute: true, id: session.id });
    expect(mockSessionHandler.setAudioMute).toHaveBeenCalledWith(session, { mute: true, id: session.id });

    /* should also remove audio tracks because setAudioMute does not remove them (setVideoMute does) */
    expect(mockSessionHandler.removeMediaFromSession).toHaveBeenCalledWith(session, mockAudioTrack);
    expect(mockAudioTrack.stop).toHaveBeenCalled();
    expect(session._outboundStream.removeTrack).toHaveBeenCalledWith(mockAudioTrack);
  });
});