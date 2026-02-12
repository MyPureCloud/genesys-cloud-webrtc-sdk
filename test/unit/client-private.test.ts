import { GenesysCloudWebrtcSdk } from '../../src/client';
import { SimpleMockSdk } from '../test-utils';
import { CommunicationStates } from '../../src/types/enums';
import { ICustomerData, IPersonDetails, SubscriptionEvent } from '../../src/types/interfaces';
import { handleConversationUpdate, setupStreamingClient, handleDisconnectedEvent, proxyStreamingClientEvents } from '../../src/client-private';
import { ConversationUpdate } from '../../src/';
import StreamingClient from 'genesys-cloud-streaming-client';
import { NotificationsApi } from "purecloud-platform-client-v2";

jest.mock('genesys-cloud-streaming-client');

let mockSdk: GenesysCloudWebrtcSdk;

beforeEach(() => {
  mockSdk = new SimpleMockSdk() as any;
});

describe('setupStreamingClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should use jwt in connection options', async () => {
    const jwt = 'myjwt';

    mockSdk._config.jwt = jwt;
    Object.defineProperty(mockSdk, 'isJwtAuth', { get: () => true });
    mockSdk._config.accessToken = null;
    mockSdk._personDetails = {
      id: 'abc123',
      name: 'myUsername',
      chat: {
        jabberId: 'myJid'
      }
    };

    let connectedCb: () => void;
    const connectSpy = jest.fn().mockImplementation(() => {
      connectedCb();
    });
    (StreamingClient as any).mockReturnValue({
      on: (event, cb) => {
        if (event === 'connected') {
          connectedCb = cb;
        }
      },
      connect: connectSpy
    });

    await setupStreamingClient.call(mockSdk);

    expect(StreamingClient).toHaveBeenCalledWith(expect.objectContaining({
      jwt,
      jid: 'myJid'
    }));
  });

  it('should use wsHost', async () => {
    mockSdk._config.environment = 'downunder';
    delete mockSdk._config.wsHost;
    mockSdk._personDetails = {
      id: 'abc123',
      name: 'myUsername',
      chat: {
        jabberId: 'myJid'
      }
    };

    let connectedCb: () => void;
    const connectSpy = jest.fn().mockImplementation(() => {
      connectedCb();
    });
    (StreamingClient as any).mockReturnValue({
      on: (event, cb) => {
        if (event === 'connected') {
          connectedCb = cb;
        }
      },
      connect: connectSpy
    });

    await setupStreamingClient.call(mockSdk);

    expect(StreamingClient).toHaveBeenCalledWith(expect.objectContaining({
      host: 'wss://streaming.downunder',
      jid: 'myJid'
    }));
  });
});

describe('handleConversationUpdate', () => {
  it('should call sessionManager.handleConversationUpdate with the transformed event', () => {
    mockSdk.sessionManager = { handleConversationUpdateRaw: jest.fn(), handleConversationUpdate: jest.fn() } as any;

    const userId = '444kjskdk';
    const participant1 = {
      id: '7b809e10-fb79-4420-9d5f-69d232ddf490',
      userId: 'dad93e0d-31fa-4fd2-8fc4-d9d3f214ddcf',
      purpose: 'user',
      videos: [
        {
          state: CommunicationStates.connected,
          id: '5e2bf9b8-c9d5-4975-b89b-756b6bd0b3d5',
          context: '5d1130ff978496186c5ce304@conference.test-valve-1ym37mj1kao.orgspan.com',
          audioMuted: false,
          videoMuted: true,
          sharingScreen: false,
          peerCount: 0
        }
      ]
    };

    const local = {
      id: '7sdffs-4420-9d5f-69d232ddf490',
      userId,
      purpose: 'user',
      videos: [
        {
          state: CommunicationStates.connected,
          id: '5e2bf9b855125-b89b-756b6bd0b3d5',
          context: '5d1130ff978496186c5ce304@conference.test-valve-1ym37mj1kao.orgspan.com',
          audioMuted: false,
          videoMuted: true,
          sharingScreen: false,
          peerCount: 0
        }
      ]
    };

    const event: SubscriptionEvent = {
      eventBody: {
        id: 'ff5a3ba2-373b-42c7-912a-5309a2656095',
        participants: [participant1, local]
      },
      metadata: {
        correlationId: '11l2k31j'
      },
      topicName: `v2.users.${userId}.coversations`
    };

    handleConversationUpdate.call(mockSdk, event);

    const spy = mockSdk.sessionManager.handleConversationUpdate;
    expect(spy).toHaveBeenCalled();
    const arg = (spy as jest.Mock).mock.calls[0][0];
    expect(arg).toBeInstanceOf(ConversationUpdate);
  });
});

