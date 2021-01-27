import nock = require('nock');

import {
  SimpleMockSdk,
  MockSession,
  createPendingSession,
  MockStream,
  random,
  getMockConversation,
  PARTICIPANT_ID,
  USER_ID,
  mockGetConversationApi,
  mockPatchConversationApi,
  createNock
} from '../../test-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import { SessionTypes } from '../../../src/types/enums';
import * as mediaUtils from '../../../src/media/media-utils';
import * as utils from '../../../src/utils';
import SoftphoneSessionHandler from '../../../src/sessions/softphone-session-handler';
import { IAcceptSessionRequest, ISessionAndConversationIds } from '../../../src/types/interfaces';

let handler: SoftphoneSessionHandler;
let mockSdk: GenesysCloudWebrtcSdk;
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
    await handler.handlePropose(pendingSession);

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
    await handler.handlePropose(pendingSession);

    expect(spy).toHaveBeenCalled();
    expect(superSpyHandlePropose).toHaveBeenCalled();
    expect(superSpyProceed).not.toHaveBeenCalled();
  });

  it('should not autoAnswer if disableAutoAnswer', async () => {
    const superSpyHandlePropose = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose');
    const superSpyProceed = jest.spyOn(BaseSessionHandler.prototype, 'proceedWithSession').mockImplementation();

    const spy = jest.fn();
    mockSdk.on('pendingSession', spy);

    mockSdk._config.disableAutoAnswer = true;

    const pendingSession = createPendingSession(SessionTypes.softphone);
    pendingSession.autoAnswer = true;
    await handler.handlePropose(pendingSession);

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

    const session: any = new MockSession();
    await handler.handleSessionInit(session);

    expect(superInit).toHaveBeenCalled();
    expect(acceptSessionSpy).toHaveBeenCalled();
  });

  it('should not accept if not autoConnectSessions', async () => {
    const superInit = jest.spyOn(BaseSessionHandler.prototype, 'handleSessionInit');
    const acceptSessionSpy = jest.spyOn(handler, 'acceptSession').mockImplementation();
    mockSdk._config.autoConnectSessions = false;

    const session: any = new MockSession();
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
    const startMediaSpy = jest.spyOn(mockSdk.media, 'startMedia');

    const element = {};
    const mockOutgoingStream = new MockStream({ audio: true });
    const mockIncomingStream = new MockStream({ audio: true });

    const session: any = new MockSession();
    session.streams = [mockIncomingStream];

    const params: IAcceptSessionRequest = {
      sessionId: session.sid,
      audioElement: element as any,
      mediaStream: mockOutgoingStream as any
    };
    const ids: ISessionAndConversationIds = {
      sessionId: session.id,
      conversationId: session.conversationId
    };

    await handler.acceptSession(session, params);

    expect(acceptSpy).toHaveBeenCalled();
    expect(startMediaSpy).not.toHaveBeenCalled();
    expect(addMediaSpy).toHaveBeenCalledWith(session, mockOutgoingStream);
    expect(attachSpy).toHaveBeenCalledWith(mockSdk, mockIncomingStream, element, ids);
  });

  it('should add media using default stream and element then accept session', async () => {
    const acceptSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    const attachSpy = jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();
    const addMediaSpy = jest.spyOn(handler, 'addMediaToSession').mockImplementation();
    const startMediaSpy = jest.spyOn(mockSdk.media, 'startMedia');

    const defaultElement = {};
    const defaultStream = new MockStream({ audio: true });

    mockSdk._config.defaults.audioElement = defaultElement as any;
    mockSdk._config.defaults.audioStream = defaultStream as any;
    const mockIncomingStream = new MockStream({ audio: true });

    const session: any = new MockSession();
    session.streams = [mockIncomingStream];

    const params: IAcceptSessionRequest = {
      sessionId: session.sid
    };
    const ids: ISessionAndConversationIds = {
      sessionId: session.id,
      conversationId: session.conversationId
    };

    await handler.acceptSession(session, params);

    expect(acceptSpy).toHaveBeenCalled();
    expect(startMediaSpy).not.toHaveBeenCalled();
    expect(addMediaSpy).toHaveBeenCalledWith(session, defaultStream);
    expect(attachSpy).toHaveBeenCalledWith(mockSdk, mockIncomingStream, defaultElement, ids);
  });

  it('should add media using created stream accept session', async () => {
    const acceptSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    const attachSpy = jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();
    const addMediaSpy = jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    const createdStream = new MockStream({ audio: true });
    const startMediaSpy = jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(createdStream as any);

    const mockIncomingStream = new MockStream({ audio: true });

    const session: any = new MockSession();
    session.streams = [mockIncomingStream];

    const params: IAcceptSessionRequest = {
      sessionId: session.sid
    };
    const ids: ISessionAndConversationIds = {
      sessionId: session.id,
      conversationId: session.conversationId
    };

    await handler.acceptSession(session, params);

    expect(acceptSpy).toHaveBeenCalled();
    expect(startMediaSpy).toHaveBeenCalled();
    expect(addMediaSpy).toHaveBeenCalledWith(session, createdStream);
    expect(attachSpy).toHaveBeenCalledWith(mockSdk, mockIncomingStream, undefined, ids);
  });

  it('should wait to attachAudioMedia until session has a track', async () => {
    const attachSpy = jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();
    jest.spyOn(mediaUtils, 'checkHasTransceiverFunctionality').mockReturnValue(true);

    const element = {};

    const session: any = new MockSession();

    const params: IAcceptSessionRequest = {
      sessionId: session.sid,
      audioElement: element as any,
      mediaStream: new MockStream() as any
    };
    const ids: ISessionAndConversationIds = {
      sessionId: session.id,
      conversationId: session.conversationId
    };

    await handler.acceptSession(session, params);

    expect(attachSpy).not.toHaveBeenCalled();

    const mockIncomingStream = new MockStream({ video: false });
    const track = mockIncomingStream.getAudioTracks()[0];
    session.emit('peerTrackAdded', track, mockIncomingStream);

    expect(attachSpy).toHaveBeenCalledWith(mockSdk, mockIncomingStream, element, ids);
  });
});

