import nock from 'nock';

import {
  SimpleMockSdk,
  MockSession,
  createPendingSession,
  MockStream,
  random,
  flushPromises
} from '../../test-utils';
import {
  PARTICIPANT_ID,
  mockPostConversationApi
} from '../../mock-apis';
import {
  GenesysCloudWebrtcSdk,
  SessionTypes,
  ConversationUpdate,
  IAcceptSessionRequest,
  ICallStateFromParticipant,
  IUpdateOutgoingMedia,
  CommunicationStates,
  IConversationParticipantFromEvent,
  IPersonDetails,
  IExtendedMediaSession,
  IStoredConversationState,
  ISdkConversationUpdateEvent,
  IConversationParticipant,
  IConversationHeldRequest,
  SdkErrorTypes,
  IPendingSession,
  JingleReasons,
  ISessionMuteRequest
} from '../../../src';
import { SessionManager } from '../../../src/sessions/session-manager';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import * as mediaUtils from '../../../src/media/media-utils';
import * as utils from '../../../src/utils';
import SoftphoneSessionHandler from '../../../src/sessions/softphone-session-handler';
import { SdkError } from '../../../src/utils';
import { ISdkHeadsetService } from '../../../src/headsets/headset-types';
import { HeadsetProxyService } from '../../../src/headsets/headset';

let handler: SoftphoneSessionHandler;
let mockSdk: GenesysCloudWebrtcSdk;
let mockSessionManager: SessionManager;
let mockHeadset: ISdkHeadsetService;

beforeAll(() => {
  (window as any).MediaStream = MockStream;
});

beforeEach(() => {
  jest.clearAllMocks();
  nock.cleanAll();
  mockSdk = (new SimpleMockSdk() as any);
  (mockSdk as any).isGuest = true;
  mockSdk._config.autoConnectSessions = true;
  mockSdk.headset = mockHeadset = new HeadsetProxyService(mockSdk);
  (mockHeadset as HeadsetProxyService).setUseHeadsets(false);

  mockSessionManager = new SessionManager(mockSdk);
  handler = new SoftphoneSessionHandler(mockSdk, mockSessionManager);
});

describe('shouldHandleSessionByJid()', () => {
  it('should rely on isSoftphoneJid', () => {
    jest.spyOn(utils, 'isSoftphoneJid').mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(handler.shouldHandleSessionByJid('sdlkf')).toBeFalsy();
    expect(handler.shouldHandleSessionByJid('sdlfk')).toBeTruthy();
  });
});

describe('handlePropose()', () => {
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

  it('should swallow the propose if eagerConnectionEstablishmentMode is "none" and priv-answer-mode', async () => {
    const superSpyHandlePropose = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose');
    const superSpyProceed = jest.spyOn(BaseSessionHandler.prototype, 'proceedWithSession').mockImplementation();

    const spy = jest.fn();
    mockSdk.on('pendingSession', spy);

    mockSdk._config.disableAutoAnswer = true;
    mockSdk._config.eagerPersistentConnectionEstablishment = 'none';

    const pendingSession = createPendingSession(SessionTypes.softphone);
    pendingSession.privAnswerMode = 'Auto';
    pendingSession.autoAnswer = true;
    await handler.handlePropose(pendingSession);

    expect(spy).not.toHaveBeenCalled();
    expect(superSpyHandlePropose).not.toHaveBeenCalled();
    expect(superSpyProceed).not.toHaveBeenCalled();
  });

  it('should event the propose if eagerConnectionEstablishmentMode is "event" and priv-answer-mode', async () => {
    const superSpyHandlePropose = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose');
    const superSpyProceed = jest.spyOn(BaseSessionHandler.prototype, 'proceedWithSession').mockImplementation();

    const spy = jest.fn();
    mockSdk.on('pendingSession', spy);

    mockSdk._config.disableAutoAnswer = true;
    mockSdk._config.eagerPersistentConnectionEstablishment = 'event';

    const pendingSession = createPendingSession(SessionTypes.softphone);
    pendingSession.privAnswerMode = 'Auto';
    pendingSession.autoAnswer = true;
    await handler.handlePropose(pendingSession);

    expect(spy).toHaveBeenCalled();
    expect(superSpyHandlePropose).toHaveBeenCalled();
    expect(superSpyProceed).not.toHaveBeenCalled();
  });

  it('should auto proceed the propose if eagerConnectionEstablishmentMode is "auto" and priv-answer-mode', async () => {
    const superSpyHandlePropose = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose');
    const superSpyProceed = jest.spyOn(BaseSessionHandler.prototype, 'proceedWithSession').mockImplementation();

    const spy = jest.fn();
    mockSdk.on('pendingSession', spy);

    mockSdk._config.disableAutoAnswer = true;
    mockSdk._config.eagerPersistentConnectionEstablishment = 'auto';

    const pendingSession = createPendingSession(SessionTypes.softphone);
    pendingSession.privAnswerMode = 'Auto';
    pendingSession.autoAnswer = true;
    await handler.handlePropose(pendingSession);

    expect(spy).not.toHaveBeenCalled();
    expect(superSpyHandlePropose).not.toHaveBeenCalled();
    expect(superSpyProceed).toHaveBeenCalled();
  });
});

describe('handleSessionInit()', () => {
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

  it('should auto accept reinvite sessions and mark previous session as replaced', async () => {
    const superInit = jest.spyOn(BaseSessionHandler.prototype, 'handleSessionInit');
    const acceptSessionSpy = jest.spyOn(handler, 'acceptSession').mockImplementation();
    mockSdk._config.autoConnectSessions = false;

    const oldSession = new MockSession();
    oldSession.conversationId = 'covid20';
    oldSession.sessionType = SessionTypes.softphone;
    jest.spyOn(handler['sessionManager'], 'getAllSessions').mockReturnValue([oldSession as any]);

    const session: any = new MockSession();
    session.conversationId = 'covid20';
    session.sessionType = SessionTypes.softphone;
    session.reinvite = true;
    await handler.handleSessionInit(session);

    expect(superInit).toHaveBeenCalled();
    expect(acceptSessionSpy).toHaveBeenCalled();
    expect(oldSession.sessionReplacedByReinvite).toBeTruthy();
  });

  it('should auto accept reinvite sessions and not blow up if there\'s no existing session', async () => {
    const superInit = jest.spyOn(BaseSessionHandler.prototype, 'handleSessionInit');
    const acceptSessionSpy = jest.spyOn(handler, 'acceptSession').mockImplementation();
    mockSdk._config.autoConnectSessions = false;

    jest.spyOn(handler['sessionManager'], 'getAllSessions').mockReturnValue([]);

    const session: any = new MockSession();
    session.conversationId = 'covid20';
    session.sessionType = SessionTypes.softphone;
    session.reinvite = true;
    await handler.handleSessionInit(session);

    expect(superInit).toHaveBeenCalled();
    expect(acceptSessionSpy).toHaveBeenCalled();
  });

  it('should not blow up if forceEndSession fails', async () => {
    const superInit = jest.spyOn(BaseSessionHandler.prototype, 'handleSessionInit');
    const acceptSessionSpy = jest.spyOn(handler, 'acceptSession').mockImplementation();
    mockSdk._config.autoConnectSessions = false;

    const oldSession = new MockSession();
    oldSession.conversationId = 'covid20';
    oldSession.sessionType = SessionTypes.softphone;
    jest.spyOn(handler['sessionManager'], 'getAllSessions').mockReturnValue([oldSession as any]);

    const session: any = new MockSession();
    session.conversationId = 'covid20';
    session.sessionType = SessionTypes.softphone;
    session.reinvite = true;

    jest.spyOn(handler as any, 'forceEndSession').mockRejectedValue('boom');
    await handler.handleSessionInit(session);

    expect(superInit).toHaveBeenCalled();
    expect(acceptSessionSpy).toHaveBeenCalled();
    expect(oldSession.sessionReplacedByReinvite).toBeTruthy();
  });
});

