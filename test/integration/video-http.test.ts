/* eslint @typescript-eslint/no-explicit-any: "off" */
import { SimpleMockSdk } from '../test-utils';
import { GenesysCloudWebrtcSdk } from '../../src';
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
});