describe('handleConversationUpdateRaw', () => {
  it('should call sessionManager.handleConversationUpdateRaw with the event', () => {
    mockSdk.sessionManager = { handleConversationUpdateRaw: jest.fn(), handleConversationUpdate: jest.fn() } as any;

    const userId = '444kjskdk';
    const participant1 = {
      id: '7b809e10-fb79-4420-9d5f-69d232ddf490',
      userId: 'dad93e0d-31fa-4fd2-8fc4-d9d3f214ddcf',
      purpose: 'user',
      videos: [
        {
          state: CommunicationStates.connected,
          id: '5e2bf9b8-c9d5-4975-b89b-756b6bd0b3d5',
          context: '5d1130ff978496186c5ce304@conference.test-valve-1ym37mj1kao.orgspan.com',
          audioMuted: false,
          videoMuted: true,
          sharingScreen: false,
          peerCount: 0
        }
      ]
    };

    const local = {
      id: '7sdffs-4420-9d5f-69d232ddf490',
      userId,
      purpose: 'user',
      videos: [
        {
          state: CommunicationStates.connected,
          id: '5e2bf9b855125-b89b-756b6bd0b3d5',
          context: '5d1130ff978496186c5ce304@conference.test-valve-1ym37mj1kao.orgspan.com',
          audioMuted: false,
          videoMuted: true,
          sharingScreen: false,
          peerCount: 0
        }
      ]
    };

    const event: SubscriptionEvent = {
      eventBody: {
        id: 'ff5a3ba2-373b-42c7-912a-5309a2656095',
        participants: [participant1, local]
      },
      metadata: {
        correlationId: '11l2k31j'
      },
      topicName: `v2.users.${userId}.coversations`
    };

    handleConversationUpdate.call(mockSdk, event);

    const spy = mockSdk.sessionManager.handleConversationUpdateRaw;
    expect(spy).toHaveBeenCalled();
    const arg = (spy as jest.Mock).mock.calls[0][0];
    expect(arg).toEqual(event);
  });
});

describe('handleDisconnectedEvent', () => {
  it('should emit disconnected event with message and eventData', () => {
    const eventData = { reconnecting: true };
    const emitSpy = mockSdk.emit = jest.fn();
    handleDisconnectedEvent.call(mockSdk as GenesysCloudWebrtcSdk, eventData);

    expect(mockSdk.logger.error).toHaveBeenCalledWith('Streaming API connection disconnected');
    expect(emitSpy).toHaveBeenCalledWith(
      'disconnected',
      'Streaming API connection disconnected',
      eventData
    );
  });
});

