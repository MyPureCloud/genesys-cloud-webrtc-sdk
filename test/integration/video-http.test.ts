/* eslint @typescript-eslint/no-explicit-any: "off" */
import { SimpleMockSdk, MockSession } from '../test-utils';
import { GenesysCloudWebrtcSdk, SessionTypes } from '../../src';
import { SdkErrorTypes } from '../../src/types/enums';
import { SessionManager } from '../../src/sessions/session-manager';
import VideoSessionHandler from '../../src/sessions/video-session-handler';
import { installHttpMockServer } from './support/black-box-harness';

/**
 * BLACK-BOX integration tests for VideoSessionHandler's start flows. The real
 * handler issues real requests to a real node:http mock server; we assert the
 * server received the expected POST and the handler returned the conversationId
 * (or rethrew on an error status). No SDK method is spied.
 */
describe('Video start session (black-box, mock server)', () => {
  const api = installHttpMockServer();
  let handler: VideoSessionHandler;
  let mockSdk: GenesysCloudWebrtcSdk;

  beforeEach(() => {
    mockSdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtcSdk;
    mockSdk._config.environment = api.baseUrl;
    mockSdk._config.accessToken = 'test-token';
    mockSdk._personDetails = { id: 'USER_GUID', chat: { jabberId: 'me@genesys.com' } } as any;
    handler = new VideoSessionHandler(mockSdk, new SessionManager(mockSdk));
  });

  afterEach(() => jest.restoreAllMocks());

  it('startsVideoMeetingViaApiAndReturnsConversationId', async () => {
    api.stub('post', /\/conversations\/videos\/participants$/, { status: 200, body: { conversationId: 'conv-xyz' } });

    const res = await handler.startSession({ meetingId: 'm1' } as any);

    expect(res).toEqual({ conversationId: 'conv-xyz' });
    const post = api.received('post')[0];
    expect(post.path).toBe('/api/v2/conversations/videos/participants');
    expect(post.body).toEqual({ meetingId: 'm1', participant: { address: 'me@genesys.com' } });
  });

  it('rethrowsWhenStartVideoMeetingServerReturns500', async () => {
    api.stub('post', /\/conversations\/videos\/participants$/, { status: 500, body: {} });

    await expect(handler.startSession({ meetingId: 'm1' } as any)).rejects.toBeDefined();
  });

  it('startsVideoSessionViaApiAndReturnsConversationId', async () => {
    api.stub('post', /\/conversations\/videos$/, { status: 200, body: { conversationId: 'conv-abc' } });

    const res = await handler.startSession({ jid: 'peer-1@conference.com' } as any);

    expect(res).toEqual({ conversationId: 'conv-abc' });
    const post = api.received('post')[0];
    expect(post.path).toBe('/api/v2/conversations/videos');
    expect(post.body).toEqual({ roomId: 'peer-1@conference.com', participant: { address: 'me@genesys.com' } });
  });

  it('rethrowsAndClearsRequestedWhenStartVideoServerReturns403', async () => {
    api.stub('post', /\/conversations\/videos$/, { status: 403, body: {} });

    await expect(handler.startSession({ jid: 'peer-1@conference.com' } as any)).rejects.toBeDefined();
    expect(handler.requestedSessions['peer-1@conference.com']).toBeUndefined();
  });

  /* ───────────── pinParticipantVideo (real outbound pin/unpin HTTP) ───────────── */

  const videoSessionWithLocalParticipant = (conversationId: string, localParticipantId = 'local-1'): MockSession => {
    const session = new MockSession(SessionTypes.collaborateVideo);
    session.conversationId = conversationId;
    /* pcParticipant is inbound conversation state the handler reads; set it as
     * data rather than spying the handler. */
    (session as any).pcParticipant = { id: localParticipantId };
    return session;
  };

  it('pinParticipantVideoPostsPinRequestAndEmitsPinnedParticipant', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = videoSessionWithLocalParticipant(conversationId, 'local-1');
    api.stub('post', /\/conversations\/videos\/.+\/participants\/local-1\/pin$/, { status: 200, body: {} });
    const pinnedSpy = jest.fn();
    session.on('pinnedParticipant', pinnedSpy);

    await handler.pinParticipantVideo(session as any, 'target-7');

    const post = api.received('post')[0];
    expect(post.path).toBe(`/api/v2/conversations/videos/${conversationId}/participants/local-1/pin`);
    expect(post.body).toEqual({ targetParticipantId: 'target-7', streamType: 'video' });
    expect(pinnedSpy).toHaveBeenCalledWith({ participantId: 'target-7' });
  });

  it('pinParticipantVideoSendsDeleteToUnpinWhenNoParticipantId', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = videoSessionWithLocalParticipant(conversationId, 'local-2');
    api.stub('delete', /\/conversations\/videos\/.+\/participants\/local-2\/pin$/, { status: 200, body: {} });
    const pinnedSpy = jest.fn();
    session.on('pinnedParticipant', pinnedSpy);

    await handler.pinParticipantVideo(session as any);

    const del = api.received('delete')[0];
    expect(del.path).toBe(`/api/v2/conversations/videos/${conversationId}/participants/local-2/pin`);
    expect(pinnedSpy).toHaveBeenCalledWith({ participantId: null });
  });

  it('pinParticipantVideoThrowsSessionSdkErrorWhenServerFails', async () => {
    const conversationId = globalThis.crypto.randomUUID();
    const session = videoSessionWithLocalParticipant(conversationId, 'local-3');
    api.stub('post', /\/participants\/local-3\/pin$/, { status: 500, body: {} });

    await expect(
      handler.pinParticipantVideo(session as any, 'target-9')
    ).rejects.toHaveProperty('type', SdkErrorTypes.session);
  });
});
