import { GenesysCloudWebrtcSdk } from '../../src/client';
import { SimpleMockSdk } from '../test-utils';
import { CommunicationStates } from '../../src/types/enums';
import { SubscriptionEvent } from '../../src/types/interfaces';
import { handleConversationUpdate, setupStreamingClient, handleDisconnectedEvent } from '../../src/client-private';
import { ConversationUpdate } from '../../src/';
import StreamingClient from 'genesys-cloud-streaming-client';

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
    mockSdk.sessionManager = { handleConversationUpdate: jest.fn() } as any;

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