describe('acceptSession()', () => {
  let session: IExtendedMediaSession;
  let session2: IExtendedMediaSession;
  let sessionsArray: IExtendedMediaSession[];
  let callState: ICallStateFromParticipant;
  let update: ConversationUpdate;
  let participant: IConversationParticipantFromEvent;

  beforeEach(() => {
    session = new MockSession() as any;
    session2 = new MockSession() as any;
    session.conversationId = '1234session1';
    session2.conversationId = '1234session2';
    session2.sessionType = SessionTypes.softphone;
    sessionsArray = [session, session2];

    callState = {
      id: 'call-id',
      state: CommunicationStates.contacting,
      muted: false,
      confined: false,
      held: false,
      direction: 'outbound',
      provider: 'provider'
    };

    update = new ConversationUpdate({
      id: '123conversationId',
      participants: [{}]
    });

    participant = {
      id: 'participants-1',
      purpose: 'agent',
      userId: '123',
      calls: [callState],
      videos: []
    };

    handler.conversations = {
      [session.conversationId]: {
        session,
        conversationUpdate: update,
        conversationId: update.id,
        mostRecentUserParticipant: participant,
        mostRecentCallState: callState
      },
      [session2.conversationId]: {
        session: session2,
        conversationUpdate: update,
        conversationId: update.id,
        mostRecentUserParticipant: participant,
        mostRecentCallState: callState
      }
    };
  })

  it('should drop it on the floor if we have an activeSession with lineAppearance of 1', async () => {
    const acceptSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    const session: any = new MockSession();

    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(false);
    handler.activeSession = session;

    await handler.acceptSession(session, {} as any);

    expect(acceptSpy).not.toHaveBeenCalled();
    expect(mockSdk.logger.debug).toHaveBeenCalledWith(
      '`acceptSession` called with an active session and LineAppearance of 1. no further action needed. session will automatically accept',
      {
        conversationId: session.conversationId,
        sessionId: session.id
      },
      undefined
    );
  });

  it('should set the currentActiveSession if we have persistent connection', async () => {
    const session: any = new MockSession();
    const audioElement = {} as HTMLMediaElement;
    const mediaStream: MediaStream = new MockStream({ audio: true }) as any;

    /* LA > 1 */
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(true);
    /* persistent connection ON */
    jest.spyOn(mockSdk, 'isPersistentConnectionEnabled').mockReturnValue(true);
    jest.spyOn(BaseSessionHandler.prototype, 'acceptSession').mockImplementation();
    jest.spyOn(BaseSessionHandler.prototype, 'addMediaToSession').mockImplementation();
    const setCurrentSessionSpy = jest.spyOn(handler, 'setCurrentSession' as any);

    await handler.acceptSession(session, { audioElement, mediaStream, conversationId: session.conversationId });

    expect(setCurrentSessionSpy).toHaveBeenCalledWith(session);
  });

  it('should set the currentActiveSession if we have lineAppearance of 1', async () => {
    const session: IExtendedMediaSession = new MockSession() as any;
    const audioElement = {} as HTMLMediaElement;
    const mediaStream: MediaStream = new MockStream({ audio: true }) as any;

    /* LA == 1 */
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(false);
    /* persistent connection OFF */
    jest.spyOn(mockSdk, 'isPersistentConnectionEnabled').mockReturnValue(false);
    jest.spyOn(BaseSessionHandler.prototype, 'acceptSession').mockImplementation();
    jest.spyOn(BaseSessionHandler.prototype, 'addMediaToSession').mockImplementation();

    const setCurrentSessionSpy = jest.spyOn(handler, 'setCurrentSession' as any);

    handler.conversations[session.conversationId] = {} as any;

    await handler.acceptSession(session, { audioElement, mediaStream, conversationId: session.conversationId });

    expect(setCurrentSessionSpy).toHaveBeenCalledWith(session);
  });

  it('should not set cucrrentActiveSession if we already have an activeSession', async () => {
    const session: IExtendedMediaSession = new MockSession() as any;
    const audioElement = {} as HTMLMediaElement;
    const mediaStream: MediaStream = new MockStream({ audio: true }) as any;

    /* LA == 1 */
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(false);
    /* persistent connection OFF */
    jest.spyOn(mockSdk, 'isPersistentConnectionEnabled').mockReturnValue(false);
    jest.spyOn(BaseSessionHandler.prototype, 'acceptSession').mockImplementation();
    jest.spyOn(BaseSessionHandler.prototype, 'addMediaToSession').mockImplementation();

    const setCurrentSessionSpy = jest.spyOn(handler, 'setCurrentSession' as any);

    handler.conversations[session.conversationId] = {} as any;
    handler.activeSession = new MockSession() as any;

    await handler.acceptSession(session, { audioElement, mediaStream, conversationId: session.conversationId });

    expect(setCurrentSessionSpy).not.toHaveBeenCalled();
  });

  it('should add media using provided stream and element then accept session', async () => {
    const acceptSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    const attachSpy = jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();
    const addMediaSpy = jest.spyOn(handler, 'addMediaToSession').mockImplementation();
    const startMediaSpy = jest.spyOn(mockSdk.media, 'startMedia');

    const element = {};
    const volume = mockSdk._config.defaults!.audioVolume = 67;
    const mockOutgoingStream = new MockStream({ audio: true });
    const mockIncomingStream = new MockStream({ audio: true });

    const session: any = new MockSession();
    session.peerConnection.getReceivers = jest.fn().mockReturnValue([
      {
        track: {
          kind: 'audio'
        }
      }
    ]);
    session.streams = [mockIncomingStream];

    const params: IAcceptSessionRequest = {
      conversationId: session.conversationId,
      audioElement: element as any,
      mediaStream: mockOutgoingStream as any
    };
    const ids = {
      sessionId: session.id,
      conversationId: session.conversationId
    };

    await handler.acceptSession(session, params);

    expect(acceptSpy).toHaveBeenCalled();
    expect(startMediaSpy).not.toHaveBeenCalled();
    expect(addMediaSpy).toHaveBeenCalledWith(session, mockOutgoingStream);
    expect(attachSpy).toHaveBeenCalledWith(mockSdk, expect.anything(), volume, element, ids);
  });

  it('should add media using default stream and element then accept session', async () => {
    const acceptSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    const attachSpy = jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();
    const addMediaSpy = jest.spyOn(handler, 'addMediaToSession').mockImplementation();
    const startMediaSpy = jest.spyOn(mockSdk.media, 'startMedia');

    const defaultElement = {};
    const defaultStream = new MockStream({ audio: true });

    mockSdk._config.defaults!.audioElement = defaultElement as any;
    mockSdk._config.defaults!.audioStream = defaultStream as any;
    const volume = mockSdk._config.defaults!.audioVolume = 67;
    const mockIncomingStream = new MockStream({ audio: true });

    const session: any = new MockSession();
    session.peerConnection.getReceivers = jest.fn().mockReturnValue([
      {
        track: mockIncomingStream.getAudioTracks()[0]
      }
    ]);

    const params: IAcceptSessionRequest = {
      conversationId: session.conversationId
    };
    const ids = {
      sessionId: session.id,
      conversationId: session.conversationId
    };

    await handler.acceptSession(session, params);

    expect(acceptSpy).toHaveBeenCalled();
    expect(startMediaSpy).not.toHaveBeenCalled();
    expect(addMediaSpy).toHaveBeenCalledWith(session, defaultStream);
    expect(attachSpy).toHaveBeenCalledWith(mockSdk, expect.anything(), volume, defaultElement, ids);
  });

  it('should add media using created stream accept session', async () => {
    const mockAudioElement = {} as HTMLAudioElement;
    const acceptSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    const attachSpy = jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();
    const addMediaSpy = jest.spyOn(handler, 'addMediaToSession').mockImplementation();
    jest.spyOn(mediaUtils, 'createUniqueAudioMediaElement').mockReturnValue(mockAudioElement);

    const createdStream = new MockStream({ audio: true });
    const startMediaSpy = jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(createdStream as any);

    const mockIncomingStream = new MockStream({ audio: true });
    const volume = mockSdk._config.defaults!!.audioVolume = 67;

    const session: any = new MockSession();
    session.peerConnection.getReceivers = jest.fn().mockReturnValue([
      {
        track: mockIncomingStream.getAudioTracks()[0]
      }
    ]);

    const params: IAcceptSessionRequest = {
      conversationId: session.conversationId
    };
    const ids = {
      sessionId: session.id,
      conversationId: session.conversationId
    };

    await handler.acceptSession(session, params);

    expect(acceptSpy).toHaveBeenCalled();
    expect(startMediaSpy).toHaveBeenCalled();
    expect(addMediaSpy).toHaveBeenCalledWith(session, createdStream);
    expect(attachSpy).toHaveBeenCalledWith(mockSdk, expect.anything(), volume, mockAudioElement, ids);
  });

  it('should wait to attachAudioMedia until session has a track', async () => {
    const attachSpy = jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();
    jest.spyOn(mediaUtils, 'checkHasTransceiverFunctionality').mockReturnValue(true);

    const element = {};

    const session: any = new MockSession();
    const volume = mockSdk._config.defaults!!.audioVolume = 67;

    const params: IAcceptSessionRequest = {
      conversationId: session.conversationId,
      audioElement: element as any,
      mediaStream: new MockStream() as any
    };
    const ids = {
      sessionId: session.id,
      conversationId: session.conversationId
    };

    session.peerConnection.getReceivers = jest.fn().mockReturnValue([
      {
        track: null
      }
    ]);

    await handler.acceptSession(session, params);

    expect(attachSpy).not.toHaveBeenCalled();

    const mockIncomingStream = new MockStream({ video: false });
    const track = mockIncomingStream.getAudioTracks()[0];
    session.emit('peerTrackAdded', track, mockIncomingStream);

    expect(attachSpy).toHaveBeenCalledWith(mockSdk, mockIncomingStream, volume, element, ids);
  });

  it('should setup listener and remove audio element from DOM once session ends', async () => {
    const mockAudioElement = { parentNode: { removeChild: jest.fn() } } as any as HTMLAudioElement;
    jest.spyOn(mediaUtils, 'createUniqueAudioMediaElement').mockReturnValue(mockAudioElement);

    jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation((_sdk, _stream, _volume, element) => element as HTMLAudioElement);
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    const createdStream = new MockStream({ audio: true });
    jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(createdStream as any);

    const mockIncomingStream = new MockStream({ audio: true });
    mockSdk._config.defaults!.audioVolume = 100;

    const session: any = new MockSession();
    session.peerConnection.getReceivers = jest.fn().mockReturnValue([
      {
        track: mockIncomingStream.getAudioTracks()[0]
      }
    ]);

    const params: IAcceptSessionRequest = {
      conversationId: session.conversationId
    };

    await handler.acceptSession(session, params);

    session.emit('terminated');

    expect(mockAudioElement.parentNode!.removeChild).toHaveBeenCalledWith(mockAudioElement);
  });

  it('should setup listener but not remove the audio element from the DOM if it was not tracked', async () => {
    const mockAudioElement = { parentNode: { removeChild: jest.fn() } } as any as HTMLAudioElement;
    jest.spyOn(mediaUtils, 'createUniqueAudioMediaElement').mockReturnValue(mockAudioElement);

    jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation((_sdk, _stream, _volume, element) => element as HTMLAudioElement);
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    const createdStream = new MockStream({ audio: true });
    jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(createdStream as any);

    const mockIncomingStream = new MockStream({ audio: true });
    mockSdk._config.defaults!.audioVolume = 100;

    const session: any = new MockSession();
    session.streams = [mockIncomingStream];

    const params: IAcceptSessionRequest = {
      conversationId: session.conversationId
    };

    await handler.acceptSession(session, params);

    /* mimic if someone changes this (which they shouldn't) */
    session._outputAudioElement = {};

    session.emit('terminated');

    expect(mockAudioElement.parentNode!.removeChild).not.toHaveBeenCalledWith(mockAudioElement);
  });

  it('should hold other sessions if LA>1', () => {
    const setHoldSpy = jest.spyOn(handler, 'setConversationHeld').mockImplementation();
    const getActiveSessionsSpy = jest.spyOn(mockSessionManager, 'getAllActiveSessions').mockReturnValue(sessionsArray);
    const mockAudioElement = {} as HTMLAudioElement;
    jest.spyOn(BaseSessionHandler.prototype, 'acceptSession');
    jest.spyOn(mediaUtils, 'attachAudioMedia').mockImplementation();
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();
    jest.spyOn(mediaUtils, 'createUniqueAudioMediaElement').mockReturnValue(mockAudioElement);

    const createdStream = new MockStream({ audio: true });
    jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(createdStream as any);

    const mockIncomingStream = new MockStream({ audio: true });

    const session: any = new MockSession();
    session.peerConnection.getReceivers = jest.fn().mockReturnValue([
      {
        track: mockIncomingStream.getAudioTracks()[0]
      }
    ]);

    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(true);

    handler.acceptSession(session, { conversationId: session.conversationId });
    expect(setHoldSpy).toHaveBeenCalledWith(session2, { conversationId: session2.conversationId, held: true });
    expect(getActiveSessionsSpy).toHaveBeenCalled();
    expect(mockSdk.logger.debug).toHaveBeenCalledWith('Received new session or unheld previously held session with LA>1, holding other active sessions.', undefined, undefined);
  });
});

