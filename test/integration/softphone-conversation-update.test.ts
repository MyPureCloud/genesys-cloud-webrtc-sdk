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

  /* ───────────── helper: getUserParticipantFromConversationEvent ───────────── */

  it('returnsUndefinedParticipantWhenUpdateIsNull', () => {
    expect(handler.getUserParticipantFromConversationEvent(undefined as any)).toBeUndefined();
  });

  it('skipsVoicemailParticipantsWhenSelectingUser', () => {
    const u = new ConversationUpdate({
      id: 'c1',
      participants: [
        { id: 'vm', userId: USER_ID, purpose: 'voicemail', calls: [{ id: 'x', state: CommunicationStates.connected }] },
        { id: 'real', userId: USER_ID, purpose: 'agent', calls: [{ id: 'y', state: CommunicationStates.connected }] }
      ]
    });
    const p = handler.getUserParticipantFromConversationEvent(u);
    expect(p?.id).toBe('real');
  });

  it('returnsUndefinedWhenUserNotAParticipant', () => {
    const u = new ConversationUpdate({
      id: 'c1',
      participants: [{ id: 'other', userId: 'someone-else', purpose: 'agent', calls: [] }]
    });
    expect(handler.getUserParticipantFromConversationEvent(u)).toBeUndefined();
  });

  /* ───────────── helper: getCallStateFromParticipant ───────────── */

  it('returnsUndefinedCallStateWhenNoCalls', () => {
    expect(handler.getCallStateFromParticipant({ id: 'p', calls: [] } as any)).toBeUndefined();
  });

  it('returnsSingleCallState', () => {
    const call = { id: 'c', state: CommunicationStates.connected };
    expect(handler.getCallStateFromParticipant({ id: 'p', calls: [call] } as any)).toBe(call);
  });

  it('returnsSoleNonEndedCallWhenMultipleCalls', () => {
    const ended = { id: 'e', state: CommunicationStates.disconnected };
    const live = { id: 'l', state: CommunicationStates.connected };
    expect(handler.getCallStateFromParticipant({ id: 'p', calls: [ended, live] } as any)).toBe(live);
  });

  /* ───────────── helper: diffConversationCallStates ───────────── */

  it('diffReportsTrueWhenEitherStateMissing', () => {
    expect(handler.diffConversationCallStates(undefined as any, { state: 'connected' } as any)).toBe(true);
    expect(handler.diffConversationCallStates({ state: 'connected' } as any, undefined as any)).toBe(true);
  });

  it('diffReportsFalseWhenStatesIdentical', () => {
    const a = { state: CommunicationStates.connected, muted: false, held: false, confined: false } as any;
    const b = { state: CommunicationStates.connected, muted: false, held: false, confined: false } as any;
    expect(handler.diffConversationCallStates(a, b)).toBe(false);
  });

  it('diffReportsTrueWhenMutedDiffers', () => {
    const a = { state: CommunicationStates.connected, muted: false, held: false, confined: false } as any;
    const b = { state: CommunicationStates.connected, muted: true, held: false, confined: false } as any;
    expect(handler.diffConversationCallStates(a, b)).toBe(true);
  });

  /* ───────────── helper: determineActiveConversationId ───────────── */

  it('determinesActiveConversationFromSingleStoredConversation', () => {
    handler.conversations['only'] = { conversationId: 'only', mostRecentCallState: { state: CommunicationStates.connected } } as any;
    expect(handler.determineActiveConversationId()).toBe('only');
  });

  it('picksNonHeldConnectedConversationWhenMultiple', () => {
    handler.conversations['held'] = { conversationId: 'held', mostRecentCallState: { state: CommunicationStates.connected, held: true } } as any;
    handler.conversations['active'] = { conversationId: 'active', mostRecentCallState: { state: CommunicationStates.connected, held: false } } as any;
    expect(handler.determineActiveConversationId()).toBe('active');
  });

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

  it('ignoresInactiveSessionCallError', () => {
    const conversationId = globalThis.crypto.randomUUID();
    const emitSpy = jest.spyOn(mockSdk, 'emit');
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

    /* the inactive-session error code is explicitly ignored - no sdkError */
    expect(emitSpy).not.toHaveBeenCalledWith('sdkError', expect.anything());
  });
});
