import { SimpleMockSdk, MockSession, createPendingSession, MockStream, MockTrack, random, getMockConversation, PARTICIPANT_ID, USER_ID, mockGetConversationApi, mockPatchConversationApi, createNock } from '../../test-utils';
import { PureCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import { SessionTypes } from '../../../src/types/enums';
import * as mediaUtils from '../../../src/media-utils';
import * as utils from '../../../src/utils';
import SoftphoneSessionHandler from '../../../src/sessions/softphone-session-handler';
import { IAcceptSessionRequest } from '../../../src/types/interfaces';
import nock = require('nock');

let handler: SoftphoneSessionHandler;
let mockSdk: PureCloudWebrtcSdk;
let mockSessionManager: SessionManager;

beforeEach(() => {
  jest.clearAllMocks();
  nock.cleanAll();
  mockSdk = (new SimpleMockSdk() as any);
  (mockSdk as any).isGuest = true;
  mockSdk._config.autoConnectSessions = true;

  mockSessionManager = new SessionManager(mockSdk);
  handler = new SoftphoneSessionHandler(mockSdk, mockSessionManager);
});

describe('shouldHandleSessionByJid', () => {
  it('should rely on isSoftphoneJid', () => {
    jest.spyOn(utils, 'isSoftphoneJid').mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(handler.shouldHandleSessionByJid('sdlkf')).toBeFalsy();
    expect(handler.shouldHandleSessionByJid('sdlfk')).toBeTruthy();
  });
});

describe('handlePropose', () => {
  it('should emit pending session and proceed immediately if autoAnswer', async () => {
    const superSpyHandlePropose = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose');
    const superSpyProceed = jest.spyOn(BaseSessionHandler.prototype, 'proceedWithSession').mockImplementation();

    const spy = jest.fn();
    mockSdk.on('pendingSession', spy);

    mockSdk._config.disableAutoAnswer = false;

    const pendingSession = createPendingSession(SessionTypes.softphone);
    pendingSession.autoAnswer = true;
    handler.handlePropose(pendingSession);

    expect(spy).toHaveBeenCalled();
    expect(superSpyHandlePropose).toHaveBeenCalled();
    expect(superSpyProceed).toHaveBeenCalled();
  });

  it('should not auto answer if pending session is not autoAnswer', async () => {
    const superSpyHandlePropose = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose');
    const superSpyProceed = jest.spyOn(BaseSessionHandler.prototype, 'proceedWithSession').mockImplementation();

    const spy = jest.fn();
    mockSdk.on('pendingSession', spy);

    mockSdk._config.disableAutoAnswer = false;

    const pendingSession = createPendingSession(SessionTypes.softphone);
    pendingSession.autoAnswer = false;
    handler.handlePropose(pendingSession);

    expect(spy).toHaveBeenCalled();
    expect(superSpyHandlePropose).toHaveBeenCalled();
    expect(superSpyProceed).not.toHaveBeenCalled();
  });

  it('should not autoAnswer if disableAutoAnswer', () => {
    const superSpyHandlePropose = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose');
    const superSpyProceed = jest.spyOn(BaseSessionHandler.prototype, 'proceedWithSession').mockImplementation();

    const spy = jest.fn();
    mockSdk.on('pendingSession', spy);

    mockSdk._config.disableAutoAnswer = true;

    const pendingSession = createPendingSession(SessionTypes.softphone);
    pendingSession.autoAnswer = true;
    handler.handlePropose(pendingSession);

    expect(spy).toHaveBeenCalled();
    expect(superSpyHandlePropose).toHaveBeenCalled();
    expect(superSpyProceed).not.toHaveBeenCalled();
  });
});

describe('handleSessionInit', () => {
  it('should call super\'s init and accept immediately', async () => {
    const superInit = jest.spyOn(BaseSessionHandler.prototype, 'handleSessionInit');
    const acceptSessionSpy = jest.spyOn(handler, 'acceptSession').mockImplementation();
    mockSdk._config.autoConnectSessions = true;

    const session = new MockSession();
    await handler.handleSessionInit(session);

    expect(superInit).toHaveBeenCalled();
    expect(acceptSessionSpy).toHaveBeenCalled();
  });

  it('should not accept if not autoConnectSessions', async () => {
    const superInit = jest.spyOn(BaseSessionHandler.prototype, 'handleSessionInit');
    const acceptSessionSpy = jest.spyOn(handler, 'acceptSession').mockImplementation();
    mockSdk._config.autoConnectSessions = false;

    const session = new MockSession();
    await handler.handleSessionInit(session);

    expect(superInit).toHaveBeenCalled();
    expect(acceptSessionSpy).not.toHaveBeenCalled();
  });
});

describe('acceptSesion', () => {
  it('should add media using provided stream and element then accept session', async () => {
    const acceptSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    const attachSpy = jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();
    const addMediaSpy = jest.spyOn(handler, 'addMediaToSession').mockImplementation();
    const startMediaSpy = jest.spyOn(mediaUtils, 'startAudioMedia');

    const element = {};
    const mockOutgoingStream = new MockStream();
    const mockIncomingStream = new MockStream();

    const session = new MockSession();
    session.streams = [mockIncomingStream];

    const params: IAcceptSessionRequest = {
      id: session.sid,
      audioElement: element as any,
      mediaStream: mockOutgoingStream as any
    };

    await handler.acceptSession(session, params);

    expect(acceptSpy).toHaveBeenCalled();
    expect(startMediaSpy).not.toHaveBeenCalled();
    expect(addMediaSpy).toHaveBeenCalledWith(session, mockOutgoingStream);
    expect(attachSpy).toHaveBeenCalledWith(mockSdk, mockIncomingStream, element);
  });

  it('should add media using default stream and element then accept session', async () => {
    const acceptSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    const attachSpy = jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();
    const addMediaSpy = jest.spyOn(handler, 'addMediaToSession').mockImplementation();
    const startMediaSpy = jest.spyOn(mediaUtils, 'startAudioMedia');

    const defaultElement = {};
    const defaultStream = new MockStream();

    mockSdk._config.defaultAudioElement = defaultElement as any;
    mockSdk._config.defaultAudioStream = defaultStream as any;
    const mockIncomingStream = new MockStream();

    const session = new MockSession();
    session.streams = [mockIncomingStream];

    const params: IAcceptSessionRequest = {
      id: session.sid
    };

    await handler.acceptSession(session, params);

    expect(acceptSpy).toHaveBeenCalled();
    expect(startMediaSpy).not.toHaveBeenCalled();
    expect(addMediaSpy).toHaveBeenCalledWith(session, defaultStream);
    expect(attachSpy).toHaveBeenCalledWith(mockSdk, mockIncomingStream, defaultElement);
  });

  it('should add media using created stream accept session', async () => {
    const acceptSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    const attachSpy = jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();
    const addMediaSpy = jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    const createdStream = new MockStream();
    const startMediaSpy = jest.spyOn(mediaUtils, 'startAudioMedia').mockResolvedValue(createdStream as any);

    const mockIncomingStream = new MockStream();

    const session = new MockSession();
    session.streams = [mockIncomingStream];

    const params: IAcceptSessionRequest = {
      id: session.sid
    };

    await handler.acceptSession(session, params);

    expect(acceptSpy).toHaveBeenCalled();
    expect(startMediaSpy).toHaveBeenCalled();
    expect(addMediaSpy).toHaveBeenCalledWith(session, createdStream);
    expect(attachSpy).toHaveBeenCalledWith(mockSdk, mockIncomingStream, undefined);
  });

  it('should wait to attachAudioMedia until session has a stream', async () => {
    const attachSpy = jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();

    const element = {};

    const session = new MockSession();

    const params: IAcceptSessionRequest = {
      id: session.sid,
      audioElement: element as any,
      mediaStream: new MockStream() as any
    };

    await handler.acceptSession(session, params);

    expect(attachSpy).not.toHaveBeenCalled();

    const mockIncomingStream = new MockStream();
    session.emit('peerStreamAdded', session, mockIncomingStream);

    expect(attachSpy).toHaveBeenCalledWith(mockSdk, mockIncomingStream, element);
  });
});

describe('endSession', () => {
  it('should fetch conversation and patch participant', async () => {
    const session = new MockSession();
    const conversationId = (session as any).conversationId = random();
    const participantId = PARTICIPANT_ID;

    mockSdk._personDetails = {
      id: USER_ID
    };

    const scope = createNock();
    const getConversation = mockGetConversationApi({ nockScope: scope, conversationId });
    const patchConversation = mockPatchConversationApi({ nockScope: scope, conversationId, participantId });

    await handler.endSession(session);

    expect(getConversation.isDone()).toBeTruthy();
    expect(patchConversation.isDone()).toBeTruthy();
    expect(session.end).not.toHaveBeenCalled();
  });

  it('should manually end the session if fetch conversation fails', async () => {
    const session = new MockSession();
    const conversationId = (session as any).conversationId = random();

    mockSdk._personDetails = {
      id: USER_ID
    };

    const scope = createNock();
    const getConversation = mockGetConversationApi({ nockScope: scope, conversationId, shouldFail: true });

    await expect(handler.endSession(session)).rejects.toThrow();
    expect(getConversation.isDone()).toBeTruthy();
    expect(session.end).toHaveBeenCalled();
  });

  it('should manually end the session if the patch fails', async () => {
    const session = new MockSession();
    const conversationId = (session as any).conversationId = random();
    const participantId = PARTICIPANT_ID;

    mockSdk._personDetails = {
      id: USER_ID
    };

    const scope = createNock();
    const getConversation = mockGetConversationApi({ nockScope: scope, conversationId });
    const patchConversation = mockPatchConversationApi({ nockScope: scope, conversationId, participantId, shouldFail: true });

    await expect(handler.endSession(session)).rejects.toThrow();
    expect(getConversation.isDone()).toBeTruthy();
    expect(patchConversation.isDone()).toBeTruthy();
    expect(session.end).toHaveBeenCalled();
  });
});