describe('proceedWithSession()', () => {
  let pendingSession: IPendingSession;
  let patchPhoneCallSpy: jest.SpyInstance;
  let proceedWithSessionSpy: jest.SpyInstance;
  let getUserParticipantFromConversationEventSpy: jest.SpyInstance;
  let fetchUserParticipantFromConversationIdSpy: jest.SpyInstance;

  beforeEach(() => {
    const sessionId = random().toString();
    pendingSession = {
      id: sessionId,
      sessionType: SessionTypes.softphone,
      sessionId,
      autoAnswer: true,
      toJid: 'someone-else',
      fromJid: 'maybe-me',
      conversationId: random().toString(),
    };

    patchPhoneCallSpy = jest.spyOn(handler, 'patchPhoneCall' as any).mockResolvedValue(null);
    proceedWithSessionSpy = jest.spyOn(BaseSessionHandler.prototype, 'proceedWithSession').mockResolvedValue(null);
    getUserParticipantFromConversationEventSpy = jest.spyOn(handler, 'getUserParticipantFromConversationEvent')
      .mockReturnValue(undefined);
    fetchUserParticipantFromConversationIdSpy = jest.spyOn(handler, 'fetchUserParticipantFromConversationId' as any)
      .mockResolvedValue(null)
  });

  it('should proxy call through if we do not have an active session', async () => {
    await handler.proceedWithSession(pendingSession);

    expect(proceedWithSessionSpy).toHaveBeenCalledWith(pendingSession);
    expect(patchPhoneCallSpy).not.toHaveBeenCalled();
  });

  it('should proxy call through if the session id does not match our activeSession', async () => {
    handler.activeSession = new MockSession() as any;

    await handler.proceedWithSession(pendingSession);

    expect(proceedWithSessionSpy).toHaveBeenCalledWith(pendingSession);
    expect(patchPhoneCallSpy).not.toHaveBeenCalled();
  });

  it('should patch the phone call with the participant from the conversationState', async () => {
    const participant = { id: 'gazer-beam' };
    getUserParticipantFromConversationEventSpy.mockReturnValue(participant);

    handler.activeSession = new MockSession() as any;
    handler.activeSession!.id = pendingSession.id;
    handler.conversations[pendingSession.conversationId] = { conversationUpdate: {} } as any;

    await handler.proceedWithSession(pendingSession);

    expect(proceedWithSessionSpy).not.toHaveBeenCalled();
    expect(patchPhoneCallSpy).toHaveBeenCalledWith(
      pendingSession.conversationId,
      participant.id,
      { state: CommunicationStates.connected }
    );
  });

  it('should load the participant and then patch the phone call', async () => {
    const participant = { id: 'gazer-beam' };
    fetchUserParticipantFromConversationIdSpy.mockResolvedValue(participant);

    handler.activeSession = new MockSession() as any;
    handler.activeSession!.id = pendingSession.id;

    await handler.proceedWithSession(pendingSession);

    expect(proceedWithSessionSpy).not.toHaveBeenCalled();
    expect(patchPhoneCallSpy).toHaveBeenCalledWith(
      pendingSession.conversationId,
      participant.id,
      { state: CommunicationStates.connected }
    );
  });
});

describe('rejectPendingSession()', () => {
  let pendingSession: IPendingSession;
  let patchPhoneCallSpy: jest.SpyInstance;
  let superRejectPendingSessionSpy: jest.SpyInstance;
  let getUserParticipantFromConversationEventSpy: jest.SpyInstance;
  let fetchUserParticipantFromConversationIdSpy: jest.SpyInstance;

  beforeEach(() => {
    const sessionId = random().toString();
    pendingSession = {
      id: sessionId,
      sessionType: SessionTypes.softphone,
      sessionId,
      autoAnswer: true,
      toJid: 'someone-else',
      fromJid: 'maybe-me',
      conversationId: random().toString(),
    };

    patchPhoneCallSpy = jest.spyOn(handler, 'patchPhoneCall' as any).mockResolvedValue(null);
    superRejectPendingSessionSpy = jest.spyOn(BaseSessionHandler.prototype, 'rejectPendingSession').mockResolvedValue(null);
    getUserParticipantFromConversationEventSpy = jest.spyOn(handler, 'getUserParticipantFromConversationEvent')
      .mockReturnValue(undefined);
    fetchUserParticipantFromConversationIdSpy = jest.spyOn(handler, 'fetchUserParticipantFromConversationId' as any)
      .mockResolvedValue(null)
  });

  it('should reject uc calls by sending to vm', async () => {
    const participant = { id: 'blazer', purpose: 'user' };
    getUserParticipantFromConversationEventSpy.mockReturnValue(participant);

    handler.activeSession = new MockSession() as any;
    handler.activeSession!.id = pendingSession.id;
    handler.conversations[pendingSession.conversationId] = { conversationUpdate: {} } as any;

    const spy = jest.spyOn(handler, '_rejectUcCall').mockResolvedValue(null);

    await handler.rejectPendingSession(pendingSession);

    expect(spy).toHaveBeenCalled();
    expect(superRejectPendingSessionSpy).not.toHaveBeenCalled();
    expect(patchPhoneCallSpy).not.toHaveBeenCalled();
  });

  it('should patch the phone call with the participant from the conversationState', async () => {
    const participant = { id: 'gazer-beam' };
    getUserParticipantFromConversationEventSpy.mockReturnValue(participant);

    handler.activeSession = new MockSession() as any;
    handler.activeSession!.id = pendingSession.id;
    handler.conversations[pendingSession.conversationId] = { conversationUpdate: {} } as any;

    await handler.rejectPendingSession(pendingSession);

    expect(superRejectPendingSessionSpy).not.toHaveBeenCalled();
    expect(patchPhoneCallSpy).toHaveBeenCalledWith(
      pendingSession.conversationId,
      participant.id,
      { state: CommunicationStates.disconnected }
    );
  });

  it('should load the participant and then patch the phone call', async () => {
    const participant = { id: 'gazer-beam' };
    fetchUserParticipantFromConversationIdSpy.mockResolvedValue(participant);

    handler.activeSession = new MockSession() as any;
    handler.activeSession!.id = pendingSession.id;

    await handler.rejectPendingSession(pendingSession);

    expect(superRejectPendingSessionSpy).not.toHaveBeenCalled();
    expect(patchPhoneCallSpy).toHaveBeenCalledWith(
      pendingSession.conversationId,
      participant.id,
      { state: CommunicationStates.disconnected }
    );
  });
});

describe('_rejectUcCall', () => {
  it('should call requestApi', async () => {
    const requestApiSpy = jest.spyOn(utils, 'requestApi').mockResolvedValue(null);

    await handler._rejectUcCall('myConvo', 'myPartId');

    expect(requestApiSpy).toHaveBeenCalled();
    requestApiSpy.mockRestore();
  });
});

describe('handleConversationUpdate()', () => {
  const userId = 'our-agent-user';
  const conversationId = 'convo-id';
  let session: IExtendedMediaSession;
  let update: ConversationUpdate;
  let participant: IConversationParticipantFromEvent;
  let callState: ICallStateFromParticipant;
  let handleSoftphoneConversationUpdateSpy: jest.SpyInstance;

  beforeEach(() => {
    callState = {
      id: 'call-id',
      state: CommunicationStates.contacting,
      muted: false,
      confined: false,
      held: false,
      direction: 'outbound',
      provider: 'provider'
    };
    participant = {
      id: 'participants-1',
      purpose: 'agent',
      userId,
      calls: [callState],
      videos: []
    };
    update = new ConversationUpdate({
      id: conversationId,
      participants: [participant]
    });

    session = new MockSession() as any;
    session.conversationId = update.id;
    mockSdk._personDetails = { id: userId } as IPersonDetails;
    handleSoftphoneConversationUpdateSpy = jest.spyOn(handler, 'handleSoftphoneConversationUpdate').mockImplementation();
  });

  it('should do nothing if no participant on the update', () => {
    update.participants = [];
    handler.handleConversationUpdate(update, []);
    expect(mockSdk.logger.debug).toHaveBeenCalledWith('user participant not found on the conversation update', update, { skipServer: true });
  });

  it('should do nothing if no callState on the participant', () => {
    update.participants = update.participants.map(p => ({ ...p, calls: [] }));
    handler.handleConversationUpdate(update, []);
    expect(mockSdk.logger.debug).toHaveBeenCalledWith("user participant's call state not found on the conversation update. not processing", expect.any(Object), { skipServer: true });
  });

  it('should use the session on the previous conversationState', () => {
    handler.conversations = {
      [update.id]: {
        session,
        conversationUpdate: update,
        conversationId: update.id,
        mostRecentUserParticipant: participant,
        mostRecentCallState: callState
      }
    };

    handler.handleConversationUpdate(update, []);
    expect(handleSoftphoneConversationUpdateSpy).toHaveBeenCalledWith(
      update,
      participant,
      callState,
      session
    );
  });

  it('should use the active session if lineAppearance == 1', () => {
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(false);
    handler.activeSession = session;

    handler.handleConversationUpdate(update, []);
    expect(handleSoftphoneConversationUpdateSpy).toHaveBeenCalledWith(
      update,
      participant,
      callState,
      session
    );
  });

  it('should find the session from the passed in array of sessions', () => {
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(true);

    handler.handleConversationUpdate(update, [session]);
    expect(handleSoftphoneConversationUpdateSpy).toHaveBeenCalledWith(
      update,
      participant,
      callState,
      session
    );
  });

  it('should do extra checks if it could not find session initially and persistent connection is enabled', () => {
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(true);
    jest.spyOn(mockSdk, 'isPersistentConnectionEnabled').mockReturnValue(true);

    handler.activeSession = session;
    handler.conversations = {
      [update.id]: {
        // session,
        conversationUpdate: update,
        conversationId: update.id,
        mostRecentUserParticipant: participant,
        mostRecentCallState: callState
      }
    };

    handler.handleConversationUpdate(update, []);
    expect(handleSoftphoneConversationUpdateSpy).toHaveBeenCalledWith(
      update,
      participant,
      callState,
      session
    );
    expect(mockSdk.logger.info).toHaveBeenCalledWith(
      'we have an active session that is not in use by another conversation. using that session',
      expect.any(Object),
      undefined
    );
  });

  it('should use no session if there is not one', () => {
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(true);
    jest.spyOn(mockSdk, 'isPersistentConnectionEnabled').mockReturnValue(true);

    handler.conversations = {
      [update.id]: {
        conversationUpdate: update,
        conversationId: update.id,
        mostRecentUserParticipant: participant,
        mostRecentCallState: callState
      }
    };

    handler.handleConversationUpdate(update, []);
    expect(handleSoftphoneConversationUpdateSpy).toHaveBeenCalledWith(
      update,
      participant,
      callState,
      undefined
    );
  });
});