describe('getParticipantForSession', () => {
  it('should throw if participant is not found', async () => {
    const response = getMockConversation();
    response.participants = [];
    const scope = createNock();
    const session: any = new MockSession();
    const conversationId = session.conversationId = random();
    const getConversation = mockGetConversationApi({ nockScope: scope, conversationId, response });

    await expect(handler.getParticipantForSession(session)).rejects.toThrowError(/Failed to find a participant/);
    expect(getConversation.isDone()).toBeTruthy();
  });

  it('should not request participant if cached locally', async () => {
    jest.spyOn(utils, 'requestApi');

    const mockParticipant = {};
    const session = {
      pcParticipant: mockParticipant
    };

    expect(await handler.getParticipantForSession(session as any)).toBe(mockParticipant);

    expect(utils.requestApi).not.toHaveBeenCalled();
  });
});

describe('endSession', () => {
  it('should fetch conversation and patch participant', async () => {
    const session: any = new MockSession();
    const conversationId = session.conversationId = random();
    const participantId = PARTICIPANT_ID;
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'endSession');

    mockSdk._personDetails = {
      id: USER_ID
    } as any;

    const scope = createNock();
    const getConversation = mockGetConversationApi({ nockScope: scope, conversationId });
    const patchConversation = mockPatchConversationApi({ nockScope: scope, conversationId, participantId });

    const promise = handler.endSession(session);
    // need to wait for requests to "process" before triggering session terminate
    await new Promise(resolve => setTimeout(resolve, 50));
    session.emit('terminated');
    await promise;

    expect(getConversation.isDone()).toBeTruthy();
    expect(patchConversation.isDone()).toBeTruthy();
    expect(session.end).not.toHaveBeenCalled();
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('should manually end the session if fetch conversation fails', async () => {
    const session: any = new MockSession();
    const conversationId = session.conversationId = random();

    mockSdk._personDetails = {
      id: USER_ID
    } as any;

    const scope = createNock();
    const getConversation = mockGetConversationApi({ nockScope: scope, conversationId, shouldFail: true });

    jest.spyOn(handler, 'endSessionFallback').mockResolvedValue();

    await handler.endSession(session);
    expect(getConversation.isDone()).toBeTruthy();
    expect(handler.endSessionFallback).toHaveBeenCalled();
    expect(session.end).not.toHaveBeenCalled();
  });

  it('should manually end the session if the patch fails', async () => {
    const session: any = new MockSession();
    const conversationId = session.conversationId = random();
    const participantId = PARTICIPANT_ID;

    mockSdk._personDetails = {
      id: USER_ID
    } as any;

    const scope = createNock();
    const getConversation = mockGetConversationApi({ nockScope: scope, conversationId });
    const patchConversation = mockPatchConversationApi({ nockScope: scope, conversationId, participantId, shouldFail: true });

    jest.spyOn(handler, 'endSessionFallback').mockResolvedValue();

    await handler.endSession(session);
    expect(getConversation.isDone()).toBeTruthy();
    expect(patchConversation.isDone()).toBeTruthy();
    expect(handler.endSessionFallback).toHaveBeenCalled();
    expect(session.end).not.toHaveBeenCalled();
  });

  // fit('should call the fallback if session end fails', async () => {
  //   const session: any = new MockSession();
  //   const conversationId = session.conversationId = random();
  //   const participantId = PARTICIPANT_ID;
  //   const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'endSession');
  //   const fallbackSpy = jest.spyOn(handler, 'endSessionFallback').mockResolvedValue();

  //   mockSdk._personDetails = {
  //     id: USER_ID
  //   } as any;

  //   const scope = createNock();
  //   const getConversation = mockGetConversationApi({ nockScope: scope, conversationId });
  //   const patchConversation = mockPatchConversationApi({ nockScope: scope, conversationId, participantId, shouldFail: true });

  //   const promise = handler.endSession(session);
  //   // need to wait for requests to "process" before triggering session terminate
  //   await new Promise(resolve => setTimeout(resolve, 10));
  //   session.emit('error', 'fake error');
  //   await promise;

  //   expect(getConversation.isDone()).toBeTruthy();
  //   expect(patchConversation.isDone()).toBeTruthy();
  //   expect(session.end).not.toHaveBeenCalled();
  //   expect(superSpy).not.toHaveBeenCalled();
  //   expect(fallbackSpy).toHaveBeenCalled();
  // });
});

describe('endSessionFallback', () => {
  it('should call supers endSession', async () => {
    const session: any = new MockSession();
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'endSession').mockResolvedValue();
    await handler.endSessionFallback(session);
    expect(superSpy).toHaveBeenCalled();
  });

  it('should throw error if call to super fails', async () => {
    const session: any = new MockSession();
    const error = new Error('fake');
    jest.spyOn(BaseSessionHandler.prototype, 'endSession').mockRejectedValue(error);
    await expect(handler.endSessionFallback(session)).rejects.toThrowError(/Failed to end session directly/);
  });
});

describe('setAudioMute', () => {
  it('should patch a mute for the participant', async () => {
    const session: any = new MockSession();
    const conversationId = session.conversationId = random();
    const participantId = PARTICIPANT_ID;
    const scope = createNock();

    jest.spyOn(handler, 'getParticipantForSession').mockResolvedValue({ id: participantId } as any);

    const patchConversation = mockPatchConversationApi({ nockScope: scope, conversationId, participantId });

    await handler.setAudioMute(session, { sessionId: session.id, mute: true });

    expect(patchConversation.isDone).toBeTruthy();
  });

  it('should log failure', async () => {
    const session: any = new MockSession();
    const conversationId = session.conversationId = random();
    const participantId = PARTICIPANT_ID;
    const scope = createNock();

    jest.spyOn(handler, 'getParticipantForSession').mockResolvedValue({ id: participantId } as any);

    mockPatchConversationApi({ nockScope: scope, conversationId, participantId, shouldFail: true });

    await expect(handler.setAudioMute(session, { sessionId: session.id, mute: true })).rejects.toThrowError(/Failed to set audioMute/);
  });
});
