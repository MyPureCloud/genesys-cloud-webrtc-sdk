/* eslint @typescript-eslint/no-explicit-any: "off" */
import {
  SimpleMockSdk,
  MockSession,
  flushPromises
} from '../test-utils';
import { GenesysCloudWebrtcSdk, SessionTypes } from '../../src';
import { CommunicationStates } from '../../src/types/enums';
import { SessionManager } from '../../src/sessions/session-manager';
import SoftphoneSessionHandler from '../../src/sessions/softphone-session-handler';
import { ConversationUpdate } from '../../src/conversations/conversation-update';

/**
 * Integration tests driving SoftphoneSessionHandler's conversation-update state
 * machine (handleConversationUpdate -> handleSoftphoneConversationUpdate) and
 * its participant/call-state selection helpers. This is the largest branch
 * block in the handler and is exercised the way streaming-client drives it:
 * by feeding ConversationUpdate payloads in, then asserting which SDK events
 * fire (pendingSession / sessionStarted / sessionEnded / conversationUpdate),
 * which headset actions queue, and that "not responsible" updates are ignored.
 *
 * Real handler + real SessionManager + SimpleMockSdk; only externals faked.
 */
describe('Softphone conversation-update state machine (integration)', () => {
  let handler: SoftphoneSessionHandler;
  let mockSdk: GenesysCloudWebrtcSdk;
  let sessionManager: SessionManager;

  const USER_ID = 'USER_GUID';

  /** Build a ConversationUpdate with a single user call participant. */
  const update = (conversationId: string, call: Partial<any>, overrides: Partial<any> = {}): ConversationUpdate => {
    return new ConversationUpdate({
      id: conversationId,
      participants: [
        {
          id: `part-${conversationId}`,
          userId: USER_ID,
          purpose: 'agent',
          calls: [{
            id: `call-${conversationId}`,
            state: CommunicationStates.alerting,
            direction: 'inbound',
            muted: false,
            held: false,
            confined: false,
            ...call
          }],
          ...overrides
        }
      ]
    });
  };

  const activeConnectedSession = (conversationId: string): MockSession => {
    const s = new MockSession(SessionTypes.softphone);
    s.conversationId = conversationId;
    s.peerConnection.connectionState = 'connected';
    s._emittedSessionStarteds = {};
    return s;
  };

  beforeEach(() => {
    mockSdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtcSdk;
    mockSdk._personDetails = { id: USER_ID, chat: { jabberId: 'me@genesys.com' } } as any;
    (mockSdk as any).VERSION = 'test';
    (mockSdk as any).headset = {
      setMute: jest.fn(), setHold: jest.fn(), setRinging: jest.fn(), outgoingCall: jest.fn(),
      endCurrentCall: jest.fn(), rejectIncomingCall: jest.fn(), answerIncomingCall: jest.fn(),
      resetHeadsetStateForCall: jest.fn(), orchestrationState: 'hasControls'
    };
    (mockSdk.isConcurrentSoftphoneSessionsEnabled as jest.Mock).mockReturnValue(false);
    (mockSdk.isPersistentConnectionEnabled as jest.Mock).mockReturnValue(false);
    sessionManager = new SessionManager(mockSdk);
    handler = new SoftphoneSessionHandler(mockSdk, sessionManager);
    handler.disabled = false;
  });

  afterEach(() => jest.restoreAllMocks());

  /* ───────────── state machine: not-responsible ───────────── */

  it('ignoresUpdateForConversationWeAreNotResponsibleForWhenNotPending', () => {
    const conversationId = globalThis.crypto.randomUUID();
    const emitSpy = jest.spyOn(mockSdk, 'emit');
    /* no stored conversation + a connected (non-pending) state => not responsible */
    handler.handleConversationUpdate(update(conversationId, { state: CommunicationStates.connected }), []);
    expect(emitSpy).not.toHaveBeenCalledWith('pendingSession', expect.anything());
    expect(emitSpy).not.toHaveBeenCalledWith('sessionStarted', expect.anything());
  });

  it('ignoresUpdateWhenUserParticipantMissing', () => {
    const conversationId = globalThis.crypto.randomUUID();
    const u = new ConversationUpdate({ id: conversationId, participants: [] });
    const emitSpy = jest.spyOn(mockSdk, 'emit');
    handler.handleConversationUpdate(u, []);
    expect(emitSpy).not.toHaveBeenCalledWith('conversationUpdate', expect.anything());
  });

  /* ───────────── state machine: pending -> emit pendingSession ───────────── */

  it('emitsPendingSessionOnAlertingWhenActiveSessionPresent', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = activeConnectedSession(conversationId);
    handler.activeSession = session as any;
    /* store a prior pending state so we are "responsible" and state changes */
    handler.conversations[conversationId] = {
      conversationId,
      session: session as any,
      mostRecentCallState: { state: CommunicationStates.contacting } as any,
      conversationUpdate: update(conversationId, { state: CommunicationStates.contacting }),
      mostRecentUserParticipant: {} as any
    };
    const pendingSpy = jest.fn();
    mockSdk.on('pendingSession', pendingSpy);

    handler.handleConversationUpdate(update(conversationId, { state: CommunicationStates.alerting, direction: 'inbound' }), [session as any]);
    await flushPromises();

    expect(pendingSpy).toHaveBeenCalledWith(expect.objectContaining({ conversationId }));
  });

  it('queuesOutgoingCallHeadsetActionOnOutboundPending', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = activeConnectedSession(conversationId);
    handler.activeSession = session as any;
    handler.conversations[conversationId] = {
      conversationId,
      session: session as any,
      mostRecentCallState: { state: CommunicationStates.connected } as any,
      conversationUpdate: update(conversationId, { state: CommunicationStates.connected }),
      mostRecentUserParticipant: {} as any
    };

    handler.handleConversationUpdate(update(conversationId, { state: CommunicationStates.contacting, direction: 'outbound' }), [session as any]);
    await flushPromises();

    expect((mockSdk.headset.outgoingCall as jest.Mock)).toHaveBeenCalledWith({ conversationId });
  });

  /* ───────────── state machine: ended -> sessionEnded ───────────── */

  it('emitsSessionEndedWhenConnectedCallDisconnects', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = activeConnectedSession(conversationId);
    handler.activeSession = session as any;
    handler.conversations[conversationId] = {
      conversationId,
      session: session as any,
      mostRecentCallState: { state: CommunicationStates.connected } as any,
      conversationUpdate: update(conversationId, { state: CommunicationStates.connected }),
      mostRecentUserParticipant: {} as any
    };
    const endedSpy = jest.fn();
    mockSdk.on('sessionEnded', endedSpy);

    handler.handleConversationUpdate(update(conversationId, { state: CommunicationStates.disconnected }), [session as any]);
    await flushPromises();

    expect(endedSpy).toHaveBeenCalled();
    expect((mockSdk.headset.endCurrentCall as jest.Mock)).toHaveBeenCalled();
  });

  /* ───────────── state machine: call error ───────────── */

  it('emitsCallErrorWhenCallStateHasErrorInfo', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    handler.conversations[conversationId] = {
      conversationId,
      mostRecentCallState: { state: CommunicationStates.alerting } as any,
      conversationUpdate: update(conversationId, { state: CommunicationStates.alerting }),
      mostRecentUserParticipant: {} as any,
      session: undefined as any
    };
    const errorPromise: Promise<any> = new Promise(res => mockSdk.once('sdkError', res));

    handler.handleConversationUpdate(
      update(conversationId, { state: CommunicationStates.alerting, errorInfo: { code: 'error.someproblem', message: 'boom' } }),
      []
    );

    const emitted = await errorPromise;
    expect(emitted.type).toBeDefined();
  });

  it('ignoresInactiveSessionCallError', async () => {
    /* `sdkError` is emitted via debouncedEmitCallError (500ms debounce) then
     * createAndEmitSdkError's setTimeout(0). A synchronous assertion would pass
     * even if the guard were deleted, so use fake timers and advance past both
     * delays before asserting nothing was emitted. */
    jest.useFakeTimers();
    try {
      const conversationId = globalThis.crypto.randomUUID();
      const sdkErrorSpy = jest.fn();
      mockSdk.on('sdkError', sdkErrorSpy);
      handler.conversations[conversationId] = {
        conversationId,
        mostRecentCallState: { state: CommunicationStates.alerting } as any,
        conversationUpdate: update(conversationId, { state: CommunicationStates.alerting }),
        mostRecentUserParticipant: {} as any,
        session: undefined as any
      };

      handler.handleConversationUpdate(
        update(conversationId, { state: CommunicationStates.alerting, errorInfo: { code: 'error.ininedgecontrol.session.inactive' } }),
        []
      );

      /* advance past the debounce (500ms) and the emit's setTimeout(0) */
      jest.advanceTimersByTime(600);

      expect(sdkErrorSpy).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

});