describe('handleSoftphoneConversationUpdate()', () => {
  interface ReturnedState {
    update: ConversationUpdate;
    participant: IConversationParticipantFromEvent;
    callState: ICallStateFromParticipant;
    session: IExtendedMediaSession;
    previousUpdate?: ConversationUpdate;
  }

  interface RequestState {
    callState?: CommunicationStates;
    session?: IExtendedMediaSession;
    previousCallState?: Partial<ICallStateFromParticipant>;
  }

  const generateUpdate = (reqState: RequestState = {}): ReturnedState => {
    const state = reqState.callState || CommunicationStates.contacting;
    const session: IExtendedMediaSession = reqState.session || new MockSession() as any;

    const callState = {
      id: 'call-id',
      state,
      muted: false,
      confined: false,
      held: false,
      direction: 'outbound',
      provider: 'provider'
    } as ICallStateFromParticipant;

    const participant = {
      id: 'participants-1',
      purpose: 'agent',
      userId,
      calls: [callState],
      videos: []
    } as IConversationParticipantFromEvent;

    const update = new ConversationUpdate({
      id: session.conversationId,
      participants: [participant]
    });

    let previousUpdate: ConversationUpdate;
    if (reqState.previousCallState) {
      const previousCallState = { ...callState, ...reqState.previousCallState };
      const previousParticipant = { ...participant, calls: [previousCallState] };
      previousUpdate = new ConversationUpdate({
        id: session.id,
        participants: [previousParticipant]
      });
    }

    return {
      update,
      participant,
      callState,
      session,
      previousUpdate: previousUpdate!
    };
  };

  const userId = 'martian-manhunter';
  const userJid = 'martians-like-to-talk-too@mars.com';
  let emitConversationEventSpy: jest.SpyInstance;
  let sdkEmitSpy: jest.SpyInstance;

  beforeEach(() => {
    mockSdk._personDetails = { id: userId, chat: { jabberId: userJid } } as IPersonDetails;
    emitConversationEventSpy = jest.spyOn(handler, 'emitConversationEvent')
      .mockImplementation();
    sdkEmitSpy = jest.spyOn(mockSdk, 'emit').mockImplementation();
  });

  describe('headset functionality', () => {
    it('should call outboundCall', async () => {
      const spy = jest.spyOn(mockHeadset, 'outgoingCall');
      const { update, participant, callState, session } = generateUpdate({
        callState: CommunicationStates.contacting
      });

      handler.activeSession = session;

      handler.handleSoftphoneConversationUpdate(update, participant, callState, session);
      expect(spy).toHaveBeenCalled();
    });

    it('should call setRinging', async () => {
      const spy = jest.spyOn(mockHeadset, 'setRinging');
      const { update, participant, callState, session } = generateUpdate({
        callState: CommunicationStates.alerting
      });

      callState.direction = 'inbound';

      handler.activeSession = session;

      handler.handleSoftphoneConversationUpdate(update, participant, callState, session);
      expect(spy).toHaveBeenCalled();
    });

    it('should call answerIncomingCall', async () => {
      (mockHeadset as HeadsetProxyService).orchestrationState = 'hasControls';
      const spy = jest.spyOn(mockHeadset, 'answerIncomingCall');
      const { update, participant, callState, session, previousUpdate } = generateUpdate({
        callState: CommunicationStates.connected,
        previousCallState: { state: CommunicationStates.alerting }
      });
      callState.direction = 'inbound';

      handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;

      handler.activeSession = session;

      handler.handleSoftphoneConversationUpdate(update, participant, callState, session);
      expect(spy).toHaveBeenCalled();
    });

    it('should call rejectIncomingCall', async () => {
      const spy = jest.spyOn(mockHeadset, 'rejectIncomingCall');
      const { update, participant, callState, session, previousUpdate } = generateUpdate({
        callState: CommunicationStates.disconnected,
        previousCallState: { state: CommunicationStates.alerting }
      });
      callState.direction = 'inbound';

      handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;
      handler.activeSession = session;

      handler.handleSoftphoneConversationUpdate(update, participant, callState, session);
      expect(spy).toHaveBeenCalled();
    });

    it('should call endCurrentCall', async () => {
      const spy = jest.spyOn(mockHeadset, 'endCurrentCall');
      const { update, participant, callState, session, previousUpdate } = generateUpdate({
        callState: CommunicationStates.disconnected,
        previousCallState: { state: CommunicationStates.connected }
      });

      handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;
      handler.activeSession = session;

      handler.handleSoftphoneConversationUpdate(update, participant, callState, session);
      expect(spy).toHaveBeenCalled();
    });
  });

  it('should return void if it is a non-pending session that this client did not answer it', () => {
    const { update, participant, callState, session } = generateUpdate({ callState: CommunicationStates.connected });

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    expect(mockSdk.logger.debug).toHaveBeenCalledWith(
      'received a conversation event for a conversation we are not responsible for. not processing',
      { update, callState },
      { skipServer: true }
    );
  });

  it('should return void if the call state did not change for our user', () => {
    const { update, participant, callState, session, previousUpdate } = generateUpdate({
      callState: CommunicationStates.connected,
      previousCallState: {}
    });

    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    expect(mockSdk.logger.debug).toHaveBeenCalledWith(
      'conversation update received but state is unchanged. ignoring',
      {
        conversationId: update.id,
        previousCallState: callState,
        callState,
        sessionType: handler.sessionType
      },
      undefined
    );
  });

  it('should emit an update if our users state changed, but not their communication state', async () => {
    const { update, participant, callState, session, previousUpdate } = generateUpdate({
      callState: CommunicationStates.connected,
      previousCallState: { muted: true }
    });

    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);
    await flushPromises();
    expect(emitConversationEventSpy).toHaveBeenCalledWith(
      'updated',
      handler.conversations[update.id],
      session
    );
  });

  it('should emit a pending session if we already have an active session', async () => {
    const { update, participant, callState, session } = generateUpdate({
      callState: CommunicationStates.alerting
    });

    handler.activeSession = session;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    const expectedPendingSession: IPendingSession = {
      id: session.id,
      sessionId: session.id,
      autoAnswer: callState.direction === 'outbound', // Not always accurate. If inbound auto answer, we don't know about it from convo evt
      conversationId: update.id,
      sessionType: handler.sessionType,
      originalRoomJid: session.originalRoomJid,
      fromUserId: session.fromUserId,
      fromJid: session.peerID,
      toJid: userJid
    }

    await flushPromises();

    expect(emitConversationEventSpy).not.toHaveBeenCalled();
    expect(sdkEmitSpy).toHaveBeenCalledWith(
      'pendingSession',
      expectedPendingSession
    );
    expect(mockSessionManager.pendingSessions[0]).toEqual(expectedPendingSession);
  });

  it('should not emit a pending session if we do not have an active session', () => {
    const { update, participant, callState, session } = generateUpdate({
      callState: CommunicationStates.alerting
    });

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    expect(emitConversationEventSpy).not.toHaveBeenCalled();
    expect(sdkEmitSpy).not.toHaveBeenCalledWith(
      'pendingSession',
      expect.any(Object)
    );
  });

  it('should not emit "sessionStarted" for conversationUpdates in a connected state when the session was accepted by the normal session-accept', () => {
    const { update, participant, callState, session, previousUpdate } = generateUpdate({
      callState: CommunicationStates.connected,
      previousCallState: { state: CommunicationStates.contacting }
    });

    session.conversationId = 'not-our-updates-convo-id';
    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    expect(emitConversationEventSpy).toHaveBeenCalledWith(
      'added',
      handler.conversations[update.id],
      session
    );
    expect(handler.conversations[update.id]).toBeTruthy();
    expect(sdkEmitSpy).not.toHaveBeenCalled();
  });

  it('should not emit for conversationUpdates in a connected state when the previous call was not in a connectedState', () => {
    const { update, participant, callState, session, previousUpdate } = generateUpdate({
      callState: CommunicationStates.connected,
      previousCallState: { state: CommunicationStates.contacting }
    });

    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    expect(emitConversationEventSpy).toHaveBeenCalledWith(
      'added',
      handler.conversations[update.id],
      session
    );
    expect(handler.conversations[update.id]).toBeTruthy();
    expect(sdkEmitSpy).not.toHaveBeenCalled();
  });

  it('should not emit for conversationUpdates that we do not have a session for', () => {
    const { update, participant, callState, previousUpdate } = generateUpdate({
      callState: CommunicationStates.connected,
      previousCallState: { state: CommunicationStates.contacting }
    });

    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, undefined);

    expect(emitConversationEventSpy).not.toHaveBeenCalled();
    expect(handler.conversations[update.id]).toBeFalsy();
    expect(sdkEmitSpy).not.toHaveBeenCalled();
  });

  it('should not emit for conversationUpdates that we do not have a session for but call resetHeadsetStateForCall if orchestrationState===hasControls', () => {
    (mockSdk.headset as HeadsetProxyService).orchestrationState = 'hasControls';
    const resetCallSpy = jest.spyOn(mockHeadset, 'resetHeadsetStateForCall');
    const { update, participant, callState, previousUpdate } = generateUpdate({
      callState: CommunicationStates.connected,
      previousCallState: { state: CommunicationStates.contacting }
    });

    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, undefined);

    expect(resetCallSpy).toHaveBeenCalled();
    expect(emitConversationEventSpy).not.toHaveBeenCalled();
    expect(handler.conversations[update.id]).toBeFalsy();
    expect(sdkEmitSpy).not.toHaveBeenCalled();
  });

  it('should emit "updated" event if we did not have a previous call but have a connection call now', async () => {
    const { session, update, participant, callState } = generateUpdate({
      callState: CommunicationStates.connected,
      previousCallState: { state: CommunicationStates.contacting }
    });

    handler.conversations[update.id] = {} as any; // this would never really happen
    handler.activeSession = session;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    await flushPromises();

    expect(emitConversationEventSpy).toHaveBeenCalledWith(
      'updated',
      handler.conversations[update.id],
      session
    );
    expect(handler.conversations[update.id]).toBeTruthy();
    expect(sdkEmitSpy).not.toHaveBeenCalled();
  });

  it('should emit "sessionStarted" if we have an active session and we have not already emitted one', () => {
    const { update, participant, callState, session, previousUpdate } = generateUpdate({
      callState: CommunicationStates.connected,
      previousCallState: { state: CommunicationStates.contacting }
    });

    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;
    handler.activeSession = session;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    expect(emitConversationEventSpy).toHaveBeenCalledWith(
      'added',
      handler.conversations[update.id],
      session
    );
    expect(handler.conversations[update.id]).toBeTruthy();
    expect(sdkEmitSpy).toHaveBeenCalledWith(
      'sessionStarted',
      session
    );
  });

  it('should not emit "sessionStarted" if it was already emitted', () => {
    const { update, participant, callState, session, previousUpdate } = generateUpdate({
      callState: CommunicationStates.connected,
      previousCallState: { state: CommunicationStates.contacting }
    });

    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;
    handler.activeSession = session;
    session._emittedSessionStarteds = { [update.id]: true };

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    expect(emitConversationEventSpy).toHaveBeenCalledWith(
      'added',
      handler.conversations[update.id],
      session
    );
    expect(handler.conversations[update.id]).toBeTruthy();
    expect(sdkEmitSpy).not.toHaveBeenCalled();
  });

  it('should handle pending sessions we rejected', async () => {
    const { update, participant, callState, session, previousUpdate } = generateUpdate({
      callState: CommunicationStates.disconnected,
      previousCallState: { state: CommunicationStates.contacting }
    });
    const onCancelPendingSessionSpy = jest.spyOn(mockSessionManager, 'onCancelPendingSession').mockImplementation();

    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;
    handler.activeSession = session;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    await flushPromises();

    expect(onCancelPendingSessionSpy).toHaveBeenCalledWith(
      session.id,
      update.id
    );
    expect(emitConversationEventSpy).not.toHaveBeenCalled();
    expect(handler.conversations[update.id]).toBeFalsy();
    expect(sdkEmitSpy).not.toHaveBeenCalled();
  });

  it('should delete conversationState, not emit an event, and not cancelPendingSession if session does not match active session', async () => {
    const { update, participant, callState, session, previousUpdate } = generateUpdate({
      callState: CommunicationStates.disconnected,
      previousCallState: { state: CommunicationStates.contacting }
    });
    const onCancelPendingSessionSpy = jest.spyOn(mockSessionManager, 'onCancelPendingSession').mockImplementation();

    /* 1st: we don't pass in a session */
    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;
    handler.handleSoftphoneConversationUpdate(update, participant, callState, undefined);

    await flushPromises();

    expect(onCancelPendingSessionSpy).not.toHaveBeenCalled();
    expect(emitConversationEventSpy).not.toHaveBeenCalled();
    expect(handler.conversations[update.id]).toBeFalsy();
    expect(sdkEmitSpy).not.toHaveBeenCalled();

    /* 2nd: our session does not match our current active session */
    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;
    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    await flushPromises();

    expect(onCancelPendingSessionSpy).not.toHaveBeenCalled();
    expect(emitConversationEventSpy).not.toHaveBeenCalled();
    expect(handler.conversations[update.id]).toBeFalsy();
    expect(sdkEmitSpy).not.toHaveBeenCalled();
  });

  it('should filter out duplicate ended events', () => {
    const { update, participant, callState, session } = generateUpdate({
      callState: CommunicationStates.terminated
    });

    /* mimic that we already received a "disconnect" callState event */
    expect(handler.conversations[update.id]).toBeFalsy();

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    expect(emitConversationEventSpy).not.toHaveBeenCalled();
    expect(handler.conversations[update.id]).toBeFalsy();
    expect(sdkEmitSpy).not.toHaveBeenCalled();
  });

  it('should emit removed event if we were responsible for the call', () => {
    const { update, participant, callState, session, previousUpdate } = generateUpdate({
      callState: CommunicationStates.disconnected,
      previousCallState: { state: CommunicationStates.connected }
    });

    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    expect(emitConversationEventSpy).toHaveBeenCalledWith(
      'removed',
      handler.conversations[update.id],
      session
    );
    expect(sdkEmitSpy).not.toHaveBeenCalled();
  });

  it('should emit removed event and "sessionEnded" if we had an activeSession', async () => {
    const { update, participant, callState, session, previousUpdate } = generateUpdate({
      callState: CommunicationStates.disconnected,
      previousCallState: { state: CommunicationStates.connected }
    });

    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;
    handler.activeSession = session;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    await flushPromises();

    expect(emitConversationEventSpy).toHaveBeenCalledWith(
      'removed',
      handler.conversations[update.id],
      session
    );
    expect(handler.conversations[update.id]).toBeTruthy();
    expect(sdkEmitSpy).toHaveBeenCalledWith(
      'sessionEnded',
      session,
      { condition: JingleReasons.success }
    );
  });

  it('should emit "updated" if we are in and ended state but did not have a previous callState', () => {
    const { update, participant, callState, session } = generateUpdate({
      callState: CommunicationStates.disconnected
    });

    handler.conversations[update.id] = {} as any; // should never happen
    handler.activeSession = session;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    expect(emitConversationEventSpy).not.toHaveBeenCalled();
    expect(handler.conversations[update.id]).toBeTruthy();
    expect(sdkEmitSpy).not.toHaveBeenCalled();
  });

  it('should emit "updated" if we have an unknown communicationState', () => {
    const { update, participant, callState, session, previousUpdate } = generateUpdate({
      callState: CommunicationStates.hold,
      previousCallState: { state: CommunicationStates.connected }
    });

    handler.conversations[update.id] = { conversationUpdate: previousUpdate } as any;

    handler.handleSoftphoneConversationUpdate(update, participant, callState, session);

    expect(emitConversationEventSpy).toHaveBeenCalledWith(
      'updated',
      handler.conversations[update.id],
      session
    );
    expect(handler.conversations[update.id]).toBeTruthy();
  });
});