describe('proxyStreamingClientEvents', () => {
  it('should handle JWT auth path', async () => {
    const { handleConversationUpdateSpy, mockConversationUpdate } = await createEventDataAndCallProxyFunction();

    expect(handleConversationUpdateSpy).toHaveBeenCalledWith(new ConversationUpdate(mockConversationUpdate.eventBody));
  });

  it('should handle JWT auth path with no conversation id', async () => {
    const { handleConversationUpdateSpy, conversationUpdateHandler } = await createEventDataAndCallProxyFunction({ conversationId: undefined });

    expect(conversationUpdateHandler).toBe(undefined);
    expect(handleConversationUpdateSpy).not.toHaveBeenCalled();
  });

  it('should handle JWT auth path with non-agent conference', async () => {
    const { handleConversationUpdateSpy, conversationUpdateHandler } = await createEventDataAndCallProxyFunction({ jabberId: 'adhoc-123@conference.com' });

    expect(conversationUpdateHandler).toBe(undefined);
    expect(handleConversationUpdateSpy).not.toHaveBeenCalled();
  });

  it('should handle JWT auth path with missing conference jid', async () => {
    const { handleConversationUpdateSpy, conversationUpdateHandler } = await createEventDataAndCallProxyFunction({ jabberId: undefined });

    expect(conversationUpdateHandler).toBe(undefined);
    expect(handleConversationUpdateSpy).not.toHaveBeenCalled();
  });

  it('should handle JWT auth path with guest with userId', async () => {
    const { handleConversationUpdateSpy, conversationUpdateHandler } = await createEventDataAndCallProxyFunction({ userId: 'user123'});

    expect(conversationUpdateHandler).toBe(undefined);
    expect(handleConversationUpdateSpy).not.toHaveBeenCalled();
  });

  it('should still handle non-JWT auth path', async () => {
    const { handleConversationUpdateSpy, mockConversationUpdate } = await createEventDataAndCallProxyFunction({
      userId: 'user123',
      isJwtAuth: false
    });

    expect(handleConversationUpdateSpy).toHaveBeenCalledWith(new ConversationUpdate(mockConversationUpdate.eventBody));
    expect(mockSdk._customerData).toBe(undefined);
  });

  async function createEventDataAndCallProxyFunction(options = {} as { userId?: string, jabberId?: string, conversationId?: string, isJwtAuth?: boolean }) {
    const userId = 'userId' in options ? options.userId : undefined;
    const jabberId = 'jabberId' in options ? options.jabberId : 'agent-123@conference.com';
    const conversationId = 'conversationId' in options ? options.conversationId : 'conv123';
    const isJwtAuth = options.isJwtAuth ?? true;

    mockSdk._personDetails = {
      id: userId,
      chat: { jabberId: jabberId }
    } as IPersonDetails;

    if (isJwtAuth) { // we only assign this on jwt path
      mockSdk._customerData = {
        conversation: { id: conversationId }
      } as ICustomerData;
    }

    Object.defineProperty(mockSdk, 'isJwtAuth', { get: () => isJwtAuth });

    let conversationUpdateHandler;

    mockSdk._streamingConnection = {
      on: jest.fn((event, handler) => {
        if (event === `notify:v2.guest.conversations.${conversationId}`) {
          if (conversationUpdateHandler) throw new Error('handler already assigned');
          conversationUpdateHandler = handler;
        }
      }),
      webrtcSessions: { on: jest.fn() },
      notifications: {
        subscribe: jest.fn((topic, handler) => {
          if (topic === `v2.users.${userId}.conversations`) {
            if (conversationUpdateHandler) throw new Error('handler already assigned');
            conversationUpdateHandler = handler;
          }
        })
      }
    } as unknown as StreamingClient;

    await proxyStreamingClientEvents.call(mockSdk);

    mockSdk.sessionManager = { handleConversationUpdate: jest.fn(), handleConversationUpdateRaw: jest.fn() } as never;
    const mockConversationUpdate = { eventBody: {}, metadata: { correlationId: '' }, topicName: '' };
    if (conversationUpdateHandler) conversationUpdateHandler(mockConversationUpdate);

    const handleConversationUpdateSpy = mockSdk.sessionManager.handleConversationUpdate;

    return { handleConversationUpdateSpy, conversationUpdateHandler, mockConversationUpdate};
  }
});
