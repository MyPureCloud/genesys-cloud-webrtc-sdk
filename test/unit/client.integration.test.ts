import crypto from 'crypto';

// @ts-ignore
window.crypto = {
  getRandomValues: arr => crypto.randomBytes(arr.length)
};

import { PureCloudWebrtcSdk } from '../../src/client';
import { IJingleSession, ISdkConstructOptions, ICustomerData, IUpdateOutgoingMedia, IMediaDeviceIds } from '../../src/types/interfaces';
import {
  MockStream,
  mockApis,
  wss,
  random,
  closeWebSocketServer,
  mockGetUserApi,
  mockGetOrgApi,
  mockGetChannelApi,
  mockNotificationSubscription,
  wait
} from '../test-utils';
import { SdkError } from '../../src/utils';
import { SdkErrorTypes, LogLevels, SessionTypes } from '../../src/types/enums';
import * as mediaUtils from '../../src/media-utils';

let { ws } = require('../test-utils');

function getMockLogger () {
  return { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function disconnectSdk (sdk: PureCloudWebrtcSdk): Promise<any> {
  return new Promise(async res => {
    // wait and then call disconnect
    await wait(50);
    await sdk.disconnect();
    // wait for a reply from the server
    await wait(50);
    res();
  });
}

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
      (ws as WebSocket).close()
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

    it('warns if environment is not valid', () => {
      const sdk1 = new PureCloudWebrtcSdk({ accessToken: '1234', environment: 'mypurecloud.con' });
      const sdk2 = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.con',
        logger: getMockLogger() as any
      } as ISdkConstructOptions);

      expect(sdk2.logger.warn).toHaveBeenCalled();
    });

    test('does not warn if things are fine', () => {
      const sdk = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.com',
        logLevel: 'error',
        logger: getMockLogger() as any
      } as ISdkConstructOptions);
      expect(sdk.logger.warn).not.toHaveBeenCalled();
    });

    test('sets up options with defaults', () => {
      const sdk = new PureCloudWebrtcSdk({ accessToken: '1234' } as ISdkConstructOptions);
      expect(sdk._config.accessToken).toBe('1234');
      expect(sdk._config.environment).toBe('mypurecloud.com');
      expect(sdk._config.autoConnectSessions).toBe(true);
      expect(typeof sdk._config.customIceServersConfig).toBe('undefined');
      expect(sdk._config.iceTransportPolicy).toBe('all');
      expect(sdk.isGuest).toBe(false);
    });

    test('sets up options when provided', () => {
      const logger = getMockLogger();
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
      const { getOrg, getUser, getChannel, sdk, notificationSubscription } = mockApis();
      await sdk.initialize();
      getOrg.done();
      getUser.done();
      getChannel.done();
      notificationSubscription.done();
      expect(sdk._streamingConnection).toBeTruthy();
      sdk._config.optOutOfTelemetry = true;

      await disconnectSdk(sdk);
    });

    test('should disconnect if initialize is called again', async () => {
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
      await sdk.initialize();
      expect(disconnectSpy).toHaveBeenCalled();

      await disconnectSdk(sdk);
    });

    test('fetches jwt for guest users, sets up the streaming connection', async () => {
      const { getJwt, sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true });
      await sdk.initialize({ securityCode: '123456' });
      getJwt.done();
      expect(sdk._streamingConnection).toBeTruthy();

      await disconnectSdk(sdk);
    });

    test('should use the customerData when passed in', async () => {
      const { sdk, mockCustomerData } = mockApis({ withMedia: new MockStream(), guestSdk: true, withCustomerData: true });

      await sdk.initialize(mockCustomerData);
      expect(sdk._streamingConnection).toBeTruthy();

      await disconnectSdk(sdk);
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
        console.log("THE TEST FINISHED");
      }
    }, 12 * 1000);

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

      await disconnectSdk(sdk);
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

      await disconnectSdk(sdk);
    });
  });

  describe('startVideoConference()', () => {
    it('should call session manager to start screenshare', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();
      jest.spyOn(sdk.sessionManager, 'startSession').mockResolvedValue({});
      await sdk.startVideoConference('123');
      expect(sdk.sessionManager.startSession).toBeCalledWith({ jid: '123', sessionType: SessionTypes.collaborateVideo });

      await disconnectSdk(sdk);
    });

    it('should throw if guest user', async () => {
      const { sdk } = mockApis({ guestSdk: true });

      await sdk.initialize({ securityCode: '123454' });
      jest.spyOn(sdk.sessionManager, 'startSession');
      try {
        await sdk.startVideoConference('123');
        fail('should have failed');
      } catch (e) {
        expect(e).toEqual(new Error('video conferencing not supported for guests'));
        expect(sdk.sessionManager.startSession).not.toHaveBeenCalled();
      }

      await disconnectSdk(sdk);
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

      await disconnectSdk(sdk);
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

      await disconnectSdk(sdk);
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

      await disconnectSdk(sdk);
    });
  });

  describe('setAudioMute()', () => {
    it('proxies the call to the sessionManager', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'setAudioMute').mockImplementation(() => Promise.resolve());

      const params = { id: '5512551', mute: true };
      await sdk.setAudioMute(params);
      expect(sdk.sessionManager.setAudioMute).toBeCalledWith(params);

      await disconnectSdk(sdk);
    });
  });

  describe('setVideoMute()', () => {
    it('proxies the call to the sessionManager', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'setVideoMute').mockImplementation(() => Promise.resolve());

      const params = { id: '5512551', mute: true };
      await sdk.setVideoMute(params);
      expect(sdk.sessionManager.setVideoMute).toBeCalledWith(params);

      await disconnectSdk(sdk);
    });
  });

  describe('createMedia()', () => {
    it('should throw if no media requested', async () => {
      const spy = jest.spyOn(mediaUtils, 'startMedia');

      const { sdk } = mockApis();
      await expect(sdk.createMedia({} as any)).rejects.toThrowError(/called with at least one media type/);
      expect(spy).not.toHaveBeenCalled();

      await expect((sdk.createMedia as any)()).rejects.toThrowError(/called with at least one media type/);
      expect(spy).not.toHaveBeenCalled();

      await expect(sdk.createMedia({ video: false, audio: false })).rejects.toThrowError(/called with at least one media type/);
      expect(spy).not.toHaveBeenCalled();

      await expect(sdk.createMedia({ video: undefined, audio: false })).rejects.toThrowError(/called with at least one media type/);
      expect(spy).not.toHaveBeenCalled();

      await expect(sdk.createMedia({ video: false, audio: undefined })).rejects.toThrowError(/called with at least one media type/);
      expect(spy).not.toHaveBeenCalled();
    });

    it('proxies the call to the mediaUtils', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(mediaUtils, 'startMedia').mockResolvedValue({} as any);

      const params = { video: true };
      await sdk.createMedia(params);
      expect(mediaUtils.startMedia).toHaveBeenCalledWith(sdk, params);

      await disconnectSdk(sdk);
    });
  });

  describe('getDisplayMedia()', () => {
    test('should call through to startDisplayMedia', async () => {
      const { sdk } = mockApis();
      const spy = jest.spyOn(mediaUtils, 'startDisplayMedia').mockResolvedValue({} as any);
      await sdk.getDisplayMedia();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('updateOutputDevice()', () => {
    test('should call through to the sessionManager', async () => {
      const { sdk } = mockApis();
      const deviceId = 'device-id';
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'updateOutputDeviceForAllSessions').mockResolvedValue(undefined);

      await sdk.updateOutputDevice(deviceId);
      expect(sdk.sessionManager.updateOutputDeviceForAllSessions).toBeCalledWith(deviceId);

      await disconnectSdk(sdk);
    });
  });

  describe('updateOutgoingMedia()', () => {
    test('should throw if invalid options are passed in', async () => {
      const { sdk } = mockApis();
      const options: IUpdateOutgoingMedia = {};
      await sdk.initialize();

      try {
        await sdk.updateOutgoingMedia(options);
        fail('it should have failed');
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.invalid_options);
      }

      await disconnectSdk(sdk);
    });

    test('should call through to sessionManager', async () => {
      const { sdk } = mockApis();
      const options: IUpdateOutgoingMedia = {
        sessionId: 'session-id',
        session: {} as IJingleSession,
        stream: {} as MediaStream,
        videoDeviceId: 'video-id',
        audioDeviceId: 'audio-id'
      };
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'updateOutgoingMedia').mockResolvedValue(undefined);

      await sdk.updateOutgoingMedia(options);

      expect(sdk.sessionManager.updateOutgoingMedia).toBeCalledWith(options);

      await disconnectSdk(sdk);
    });
  });

  describe('updateDefaultDevices()', () => {
    test('should not set defaultDevice Ids if value is not undefined', async () => {
      const { sdk } = mockApis();
      const options: IMediaDeviceIds = {};

      await sdk.initialize();
      await sdk.updateDefaultDevices(options);

      expect(sdk._config.defaultAudioDeviceId).toBe(null);
      expect(sdk._config.defaultVideoDeviceId).toBe(null);
      expect(sdk._config.defaultOutputDeviceId).toBe(null);


      await disconnectSdk(sdk);
    });

    test('should set defaultDevice Ids if values are passed in', async () => {
      const { sdk } = mockApis();
      const options: IMediaDeviceIds = {
        videoDeviceId: 'new-video-device',
        audioDeviceId: 'new-audio-device',
        outputDeviceId: 'new-output-device',
      };

      await sdk.initialize();
      await sdk.updateDefaultDevices(options);

      expect(sdk._config.defaultAudioDeviceId).toBe(options.audioDeviceId);
      expect(sdk._config.defaultVideoDeviceId).toBe(options.videoDeviceId);
      expect(sdk._config.defaultOutputDeviceId).toBe(options.outputDeviceId);


      await disconnectSdk(sdk);
    });

    test('should call through to sessionManager to update active sessions', async () => {
      const { sdk } = mockApis();
      const options: IMediaDeviceIds & { updateActiveSessions?: boolean } = {
        videoDeviceId: 'new-video-device',
        audioDeviceId: 'new-audio-device',
        outputDeviceId: 'new-output-device',
        updateActiveSessions: true
      };

      await sdk.initialize();

      const updateOutgoingMediaForAllSessionsSpy = jest.spyOn(sdk.sessionManager, 'updateOutgoingMediaForAllSessions').mockResolvedValue(undefined);
      const updateOutputDeviceForAllSessionsSpy = jest.spyOn(sdk.sessionManager, 'updateOutputDeviceForAllSessions').mockResolvedValue(undefined);

      await sdk.updateDefaultDevices(options);

      expect(updateOutgoingMediaForAllSessionsSpy).toHaveBeenCalledWith({
        videoDeviceId: options.videoDeviceId,
        audioDeviceId: options.audioDeviceId
      });
      expect(updateOutputDeviceForAllSessionsSpy).toHaveBeenCalledWith(options.outputDeviceId);


      await disconnectSdk(sdk);
    });

    test('should only update media that is changing (video, audio, and/or output)', async () => {
      const { sdk } = mockApis();
      const options: IMediaDeviceIds & { updateActiveSessions?: boolean } = {
        videoDeviceId: 'new-video-device',
        audioDeviceId: undefined,
        outputDeviceId: 'new-output-device-id',
        updateActiveSessions: true
      };

      await sdk.initialize();

      const updateOutgoingMediaForAllSessionsSpy = jest.spyOn(sdk.sessionManager, 'updateOutgoingMediaForAllSessions')
        .mockResolvedValue(undefined);
      const updateOutputDeviceForAllSessionsSpy = jest.spyOn(sdk.sessionManager, 'updateOutputDeviceForAllSessions')
        .mockResolvedValue(undefined);

      /* video and output device */
      await sdk.updateDefaultDevices(options);

      expect(updateOutgoingMediaForAllSessionsSpy).toHaveBeenCalledWith({
        videoDeviceId: options.videoDeviceId,
        audioDeviceId: options.audioDeviceId
      });
      expect(updateOutputDeviceForAllSessionsSpy).toHaveBeenCalledWith(options.outputDeviceId);

      updateOutgoingMediaForAllSessionsSpy.mockReset();
      updateOutputDeviceForAllSessionsSpy.mockReset();

      /* audio device */
      options.videoDeviceId = undefined;
      options.outputDeviceId = undefined;
      options.audioDeviceId = 'new-audio-device-id';

      await sdk.updateDefaultDevices(options);

      expect(updateOutgoingMediaForAllSessionsSpy).toHaveBeenCalledWith({
        videoDeviceId: options.videoDeviceId,
        audioDeviceId: options.audioDeviceId
      });
      expect(updateOutputDeviceForAllSessionsSpy).not.toHaveBeenCalled();

      updateOutgoingMediaForAllSessionsSpy.mockReset();
      updateOutputDeviceForAllSessionsSpy.mockReset();

      /* no video or audio device */
      options.videoDeviceId = undefined;
      options.audioDeviceId = undefined;
      options.outputDeviceId = 'new-output-device-id';

      await sdk.updateDefaultDevices(options);

      expect(updateOutgoingMediaForAllSessionsSpy).not.toHaveBeenCalled();
      expect(updateOutputDeviceForAllSessionsSpy).toHaveBeenCalledWith(options.outputDeviceId);

      updateOutgoingMediaForAllSessionsSpy.mockReset();
      updateOutputDeviceForAllSessionsSpy.mockReset();

      await disconnectSdk(sdk);
    });

    test('should do nothing if no params are passed in', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      const updateOutgoingMediaForAllSessionsSpy = jest.spyOn(sdk.sessionManager, 'updateOutgoingMediaForAllSessions')
        .mockResolvedValue(undefined);
      const updateOutputDeviceForAllSessionsSpy = jest.spyOn(sdk.sessionManager, 'updateOutputDeviceForAllSessions')
        .mockResolvedValue(undefined);

      await sdk.updateDefaultDevices();

      expect(updateOutgoingMediaForAllSessionsSpy).not.toHaveBeenCalled();
      expect(updateOutputDeviceForAllSessionsSpy).not.toHaveBeenCalled();
    });
  });

  describe('endSession()', () => {
    it('should proxy to sessionManager', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'endSession').mockResolvedValue();
      const sessionId = random();
      const params = { id: sessionId };
      await sdk.endSession(params);
      expect(sdk.sessionManager.endSession).toBeCalledWith(params);

      await disconnectSdk(sdk);
    });
  });

  describe('reconnect()', () => {
    test('proxies the call to the streaming connection', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.reconnect = jest.fn();

      await sdk.reconnect();
      expect(sdk._streamingConnection.reconnect).toHaveBeenCalledTimes(1);

      await disconnectSdk(sdk);
    });
  });

  describe('disconnect()', () => {
    test('proxies the call to the streaming connection', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.disconnect = jest.fn();


      await sdk.disconnect();
      expect(sdk._streamingConnection.disconnect).toHaveBeenCalledTimes(1);

      // for for the response for disconnect
      await wait(50);
    });

    test('_config.customIceServersConfig | gets reset if the client refreshes ice servers', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();
      sdk._config.customIceServersConfig = [{ something: 'junk' }] as RTCConfiguration;

      sdk.sessionManager.jingle.iceServers = [{ urls: ['turn:mypurecloud.com'] }];

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

      await disconnectSdk(sdk);
    });
  });

  describe('_refreshIceServers()', () => {
    test('should not get iceServers if not connected', async () => {
      const { sdk } = mockApis({ withIceRefresh: true });
      await sdk.initialize();

      sdk._streamingConnection.connected = false;
      expect(sdk.connected).toBe(false);

      sdk._streamingConnection._webrtcSessions.refreshIceServers = jest.fn();
      await sdk._refreshIceServers();
      expect(sdk._streamingConnection._webrtcSessions.refreshIceServers).not.toHaveBeenCalled();

      await disconnectSdk(sdk);
    });

    test('refreshes the turn servers', async () => {
      const { sdk } = mockApis({ withIceRefresh: true });
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);

      jest.spyOn(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').mockReturnValue(Promise.resolve(undefined));
      await sdk._refreshIceServers();
      expect(sdk._streamingConnection._webrtcSessions.refreshIceServers).toHaveBeenCalledTimes(1);
      expect(sdk._refreshIceServersInterval).toBeTruthy();

      await disconnectSdk(sdk);
    });

    test('should set icePolicy to relay if only relay candidates are returned', async () => {
      const { sdk } = mockApis({ withIceRefresh: true });
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);
      expect(sdk._streamingConnection.webrtcSessions.config.iceTransportPolicy).toEqual('all');

      jest.spyOn(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').mockReturnValue(Promise.resolve(
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
      expect(sdk._streamingConnection._webrtcSessions.refreshIceServers).toHaveBeenCalledTimes(1);
      expect(sdk._refreshIceServersInterval).toBeTruthy();
      expect(sdk._streamingConnection.webrtcSessions.config.iceTransportPolicy).toEqual('relay');

      await disconnectSdk(sdk);
    });

    test('emits an error if there is an error refreshing turn servers', async () => {
      const { sdk } = mockApis({ withIceRefresh: true });
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);

      const promise = new Promise(resolve => sdk.on('error', resolve));
      jest.spyOn(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').mockReturnValue(Promise.reject(new Error('fail')));
      try {
        await sdk._refreshIceServers();
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeTruthy();
      }
      expect(sdk._streamingConnection._webrtcSessions.refreshIceServers).toHaveBeenCalledTimes(1);
      await promise;

      await disconnectSdk(sdk);
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