describe('diffConversationCallStates()', () => {
  let call1: ICallStateFromParticipant;
  let call2: ICallStateFromParticipant;

  beforeEach(() => {
    call1 = {
      state: CommunicationStates.connected,
      confined: false,
      held: false,
      muted: false,
      direction: 'inbound',
      provider: 'anything',
      id: 'something'
    };
    call2 = { ...call1 };
  });

  it('should return "false" if the call states are not different', () => {
    expect(handler.diffConversationCallStates(call1, call2)).toBe(false);
  });

  it('should return "true" if one call state is missing', () => {
    expect(handler.diffConversationCallStates(undefined as any, call2)).toBe(true);
    expect(handler.diffConversationCallStates(call1, undefined as any)).toBe(true);
  });

  it('should return "true" if the state is different', () => {
    call2.state = CommunicationStates.disconnected;
    expect(handler.diffConversationCallStates(call1, call2)).toBe(true);
  });

  it('should return "true" if the confined is different', () => {
    call2.confined = true;
    expect(handler.diffConversationCallStates(call1, call2)).toBe(true);
  });

  it('should return "true" if the held is different', () => {
    call2.held = true;
    expect(handler.diffConversationCallStates(call1, call2)).toBe(true);
  });

  it('should return "true" if the muted is different', () => {
    call2.muted = true;
    expect(handler.diffConversationCallStates(call1, call2)).toBe(true);
  });
});

describe('emitConversationEvent()', () => {
  const activeConvoId = 'activity-is-good';
  let conversationState: IStoredConversationState;
  let expectedEvent: ISdkConversationUpdateEvent;

  beforeEach(() => {
    conversationState = {
      conversationId: 'convo-id',
      session: { id: '345' } as IExtendedMediaSession,
      conversationUpdate: new ConversationUpdate({ participants: [] }),
      mostRecentUserParticipant: undefined,
      mostRecentCallState: undefined
    };
    expectedEvent = {
      added: [],
      removed: [],
      current: [],
      activeConversationId: activeConvoId
    };
    jest.spyOn(handler, 'determineActiveConversationId').mockReturnValue(activeConvoId);
  });

  it('should emit added conversations', () => {
    mockSdk.on('conversationUpdate', event => {
      expect(event).toEqual(expectedEvent);
    });

    expectedEvent.added.push(conversationState);
    handler.emitConversationEvent('added', conversationState, { id: '123' } as IExtendedMediaSession);
  });

  it('should emit removed conversations', () => {
    mockSdk.on('conversationUpdate', event => {
      expect(event).toEqual(expectedEvent);
    });

    expectedEvent.removed.push(conversationState);
    handler.emitConversationEvent('removed', conversationState, undefined as any);
  });

  it('should remove from the current array', () => {
    mockSdk.on('conversationUpdate', event => {
      expect(event).toEqual(expectedEvent);
    });

    expectedEvent.removed.push(conversationState);
    handler.conversations = { [conversationState.conversationId]: conversationState };
    handler.emitConversationEvent('removed', conversationState, { id: '123' } as IExtendedMediaSession);
  });

  it('should emit updated conversations', () => {
    mockSdk.on('conversationUpdate', event => {
      expect(event).toEqual(expectedEvent);
    });

    handler.conversations[conversationState.conversationId] = conversationState;
    expectedEvent.current.push(conversationState);
    handler.emitConversationEvent('updated', conversationState, undefined as any);
  });
});

describe('pruneConversationUpdateForLogging', () => {
  it('should replace session but not in original update', () => {
    const lastEmittedSdkConversationEvent = {
      current: [
        { conversationId: 'convo1', session: { id: 'session1' }},
        { conversationId: 'convo2', session: { id: 'session2' }}
      ],
      added: [],
      removed: []
    } as unknown as ISdkConversationUpdateEvent;

    const prunedConvo = handler['pruneConversationUpdateForLogging'](lastEmittedSdkConversationEvent) as any;

    expect(Object.keys(prunedConvo.current[0])).not.toContain('session');
    expect(prunedConvo.current[0].sessionId).toBeTruthy();
    expect(prunedConvo.current[0].sessionId).toBe(lastEmittedSdkConversationEvent.current[0].session?.id);
    expect(lastEmittedSdkConversationEvent.current[0].session).toBeTruthy();
  });

  it('should not throw if a session does not exist', () => {
    const lastEmittedSdkConversationEvent = {
      current: [
        { conversationId: 'convo1' },
        { conversationId: 'convo2' }
      ],
      added: [],
      removed: []
    } as unknown as ISdkConversationUpdateEvent;

    expect(() => handler['pruneConversationUpdateForLogging'](lastEmittedSdkConversationEvent)).not.toThrow();
  })
});

