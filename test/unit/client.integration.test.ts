import { GenesysCloudWebrtcSdk } from '../../src/client';
import * as utils from '../../src/utils';
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
import { mockGetStationApi } from '../mock-apis';
import { BroadcastChannel } from 'broadcast-channel';

jest.mock('broadcast-channel');

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
  Object.defineProperty(window.navigator, 'hid', { get: () => ({
    getDevices: () => { return [] }
  })});
  Object.defineProperty(navigator, "userAgentData", {
    get: () => { return { platform: "MacOS" } }
  });
  Object.defineProperty(window.navigator, 'locks', { get: () => ({})});
  (window as any).BroadcastChannel = BroadcastChannel;
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
    it('fetches org and person details, sets up the streaming connection, and fetches the station', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      expect(sdk._streamingConnection).toBeTruthy();

      await disconnectSdk(sdk);
    }, 30000);

    it('should disconnect if initialize is called again', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();
      expect(sdk._streamingConnection).toBeTruthy();
      expect(sdk.isInitialized).toBeTruthy();
      const disconnectSpy = jest.spyOn(sdk._streamingConnection, 'disconnect');
      mockGetOrgApi({ });
      mockGetUserApi({ });
      mockGetChannelApi({ });
      mockNotificationSubscription({ });
      mockGetStationApi({ });
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
      const { sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true });
      await sdk.initialize({ securityCode: '123456' });
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
        expect(e.type).toBe(SdkErrorTypes.initialization);
      }
    });

    it('throws if getting the org fails', async () => {
      expect.assertions(1);
      const { sdk } = mockApis({ failOrg: true });

      // have to mock until: https://inindca.atlassian.net/browse/PCM-1581 is complete
      jest.spyOn(utils, 'requestApiWithRetry').mockReturnValue({
        promise: Promise.reject()
      } as any);

      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e).toBeTruthy();
      }

      jest.spyOn(utils, 'requestApiWithRetry').mockRestore();
    });

    it('throws if getting the user fails', async () => {
      expect.assertions(1);
      const { sdk } = mockApis({ failUser: true });

      // have to mock until: https://inindca.atlassian.net/browse/PCM-1581 is complete
      jest.spyOn(utils, 'requestApiWithRetry').mockReturnValue({
        promise: Promise.reject()
      } as any);

      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e).toBeTruthy();
      }

      jest.spyOn(utils, 'requestApiWithRetry').mockRestore();
    });

    it('should not throw if fetching the station fails', async () => {
      const { sdk } = mockApis({ failStation: true });
      jest.spyOn(sdk, 'listenForStationEvents' as any).mockResolvedValue(undefined);

      await sdk.initialize()

      expect(sdk._streamingConnection).toBeTruthy();
      jest.spyOn(sdk, 'listenForStationEvents' as any).mockRestore();

      await disconnectSdk(sdk);
    });

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
        await Promise.all(eventsToVerify.map(e => awaitEvent(sdk, e.name, e.trigger, (e as any).args, e.transformedArgs)));
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
});
