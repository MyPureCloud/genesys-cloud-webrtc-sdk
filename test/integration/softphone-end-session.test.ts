/* eslint @typescript-eslint/no-explicit-any: "off" */
import {
  SimpleMockSdk,
  MockSession
} from '../test-utils';
import { GenesysCloudWebrtcSdk, SessionTypes } from '../../src';
import { SdkErrorTypes, CommunicationStates, JingleReasons } from '../../src/types/enums';
import { SessionManager } from '../../src/sessions/session-manager';
import SoftphoneSessionHandler from '../../src/sessions/softphone-session-handler';

/**
 * Integration tests for SoftphoneSessionHandler.endSession and handleSessionInit
 * control flow - the graceful end path and its error-fallback branches, plus
 * the auto-connect / reinvite init branches.
 *
 * These are negative-heavy: the graceful end tries a disconnect patch and waits
 * for the sessionEnded event; when the patch throws we assert the SDK picks the
 * correct fallback based on LineAppearance and active-conversation count, and
 * surfaces the right SdkError when it cannot safely end.
 */
describe('Softphone endSession + init control flow (integration)', () => {
  let handler: SoftphoneSessionHandler;
  let mockSdk: GenesysCloudWebrtcSdk;
  let sessionManager: SessionManager;

  const httpError = (status: number): any => {
    const err: any = new Error(`Request failed with status code ${status}`);
    err.name = 'AxiosError';
    err.response = { status };
    return err;
  };

  beforeEach(() => {
    mockSdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtcSdk;
    mockSdk._personDetails = { id: 'USER_GUID', chat: { jabberId: 'me@genesys.com' } } as any;
    (mockSdk as any).headset = { setMute: jest.fn(), setHold: jest.fn(), endCurrentCall: jest.fn() };
    (mockSdk.isConcurrentSoftphoneSessionsEnabled as jest.Mock).mockReturnValue(false);
    (mockSdk.isPersistentConnectionEnabled as jest.Mock).mockReturnValue(false);
    sessionManager = new SessionManager(mockSdk);
    handler = new SoftphoneSessionHandler(mockSdk, sessionManager);
    handler.disabled = false;
  });

  afterEach(() => jest.restoreAllMocks());

  const makeSession = (conversationId: string): MockSession => {
    const s = new MockSession(SessionTypes.softphone);
    s.conversationId = conversationId;
    return s;
  };

  const storeParticipant = (conversationId: string, participantId = 'p-1') => {
    handler.conversations[conversationId] = {
      conversationId,
      mostRecentUserParticipant: { id: participantId, userId: 'USER_GUID', purpose: 'agent', calls: [] } as any,
      mostRecentCallState: { state: CommunicationStates.connected } as any,
      conversationUpdate: {} as any,
      session: undefined as any
    };
  };

  /* ───────────── endSession graceful ───────────── */

  it('endsSessionGracefullyViaPatchThenTerminatedEvent', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = makeSession(conversationId);
    storeParticipant(conversationId);
    const patchSpy = jest.spyOn(mockSdk._http, 'requestApi').mockResolvedValue({});

    const endPromise = handler.endSession(conversationId, session as any);
    /* endSession attaches its sessionEnded listener asynchronously (after an
     * awaited participant lookup), so wait a tick before emitting the event. */
    await new Promise(res => setTimeout(res, 0));
    mockSdk.emit('sessionEnded', session as any, { condition: JingleReasons.success } as any);
    await endPromise;

    expect(patchSpy).toHaveBeenCalledWith(
      expect.stringContaining(`/conversations/calls/${conversationId}/participants/p-1`),
      expect.objectContaining({ method: 'patch' })
    );
  });

  /* ───────────── endSession fallback: LA > 1 ───────────── */

  it('fallsBackToDirectEndWhenPatchFailsAndLineAppearanceGreaterThan1', async () => {
    (mockSdk.isConcurrentSoftphoneSessionsEnabled as jest.Mock).mockReturnValue(true);
    const conversationId = globalThis.crypto.randomUUID();
    const session = makeSession(conversationId);
    storeParticipant(conversationId);
    jest.spyOn(mockSdk._http, 'requestApi').mockRejectedValue(httpError(500));
    const fallbackSpy = jest.spyOn(handler, 'endSessionFallback').mockResolvedValue(undefined);

    await handler.endSession(conversationId, session as any);

    expect(fallbackSpy).toHaveBeenCalled();
  });

  /* ───────────── endSession fallback: LA == 1, no other active ───────────── */

  it('fallsBackToDirectEndWhenPatchFailsLA1AndNoOtherActiveSessions', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = makeSession(conversationId);
    storeParticipant(conversationId);
    jest.spyOn(mockSdk._http, 'requestApi').mockRejectedValue(httpError(500));
    const fallbackSpy = jest.spyOn(handler, 'endSessionFallback').mockResolvedValue(undefined);

    await handler.endSession(conversationId, session as any);

    expect(fallbackSpy).toHaveBeenCalled();
  });

  /* ───────────── endSession throws: LA == 1 WITH other active ───────────── */

  it('throwsSessionErrorWhenPatchFailsLA1WithOtherActiveConversations', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const otherConversationId = globalThis.crypto.randomUUID();
    const session = makeSession(conversationId);
    storeParticipant(conversationId);
    /* a second, still-active conversation means we can't safely end directly */
    handler.conversations[otherConversationId] = {
      conversationId: otherConversationId,
      mostRecentCallState: { state: CommunicationStates.connected } as any,
      mostRecentUserParticipant: {} as any,
      conversationUpdate: {} as any,
      session: makeSession(otherConversationId) as any
    };
    jest.spyOn(mockSdk._http, 'requestApi').mockRejectedValue(httpError(500));

    await expect(
      handler.endSession(conversationId, session as any)
    ).rejects.toHaveProperty('type', SdkErrorTypes.session);
  });

  /* ───────────── endSessionFallback error ───────────── */

  it('throwsSessionErrorWhenDirectEndFallbackFails', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = makeSession(conversationId);
    jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'endSession').mockRejectedValue(new Error('cannot end'));

    await expect(
      handler.endSessionFallback(conversationId, session as any)
    ).rejects.toHaveProperty('type', SdkErrorTypes.session);
  });

  /* ───────────── handleSessionInit ───────────── */

  it('autoAcceptsSessionOnInitWhenAutoConnectEnabled', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = makeSession(conversationId);
    mockSdk._config.autoConnectSessions = true;
    jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'handleSessionInit').mockResolvedValue(undefined as any);
    const acceptSpy = jest.spyOn(handler, 'acceptSession').mockResolvedValue(undefined);

    await handler.handleSessionInit(session as any);

    expect(acceptSpy).toHaveBeenCalledWith(session, expect.objectContaining({ conversationId }));
  });

  it('doesNotAutoAcceptOnInitWhenAutoConnectDisabledAndNotReinvite', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = makeSession(conversationId);
    mockSdk._config.autoConnectSessions = false;
    (session as any).reinvite = false;
    jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'handleSessionInit').mockResolvedValue(undefined as any);
    const acceptSpy = jest.spyOn(handler, 'acceptSession').mockResolvedValue(undefined);

    await handler.handleSessionInit(session as any);

    expect(acceptSpy).not.toHaveBeenCalled();
  });

  it('forceTerminatesOldSessionOnReinvite', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const newSession = makeSession(conversationId);
    (newSession as any).reinvite = true;
    const oldSession = makeSession(conversationId);
    mockSdk._config.autoConnectSessions = false;

    jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'handleSessionInit').mockResolvedValue(undefined as any);
    jest.spyOn(sessionManager, 'getAllSessions').mockReturnValue([oldSession as any]);
    const forceEndSpy = jest.spyOn(handler, 'forceEndSession').mockResolvedValue(undefined as any);
    jest.spyOn(handler, 'acceptSession').mockResolvedValue(undefined);

    await handler.handleSessionInit(newSession as any);

    expect(oldSession.sessionReplacedByReinvite).toBe(true);
    expect(forceEndSpy).toHaveBeenCalledWith(oldSession, JingleReasons.alternativeSession);
  });
});
