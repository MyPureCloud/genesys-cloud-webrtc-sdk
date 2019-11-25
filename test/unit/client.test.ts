import { PureCloudWebrtcSdk } from '../../src/client';
import { ISdkConstructOptions, ICustomerData } from '../../src/types/interfaces';
import {
  MockStream,
  MockSession,
  mockApis,
  timeout,
  MockTrack,
  wss,
  random,
  PARTICIPANT_ID,
  PARTICIPANT_ID_2,
  closeWebSocketServer,
  getMockConversation,
  mockGetUserApi,
  mockGetOrgApi,
  mockGetChannelApi
} from '../test-utils';
import { SdkError } from '../../src/utils';
import { SdkErrorTypes, LogLevels, SessionTypes } from '../../src/types/enums';
import * as logging from '../../src/logging';

declare var global: {
  window: any,
  document: any
} & NodeJS.Global;

let { ws } = require('../test-utils');

describe('Client', () => {
  // check to make sure the server isn't running
  beforeAll(async () => {
    await closeWebSocketServer();
  });

  afterAll(async () => {
    await closeWebSocketServer();
  });

  afterEach(async () => {
    if (ws) {
      await Promise.resolve(ws.close());
      ws = null;
    }
    if (wss) {
      wss.removeAllListeners();
    }
    jest.resetAllMocks();
  });

  describe('constructor()', () => {
    test('throws if options are not provided', () => {
      try {
        new PureCloudWebrtcSdk(null); // tslint:disable-line
        fail();
      } catch (err) {
        expect(err).toEqual(new SdkError(SdkErrorTypes.invalid_options, 'Options required to create an instance of the SDK'));
      }
    });

    test('throws if accessToken and organizationId is not provided', () => {
      try {
        new PureCloudWebrtcSdk({ environment: 'mypurecloud.com' }); // tslint:disable-line
        fail();
      } catch (err) {
        expect(err).toEqual(new SdkError(SdkErrorTypes.invalid_options, 'Access token is required to create an authenticated instance of the SDK. Otherwise, provide organizationId for a guest/anonymous user.'));
      }
    });

    test('warns if environment is not valid', () => {
      const sdk1 = new PureCloudWebrtcSdk({ accessToken: '1234', environment: 'mypurecloud.con' });
      const sdk2 = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.con',
        logger: { warn: jest.fn(), debug: jest.fn() } as any
      } as ISdkConstructOptions);

      expect(sdk2.logger.warn).toHaveBeenCalled();
    });

    test('warns if the logLevel is not valid', () => {
      const sdk = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.com',
        logLevel: 'error__' as LogLevels,
        logger: { warn: jest.fn(), debug: jest.fn() } as any
      } as ISdkConstructOptions);
      expect(sdk.logger.warn).toHaveBeenCalled();
    });

    test('does not warn if things are fine', () => {
      const sdk = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.com',
        logLevel: 'error',
        logger: { warn: jest.fn(), debug: jest.fn() } as any
      } as ISdkConstructOptions);
      expect(sdk.logger.warn).not.toHaveBeenCalled();
    });

    test('sets up options with defaults', () => {
      const sdk = new PureCloudWebrtcSdk({ accessToken: '1234' } as ISdkConstructOptions);
      expect(sdk.logger).toBe(console);
      expect(sdk._config.accessToken).toBe('1234');
      expect(sdk._config.environment).toBe('mypurecloud.com');
      expect(sdk._config.autoConnectSessions).toBe(true);
      expect(typeof sdk._config.customIceServersConfig).toBe('undefined');
      expect(sdk._config.iceTransportPolicy).toBe('all');
      expect(sdk.isGuest).toBe(false);
    });

    test('sets up options when provided', () => {
      const logger = { debug: jest.fn() };
      const iceServers = [];
      const sdk = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.ie',
        autoConnectSessions: false,
        iceServers: iceServers as any,
        iceTransportPolicy: 'relay',
        logger: logger as any
      } as ISdkConstructOptions);

      expect(sdk.logger).toBe(logger);
      expect(sdk._config.accessToken).toBe('1234');
      expect(sdk._config.environment).toBe('mypurecloud.ie');
      expect(sdk._config.autoConnectSessions).toBe(false);
      expect(sdk._config.customIceServersConfig).toBe(iceServers);
      expect(sdk._config.iceTransportPolicy).toBe('relay');
      expect(sdk.isGuest).toBe(false);
    });
  });

  describe('initialize()', () => {
    test('fetches org and person details, sets up the streaming connection', async () => {
      const { getOrg, getUser, getChannel, sdk } = mockApis();
      await sdk.initialize();
      getOrg.done();
      getUser.done();
      getChannel.done();
      expect(sdk._streamingConnection).toBeTruthy();
      sdk._logBuffer = [];
      sdk._config.optOutOfTelemetry = true;
      await sdk.disconnect();
    });

    it('should disconnect if initialize is called again', async () => {
      const { getOrg, getUser, getChannel, sdk } = mockApis();
      await sdk.initialize();
      expect(sdk._streamingConnection).toBeTruthy();
      sdk._logBuffer = [];
      sdk._config.optOutOfTelemetry = true;
      expect(sdk.isInitialized).toBeTruthy();
      const disconnectSpy = jest.spyOn(sdk._streamingConnection, 'disconnect');
      mockGetOrgApi({ nockScope: getOrg });
      mockGetUserApi({ nockScope: getUser });
      mockGetChannelApi({ nockScope: getChannel });
      await sdk.initialize();
      expect(disconnectSpy).toHaveBeenCalled();
      await sdk.disconnect();
    });

    test('fetches jwt for guest users, sets up the streaming connection', async () => {
      const { getJwt, sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true });
      await sdk.initialize({ securityCode: '123456' });
      getJwt.done();
      expect(sdk._streamingConnection).toBeTruthy();
      await sdk.disconnect();
    });

    test('should use the customerData when passed in', async () => {
      const { sdk, mockCustomerData } = mockApis({ withMedia: new MockStream(), guestSdk: true, withCustomerData: true });

      await sdk.initialize(mockCustomerData);
      expect(sdk._streamingConnection).toBeTruthy();
      await sdk.disconnect();
    });

    test('should throw if invalid customerData is passed in', async () => {
      const { sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true });

      const invalidCustomerData = {};
      try {
        await sdk.initialize(invalidCustomerData as ICustomerData);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeTruthy();
      }
    });

    test('throws error for guest users without a security code', async () => {
      const { sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true });
      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e).toEqual(new SdkError(SdkErrorTypes.initialization, '`securityCode` is required to initialize the SDK as a guest'));
      }
    });

    test('throws if getting the jwt fails', async () => {
      const { sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true, failSecurityCode: true });

      try {
        await sdk.initialize({ securityCode: '12345' });
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.http);
      }
    });

    test('throws if getting the org fails', async () => {
      const { sdk } = mockApis({ failOrg: true });

      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.http);
      }
    });

    test('throws if getting the user fails', async () => {
      const { sdk } = mockApis({ failUser: true });

      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.http);
      }
    });

    test('throws if setting up streaming connection fails', async () => {
      const { sdk } = mockApis({ failStreaming: true });
      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.initialization);
      }
    }, 15 * 1000);

    test('sets up event proxies', async () => {
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
        const promise = new Promise(resolve => {
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

      await Promise.all(eventsToVerify.map(e => awaitEvent(sdk, e.name, e.trigger, e.args, e.transformedArgs)));
      await sdk.disconnect();
    });
  });

  describe('startScreenShare()', () => {
    test('should reject if authenticated user', async () => {
      const { sdk } = mockApis();
      try {
        await sdk.startScreenShare();
        fail('should have failed');
      } catch (e) {
        expect(e).toEqual(new Error('Agent screen share is not yet supported'));
      }
    });

    test('should call session manager to start screenshare', async () => {
      const media = new MockStream();
      const { sdk } = mockApis({ guestSdk: true, withMedia: media });

      await sdk.initialize({ securityCode: '123454' });
      jest.spyOn(sdk.sessionManager, 'startSession').mockResolvedValue({});
      await sdk.startScreenShare();
      expect(sdk.sessionManager.startSession).toBeCalledWith({ sessionType: SessionTypes.acdScreenShare });
    });
  });

  describe('connected()', () => {
    test('returns the streaming client connection status', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);
      sdk._streamingConnection.connected = false;
      expect(sdk.connected).toBe(false);
      await sdk.disconnect();
    });
  });

  describe('proceedWithSession()', () => {
    test('proxies the call to the sessionManager', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'proceedWithSession').mockImplementation(() => Promise.resolve());

      const sessionId = '5512551';
      await sdk.acceptPendingSession(sessionId);
      expect(sdk.sessionManager.proceedWithSession).toBeCalledWith(sessionId);
      await sdk.disconnect();
    });
  });

  describe('acceptSession()', () => {
    test('proxies the call to the sessionManager', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'acceptSession').mockImplementation(() => Promise.resolve());

      const params = { id: '5512551' };
      await sdk.acceptSession(params);
      expect(sdk.sessionManager.acceptSession).toBeCalledWith(params);
      await sdk.disconnect();
    });
  });

  describe('endSession()', () => {
    it('should proxy to sessionManager', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'endSession').mockResolvedValue();
      const sessionId = random();
      const conversationId = random();
      const params = { id: sessionId };
      await sdk.endSession(params);
      expect(sdk.sessionManager.endSession).toBeCalledWith(params);
      await sdk.disconnect();
    });
  });

  describe('reconnect()', () => {
    test('proxies the call to the streaming connection', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.reconnect = jest.fn();

      await sdk.reconnect();
      expect(sdk._streamingConnection.reconnect).toHaveBeenCalledTimes(1);
      await sdk.disconnect();
    });
  });

  describe('disconnect()', () => {
    test('proxies the call to the streaming connection', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.disconnect = jest.fn();

      await sdk.disconnect();
      expect(sdk._streamingConnection.disconnect).toHaveBeenCalledTimes(1);
    });

    test('_config.customIceServersConfig | gets reset if the client refreshes ice servers', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();
      sdk._config.customIceServersConfig = [{ something: 'junk' }] as RTCConfiguration;

      sdk._streamingConnection.sessionManager = {
        iceServers: [{ urls: ['turn:mypurecloud.com'] }]
      };

      await sdk._streamingConnection.webrtcSessions.refreshIceServers();
      const actual = sdk.sessionManager.jingle.iceServers;
      expect(actual).toEqual([
        {
          type: 'turn',
          urls: 'turn:turn.us-east-1.mypurecloud.com:3456',
          username: 'turnuser:12395',
          credential: 'akskdfjka='
        },
        {
          type: 'stun',
          urls: 'stun:turn.us-east-1.mypurecloud.com:3456'
        }
      ]);
      await sdk.disconnect();
    });
  });

  describe('_refreshTurnServers()', () => {
    test('refreshes the turn servers', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);

      jest.spyOn(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').mockReturnValue(Promise.resolve());
      await sdk._refreshTurnServers();
      expect(sdk._streamingConnection._webrtcSessions.refreshIceServers).toHaveBeenCalledTimes(1);
      expect(sdk._refreshTurnServersInterval).toBeTruthy();
      await sdk.disconnect();
    });

    test('emits an error if there is an error refreshing turn servers', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);

      const promise = new Promise(resolve => sdk.on('error', resolve));
      jest.spyOn(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').mockReturnValue(Promise.reject(new Error('fail')));
      try {
        await sdk._refreshTurnServers();
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeTruthy();
      }
      expect(sdk._streamingConnection._webrtcSessions.refreshIceServers).toHaveBeenCalledTimes(1);
      await promise;
      await sdk.disconnect();
    });
  });

  describe('isCustomerData()', () => {
    let sdk: PureCloudWebrtcSdk;
    let isCustomerData: PureCloudWebrtcSdk['isCustomerData'];

    beforeEach(() => {
      sdk = mockApis().sdk;
      isCustomerData = sdk['isCustomerData'];
    });

    test('should return true if valid customerData is present', () => {
      const customerData = {
        jwt: 'JWT',
        sourceCommunicationId: 'source-123',
        conversation: { id: 'convo-123' }
      };
      expect(isCustomerData(customerData)).toBe(true);
    });

    test('should return false if no customerData is present', () => {
      let customerData: ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    test('should return false if conversation is missing from customerData', () => {
      const customerData = {
        jwt: 'string',
        sourceCommunicationId: 'commId'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    test('should return false if conversation.id is missing from customerData', () => {
      const customerData = {
        conversation: {},
        jwt: 'string',
        sourceCommunicationId: 'commId'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    test('should return false if jwt is missing from customerData', () => {
      const customerData = {
        conversation: { id: 'convoId' },
        sourceCommunicationId: 'commId'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    test('should return false if sourceCommunicationId is missing from customerData', () => {
      const customerData = {
        conversation: { id: 'convoId' },
        jwt: 'string'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });
  });

  describe('isSecurityCode()', () => {
    let sdk: PureCloudWebrtcSdk;
    let isSecurityCode: PureCloudWebrtcSdk['isSecurityCode'];

    beforeEach(() => {
      sdk = mockApis().sdk;
      isSecurityCode = sdk['isSecurityCode'];
    });

    test('should return true if object has securityKey', () => {
      expect(isSecurityCode({ securityCode: '123456' })).toBe(true);
    });

    test('should return false if object is missing securityKey', () => {
      expect(isSecurityCode({ key: 'prop' } as any)).toBe(false);
    });

    test('should return false if nothing is passed in', () => {
      expect(isSecurityCode(undefined as any)).toBe(false);
    });
  });
});
