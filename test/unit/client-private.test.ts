import { GenesysCloudWebrtcSdk } from '../../src/client';
import { SimpleMockSdk } from '../test-utils';
import { CommunicationStates } from '../../src/types/enums';
import { ICustomerData, IPersonDetails, SubscriptionEvent } from '../../src/types/interfaces';
import { handleConversationUpdate, setupStreamingClient, handleDisconnectedEvent, proxyStreamingClientEvents, cleanupOrphanedSessions } from '../../src/client-private';
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

  it('should call cleanupOrphanedSessions on reconnect', async () => {
    mockSdk._personDetails = {
      id: 'abc123',
      name: 'myUsername',
      chat: {
        jabberId: 'myJid'
      }
    };

    (mockSdk as any)._preDisconnectSessionIds = ['session-dead'];
    const deadSession = {
      id: 'session-dead',
      conversationId: 'conv-1',
      sessionType: 'softphone',
      peerConnection: { connectionState: 'closed' }
    };
    const onSessionTerminated = jest.fn();
    mockSdk.sessionManager = {
      getAllSessions: jest.fn().mockReturnValue([deadSession]),
      getSessionHandler: jest.fn().mockReturnValue({ onSessionTerminated })
    } as any;

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

    /* first connect sets _hasConnected = true */
    await setupStreamingClient.call(mockSdk);

    /* simulate reconnect by firing connected again */
    connectedCb();

    expect(onSessionTerminated).toHaveBeenCalledWith(deadSession, { condition: 'gone' });
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

  it('should snapshot session IDs when sessionManager exists', () => {
    const sessions = [
      { id: 'session-1' },
      { id: 'session-2' }
    ];
    mockSdk.sessionManager.getAllSessions = jest.fn().mockReturnValue(sessions);
    (mockSdk as any)._preDisconnectSessionIds = [];
    mockSdk.emit = jest.fn();

    handleDisconnectedEvent.call(mockSdk as GenesysCloudWebrtcSdk, { reconnecting: true });

    expect((mockSdk as any)._preDisconnectSessionIds).toEqual(['session-1', 'session-2']);
    expect(mockSdk.logger.info).toHaveBeenCalledWith('Snapshotted pre-disconnect sessions', { sessionIds: ['session-1', 'session-2'] });
  });

  it('should not snapshot if sessionManager does not exist', () => {
    (mockSdk as any).sessionManager = undefined;
    (mockSdk as any)._preDisconnectSessionIds = [];
    mockSdk.emit = jest.fn();

    handleDisconnectedEvent.call(mockSdk as GenesysCloudWebrtcSdk, { reconnecting: false });

    expect((mockSdk as any)._preDisconnectSessionIds).toEqual([]);
  });
});

