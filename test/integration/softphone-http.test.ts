/* eslint @typescript-eslint/no-explicit-any: "off" */
import {
  SimpleMockSdk,
  MockSession
} from '../test-utils';
import { GenesysCloudWebrtcSdk, SessionTypes } from '../../src';
import { CommunicationStates, SdkErrorTypes } from '../../src/types/enums';
import { SessionManager } from '../../src/sessions/session-manager';
import SoftphoneSessionHandler from '../../src/sessions/softphone-session-handler';
import { installHttpMockServer } from './support/black-box-harness';

/**
 * BLACK-BOX integration tests for SoftphoneSessionHandler's outbound platform
 * API calls. The real handler issues real requests to a real node:http mock
 * server; we assert the SERVER received the expected method / path / body, and
 * the handler returned the expected result. No SDK method is spied - the only
 * fake is the outward network peer (and headset, a hardware boundary).
 *
 * This is the TS analog of a backend WireMock IT: stub the downstream, drive
 * the service, verify the outbound request and the service's reaction.
 */
describe('Softphone outbound calls (black-box, mock server)', () => {
  const api = installHttpMockServer();
  let handler: SoftphoneSessionHandler;
  let mockSdk: GenesysCloudWebrtcSdk;
  let sessionManager: SessionManager;

  beforeEach(() => {
    mockSdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtcSdk;
    mockSdk._config.environment = api.baseUrl;        // point at the real mock server
    mockSdk._config.accessToken = 'test-token';
    (mockSdk as any).headset = { setMute: jest.fn(), setHold: jest.fn() };
    (mockSdk.isConcurrentSoftphoneSessionsEnabled as jest.Mock).mockReturnValue(false);
    (mockSdk.isPersistentConnectionEnabled as jest.Mock).mockReturnValue(false);
    sessionManager = new SessionManager(mockSdk);
    handler = new SoftphoneSessionHandler(mockSdk, sessionManager);
    handler.disabled = false;
  });

  afterEach(() => jest.restoreAllMocks());

  const storeConversation = (conversationId: string, participantId = 'participant-1', purpose = 'agent') => {
    handler.conversations[conversationId] = {
      conversationId,
      mostRecentUserParticipant: { id: participantId, userId: 'USER_GUID', purpose, calls: [] } as any,
      mostRecentCallState: { state: CommunicationStates.connected } as any,
      conversationUpdate: {} as any,
      session: undefined as any
    };
  };

  it('startSessionPostsToConversationsCallsAndReturnsIds', async () => {
    api.stub('post', /\/conversations\/calls$/, { status: 200, body: { id: 'call-1', selfUri: '/uri/call-1' } });

    const res = await handler.startSession({ conversationIds: ['c1', 'c2'] } as any);

    expect(res).toEqual({ id: 'call-1', selfUri: '/uri/call-1' });
    const post = api.received('post')[0];
    expect(post.path).toBe('/api/v2/conversations/calls');
    expect(post.headers.authorization).toBe('Bearer test-token');
    expect(post.body).toEqual({ conversationIds: ['c1', 'c2'] });
  });

  it('setAudioMuteSendsMutedPatchToParticipant', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    storeConversation(conversationId, 'p-mute');
    api.stub('patch', /\/participants\/p-mute$/, { status: 200, body: {} });
    const session = new MockSession(SessionTypes.softphone);
    session.conversationId = conversationId;

    await handler.setAudioMute(session as any, { conversationId, mute: true });

    const patch = api.received('patch')[0];
    expect(patch.path).toBe(`/api/v2/conversations/calls/${conversationId}/participants/p-mute`);
    expect(patch.body).toEqual({ muted: true });
    expect((mockSdk.headset.setMute as jest.Mock)).toHaveBeenCalledWith(true);
  });

  it('setConversationHeldSendsHeldPatchToParticipant', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    storeConversation(conversationId, 'p-hold');
    api.stub('patch', /\/participants\/p-hold$/, { status: 200, body: {} });
    const session = new MockSession(SessionTypes.softphone);
    session.conversationId = conversationId;
    session.peerConnection.connectionState = 'connected';

    await handler.setConversationHeld(session as any, { conversationId, held: true });

    const patch = api.received('patch')[0];
    expect(patch.path).toBe(`/api/v2/conversations/calls/${conversationId}/participants/p-hold`);
    expect(patch.body).toEqual({ held: true });
  });

  it('rejectsAgentPendingSessionViaDisconnectPatch', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    storeConversation(conversationId, 'p-agent', 'agent');
    jest.spyOn(handler, 'getUserParticipantFromConversationEvent').mockReturnValue({ id: 'p-agent', purpose: 'agent' } as any);
    api.stub('patch', /\/participants\/p-agent$/, { status: 200, body: {} });

    await handler.rejectPendingSession({ conversationId } as any);

    const patch = api.received('patch')[0];
    expect(patch.path).toBe(`/api/v2/conversations/calls/${conversationId}/participants/p-agent`);
    expect(patch.body).toEqual({ state: CommunicationStates.disconnected });
  });

  it('rejectsUcCallViaReplaceWhenParticipantPurposeIsUser', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    jest.spyOn(handler, 'getUserParticipantFromConversationEvent').mockReturnValue({ id: 'p-user', purpose: 'user' } as any);
    api.stub('post', /\/participants\/p-user\/replace$/, { status: 200, body: {} });

    await handler.rejectPendingSession({ conversationId } as any);

    const post = api.received('post')[0];
    expect(post.path).toBe(`/api/v2/conversations/calls/${conversationId}/participants/p-user/replace`);
    expect(post.body).toEqual({ voicemail: true });
  });

  it('proceedViaPatchWhenActiveSessionMatches', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = new MockSession(SessionTypes.softphone);
    session.conversationId = conversationId;
    session.peerConnection.connectionState = 'connected';
    handler.activeSession = session as any;
    storeConversation(conversationId, 'p-agent', 'agent');
    jest.spyOn(handler, 'getUserParticipantFromConversationEvent').mockReturnValue({ id: 'p-agent', purpose: 'agent' } as any);
    api.stub('patch', /\/participants\/p-agent$/, { status: 200, body: {} });

    await handler.proceedWithSession({ conversationId, id: session.id } as any);

    const patch = api.received('patch')[0];
    expect(patch.path).toBe(`/api/v2/conversations/calls/${conversationId}/participants/p-agent`);
    expect(patch.body).toEqual({ state: CommunicationStates.connected });
  });

  /* ───────────── negative HTTP paths (server returns an error status) ───────────── */

  it('rejectsStartSessionWhenServerReturns500', async () => {
    api.stub('post', /\/conversations\/calls$/, { status: 500, body: { message: 'boom' } });

    await expect(handler.startSession({ conversationIds: ['c1'] } as any)).rejects.toBeDefined();
  });

  it('throwsGenericSdkErrorWhenMutePatchReturns409', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    storeConversation(conversationId, 'p-mute');
    api.stub('patch', /\/participants\/p-mute$/, { status: 409, body: { message: 'conflict' } });
    const session = new MockSession(SessionTypes.softphone);
    session.conversationId = conversationId;

    await expect(
      handler.setAudioMute(session as any, { conversationId, mute: true })
    ).rejects.toHaveProperty('type', SdkErrorTypes.generic);
  });

  it('throwsCallSdkErrorWhenHoldPatchReturns500', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    storeConversation(conversationId, 'p-hold');
    api.stub('patch', /\/participants\/p-hold$/, { status: 500, body: {} });
    const session = new MockSession(SessionTypes.softphone);
    session.conversationId = conversationId;
    session.peerConnection.connectionState = 'connected';

    await expect(
      handler.setConversationHeld(session as any, { conversationId, held: true })
    ).rejects.toHaveProperty('type', SdkErrorTypes.call);
  });
});
