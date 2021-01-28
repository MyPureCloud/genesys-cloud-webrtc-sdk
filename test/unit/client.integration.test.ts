import { GenesysCloudWebrtcSdk } from '../../src/client';
import { ICustomerData } from '../../src/types/interfaces';
import { MockStream, wait } from '../test-utils';
import {
  mockApis,
  setupWss,
  wss,
  closeWebSocketServer,
  mockGetUserApi,
  mockGetOrgApi,
  mockGetChannelApi,
  mockNotificationSubscription
} from '../mock-apis';
import { SdkError } from '../../src/utils';
import { SdkErrorTypes } from '../../src/types/enums';

let { ws } = require('../mock-apis');

function disconnectSdk (sdk: GenesysCloudWebrtcSdk): Promise<any> {
  return new Promise<void>(async res => {
    // wait and then call disconnect
    await wait(50);
    await sdk.disconnect();

    // wait for a reply from the server
    await wait(50);
    res();
  });
}

describe('Client (integration)', () => {
  // check to make sure the server isn't running
  beforeAll(async () => {
    await closeWebSocketServer();
  });

  afterAll(async () => {
    await closeWebSocketServer();
  });

  afterEach(async () => {
    if (ws) {
      (ws as WebSocket).close();
      ws = null;
    }
    if (wss) {
      wss.removeAllListeners();
    }
    jest.resetAllMocks();
  });

  describe('initialize()', () => {
    it('fetches org and person details, sets up the streaming connection', async () => {
      const { getOrg, getUser, getChannel, sdk, notificationSubscription } = mockApis();
      await sdk.initialize();

      getOrg.done();
      getUser.done();
      getChannel.done();
      notificationSubscription.done();
      expect(sdk._streamingConnection).toBeTruthy();
      sdk._config.optOutOfTelemetry = true;

      await disconnectSdk(sdk);
    }, 30000);

    it('should disconnect if initialize is called again', async () => {
      const { getOrg, getUser, getChannel, sdk, notificationSubscription } = mockApis();
      await sdk.initialize();
      expect(sdk._streamingConnection).toBeTruthy();
      sdk._config.optOutOfTelemetry = true;
      expect(sdk.isInitialized).toBeTruthy();
      const disconnectSpy = jest.spyOn(sdk._streamingConnection, 'disconnect');
      mockGetOrgApi({ nockScope: getOrg });
      mockGetUserApi({ nockScope: getUser });
      mockGetChannelApi({ nockScope: getChannel });
      mockNotificationSubscription({ nockScope: notificationSubscription });
      const promise = new Promise<void>((resolve) => {
        sdk.once('disconnected', async () => {
          setupWss();
          expect(disconnectSpy).toHaveBeenCalled();
          resolve();
        });
      });

      await sdk.initialize();
      await promise;
      await disconnectSdk(sdk);
    });

    it('fetches jwt for guest users, sets up the streaming connection', async () => {
      const { getJwt, sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true });
      await sdk.initialize({ securityCode: '123456' });
      getJwt.done();
      expect(sdk._streamingConnection).toBeTruthy();

      await disconnectSdk(sdk);
    });

    it('should use the customerData when passed in', async () => {
      const { sdk, mockCustomerData } = mockApis({ withMedia: new MockStream(), guestSdk: true, withCustomerData: true });

      await sdk.initialize(mockCustomerData);
      expect(sdk._streamingConnection).toBeTruthy();

      await disconnectSdk(sdk);
    });

    it('should throw if invalid customerData is passed in', async () => {
      const { sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true });

      const invalidCustomerData = {};
      try {
        await sdk.initialize(invalidCustomerData as ICustomerData);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeTruthy();
      }
    });

    it('throws error for guest users without a security code', async () => {
      const { sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true });
      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e).toEqual(new SdkError(SdkErrorTypes.initialization, '`securityCode` is required to initialize the SDK as a guest'));
      }
    });

    it('throws if getting the jwt fails', async () => {
      const { sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true, failSecurityCode: true });

      try {
        await sdk.initialize({ securityCode: '12345' });
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.http);
      }
    });

    it('throws if getting the org fails', async () => {
      const { sdk } = mockApis({ failOrg: true });

      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.http);
      }
    });

    it('throws if getting the user fails', async () => {
      const { sdk } = mockApis({ failUser: true });

      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.http);
      }
    });

    it('throws if setting up streaming connection fails', async () => {
      const { sdk } = mockApis({ failStreaming: true });
      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.initialization);
        console.log("THE TEST FINISHED");
      }
    }, 12 * 1000);

    it('sets up event proxies', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      const eventsToVerify = [
        { name: 'error', trigger: 'error', args: [new Error('test'), {}] },
        { name: 'trace', trigger: 'traceRtcSession' },
        {
          name: 'handledPendingSession',
          trigger: 'handledIncomingRtcSession',
          args: [1],
          transformedArgs: [1]
        },
        {
          name: 'cancelPendingSession',
          trigger: 'cancelIncomingRtcSession',
          args: [1],
          transformedArgs: [1]
        },
        { name: 'error', trigger: 'rtcSessionError' },
        { name: 'disconnected', trigger: 'session:end', args: [], transformedArgs: ['Streaming API connection disconnected'] }
      ];

      async function awaitEvent (sdk, eventName, trigger, args = [], transformedArgs) {
        if (!transformedArgs) {
          transformedArgs = args;
        }
        const promise = new Promise<void>(resolve => {
          const handler = (...eventArgs) => {
            expect(transformedArgs).toEqual(eventArgs);
            sdk.off(eventName, handler);
            resolve();
          };
          sdk.on(eventName, handler);
        });
        if (typeof trigger === 'string') {
          sdk._streamingConnection._webrtcSessions.emit(trigger, ...args);
          sdk._streamingConnection._stanzaio.emit(trigger, ...args);
        } else {
          trigger(args);
        }
        await promise;
      }

      try {
        await Promise.all(eventsToVerify.map(e => awaitEvent(sdk, e.name, e.trigger, e.args, e.transformedArgs)));
      } catch (e) {
        console.info('got an error as expected');
      }

      await disconnectSdk(sdk);
    });
  });

  describe('connected()', () => {
    it('returns the streaming client connection status', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);
      sdk._streamingConnection.connected = false;
      expect(sdk.connected).toBe(false);

      await disconnectSdk(sdk);
    });
  });

  describe('reconnect()', () => {
    it('proxies the call to the streaming connection', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.reconnect = jest.fn();

      await sdk.reconnect();
      expect(sdk._streamingConnection.reconnect).toHaveBeenCalledTimes(1);

      await disconnectSdk(sdk);
    });
  });

  describe('disconnect()', () => {
    it('proxies the call to the streaming connection', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk._streamingConnection, 'disconnect');

      await sdk.disconnect();
      expect(sdk._streamingConnection.disconnect).toHaveBeenCalledTimes(1);

      await disconnectSdk(sdk);

      // for for the response for disconnect
      await wait(50);
    });
  });

  describe('_refreshIceServers()', () => {
    it('should not get iceServers if not connected', async () => {
      const { sdk } = mockApis({ withIceRefresh: true });

      await sdk.initialize();

      sdk._streamingConnection.connected = false;
      expect(sdk.connected).toBe(false);

      sdk._streamingConnection.webrtcSessions.refreshIceServers = jest.fn();
      await sdk._refreshIceServers();
      expect(sdk._streamingConnection.webrtcSessions.refreshIceServers).not.toHaveBeenCalled();

      await disconnectSdk(sdk);
    }, 150000);

    it('refreshes the turn servers', async () => {
      const { sdk } = mockApis({ withIceRefresh: true });
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);

      jest.spyOn(sdk._streamingConnection.webrtcSessions, 'refreshIceServers').mockReturnValue(Promise.resolve(undefined));
      await sdk._refreshIceServers();
      expect(sdk._streamingConnection.webrtcSessions.refreshIceServers).toHaveBeenCalledTimes(1);
      expect(sdk._refreshIceServersInterval).toBeTruthy();

      await disconnectSdk(sdk);
    });

    it('should set icePolicy to relay if only relay candidates are returned', async () => {
      const { sdk } = mockApis({ withIceRefresh: true });
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);
      /* iceTransportPolicy is no longer a sdk config option. it is only set if only turn servers are received */
      expect(sdk._streamingConnection._webrtcSessions.config.iceTransportPolicy).toBe(undefined);

      jest.spyOn(sdk._streamingConnection.webrtcSessions, 'refreshIceServers').mockReturnValue(Promise.resolve(
        [
          {
            'host': 'turn.use1.dev-pure.cloud',
            'password': 'pw',
            'port': '3478',
            'transport': 'udp',
            'type': 'relay',
            'username': 'user'
          },
          {
            'host': 'turn.use1.dev-pure.cloud',
            'password': 'pass',
            'port': '3478',
            'transport': 'udp',
            'type': 'relay',
            'username': 'u2'
          }
        ]
      ));
      await sdk._refreshIceServers();
      expect(sdk._streamingConnection.webrtcSessions.refreshIceServers).toHaveBeenCalledTimes(1);
      expect(sdk._refreshIceServersInterval).toBeTruthy();
      expect(sdk._streamingConnection._webrtcSessions.config.iceTransportPolicy).toEqual('relay');

      await disconnectSdk(sdk);
    });

    it('emits an error if there is an error refreshing turn servers', async () => {
      const { sdk } = mockApis({ withIceRefresh: true });
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);

      const promise = new Promise(resolve => sdk.on('sdkError', resolve));
      jest.spyOn(sdk._streamingConnection.webrtcSessions, 'refreshIceServers').mockReturnValue(Promise.reject(new Error('fail')));
      try {
        await sdk._refreshIceServers();
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeTruthy();
      }
      expect(sdk._streamingConnection.webrtcSessions.refreshIceServers).toHaveBeenCalledTimes(1);
      await promise;

      await disconnectSdk(sdk);
    });
  });
});
