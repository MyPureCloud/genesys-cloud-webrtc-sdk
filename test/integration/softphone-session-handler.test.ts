/* eslint @typescript-eslint/no-explicit-any: "off" */
import {
  SimpleMockSdk,
  MockSession,
  flushPromises
} from '../test-utils';
import {
  GenesysCloudWebrtcSdk,
  SessionTypes
} from '../../src';
import { SdkErrorTypes, CommunicationStates, MediaHandling } from '../../src/types/enums';
import { SessionManager } from '../../src/sessions/session-manager';
import SoftphoneSessionHandler from '../../src/sessions/softphone-session-handler';

/**
 * Integration tests for SoftphoneSessionHandler - the largest handler and the
 * core of softphone call flow. Uses the repo's SimpleMockSdk + a REAL
 * SessionManager + REAL SoftphoneSessionHandler (same pattern as the existing
 * media-handling IT). Only external systems are faked: the HTTP client
 * (`sdk._http`), headset, and streaming notifications.
 *
 * Heavy on negative paths: downstream /conversations API calls that throw or
 * return bad statuses, and assertions on the SDK's OWN behavior - which
 * SdkError type surfaces, which fallback path runs, and that no dirty state is
 * persisted.
 */
describe('SoftphoneSessionHandler flows (integration)', () => {
  let handler: SoftphoneSessionHandler;
  let mockSdk: GenesysCloudWebrtcSdk;
  let sessionManager: SessionManager;

  beforeEach(() => {
    mockSdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtcSdk;
    (mockSdk as any).headset = {
      setMute: jest.fn(),
      setHold: jest.fn(),
      setRinging: jest.fn(),
      endCurrentCall: jest.fn(),
      rejectIncomingCall: jest.fn(),
      answerIncomingCall: jest.fn(),
      outgoingCall: jest.fn(),
      resetHeadsetStateForCall: jest.fn()
    };
    (mockSdk.isConcurrentSoftphoneSessionsEnabled as jest.Mock).mockReturnValue(false);
    (mockSdk.isPersistentConnectionEnabled as jest.Mock).mockReturnValue(false);
    sessionManager = new SessionManager(mockSdk);
    handler = new SoftphoneSessionHandler(mockSdk, sessionManager);
    handler.disabled = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const storeConversation = (conversationId: string, participantId = 'participant-1', purpose = 'agent') => {
    handler.conversations[conversationId] = {
      conversationId,
      mostRecentUserParticipant: { id: participantId, userId: 'USER_GUID', purpose, calls: [] } as any,
      mostRecentCallState: { state: CommunicationStates.connected } as any,
      conversationUpdate: {} as any,
      session: undefined as any
    };
  };

  /* ───────────── startSession ───────────── */

  /*
   * Outbound HTTP flows (startSession, mute/hold PATCH, reject, proceed-via-
   * PATCH, and their error statuses) are covered BLACK-BOX against a real mock
   * server in softphone-http.test.ts. This file keeps the non-HTTP behavior
   * branches: early returns, super-delegation fallbacks, propose decisions, and
   * persistent-connection events.
   */

  it('skipsHoldWhenPeerConnectionDisconnected', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    storeConversation(conversationId);
    const session = new MockSession(SessionTypes.softphone);
    session.conversationId = conversationId;
    session.peerConnection.connectionState = 'failed';
    const patchSpy = jest.spyOn(mockSdk._http, 'requestApi').mockResolvedValue({});

    await handler.setConversationHeld(session as any, { conversationId, held: true });

    expect(patchSpy).not.toHaveBeenCalled();
    expect((mockSdk.headset.setHold as jest.Mock)).not.toHaveBeenCalled();
  });

  it('fallsBackToOrtcRejectWhenNoParticipantFound', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    jest.spyOn(handler, 'getUserParticipantFromConversationEvent').mockReturnValue(undefined);
    jest.spyOn(handler, 'fetchUserParticipantFromConversationId').mockResolvedValue(undefined as any);
    const superReject = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'rejectPendingSession')
      .mockResolvedValue(undefined as any);

    await handler.rejectPendingSession({ conversationId, id: 'sess-1' } as any);

    expect(superReject).toHaveBeenCalled();
  });

  it('proceedDelegatesToSuperWhenNoActiveSession', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const superProceed = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'proceedWithSession')
      .mockResolvedValue(undefined as any);

    await handler.proceedWithSession({ conversationId, id: 'sess-x' } as any);

    expect(superProceed).toHaveBeenCalled();
  });

  /* ───────────── handlePropose (reduced media handling) ───────────── */

  it('proceedsOnReducedMediaAutoAnswerPropose', async () => {
    mockSdk._mediaHandling = MediaHandling.reducedMedia;
    mockSdk._config.disableAutoAnswer = false;
    const superPropose = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'handlePropose').mockResolvedValue(undefined as any);
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(undefined as any);

    await handler.handlePropose({ id: 's1', conversationId: 'c1', autoAnswer: true } as any);

    expect(superPropose).toHaveBeenCalled();
    expect(proceedSpy).toHaveBeenCalled();
  });

  it('defersToClientWhenReducedMediaAutoAnswerButAutoAnswerDisabled', async () => {
    mockSdk._mediaHandling = MediaHandling.reducedMedia;
    mockSdk._config.disableAutoAnswer = true;
    jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'handlePropose').mockResolvedValue(undefined as any);
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(undefined as any);

    await handler.handlePropose({ id: 's1', conversationId: 'c1', autoAnswer: true } as any);

    expect(proceedSpy).not.toHaveBeenCalled();
  });

  it('ignoresAndRemovesReducedMediaNonAutoAnswerPropose', async () => {
    mockSdk._mediaHandling = MediaHandling.reducedMedia;
    const removeSpy = jest.spyOn(sessionManager, 'removePendingSession').mockReturnValue(undefined);
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(undefined as any);

    await handler.handlePropose({ id: 's1', conversationId: 'c1', autoAnswer: false } as any);

    expect(proceedSpy).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });

  /* ───────────── handlePersistentConnectionEvent ───────────── */

  it('ignoresDisconnectPersistentConnectionEvent', async () => {
    const errorSpy = jest.fn();
    mockSdk.on('sdkError', errorSpy);

    handler.handlePersistentConnectionEvent({
      eventBody: { errorInfo: { code: 'error.ininedgecontrol.connection.webrtc.endpoint.disconnect' } }
    } as any);
    await flushPromises();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(handler.lastPersistentConnectionEvent).toBeDefined();
  });

  it('emitsCallSdkErrorOnPersistentConnectionErrorInfo', async () => {
    const errorPromise: Promise<any> = new Promise(res => mockSdk.once('sdkError', res));

    handler.handlePersistentConnectionEvent({
      eventBody: { errorInfo: { code: 'error.something.else', userMessage: 'boom' } }
    } as any);

    const emitted = await errorPromise;
    expect(emitted.type).toBe(SdkErrorTypes.call);
  });
});