describe('determineActiveConversationId()', () => {
  let connectedCall: ICallStateFromParticipant;

  beforeEach(() => {
    connectedCall = {
      state: CommunicationStates.connected,
      confined: false,
      held: false,
      muted: false,
      direction: 'inbound',
      provider: 'anything',
      id: 'something'
    };
  });

  it('should use activeSessionId if no current conversationStates', () => {
    handler.activeSession = { conversationId: 'friends' } as IExtendedMediaSession;
    expect(handler.determineActiveConversationId()).toBe(handler.activeSession.conversationId);
  });

  it('should use passed in sessionId if no current conversationStates and no activeSession', () => {
    const session = { conversationId: 'friends' } as IExtendedMediaSession;
    expect(handler.determineActiveConversationId(session)).toBe(session.conversationId);
  });

  it('should return empty string if no activeSession or passed in session', () => {
    expect(handler.determineActiveConversationId(undefined)).toBe('');
  });

  it('should return the conversationId if there is only one conversationState', () => {
    const conversationId = 'tom-and-jerry';
    handler.conversations = {
      [conversationId]: { conversationId } as IStoredConversationState
    };
    expect(handler.determineActiveConversationId()).toBe(conversationId);
  });

  it('should use the first connected call', () => {
    const conversationId = 'pacman';
    handler.conversations = {
      ['hungry-ghost']: {
        conversationId: 'ghosty',
        mostRecentCallState: { ...connectedCall, state: CommunicationStates.alerting }
      } as IStoredConversationState,
      [conversationId]: {
        conversationId,
        mostRecentCallState: connectedCall
      } as IStoredConversationState
    };

    expect(handler.determineActiveConversationId()).toBe(conversationId);
  });

  it('should use the first non-held call if there are multiple connected calls', () => {
    const conversationId = 'big-bird';
    handler.conversations = {
      oscar: {
        conversationId: 'oscar',
        mostRecentCallState: { ...connectedCall, held: true }
      } as IStoredConversationState,
      [conversationId]: {
        conversationId,
        mostRecentCallState: connectedCall
      } as IStoredConversationState
    };

    expect(handler.determineActiveConversationId()).toBe(conversationId);
  });

  it('should return the conversationId on the passed in session if there are multiple calls on hold', () => {
    handler.conversations = {
      bert: {
        conversationId: 'bert',
        mostRecentCallState: { ...connectedCall, held: true }
      } as IStoredConversationState,
      ernie: {
        conversationId: 'ernie',
        mostRecentCallState: { ...connectedCall, held: true }
      } as IStoredConversationState
    };
    const session = { conversationId: 'sesame-street' } as IExtendedMediaSession;

    expect(handler.determineActiveConversationId(session)).toBe(session.conversationId);
  });

  it('should return the conversationId on the passed in session if there are no connectedCalls', () => {
    handler.conversations = {
      count: {
        conversationId: 'count',
        mostRecentCallState: { ...connectedCall, state: CommunicationStates.disconnected }
      } as IStoredConversationState,
      ocsar: {
        conversationId: 'ocsar',
        mostRecentCallState: { ...connectedCall, state: CommunicationStates.terminated }
      } as IStoredConversationState
    };
    const session = { conversationId: 'sesame-street' } as IExtendedMediaSession;

    expect(handler.determineActiveConversationId(session)).toBe(session.conversationId);
  });

  it('should return an emtpy string if there are no conversations', () => {
    handler.conversations = {
      bert: {
        conversationId: 'bert',
        mostRecentCallState: { ...connectedCall, held: true }
      } as IStoredConversationState,
      ernie: {
        conversationId: 'ernie',
        mostRecentCallState: { ...connectedCall, held: true }
      } as IStoredConversationState
    };

    expect(handler.determineActiveConversationId()).toBe('');
  });
});

describe('getUsersCallStateFromConversationEvent()', () => {
  let converversationUpdate: ConversationUpdate;
  let getUserParticipantFromConversationEventSpy: jest.SpyInstance;

  beforeEach(() => {
    getUserParticipantFromConversationEventSpy = jest.spyOn(handler, 'getUserParticipantFromConversationEvent')
      .mockImplementation();
    jest.spyOn(handler, 'getCallStateFromParticipant')
      .mockImplementation();

    converversationUpdate = new ConversationUpdate({ participants: [] });
  });

  it('should use passed in state', () => {
    handler.getUsersCallStateFromConversationEvent(converversationUpdate, CommunicationStates.alerting);

    expect(getUserParticipantFromConversationEventSpy).toHaveBeenCalledWith(converversationUpdate, CommunicationStates.alerting);
  });

  it('should use default connected state', () => {
    handler.getUsersCallStateFromConversationEvent(converversationUpdate);

    expect(getUserParticipantFromConversationEventSpy).toHaveBeenCalledWith(converversationUpdate, CommunicationStates.connected);
  });
});

describe('getUserParticipantFromConversationEvent()', () => {
  const conversationId = 'call-home-to-asgard';
  const userId = 'loki';
  let converversationUpdate: ConversationUpdate;
  let participant1: IConversationParticipantFromEvent;
  let participant2: IConversationParticipantFromEvent;
  let call: ICallStateFromParticipant;

  beforeEach(() => {
    mockSdk._personDetails = { id: userId } as IPersonDetails;

    participant1 = {
      id: 'party#1',
      purpose: 'totalk',
      userId,
      videos: [],
      calls: []
    };

    participant2 = {
      id: 'party#2',
      purpose: 'tolisten',
      userId,
      videos: [],
      calls: []
    };

    converversationUpdate = new ConversationUpdate({ id: conversationId, participants: [participant1, participant2] });

    call = {
      state: CommunicationStates.connected,
      confined: false,
      held: false,
      muted: false,
      direction: 'inbound',
      provider: 'anything',
      id: 'something'
    };
  });

  it('should return void if no update', () => {
    expect(handler.getUserParticipantFromConversationEvent(undefined as any)).toBe(undefined);
  });

  it('should return void if no participant found with the auth userId', () => {
    converversationUpdate.participants = [{ ...participant2, userId: 'not-loki' }];
    expect(handler.getUserParticipantFromConversationEvent(converversationUpdate)).toBe(undefined);
    expect(mockSdk.logger.warn).toHaveBeenCalledWith('user not found on conversation as a participant', { conversationId }, undefined);
  });

  it('should return the participant that matches the auth userId', () => {
    expect(handler.getUserParticipantFromConversationEvent(converversationUpdate)).toEqual(participant2);
  });

  it('should return the participant that has call in the desired state', () => {
    /* setup our user to have multiple participants with different call states */
    participant1.userId = userId;
    participant1.calls = [{ ...call }];
    participant2.userId = userId;
    participant2.calls = [{ ...call, state: CommunicationStates.alerting }];
    converversationUpdate.participants = [participant1, participant2];

    expect(handler.getUserParticipantFromConversationEvent(converversationUpdate, CommunicationStates.alerting)).toEqual(participant2);
  });

  it('should return the first participant with calls', () => {
    participant1.userId = userId;
    participant1.calls = [];
    participant2.userId = userId;
    participant2.calls = [call];
    converversationUpdate.participants = [participant1, participant2];

    expect(handler.getUserParticipantFromConversationEvent(converversationUpdate)).toEqual(participant2);
  });

  it('should return the most recent participant if there are no calls on any of them', () => {
    expect(handler.getUserParticipantFromConversationEvent(converversationUpdate)).toEqual(participant2);
  });
});

describe('getCallStateFromParticipant()', () => {
  let participant: IConversationParticipantFromEvent;
  let call: ICallStateFromParticipant;

  beforeEach(() => {
    call = {
      state: CommunicationStates.connected,
      confined: false,
      held: false,
      muted: false,
      direction: 'inbound',
      provider: 'anything',
      id: 'something'
    };

    participant = {
      id: 'super-smash-party',
      purpose: 'smash',
      userId: 'hulk',
      videos: [],
      calls: []
    };
  });

  it('should return void if there is no participant', () => {
    expect(handler.getCallStateFromParticipant(null as any)).toBe(undefined);
    expect(mockSdk.logger.debug).toHaveBeenCalledWith(
      'no call found on participant',
      { userId: undefined, participantId: undefined },
      undefined
    );
  });

  it('should return void if no calls on the user', () => {
    expect(handler.getCallStateFromParticipant(participant)).toBe(undefined);
    expect(mockSdk.logger.debug).toHaveBeenCalledWith(
      'no call found on participant',
      { userId: participant.userId, participantId: participant.id },
      undefined
    );
  });

  it('should return the call if there is only one', () => {
    participant.calls = [call];
    expect(handler.getCallStateFromParticipant(participant)).toBe(call);
  });

  it('should return the non-ended call if there is only one', () => {
    participant.calls = [
      { ...call, state: CommunicationStates.terminated },
      call
    ];
    expect(handler.getCallStateFromParticipant(participant)).toBe(call);
  });

  it('should should return the last call in the array', () => {
    participant.calls = [
      { ...call },
      call
    ];
    expect(handler.getCallStateFromParticipant(participant)).toBe(call);
  });
});

describe('setCurrentSession()', () => {
  it('should set the activeSession and add terminated listeners', () => {
    const session: IExtendedMediaSession = new MockSession() as any;

    handler['setCurrentSession'](session);

    expect(handler.activeSession).toBe(session);

    session.emit('terminated', { condition: 'success' });

    expect(handler.activeSession).toBe(null);
  });

  it('should switch to another session if current session terminates and persistent connection is enabled', () => {
    const session1: IExtendedMediaSession = new MockSession() as any;
    const session2: IExtendedMediaSession = new MockSession() as any;

    handler['setCurrentSession'](session1);
    expect(handler.activeSession).toBe(session1);

    jest.spyOn(mockSdk.sessionManager, 'getAllActiveSessions').mockReturnValue([session2]);
    jest.spyOn(mockSdk, 'isPersistentConnectionEnabled').mockReturnValue(true);

    session1.emit('terminated', { condition: 'success' });

    expect(handler.activeSession).toBe(session2);
  });
});