describe('cleanupOrphanedSessions', () => {
  it('should do nothing if there are no pre-disconnect session IDs', () => {
    (mockSdk as any)._preDisconnectSessionIds = [];

    cleanupOrphanedSessions.call(mockSdk as GenesysCloudWebrtcSdk);

    expect(mockSdk.sessionManager.getAllSessions).not.toHaveBeenCalled();
  });

  it('should clean up sessions with dead peer connections', () => {
    const onSessionTerminated = jest.fn();
    const mockHandler = { onSessionTerminated };

    const deadSession = {
      id: 'session-1',
      conversationId: 'conv-1',
      sessionType: 'softphone',
      peerConnection: { connectionState: 'failed' }
    };

    (mockSdk as any)._preDisconnectSessionIds = ['session-1'];
    mockSdk.sessionManager.getAllSessions = jest.fn().mockReturnValue([deadSession]);
    (mockSdk.sessionManager as any).getSessionHandler = jest.fn().mockReturnValue(mockHandler);

    cleanupOrphanedSessions.call(mockSdk as GenesysCloudWebrtcSdk);

    expect(onSessionTerminated).toHaveBeenCalledWith(deadSession, { condition: 'gone' });
    expect(mockSdk.logger.warn).toHaveBeenCalledWith('Cleaning up orphaned session after reconnect', expect.objectContaining({
      sessionId: 'session-1',
      peerConnectionState: 'failed'
    }));
    expect((mockSdk as any)._preDisconnectSessionIds).toEqual([]);
  });

  it('should keep sessions with live peer connections', () => {
    const liveSession = {
      id: 'session-1',
      conversationId: 'conv-1',
      sessionType: 'softphone',
      peerConnection: { connectionState: 'connected' }
    };

    (mockSdk as any)._preDisconnectSessionIds = ['session-1'];
    mockSdk.sessionManager.getAllSessions = jest.fn().mockReturnValue([liveSession]);

    cleanupOrphanedSessions.call(mockSdk as GenesysCloudWebrtcSdk);

    expect(mockSdk.logger.info).toHaveBeenCalledWith(
      'Pre-disconnect session still has live peer connection after reconnect, keeping it',
      expect.objectContaining({ sessionId: 'session-1', peerConnectionState: 'connected' })
    );
    expect((mockSdk as any)._preDisconnectSessionIds).toEqual([]);
  });

  it('should skip sessions that no longer exist after reconnect', () => {
    (mockSdk as any)._preDisconnectSessionIds = ['session-gone'];
    mockSdk.sessionManager.getAllSessions = jest.fn().mockReturnValue([]);

    cleanupOrphanedSessions.call(mockSdk as GenesysCloudWebrtcSdk);

    expect(mockSdk.logger.warn).not.toHaveBeenCalled();
    expect(mockSdk.logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Pre-disconnect session'),
      expect.anything()
    );
    expect((mockSdk as any)._preDisconnectSessionIds).toEqual([]);
  });

  it('should handle mixed live and dead sessions', () => {
    const onSessionTerminated = jest.fn();
    const mockHandler = { onSessionTerminated };

    const deadSession = {
      id: 'session-dead',
      conversationId: 'conv-dead',
      sessionType: 'softphone',
      peerConnection: { connectionState: 'closed' }
    };
    const liveSession = {
      id: 'session-live',
      conversationId: 'conv-live',
      sessionType: 'softphone',
      peerConnection: { connectionState: 'connected' }
    };

    (mockSdk as any)._preDisconnectSessionIds = ['session-dead', 'session-live'];
    mockSdk.sessionManager.getAllSessions = jest.fn().mockReturnValue([deadSession, liveSession]);
    (mockSdk.sessionManager as any).getSessionHandler = jest.fn().mockReturnValue(mockHandler);

    cleanupOrphanedSessions.call(mockSdk as GenesysCloudWebrtcSdk);

    expect(onSessionTerminated).toHaveBeenCalledTimes(1);
    expect(onSessionTerminated).toHaveBeenCalledWith(deadSession, { condition: 'gone' });
  });

  it('should handle errors during cleanup gracefully', () => {
    const mockHandler = {
      onSessionTerminated: jest.fn().mockImplementation(() => { throw new Error('cleanup boom'); })
    };

    const deadSession = {
      id: 'session-1',
      conversationId: 'conv-1',
      sessionType: 'softphone',
      peerConnection: { connectionState: 'disconnected' }
    };

    (mockSdk as any)._preDisconnectSessionIds = ['session-1'];
    mockSdk.sessionManager.getAllSessions = jest.fn().mockReturnValue([deadSession]);
    (mockSdk.sessionManager as any).getSessionHandler = jest.fn().mockReturnValue(mockHandler);

    // should not throw
    cleanupOrphanedSessions.call(mockSdk as GenesysCloudWebrtcSdk);

    expect(mockSdk.logger.warn).toHaveBeenCalledWith('Failed to clean up orphaned session', { sessionId: 'session-1', error: 'cleanup boom' });
  });

  it('should clean up sessions in interrupted state', () => {
    const onSessionTerminated = jest.fn();
    const mockHandler = { onSessionTerminated };

    const interruptedSession = {
      id: 'session-1',
      conversationId: 'conv-1',
      sessionType: 'softphone',
      peerConnection: { connectionState: 'interrupted' }
    };

    (mockSdk as any)._preDisconnectSessionIds = ['session-1'];
    mockSdk.sessionManager.getAllSessions = jest.fn().mockReturnValue([interruptedSession]);
    (mockSdk.sessionManager as any).getSessionHandler = jest.fn().mockReturnValue(mockHandler);

    cleanupOrphanedSessions.call(mockSdk as GenesysCloudWebrtcSdk);

    expect(onSessionTerminated).toHaveBeenCalledWith(interruptedSession, { condition: 'gone' });
  });

  it('should clean up sessions with no peerConnection', () => {
    const onSessionTerminated = jest.fn();
    const mockHandler = { onSessionTerminated };

    const noPcSession = {
      id: 'session-1',
      conversationId: 'conv-1',
      sessionType: 'softphone',
      peerConnection: undefined
    };

    (mockSdk as any)._preDisconnectSessionIds = ['session-1'];
    mockSdk.sessionManager.getAllSessions = jest.fn().mockReturnValue([noPcSession]);
    (mockSdk.sessionManager as any).getSessionHandler = jest.fn().mockReturnValue(mockHandler);

    cleanupOrphanedSessions.call(mockSdk as GenesysCloudWebrtcSdk);

    expect(onSessionTerminated).toHaveBeenCalledWith(noPcSession, { condition: 'gone' });
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
