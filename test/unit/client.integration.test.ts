import crypto from 'crypto';

// @ts-ignore
window.crypto = {
  getRandomValues: arr => crypto.randomBytes(arr.length)
};

import { GenesysCloudWebrtcSdk } from '../../src/client';
import { IExtendedMediaSession, ICustomerData, IUpdateOutgoingMedia, IMediaDeviceIds, ISdkConfig, ISdkMediaState } from '../../src/types/interfaces';
import {
  MockStream,
  mockApis,
  setupWss,
  wss,
  random,
  closeWebSocketServer,
  mockGetUserApi,
  mockGetOrgApi,
  mockGetChannelApi,
  mockNotificationSubscription,
  wait,
  MockSession
} from '../test-utils';
import { SdkError } from '../../src/utils';
import { SdkErrorTypes, SessionTypes } from '../../src/types/enums';

let { ws } = require('../test-utils');

function getMockLogger () {
  return { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
}

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
      (ws as WebSocket).close();
      ws = null;
    }
    if (wss) {
      wss.removeAllListeners();
    }
    jest.resetAllMocks();
  });

  describe('constructor()', () => {
    it('throws if options are not provided', () => {
      try {
        new GenesysCloudWebrtcSdk(null); // tslint:disable-line
        fail();
      } catch (err) {
        expect(err).toEqual(new SdkError(SdkErrorTypes.invalid_options, 'Options required to create an instance of the SDK'));
      }
    });

    it('throws if accessToken and organizationId is not provided', () => {
      try {
        new GenesysCloudWebrtcSdk({ environment: 'mypurecloud.com' }); // tslint:disable-line
        fail();
      } catch (err) {
        expect(err).toEqual(new SdkError(SdkErrorTypes.invalid_options, 'Access token is required to create an authenticated instance of the SDK. Otherwise, provide organizationId for a guest/anonymous user.'));
      }
    });

    it('warns if environment is not valid', () => {
      const sdk1 = new GenesysCloudWebrtcSdk({ accessToken: '1234', environment: 'mypurecloud.con' });
      const sdk2 = new GenesysCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.con',
        logger: getMockLogger() as any
      } as ISdkConfig);

      expect(sdk2.logger.warn).toHaveBeenCalled();
    });

    it('does not warn if things are fine', () => {
      const sdk = new GenesysCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.com',
        logLevel: 'error',
        logger: getMockLogger() as any
      } as ISdkConfig);
      expect(sdk.logger.warn).not.toHaveBeenCalled();
    });

    it('sets up options with defaults', () => {
      const sdk = new GenesysCloudWebrtcSdk({ accessToken: '1234' } as ISdkConfig);
      expect(sdk._config.accessToken).toBe('1234');
      expect(sdk._config.environment).toBe('mypurecloud.com');
      expect(sdk._config.autoConnectSessions).toBe(true);
      expect(sdk.isGuest).toBe(false);
    });

    it('sets up options when provided', () => {
      const logger = getMockLogger();
      const sdk = new GenesysCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.ie',
        autoConnectSessions: false,
        logger: logger as any
      } as ISdkConfig);

      expect(sdk.logger).toBe(logger);
      expect(sdk._config.accessToken).toBe('1234');
      expect(sdk._config.environment).toBe('mypurecloud.ie');
      expect(sdk._config.autoConnectSessions).toBe(false);
      expect(sdk.isGuest).toBe(false);
    });
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

  describe('startScreenShare()', () => {
    it('should reject if authenticated user', async () => {
      const { sdk } = mockApis();
      try {
        await sdk.startScreenShare();
        fail('should have failed');
      } catch (e) {
        expect(e).toEqual(new Error('Agent screen share is not yet supported'));
      }
    });

    it('should call session manager to start screenshare', async () => {
      const media = new MockStream({ video: true });
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

  describe('proceedWithSession()', () => {
    it('proxies the call to the sessionManager', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'proceedWithSession').mockImplementation(() => Promise.resolve());

      const sessionId = '5512551';
      await sdk.acceptPendingSession(sessionId);
      expect(sdk.sessionManager.proceedWithSession).toBeCalledWith(sessionId);

      await disconnectSdk(sdk);
    });
  });

  describe('rejectPendingSession()', () => {
    it('proxies the call to the sessionManager', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'rejectPendingSession').mockImplementation(() => Promise.resolve());

      const sessionId = '5512551';
      await sdk.rejectPendingSession(sessionId);
      expect(sdk.sessionManager.rejectPendingSession).toBeCalledWith(sessionId);

      await disconnectSdk(sdk);
    });
  });

  describe('acceptSession()', () => {
    it('proxies the call to the sessionManager', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'acceptSession').mockImplementation(() => Promise.resolve());

      const params = { sessionId: '5512551' };
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

      const params = { sessionId: '5512551', mute: true };
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

      const params = { sessionId: '5512551', mute: true };
      await sdk.setVideoMute(params);
      expect(sdk.sessionManager.setVideoMute).toBeCalledWith(params);

      await disconnectSdk(sdk);
    });
  });

  describe('updateOutputDevice()', () => {
    it('should call through to the sessionManager', async () => {
      const { sdk } = mockApis();
      const deviceId = 'device-id';
      await sdk.initialize();

      jest.spyOn(sdk.media, 'getState').mockReturnValue({ hasOutputDeviceSupport: true } as any as ISdkMediaState);
      jest.spyOn(sdk.sessionManager, 'updateOutputDeviceForAllSessions').mockResolvedValue(undefined);

      await sdk.updateOutputDevice(deviceId);
      expect(sdk.sessionManager.updateOutputDeviceForAllSessions).toBeCalledWith(deviceId);

      await disconnectSdk(sdk);
    });

    it('should not call through to the sessionManager if not in a supported browser', async () => {
      const { sdk } = mockApis();
      const sessions = [new MockSession()];
      await sdk.initialize();

      jest.spyOn(sdk.media, 'getState').mockReturnValue({ hasOutputDeviceSupport: false } as any as ISdkMediaState);
      jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue(sessions as any);
      jest.spyOn(sdk.sessionManager, 'updateOutputDeviceForAllSessions');

      await sdk.updateOutputDevice('some device id');
      expect(sdk.sessionManager.updateOutputDeviceForAllSessions).not.toBeCalled();
      expect(sdk.logger.warn).toHaveBeenCalledWith(
        'cannot update output deviceId in unsupported browser',
        sessions.map(s => ({ sessionId: s.id, conversationId: s.conversationId }))
      );

      await disconnectSdk(sdk);
    });
  });

  describe('updateOutgoingMedia()', () => {
    it('should throw if invalid options are passed in', async () => {
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

    it('should call through to sessionManager', async () => {
      const { sdk } = mockApis();
      const options: IUpdateOutgoingMedia = {
        sessionId: 'session-id',
        session: {} as IExtendedMediaSession,
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
    it('should not set defaultDevice Ids if value is not undefined', async () => {
      const { sdk } = mockApis();
      const options: IMediaDeviceIds = {};

      await sdk.initialize();
      await sdk.updateDefaultDevices(options);

      expect(sdk._config.defaults.audioDeviceId).toBe(null);
      expect(sdk._config.defaults.videoDeviceId).toBe(null);
      expect(sdk._config.defaults.outputDeviceId).toBe(null);


      await disconnectSdk(sdk);
    });

    it('should set defaultDevice Ids if values are passed in', async () => {
      const { sdk } = mockApis();
      const options: IMediaDeviceIds = {
        videoDeviceId: 'new-video-device',
        audioDeviceId: 'new-audio-device',
        outputDeviceId: 'new-output-device',
      };

      await sdk.initialize();
      await sdk.updateDefaultDevices(options);

      expect(sdk._config.defaults.audioDeviceId).toBe(options.audioDeviceId);
      expect(sdk._config.defaults.videoDeviceId).toBe(options.videoDeviceId);
      expect(sdk._config.defaults.outputDeviceId).toBe(options.outputDeviceId);


      await disconnectSdk(sdk);
    });

    it('should call through to sessionManager to update active sessions', async () => {
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

    it('should only update media that is changing (video, audio, and/or output)', async () => {
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

    it('should do nothing if no params are passed in', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      const updateOutgoingMediaForAllSessionsSpy = jest.spyOn(sdk.sessionManager, 'updateOutgoingMediaForAllSessions')
        .mockResolvedValue(undefined);
      const updateOutputDeviceForAllSessionsSpy = jest.spyOn(sdk.sessionManager, 'updateOutputDeviceForAllSessions')
        .mockResolvedValue(undefined);

      await sdk.updateDefaultDevices();

      expect(updateOutgoingMediaForAllSessionsSpy).not.toHaveBeenCalled();
      expect(updateOutputDeviceForAllSessionsSpy).not.toHaveBeenCalled();

      await disconnectSdk(sdk);
    });
  });

  describe('endSession()', () => {
    it('should proxy to sessionManager', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk.sessionManager, 'endSession').mockResolvedValue();
      const sessionId = random();
      const params = { sessionId: sessionId };
      await sdk.endSession(params);
      expect(sdk.sessionManager.endSession).toBeCalledWith(params);

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

  describe('destroy()', () => {
    it('should log, end all sessions, remove listeners, destory media, and disconnect ws', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      const session1 = new MockSession();
      const session2 = new MockSession();

      sdk.sessionManager.jingle.sessions = {
        [session1.id]: session1,
        [session2.id]: session2,
      } as { [key: string]: any };

      const endSessionSpy = jest.spyOn(sdk.sessionManager, 'endSession').mockResolvedValue(null);
      const removeAllListenersSpy = jest.spyOn(sdk, 'removeAllListeners');
      const mediaDestroySpy = jest.spyOn(sdk.media, 'destroy').mockReturnValue();
      const disconnectSpy = jest.spyOn(sdk, 'disconnect');

      await sdk.destroy();

      expect(sdk.logger.info).toHaveBeenCalledWith('destroying webrtc sdk', {
        activeSessions: [
          { sessionId: session1.id, conversationId: session1.conversationId },
          { sessionId: session2.id, conversationId: session2.conversationId },
        ]
      });
      expect(endSessionSpy).toHaveBeenCalledWith(session1);
      expect(endSessionSpy).toHaveBeenCalledWith(session2);
      expect(removeAllListenersSpy).toHaveBeenCalled();
      expect(mediaDestroySpy).toHaveBeenCalled();
      expect(disconnectSpy).toHaveBeenCalled();
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

  describe('isCustomerData()', () => {
    let sdk: GenesysCloudWebrtcSdk;
    let isCustomerData: GenesysCloudWebrtcSdk['isCustomerData'];

    beforeEach(() => {
      sdk = mockApis().sdk;
      isCustomerData = sdk['isCustomerData'];
    });

    it('should return true if valid customerData is present', () => {
      const customerData = {
        jwt: 'JWT',
        sourceCommunicationId: 'source-123',
        conversation: { id: 'convo-123' }
      };
      expect(isCustomerData(customerData)).toBe(true);
    });

    it('should return false if no customerData is present', () => {
      let customerData: ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    it('should return false if conversation is missing from customerData', () => {
      const customerData = {
        jwt: 'string',
        sourceCommunicationId: 'commId'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    it('should return false if conversation.id is missing from customerData', () => {
      const customerData = {
        conversation: {},
        jwt: 'string',
        sourceCommunicationId: 'commId'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    it('should return false if jwt is missing from customerData', () => {
      const customerData = {
        conversation: { id: 'convoId' },
        sourceCommunicationId: 'commId'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    it('should return false if sourceCommunicationId is missing from customerData', () => {
      const customerData = {
        conversation: { id: 'convoId' },
        jwt: 'string'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });
  });

  describe('isSecurityCode()', () => {
    let sdk: GenesysCloudWebrtcSdk;
    let isSecurityCode: GenesysCloudWebrtcSdk['isSecurityCode'];

    beforeEach(() => {
      sdk = mockApis().sdk;
      isSecurityCode = sdk['isSecurityCode'];
    });

    it('should return true if object has securityKey', () => {
      expect(isSecurityCode({ securityCode: '123456' })).toBe(true);
    });

    it('should return false if object is missing securityKey', () => {
      expect(isSecurityCode({ key: 'prop' } as any)).toBe(false);
    });

    it('should return false if nothing is passed in', () => {
      expect(isSecurityCode(undefined as any)).toBe(false);
    });
  });
});