describe('endSession()', () => {
  it('should fetch conversation and patch participant', async () => {
    const session: any = new MockSession();
    const participantId = PARTICIPANT_ID;
    const offSpy = jest.spyOn(mockSdk, 'off');

    jest.spyOn(handler, 'patchPhoneCall' as any).mockResolvedValue(null);
    jest.spyOn(handler, 'getUserParticipantFromConversationId' as any).mockResolvedValue({ id: participantId });

    const promise = handler.endSession(session.conversationId, session);
    // need to wait for "sessionEnded" listener to wire up... don't know why
    await new Promise(resolve => setTimeout(resolve, 150));

    /* mock a sessionEnded event for a different session */
    mockSdk.emit('sessionEnded', new MockSession() as any, { condition: 'success' });
    expect(offSpy).not.toHaveBeenCalled();

    /* now our session ends */
    mockSdk.emit('sessionEnded', session, { condition: 'success' });
    await promise;

    expect(offSpy).toHaveBeenCalledWith('sessionEnded', expect.any(Function));
  });

  it('should call the fallback if session end fails with LA > 1', async () => {
    const session: any = new MockSession();
    const fallbackSpy = jest.spyOn(handler, 'endSessionFallback').mockResolvedValue();
    jest.spyOn(handler, 'patchPhoneCall' as any).mockRejectedValue(null);
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(true);

    await handler.endSession(session.conversationId, session);

    expect(fallbackSpy).toHaveBeenCalled();
  });

  it('should call the fallback if session end fails with LA == 1 but not other active conversations', async () => {
    const generateMockConversationState = (state: CommunicationStates, session: any): IStoredConversationState => {
      const conversationId = random().toString();
      return {
        conversationId,
        session,
        conversationUpdate: {} as any,
        mostRecentUserParticipant: {} as any,
        mostRecentCallState: { state } as any
      }
    };

    const fallbackSpy = jest.spyOn(handler, 'endSessionFallback').mockResolvedValue();
    jest.spyOn(handler, 'patchPhoneCall' as any).mockRejectedValue(null);
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(false);

    const session: any = new MockSession();
    const convoToEnd = generateMockConversationState(CommunicationStates.connected, session);

    session.conversationId = convoToEnd.conversationId;
    handler.conversations[convoToEnd.conversationId] = convoToEnd;

    await handler.endSession(session.conversationId, session);

    expect(fallbackSpy).toHaveBeenCalled();
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(
      'session has LineAppearance as 1 but no other active sessions. Will attempt to end session', {
      conversationId: session.conversationId,
      sessionId: session.id,
      error: null
    }, undefined);
  });

  it('should not call the fallback if the session end fails and we have an active session', async () => {
    const generateMockConversationState = (state: CommunicationStates, session: any): IStoredConversationState => {
      const conversationId = random().toString();
      return {
        conversationId,
        session,
        conversationUpdate: {} as any,
        mostRecentUserParticipant: {} as any,
        mostRecentCallState: { state } as any
      }
    };
    const error = new Error('Arnold was Mr. Freeze once... o_O');

    const fallbackSpy = jest.spyOn(handler, 'endSessionFallback').mockResolvedValue();
    jest.spyOn(handler, 'patchPhoneCall' as any).mockRejectedValue(error);
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(false);

    const session: any = new MockSession();

    const convoToEnd = generateMockConversationState(CommunicationStates.connected, session);
    const pendingConvo = generateMockConversationState(CommunicationStates.alerting, undefined);
    const connectedConvo = generateMockConversationState(CommunicationStates.connected, session);
    const endedConvo = generateMockConversationState(CommunicationStates.terminated, undefined);

    session.conversationId = convoToEnd.conversationId;

    handler.conversations[convoToEnd.conversationId] = convoToEnd;
    handler.conversations[pendingConvo.conversationId] = pendingConvo;
    handler.conversations[connectedConvo.conversationId] = connectedConvo;
    handler.conversations[endedConvo.conversationId] = endedConvo;

    try {
      await handler.endSession(session.conversationId, session);
      fail('should have thrown');
    } catch (err) {
      expect(err).toEqual(new SdkError(SdkErrorTypes.http,
        'Unable to end the session directly as a fallback because LineAppearance is 1 and there are other active conversations', {
        failedSession: { conversationId: convoToEnd.conversationId, sessionId: session.id },
        otherActiveSessions: [pendingConvo, connectedConvo].map(convo => ({
          conversationId: convo.conversationId,
          sessionId: convo.session?.id
        })),
        error
      }));
    }

    expect(fallbackSpy).not.toHaveBeenCalled();
  });
});

describe('endSessionFallback()', () => {
  it('should call supers endSession', async () => {
    const session: any = new MockSession();
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'endSession').mockResolvedValue();
    await handler.endSessionFallback(session.conversationId, session);
    expect(superSpy).toHaveBeenCalled();
  });

  it('should throw error if call to super fails', async () => {
    const session: any = new MockSession();
    const error = new Error('fake');
    jest.spyOn(BaseSessionHandler.prototype, 'endSession').mockRejectedValue(error);
    await expect(handler.endSessionFallback(session.conversationId, session)).rejects.toThrowError(/Failed to end session directly/);
  });
});

describe('setAudioMute()', () => {
  let session: IExtendedMediaSession;
  let conversationId: string;
  let userParticipant: IConversationParticipantFromEvent;
  let getUserParticipantFromConversationIdSpy: jest.SpyInstance;
  let patchPhoneCallSpy: jest.SpyInstance;

  beforeEach(() => {
    session = new MockSession() as any;
    conversationId = session.conversationId;
    userParticipant = { id: 'abraham' } as any;
    getUserParticipantFromConversationIdSpy = jest.spyOn(handler, 'getUserParticipantFromConversationId' as any)
      .mockResolvedValue(userParticipant);
    patchPhoneCallSpy = jest.spyOn(handler, 'patchPhoneCall' as any)
      .mockResolvedValue(null);
  });

  it('should fetch the participant and patch the phone call', async () => {
    const params: ISessionMuteRequest = { conversationId, mute: true };

    await handler.setAudioMute(session, params);

    expect(getUserParticipantFromConversationIdSpy).toHaveBeenCalledWith(params.conversationId);
    expect(patchPhoneCallSpy).toHaveBeenCalledWith(
      params.conversationId,
      userParticipant.id,
      { muted: params.mute }
    );
  });

  it('should throw if there are errors', async () => {
    const params: ISessionMuteRequest = { conversationId: null as any, mute: true };
    const error = new Error('Bad Request');

    patchPhoneCallSpy.mockRejectedValue(error);

    try {
      await handler.setAudioMute(session, params);
      fail('should have thrown');
    } catch (err) {
      expect(err).toEqual(new SdkError(
        SdkErrorTypes.generic,
        'Failed to set audioMute', {
        conversationId: session.conversationId,
        sessionId: session.id,
        sessionType: session.sessionType,
        params,
        error
      }));
    }
  });
});

describe('updateOutgoingMedia', () => {
  it('should call supers updateOutgoingMedia with undefined videoDeviceId', async () => {
    const superSpyUpdateOutgoingMedia = jest.spyOn(BaseSessionHandler.prototype, 'updateOutgoingMedia').mockResolvedValue(null);
    const session = new MockSession();
    const opts: IUpdateOutgoingMedia = {
      audioDeviceId: 'audioDevice',
      videoDeviceId: 'videoDevice'
    };

    await handler.updateOutgoingMedia(session as any, opts);
    expect(superSpyUpdateOutgoingMedia).toHaveBeenCalledWith(session, { audioDeviceId: 'audioDevice', videoDeviceId: undefined });
  });
});

describe('updateOutgoingMedia', () => {
  it('should call supers updateOutgoingMedia with undefined videoDeviceId', async () => {
    const superSpyUpdateOutgoingMedia = jest.spyOn(BaseSessionHandler.prototype, 'updateOutgoingMedia').mockResolvedValue(null);
    const session = new MockSession();
    const opts: IUpdateOutgoingMedia = {
      audioDeviceId: 'audioDevice',
      videoDeviceId: 'videoDevice'
    };

    await handler.updateOutgoingMedia(session as any, opts);
    expect(superSpyUpdateOutgoingMedia).toHaveBeenCalledWith(session, { audioDeviceId: 'audioDevice', videoDeviceId: undefined });
  });
});

describe('updateOutgoingMedia', () => {
  it('should call supers updateOutgoingMedia with undefined videoDeviceId', async () => {
    const superSpyUpdateOutgoingMedia = jest.spyOn(BaseSessionHandler.prototype, 'updateOutgoingMedia').mockResolvedValue(null);
    const session = new MockSession();
    const opts: IUpdateOutgoingMedia = {
      audioDeviceId: 'audioDevice',
      videoDeviceId: 'videoDevice'
    };

    await handler.updateOutgoingMedia(session as any, opts);
    expect(superSpyUpdateOutgoingMedia).toHaveBeenCalledWith(session, { audioDeviceId: 'audioDevice', videoDeviceId: undefined });
  });
});

describe('startSession', () => {
  it('should start a softphone call', async () => {
    const response = { id: '123', selfUri: 'whatever' };
    mockPostConversationApi({ response });
    const opts = {
      sessionType: 'softphone',
      phoneNumber: '3172222222',
    }
    await expect(handler.startSession(opts as any)).resolves.toEqual(response);
  });
});

describe('fetchUserParticipantFromConversationId()', () => {
  const conversationId = 'really-fun-conversation';
  const userId = 'link';
  let requestApiSpy: jest.SpyInstance;
  let getUserParticipantFromConversationEventSpy: jest.SpyInstance;

  beforeEach(() => {
    requestApiSpy = jest.spyOn(utils, 'requestApi');
    getUserParticipantFromConversationEventSpy = jest.spyOn(handler, 'getUserParticipantFromConversationEvent').mockImplementation();
  });

  it('should fetch and map user participant', async () => {
    const expectedParticipant: IConversationParticipant = {
      id: 'super-smash-bros',
      purpose: 'to-find-zelda',
      userId,
      confined: false,
      muted: false,
      direction: 'inbound',
      address: 'Outset Island',
      state: CommunicationStates.connected.toString(),
      calls: [],
      videos: []
    } as any;

    requestApiSpy.mockResolvedValue({
      data: {
        participants: [{
          ...expectedParticipant,
          extra: 'props',
          user: { id: userId }
        }]
      }
    });

    await handler.fetchUserParticipantFromConversationId(conversationId);

    expect(requestApiSpy).toHaveBeenCalledWith(`/conversations/${conversationId}`);
    expect(getUserParticipantFromConversationEventSpy)
      .toBeCalledWith({ participants: [expectedParticipant] }, CommunicationStates.connected);
  });

  it('should not map if the body is empty', async () => {
    requestApiSpy.mockResolvedValue({});

    await handler.fetchUserParticipantFromConversationId(conversationId);

    expect(requestApiSpy).toHaveBeenCalledWith(`/conversations/${conversationId}`);
    expect(getUserParticipantFromConversationEventSpy)
      .toBeCalledWith(undefined, CommunicationStates.connected);
  });

  it('should not map if the body does not have a participants array', async () => {
    requestApiSpy.mockResolvedValue({ data: {} });

    await handler.fetchUserParticipantFromConversationId(conversationId);

    expect(requestApiSpy).toHaveBeenCalledWith(`/conversations/${conversationId}`);
    expect(getUserParticipantFromConversationEventSpy)
      .toBeCalledWith(new ConversationUpdate({}), CommunicationStates.connected);
  });
});

