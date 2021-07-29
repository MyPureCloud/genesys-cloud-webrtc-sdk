import StreamingClient from 'genesys-cloud-streaming-client';

import { GenesysCloudWebrtcSdk, ICustomerData, ISdkConfig, SdkErrorTypes, SessionTypes } from '../../src';
import { SessionManager } from '../../src/sessions/session-manager';
import { SdkError } from '../../src/utils';
import { MockTrack, MockStream, MockSession, random } from '../test-utils';
import { SdkMedia } from '../../src/media/media';
import { ISdkMediaState, IUpdateOutgoingMedia, IExtendedMediaSession, IMediaDeviceIds, isSecurityCode, isCustomerData } from '../../src/types/interfaces';

jest.mock('genesys-cloud-streaming-client');
jest.mock('../../src/sessions/session-manager');
jest.mock('../../src/media/media');

function getMockLogger () {
  return { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
}

describe('Client', () => {
  let sdk: GenesysCloudWebrtcSdk;
  let constructSdk: (config?: ISdkConfig) => GenesysCloudWebrtcSdk;

  let sessionManagerMock: jest.Mocked<SessionManager>;
  let streamingClientMock: jest.Mocked<StreamingClient>;
  let mediaMock: jest.Mocked<SdkMedia>;

  beforeEach(() => {
    constructSdk = (config) => {
      /* if we have no config, then use some defaults */
      if (config === undefined) {
        config = { logger: getMockLogger(), accessToken: 'secure', environment: 'mypurecloud.com' } as any;
      }
      /* if we have `truthy`, make sure we always have the mock logger */
      else if (config) {
        config = { logger: getMockLogger(), ...config } as any;
      }

      sdk = new GenesysCloudWebrtcSdk(config as any);

      /* set up mock instances */
      sessionManagerMock = sdk.sessionManager = new SessionManager(sdk) as any;
      streamingClientMock = sdk._streamingConnection = new StreamingClient({} as any) as any;
      mediaMock = sdk.media as any;

      /* mock needed returned values (needed for `afterEach => sdk.destroy()`) */
      sessionManagerMock.getAllJingleSessions.mockReturnValue([]);

      return sdk;
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (sdk) {
      sdk.destroy();
      sdk = null;
    }
  });

  describe('constructor()', () => {
    it('throws if options are not provided', () => {
      try {
        constructSdk(null); // tslint:disable-line
        fail();
      } catch (err) {
        expect(err).toEqual(new SdkError(SdkErrorTypes.invalid_options, 'Options required to create an instance of the SDK'));
      }
    });

    it('throws if accessToken and organizationId is not provided', () => {
      try {
        constructSdk({ environment: 'mypurecloud.com' }); // tslint:disable-line
        fail();
      } catch (err) {
        expect(err).toEqual(new SdkError(SdkErrorTypes.invalid_options, 'Access token is required to create an authenticated instance of the SDK. Otherwise, provide organizationId for a guest/anonymous user.'));
      }
    });

    it('warns if environment is not valid', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn');

      const sdk1 = new GenesysCloudWebrtcSdk({ accessToken: '1234' });
      const sdk2 = new GenesysCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.con',
      } as ISdkConfig);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('does not warn if things are fine', () => {
      const sdk = constructSdk({
        accessToken: '1234',
        environment: 'mypurecloud.com',
        logLevel: 'error',
      } as ISdkConfig);
      expect(sdk.logger.warn).not.toHaveBeenCalled();
    });

    it('sets up options with defaults', () => {
      const sdk = constructSdk({ accessToken: '1234' } as ISdkConfig);
      expect(sdk._config.accessToken).toBe('1234');
      expect(sdk._config.environment).toBe('mypurecloud.com');
      expect(sdk._config.autoConnectSessions).toBe(true);
      expect(sdk.isGuest).toBe(false);
    });

    it('sets up options when provided and track default audioStream', () => {
      const trackDefaultAudioStreamSpy = jest.spyOn(GenesysCloudWebrtcSdk.prototype, 'trackDefaultAudioStream' as any)
        .mockImplementation();
      const logger = getMockLogger();
      const mockStream = {};
      const sdk = constructSdk({
        accessToken: '1234',
        environment: 'mypurecloud.ie',
        autoConnectSessions: false,
        logger: logger as any,
        defaults: {
          audioStream: mockStream,
        }
      } as ISdkConfig);

      expect(sdk.logger).toBe(logger);
      expect(sdk._config.accessToken).toBe('1234');
      expect(sdk._config.environment).toBe('mypurecloud.ie');
      expect(sdk._config.autoConnectSessions).toBe(false);
      expect(sdk.isGuest).toBe(false);
      expect(trackDefaultAudioStreamSpy).toHaveBeenCalledWith(mockStream);
    });
  });

  describe('startVideoConference()', () => {
    it('should call session manager to start screenshare', async () => {
      sdk = constructSdk();

      sessionManagerMock.startSession.mockResolvedValue({});
      await sdk.startVideoConference('123');
      expect(sessionManagerMock.startSession).toBeCalledWith({ jid: '123', sessionType: SessionTypes.collaborateVideo });
    });

    it('should throw if guest user', async () => {
      sdk = constructSdk({ organizationId: 'some-org' }); // no access_token is a guest user
      try {
        await sdk.startVideoConference('123');
        fail('should have failed');
      } catch (e) {
        expect(e).toEqual(new Error('video conferencing not supported for guests'));
        expect(sessionManagerMock.startSession).not.toHaveBeenCalled();
      }
    });
  });

  describe('startScreenShare()', () => {
    it('should reject if authenticated user', async () => {
      sdk = constructSdk();
      try {
        await sdk.startScreenShare();
        fail('should have failed');
      } catch (e) {
        expect(e).toEqual(new Error('Agent screen share is not yet supported'));
      }
    });

    it('should call session manager to start screenshare', async () => {
      const media = new MockStream({ video: true });
      sdk = constructSdk({ organizationId: 'some-org' }); // for guest user sdk

      sessionManagerMock.startSession.mockResolvedValue(media);

      const stream = await sdk.startScreenShare();

      expect(sdk.sessionManager.startSession).toBeCalledWith({ sessionType: SessionTypes.acdScreenShare });
      expect(stream).toBe(media);
    });
  });

  describe('proceedWithSession()', () => {
    it('proxies the call to the sessionManager', async () => {
      sdk = constructSdk();

      sessionManagerMock.proceedWithSession.mockResolvedValue();

      const sessionId = '5512551';
      await sdk.acceptPendingSession(sessionId);
      expect(sdk.sessionManager.proceedWithSession).toBeCalledWith(sessionId);
    });
  });

  describe('rejectPendingSession()', () => {
    it('proxies the call to the sessionManager', async () => {
      sdk = constructSdk();

      sessionManagerMock.rejectPendingSession.mockResolvedValue();

      const sessionId = '5512551';
      await sdk.rejectPendingSession(sessionId);
      expect(sdk.sessionManager.rejectPendingSession).toBeCalledWith(sessionId);
    });
  });

  describe('acceptSession()', () => {
    it('proxies the call to the sessionManager', async () => {
      sdk = constructSdk();

      sessionManagerMock.acceptSession.mockResolvedValue({ conversationId: 'some-convo' });

      const params = { sessionId: '5512551' };
      await sdk.acceptSession(params);
      expect(sdk.sessionManager.acceptSession).toBeCalledWith(params);
    });
  });

  describe('endSession()', () => {
    it('should proxy to sessionManager', async () => {
      sdk = constructSdk();

      sessionManagerMock.endSession.mockResolvedValue();
      const sessionId = random();
      const params = { sessionId: sessionId };
      await sdk.endSession(params);
      expect(sdk.sessionManager.endSession).toBeCalledWith(params);
    });
  });

  describe('updateOutputDevice()', () => {
    it('should call through to the sessionManager', async () => {
      sdk = constructSdk();
      const deviceId = 'device-id';

      mediaMock.getState.mockReturnValue({ hasOutputDeviceSupport: true } as any as ISdkMediaState);
      sessionManagerMock.updateOutputDeviceForAllSessions.mockResolvedValue(undefined);

      await sdk.updateOutputDevice(deviceId);

      expect(sdk.sessionManager.updateOutputDeviceForAllSessions).toBeCalled();
    });

    it('should not call through to the sessionManager if not in a supported browser', async () => {
      sdk = constructSdk();
      const sessions = [new MockSession()];

      mediaMock.getState.mockReturnValue({ hasOutputDeviceSupport: false } as any as ISdkMediaState);
      sessionManagerMock.getAllActiveSessions.mockReturnValue(sessions as any);

      await sdk.updateOutputDevice('some device id');

      expect(sdk.sessionManager.updateOutputDeviceForAllSessions).not.toBeCalled();
      expect(sdk.logger.warn).toHaveBeenCalledWith(
        'cannot update output deviceId in unsupported browser',
        sessions.map(s => ({ sessionId: s.id, conversationId: s.conversationId }))
      );
    });
  });

  describe('updateOutgoingMedia()', () => {
    it('should throw if invalid options are passed in', async () => {
      sdk = constructSdk();
      const options: IUpdateOutgoingMedia = {};

      const runTestWithOptions = async (options: IUpdateOutgoingMedia) => {
        try {
          await sdk.updateOutgoingMedia(options);
          fail('it should have failed');
        } catch (e) {
          expect(e.type).toBe(SdkErrorTypes.invalid_options);
        }
      };

      /* with undefined `stream`, `audioDeviceId`, or `videoDeviceId` */
      await runTestWithOptions(options);

      /* with `false` video */
      options.videoDeviceId = false;
      await runTestWithOptions(options);

      /* with `false` audio */
      options.audioDeviceId = false;
      await runTestWithOptions(options);
    });

    it('should call through to sessionManager if called with media stream', async () => {
      sdk = constructSdk();
      const options: IUpdateOutgoingMedia = {
        sessionId: 'session-id',
        session: {} as IExtendedMediaSession,
        stream: {} as MediaStream
      };

      sessionManagerMock.updateOutgoingMedia.mockResolvedValue(undefined);

      await sdk.updateOutgoingMedia(options);
      expect(sdk.sessionManager.updateOutgoingMedia).toBeCalledWith(options);
    });

    it('should call through to sessionManager if called with a valid audio device id', async () => {
      sdk = constructSdk();
      const options: IUpdateOutgoingMedia = {
        sessionId: 'session-id',
        session: {} as IExtendedMediaSession,
        audioDeviceId: true
      };

      sessionManagerMock.updateOutgoingMedia.mockResolvedValue(undefined);

      /* with `true` */
      await sdk.updateOutgoingMedia(options);
      expect(sdk.sessionManager.updateOutgoingMedia).toBeCalledWith(options);

      /* with `null` (sys default) */
      options.audioDeviceId = null;
      await sdk.updateOutgoingMedia(options);
      expect(sdk.sessionManager.updateOutgoingMedia).toBeCalledWith(options);

      /* with `string` deviceId */
      options.audioDeviceId = 'some-device-id';
      await sdk.updateOutgoingMedia(options);
      expect(sdk.sessionManager.updateOutgoingMedia).toBeCalledWith(options);
    });

    it('should call through to sessionManager if called with a valid video device id', async () => {
      sdk = constructSdk();
      const options: IUpdateOutgoingMedia = {
        sessionId: 'session-id',
        session: {} as IExtendedMediaSession,
        videoDeviceId: true
      };

      sessionManagerMock.updateOutgoingMedia.mockResolvedValue(undefined);

      /* with `true` */
      await sdk.updateOutgoingMedia(options);
      expect(sdk.sessionManager.updateOutgoingMedia).toBeCalledWith(options);

      /* with `null` (sys default) */
      options.videoDeviceId = null;
      await sdk.updateOutgoingMedia(options);
      expect(sdk.sessionManager.updateOutgoingMedia).toBeCalledWith(options);

      /* with `string` deviceId */
      options.videoDeviceId = 'some-device-id';
      await sdk.updateOutgoingMedia(options);
      expect(sdk.sessionManager.updateOutgoingMedia).toBeCalledWith(options);
    });
  });

  describe('updateDefaultDevices()', () => {
    it('should not set defaultDevice Ids if value is not undefined', async () => {
      sdk = constructSdk();
      const options: IMediaDeviceIds = {};

      await sdk.updateDefaultDevices(options);

      expect(sdk._config.defaults.audioDeviceId).toBe(null);
      expect(sdk._config.defaults.videoDeviceId).toBe(null);
      expect(sdk._config.defaults.outputDeviceId).toBe(null);
    });

    it('should set defaultDevice Ids if values are passed in', async () => {
      sdk = constructSdk();
      const options: IMediaDeviceIds = {
        videoDeviceId: 'new-video-device',
        audioDeviceId: 'new-audio-device',
        outputDeviceId: 'new-output-device',
      };

      await sdk.updateDefaultDevices(options);

      expect(sdk._config.defaults.audioDeviceId).toBe(options.audioDeviceId);
      expect(sdk._config.defaults.videoDeviceId).toBe(options.videoDeviceId);
      expect(sdk._config.defaults.outputDeviceId).toBe(options.outputDeviceId);

    });

    it('should call through to sessionManager to update active sessions', async () => {
      sdk = constructSdk();
      const options: IMediaDeviceIds & { updateActiveSessions?: boolean } = {
        videoDeviceId: 'new-video-device',
        audioDeviceId: 'new-audio-device',
        outputDeviceId: 'new-output-device',
        updateActiveSessions: true
      };

      sessionManagerMock.updateOutgoingMediaForAllSessions.mockResolvedValue(undefined);
      sessionManagerMock.updateOutputDeviceForAllSessions.mockResolvedValue(undefined);

      await sdk.updateDefaultDevices(options);

      expect(sdk.sessionManager.updateOutgoingMediaForAllSessions).toHaveBeenCalled();
      expect(sdk.sessionManager.updateOutputDeviceForAllSessions).toHaveBeenCalledWith(options.outputDeviceId);
    });

    it('should only update media that is changing (video, audio, and/or output)', async () => {
      sdk = constructSdk();
      const options: IMediaDeviceIds & { updateActiveSessions?: boolean } = {
        videoDeviceId: 'new-video-device',
        audioDeviceId: undefined,
        outputDeviceId: 'new-output-device-id',
        updateActiveSessions: true
      };

      sessionManagerMock.updateOutgoingMediaForAllSessions.mockResolvedValue(undefined);
      sessionManagerMock.updateOutputDeviceForAllSessions.mockResolvedValue(undefined);

      /* video and output device */
      await sdk.updateDefaultDevices(options);

      expect(sdk.sessionManager.updateOutgoingMediaForAllSessions).toHaveBeenCalled();
      expect(sdk.sessionManager.updateOutputDeviceForAllSessions).toHaveBeenCalledWith(options.outputDeviceId);

      sessionManagerMock.updateOutgoingMediaForAllSessions.mockReset();
      sessionManagerMock.updateOutputDeviceForAllSessions.mockReset();

      /* audio device */
      options.videoDeviceId = undefined;
      options.outputDeviceId = undefined;
      options.audioDeviceId = 'new-audio-device-id';

      await sdk.updateDefaultDevices(options);

      expect(sdk.sessionManager.updateOutgoingMediaForAllSessions).toHaveBeenCalledWith();
      expect(sessionManagerMock.updateOutputDeviceForAllSessions).not.toHaveBeenCalled();

      sessionManagerMock.updateOutgoingMediaForAllSessions.mockReset();
      sessionManagerMock.updateOutputDeviceForAllSessions.mockReset();

      /* no video or audio device */
      options.videoDeviceId = undefined;
      options.audioDeviceId = undefined;
      options.outputDeviceId = 'new-output-device-id';

      await sdk.updateDefaultDevices(options);

      expect(sdk.sessionManager.updateOutgoingMediaForAllSessions).not.toHaveBeenCalled();
      expect(sessionManagerMock.updateOutputDeviceForAllSessions).toHaveBeenCalledWith(options.outputDeviceId);

      sessionManagerMock.updateOutgoingMediaForAllSessions.mockReset();
      sessionManagerMock.updateOutputDeviceForAllSessions.mockReset();
    });

    it('should do nothing if no params are passed in', async () => {
      sdk = constructSdk();

      sessionManagerMock.updateOutgoingMediaForAllSessions.mockResolvedValue(undefined);
      sessionManagerMock.updateOutputDeviceForAllSessions.mockResolvedValue(undefined);

      await sdk.updateDefaultDevices();

      expect(sdk.sessionManager.updateOutgoingMediaForAllSessions).not.toHaveBeenCalled();
      expect(sdk.sessionManager.updateOutputDeviceForAllSessions).not.toHaveBeenCalled();
    });
  });

  describe('setAudioMute()', () => {
    it('proxies the call to the sessionManager', async () => {
      sdk = constructSdk();
      sessionManagerMock.setAudioMute.mockResolvedValue();

      const params = { sessionId: '5512551', mute: true };

      await sdk.setAudioMute(params);
      expect(sdk.sessionManager.setAudioMute).toBeCalledWith(params);
    });
  });

  describe('setVideoMute()', () => {
    it('proxies the call to the sessionManager', async () => {
      sdk = constructSdk();

      sessionManagerMock.setVideoMute.mockResolvedValue();

      const params = { sessionId: '5512551', mute: true };

      await sdk.setVideoMute(params);
      expect(sdk.sessionManager.setVideoMute).toBeCalledWith(params);
    });
  });

  describe('setAccessToken()', () => {
    it('should set _config.accessToken', () => {
      sdk = constructSdk();

      expect(sdk._config.accessToken).toBe('secure');

      const newToken = 'hi-auth-token';
      sdk.setAccessToken(newToken);

      expect(sdk._config.accessToken).toBe(newToken);
    });
  });

  describe('destroy()', () => {
    it('should log, end all sessions, remove listeners, destory media, and disconnect ws', async () => {
      sdk = constructSdk();

      const session1 = new MockSession();
      const session2 = new MockSession();

      sessionManagerMock.getAllJingleSessions.mockReturnValue([session1, session2] as any);
      sessionManagerMock.endSession.mockResolvedValue(null);
      mediaMock.destroy.mockReturnValue();

      jest.spyOn(sdk, 'removeAllListeners');
      jest.spyOn(sdk, 'disconnect').mockResolvedValue(undefined);

      await sdk.destroy();

      expect(sdk.logger.info).toHaveBeenCalledWith('destroying webrtc sdk', {
        activeSessions: [
          { sessionId: session1.id, conversationId: session1.conversationId },
          { sessionId: session2.id, conversationId: session2.conversationId },
        ]
      });
      expect(sdk.sessionManager.endSession).toHaveBeenCalledWith(session1);
      expect(sdk.sessionManager.endSession).toHaveBeenCalledWith(session2);
      expect(sdk.removeAllListeners).toHaveBeenCalled();
      expect(sdk.media.destroy).toHaveBeenCalled();
      expect(sdk.disconnect).toHaveBeenCalled();
    });
  });

  describe('trackDefaultAudioStream()', () => {
    let trackDefaultAudioStreamFn: typeof GenesysCloudWebrtcSdk.prototype['trackDefaultAudioStream'];
    let mockTrack: MediaStreamTrack;
    let mockSteam: MediaStream;

    beforeEach(() => {
      mockTrack = new MockTrack('audio') as any as MediaStreamTrack;
      mockSteam = new MockStream([mockTrack] as any) as any as MediaStream;
      sdk = constructSdk({
        accessToken: 'access-granted',
        environment: 'mypurecloud.com',
        defaults: {
          audioStream: mockSteam
        }
      });
      trackDefaultAudioStreamFn = sdk['trackDefaultAudioStream'].bind(sdk);
    });

    it('should do nothing if no stream is passed in', () => {
      expect(trackDefaultAudioStreamFn(null)).toBeFalsy();
    });

    it('should not clear the audioStream if audioTracks are present', () => {
      mockSteam.getAudioTracks = jest.fn().mockReturnValue([{label: 'notTest', stop: jest.fn(), addEventListener: jest.fn()}]);
      trackDefaultAudioStreamFn(mockSteam);
      mockTrack.stop();
      expect(sdk._config.defaults.audioStream).not.toEqual(null);
    })

    it('should remove sdk.defaults.audioStream when track is stopped via `track.stop()`', () => {
      trackDefaultAudioStreamFn(sdk._config.defaults.audioStream);

      mockTrack.stop();

      expect(sdk._config.defaults.audioStream).toBe(null);
      expect(sdk.logger.warn).toHaveBeenCalledWith(
        'stopping defaults.audioStream track from track.stop(). removing from sdk.defauls',
        mockTrack
      );
    });

    it('should remove sdk.defaults.audioStream when track is ended via the `ended` event', () => {
      trackDefaultAudioStreamFn(sdk._config.defaults.audioStream);

      /* stop the track via `ended` */
      (mockTrack as any as MockTrack)._mockTrackEnded();

      expect(sdk._config.defaults.audioStream).toBe(null);
      expect(sdk.logger.warn).toHaveBeenCalledWith(
        'stopping defaults.audioStream track from track.onended. removing from sdk.defauls',
        mockTrack
      );
    });
  });

  describe('isCustomerData()', () => {
    beforeEach(() => {
      sdk = constructSdk({ accessToken: 'secure' });
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
    beforeEach(() => {
      sdk = constructSdk({ accessToken: 'securely' });
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

  describe('updateDefaultMediaSettings()', () => {
    beforeEach(() => {
      sdk = constructSdk({
        accessToken: 'access-granted',
        environment: 'mypurecloud.com',
        defaults: {
          micAutoGainControl: true,
          micEchoCancellation: false
        }
      });

      sdk.sessionManager.updateOutgoingMediaForAllSessions = jest.fn().mockResolvedValue(null);
    });

    it('should only update specified defaults', async () => {
      await sdk.updateDefaultMediaSettings({
        micAutoGainControl: false
      });

      expect(sdk._config.defaults).toMatchObject({
        micAutoGainControl: false,
        micEchoCancellation: false,
        micNoiseSuppression: true
      });

      expect(sdk.sessionManager.updateOutgoingMediaForAllSessions).not.toHaveBeenCalled();
    });

    it('should update outgoing media', async () => {
      await sdk.updateDefaultMediaSettings({
        micAutoGainControl: false,
        updateActiveSessions: true
      });

      expect(sdk._config.defaults).toMatchObject({
        micAutoGainControl: false,
        micEchoCancellation: false,
        micNoiseSuppression: true
      });

      expect(sdk.sessionManager.updateOutgoingMediaForAllSessions).toHaveBeenCalled();
    });
  });

  describe('updateAudioVolume()', () => {
    beforeEach(() => {
      sdk = constructSdk({
        accessToken: 'access-granted',
        environment: 'mypurecloud.com',
        defaults: {
          micAutoGainControl: true,
          micEchoCancellation: false
        }
      });

      sdk.sessionManager.updateOutgoingMediaForAllSessions = jest.fn().mockResolvedValue(null);
    });

    it('should validate allowed volume levels', async () => {
      expect(() => sdk.updateAudioVolume(-1)).toThrowError('Invalid volume level');
      expect(() => sdk.updateAudioVolume(101)).toThrowError('Invalid volume level');
      const spy = sdk.sessionManager.updateAudioVolume = jest.fn();

      expect(spy).not.toHaveBeenCalled();

      sdk.updateAudioVolume(0);
      expect(spy).toHaveBeenCalled();
      spy.mockReset();

      sdk.updateAudioVolume(100);
      expect(spy).toHaveBeenCalled();
      spy.mockReset();

      sdk.updateAudioVolume(50);
      expect(spy).toHaveBeenCalled();
    });
  });
});