describe('getUserParticipantFromConversationId()', () => {
  const conversationId = 'talking-about-water-sports';
  let fetchUserParticipantFromConversationIdSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchUserParticipantFromConversationIdSpy = jest.spyOn(handler, 'fetchUserParticipantFromConversationId');
  });

  it('should use the particpant from the most recent conversationUpdate', async () => {
    const participant: IConversationParticipantFromEvent = {
      id: 'aqua-man',
      purpose: 'to-swim-with-the-fishies',
      userId: 'aquatic-dude',
      videos: [],
      calls: []
    };
    handler.conversations = {
      [conversationId]: {
        mostRecentUserParticipant: participant
      } as any
    };

    expect(await handler['getUserParticipantFromConversationId'](conversationId)).toBe(participant);
  });

  it('should fetch the participant from the API', async () => {
    const participant: IConversationParticipantFromEvent = {
      id: 'aqua-man',
      purpose: 'to-swim-with-the-fishies',
      userId: 'aquatic-dude',
      videos: [],
      calls: []
    };
    fetchUserParticipantFromConversationIdSpy.mockResolvedValue(participant);

    expect(await handler['getUserParticipantFromConversationId'](conversationId)).toBe(participant);
  });

  it('should throw if no participant is found', async () => {
    fetchUserParticipantFromConversationIdSpy.mockResolvedValue(undefined);

    try {
      await handler['getUserParticipantFromConversationId'](conversationId);
      fail('it should have thrown');
    } catch (error) {
      expect(error.message).toBe('participant not found for converstionId');
    }
  });
});

describe('setConversationHeld()', () => {
  let session: IExtendedMediaSession;
  let conversationId: string;
  let userParticipant: IConversationParticipantFromEvent;
  let getUserParticipantFromConversationIdSpy: jest.SpyInstance;
  let patchPhoneCallSpy: jest.SpyInstance;

  beforeEach(() => {
    session = new MockSession() as any;
    conversationId = session.conversationId;
    userParticipant = { id: 'abraham' } as any;
    getUserParticipantFromConversationIdSpy = jest.spyOn(handler, 'getUserParticipantFromConversationId' as any)
      .mockResolvedValue(userParticipant);
    patchPhoneCallSpy = jest.spyOn(handler, 'patchPhoneCall' as any)
      .mockResolvedValue(null);
  });

  it('should do nothing if peerConnection is not connected', async () => {
    const params: IConversationHeldRequest = { conversationId, held: true };

    (session.peerConnection as any).connectionState = 'closed';
    await handler.setConversationHeld(session, params);

    expect(getUserParticipantFromConversationIdSpy).not.toHaveBeenCalled();
    expect(patchPhoneCallSpy).not.toHaveBeenCalled();
  });

  it('should fetch the participant and patch the phone call', async () => {
    const params: IConversationHeldRequest = { conversationId, held: true };

    await handler.setConversationHeld(session, params);

    expect(getUserParticipantFromConversationIdSpy).toHaveBeenCalledWith(params.conversationId);
    expect(patchPhoneCallSpy).toHaveBeenCalledWith(
      params.conversationId,
      userParticipant.id,
      { held: params.held }
    );
  });

  it('should throw if there are errors', async () => {
    const params: IConversationHeldRequest = { conversationId, held: true };
    const error = new Error('Bad Request');

    patchPhoneCallSpy.mockRejectedValue(error);

    try {
      await handler.setConversationHeld(session, params);
      fail('should have thrown');
    } catch (err) {
      expect(err).toEqual(new SdkError(
        SdkErrorTypes.generic,
        'Failed to set held state', {
        conversationId: session.conversationId,
        sessionId: session.id,
        sessionType: session.sessionType,
        params,
        error
      }));
    }
  });

  it('should hold other active sessions if LA>1 and unholding a session', async () => {
    const params: IConversationHeldRequest = { conversationId, held: false };
    const holdOtherSessionsSpy = jest.spyOn(handler, 'holdOtherSessions').mockImplementation();
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(true);
    handler.conversations = {'123': {}, '234': {} } as any;

    await handler.setConversationHeld(session, params);

    expect(holdOtherSessionsSpy).toHaveBeenCalled();
  });

  it('should NOT hold active sessions if LA=1 and unholding a session', async () => {
    const params: IConversationHeldRequest = { conversationId, held: false };
    const holdOtherSessionsSpy = jest.spyOn(handler, 'holdOtherSessions').mockImplementation();
    jest.spyOn(mockSdk, 'isConcurrentSoftphoneSessionsEnabled').mockReturnValue(false);

    await handler.setConversationHeld(session, params);

    expect(holdOtherSessionsSpy).not.toHaveBeenCalled();
  });
});

describe('patchPhoneCall()', () => {
  it('should patch a phone call', async () => {
    const conversationId = 'talking-buddies';
    const participantId = 'riddler';
    const body = {
      state: CommunicationStates.connected
    };

    const requestApiSpy = jest.spyOn(utils, 'requestApi').mockResolvedValue(null);

    await handler['patchPhoneCall'](conversationId, participantId, body);

    expect(requestApiSpy).toHaveBeenCalledWith(
      `/conversations/calls/${conversationId}/participants/${participantId}`, {
      method: 'patch',
      data: JSON.stringify(body)
    });
  });
});

describe('isPendingState()', () => {
  let isPendingState: typeof handler['isPendingState'];
  let call: ICallStateFromParticipant;

  beforeEach(() => {
    isPendingState = handler['isPendingState'].bind(handler);
    call = {} as any;
  });

  it('should return "true" for pending states', () => {
    call.state = CommunicationStates.alerting;
    expect(isPendingState(call)).toBe(true);

    call.state = CommunicationStates.contacting;
    expect(isPendingState(call)).toBe(true);
  });

  it('should return "false" for non-pending states', () => {
    expect(isPendingState(undefined as any)).toBe(false);

    expect(isPendingState({} as any)).toBe(false);

    call.state = CommunicationStates.dialing;
    expect(isPendingState(call)).toBe(false);
  });
});

describe('isConnectedState()', () => {
  let isConnectedState: typeof handler['isConnectedState'];
  let call: ICallStateFromParticipant;

  beforeEach(() => {
    isConnectedState = handler['isConnectedState'].bind(handler);
    call = {} as any;
  });

  it('should return "true" for connected states', () => {
    call.state = CommunicationStates.dialing;
    expect(isConnectedState(call)).toBe(true);

    call.state = CommunicationStates.connected;
    expect(isConnectedState(call)).toBe(true);
  });

  it('should return "false" for non-connected states', () => {
    expect(isConnectedState(undefined as any)).toBe(false);

    expect(isConnectedState({} as any)).toBe(false);

    call.state = CommunicationStates.alerting;
    expect(isConnectedState(call)).toBe(false);
  });
});

describe('isEndedState()', () => {
  let isEndedState: typeof handler['isEndedState'];
  let call: ICallStateFromParticipant;

  beforeEach(() => {
    isEndedState = handler['isEndedState'].bind(handler);
    call = {} as any;
  });

  it('should return "true" for ended states', () => {
    call.state = CommunicationStates.disconnected;
    expect(isEndedState(call)).toBe(true);

    call.state = CommunicationStates.terminated;
    expect(isEndedState(call)).toBe(true);
  });

  it('should return "false" for non-ended states', () => {
    expect(isEndedState(undefined as any)).toBe(false);

    expect(isEndedState({} as any)).toBe(false);

    call.state = CommunicationStates.alerting;
    expect(isEndedState(call)).toBe(false);
  });
});

describe('checkForCallErrors', () => {
  it('should call debounce fn if call errorInfo', () => {
    const update = { id: 'convoUpdate' };
    const participant = { id: 'participantId' };
    const callState = {
      errorInfo: {
        code: 'myerrorcode'
      }
    };

    const spy = jest.spyOn(handler, 'debouncedEmitCallError');
    handler.checkForCallErrors(update as any, participant as any, callState as any);

    expect(spy).toHaveBeenCalled();
  });

  it('should not call debounce fn if no call errorInfo', () => {
    const update = { id: 'convoUpdate' };
    const participant = { id: 'participantId' };
    const callState = {
      errorInfo: null
    };

    const spy = jest.spyOn(handler, 'debouncedEmitCallError');
    handler.checkForCallErrors(update as any, participant as any, callState as any);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('getActiveConversations', () => {
  it('should return a list based on conversation events', () => {
    handler.lastEmittedSdkConversationEvent = {
      current: [
        { conversationId: 'convo1', session: { id: 'session1' }},
        { conversationId: 'convo2', session: { id: 'session2' }},
      ],
    } as unknown as ISdkConversationUpdateEvent;

    expect(handler.getActiveConversations()).toEqual([
      { conversationId: 'convo1', sessionId: 'session1', sessionType: SessionTypes.softphone },
      { conversationId: 'convo2', sessionId: 'session2', sessionType: SessionTypes.softphone }
    ]);
  });

  it('should return an empty list of not conversation events', () => {
    handler.lastEmittedSdkConversationEvent = null as any;
    expect(handler.getActiveConversations()).toEqual([]);
  });

  it('should return an empty list of not conversation events', () => {
    handler.lastEmittedSdkConversationEvent = {} as any;
    expect(handler.getActiveConversations()).toEqual([]);
  });
});

describe('isConversationHeld()', () => {
  it('should return false if no conversation for conversationId', async () => {
    handler.conversations = {};
    expect(handler.isConversationHeld('asdfasdf')).toBeFalsy();
  });

  it('should return true', async () => {
    const lastConversationUpdate: IStoredConversationState = {
      conversationId: 'asdfasdf',
      conversationUpdate: {
        id: 'asdfasdf',
        participants: []
      },
      mostRecentCallState: {
        held: true,
        confined: false,
        direction: 'inbound',
        id: 'callLeg',
        muted: false,
        provider: 'provider',
        state: CommunicationStates.connected
      }
    };
    handler.conversations = { 'asdfasdf': lastConversationUpdate };
    expect(handler.isConversationHeld('asdfasdf')).toBeTruthy();
  })
});