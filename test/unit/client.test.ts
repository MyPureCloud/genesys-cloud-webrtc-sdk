let loggerConstructorSpy: jest.SpyInstance;
jest.mock('genesys-cloud-client-logger', () => {
  loggerConstructorSpy = jest.fn((_config) => mockLogger)
  return loggerConstructorSpy;
});

import StreamingClient from 'genesys-cloud-streaming-client';
import { Logger } from 'genesys-cloud-client-logger';
import * as clientPrivate from '../../src/client-private';
import * as windows11Utils from '../../src/windows11-first-session-hack';
import { jwtDecode } from 'jwt-decode';

import { SessionManager } from '../../src/sessions/session-manager';
import { MockStream, MockSession, random } from '../test-utils';
import {
  GenesysCloudWebrtcSdk,
  ICustomerData,
  SdkError,
  ISdkConfig,
  SdkErrorTypes,
  SessionTypes,
  SdkMedia,
  ISdkMediaState,
  IUpdateOutgoingMedia,
  IExtendedMediaSession,
  IMediaDeviceIds,
  isSecurityCode,
  isCustomerData,
  IStation,
  IPersonDetails,
  ISessionIdAndConversationId,
  VideoSessionHandler
} from '../../src';
import * as utils from '../../src/utils';
import { RetryPromise } from 'genesys-cloud-streaming-client/dist/es/utils';
import { HeadsetProxyService } from '../../src/headsets/headset';

jest.mock('../../src/sessions/session-manager');
jest.mock('../../src/media/media');
jest.mock('jwt-decode');

const jwtDecodeSpy: jest.SpyInstance = jwtDecode as any;
const mockLogger: jest.Mocked<Logger> = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  setAccessToken: jest.fn()
} as any;

describe('Client', () => {
  let sdk: GenesysCloudWebrtcSdk;
  let constructSdk: (config?: ISdkConfig) => GenesysCloudWebrtcSdk;

  let sessionManagerMock: jest.Mocked<SessionManager>;
  let streamingClientMock: jest.Mocked<StreamingClient>;
  let mediaMock: jest.Mocked<SdkMedia>;

  beforeEach(() => {
    constructSdk = (config?: ISdkConfig) => {
      /* if we have no config, then use some defaults */
      if (config === undefined) {
        config = { logger: mockLogger as any, accessToken: 'secure', jwt: 'test-jwt', environment: 'mypurecloud.com', optOutOfTelemetry: true };
      }
      /* if we have `truthy`, make sure we always have the mock logger */
      else if (config) {
        config = { logger: mockLogger as any, optOutOfTelemetry: true, ...config };
      }

      sdk = new GenesysCloudWebrtcSdk(config);

      /* set up mock instances */
      // mockLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), log: jest.fn() };
      sessionManagerMock = sdk.sessionManager = new SessionManager(sdk) as any;
      streamingClientMock = {
        disconnect: jest.fn(),
        config: {}
      } as any;

      sdk._streamingConnection = streamingClientMock;
      mediaMock = sdk.media as any;

      /* mock needed returned values (needed for `afterEach => sdk.destroy()`) */
      sessionManagerMock.getAllSessions.mockReturnValue([]);

      return sdk;
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (sdk) {
      await sdk.destroy();
      sdk = null as any;
    }
  });

  describe('constructor()', () => {
    it('throws if options are not provided', () => {
      try {
        constructSdk(null as any); // tslint:disable-line
        fail();
      } catch (err) {
        expect(err).toEqual(new SdkError(SdkErrorTypes.invalid_options, 'Options required to create an instance of the SDK'));
      }
    });

    it('throws if accessToken and organizationId and jwt is not provided', () => {
      try {
        constructSdk({ environment: 'mypurecloud.com' }); // tslint:disable-line
        fail();
      } catch (err) {
        expect(err).toEqual(new SdkError(SdkErrorTypes.invalid_options, 'An accessToken, jwt, or organizationId (for guest access) is required to instantiate the sdk.'));
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
      expect(sdk.headset instanceof HeadsetProxyService).toBe(true);
    });

    it('sets up options when provided and track default audioStream', () => {
      const setDefaultAudioStreamSpy = jest.spyOn(GenesysCloudWebrtcSdk.prototype, 'setDefaultAudioStream').mockImplementation();
      const mockStream = {};
      const sdk = constructSdk({
        accessToken: '1234',
        environment: 'mypurecloud.ie',
        autoConnectSessions: false,
        optOutOfTelemetry: true,
        defaults: {
          audioStream: mockStream,
        }
      } as ISdkConfig);

      expect(sdk.logger).toBe(mockLogger);
      expect(sdk._config.accessToken).toBe('1234');
      expect(sdk._config.environment).toBe('mypurecloud.ie');
      expect(sdk._config.autoConnectSessions).toBe(false);
      expect(sdk.isGuest).toBe(false);
      expect(setDefaultAudioStreamSpy).toHaveBeenCalledWith(mockStream);
    });

    it('sets up listeners for canceled and handled sessions', () => {
      const sdk = constructSdk();

      const ids: ISessionIdAndConversationId = {
        conversationId: 'walk-talky',
        sessionId: 'ants-marching'
      };

      sdk.emit('cancelPendingSession', ids);
      sdk.emit('handledPendingSession', ids);

      expect(sdk.logger.info).toHaveBeenCalledWith('cancelPendingSession', ids);
      expect(sdk.logger.info).toHaveBeenCalledWith('handledPendingSession', ids);

    });
  });

  describe('isScreenRecordingSession', () => {
    beforeEach(() => {
      sdk = constructSdk();
    });

    it('should be true', () => {
      expect(sdk.isScreenRecordingSession({ sessionType: SessionTypes.screenRecording } as any)).toBeTruthy();
    });

    it('should be false', () => {
      expect(sdk.isScreenRecordingSession({ sessionType: SessionTypes.acdScreenShare } as any)).toBeFalsy();
      expect(sdk.isScreenRecordingSession({ sessionType: SessionTypes.softphone } as any)).toBeFalsy();
      expect(sdk.isScreenRecordingSession({ sessionType: SessionTypes.collaborateVideo } as any)).toBeFalsy();
    });
  });

  describe('isVideoSession', () => {
    beforeEach(() => {
      sdk = constructSdk();
    });

    it('should be true', () => {
      expect(sdk.isVideoSession({ sessionType: SessionTypes.collaborateVideo } as any)).toBeTruthy();
    });

    it('should be false', () => {
      expect(sdk.isVideoSession({ sessionType: SessionTypes.acdScreenShare } as any)).toBeFalsy();
      expect(sdk.isVideoSession({ sessionType: SessionTypes.softphone } as any)).toBeFalsy();
      expect(sdk.isVideoSession({ sessionType: SessionTypes.screenRecording } as any)).toBeFalsy();
    });
  });

  describe('startVideoConference()', () => {
    it('should call session manager to start video conference', async () => {
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
        expect(e).toEqual(new Error('Video conferencing requires authentication via JWT or access token.'));
        expect(sessionManagerMock.startSession).not.toHaveBeenCalled();
      }
    });

    it('should allow video conference with JWT authentication', async () => {
      const testJwt = 'test.jwt.token';
      sdk = constructSdk({ jwt: testJwt });

      sdk._personDetails = {
        id: 'test-user-id',
        name: 'Test User',
        chat: {
          jabberId: 'test-user@test.com'
        }
      };

      sessionManagerMock.startSession.mockResolvedValue({});
      await sdk.startVideoConference('test-room@conference.com');

      expect(sessionManagerMock.startSession).toBeCalledWith({
        jid: 'test-room@conference.com',
        sessionType: SessionTypes.collaborateVideo
      });
    });

    it('should include JWT in video session request', async () => {
      const testJwt = 'test.jwt.token';
      const mockDecodedJwt = {
        data: {
          jid: 'test-user@test.com',
          conversationId: 'test-conversation-id',
          sourceCommunicationId: 'test-source-comm-id'
        }
      };

      jwtDecodeSpy.mockReturnValue(mockDecodedJwt);

      sdk = constructSdk({ jwt: testJwt });
      const handler = new VideoSessionHandler(sdk, sessionManagerMock);

      sdk._personDetails = {
        id: 'test-user-id',
        name: 'Test User',
        chat: {
          jabberId: 'test-user@test.com'
        }
      };

      const mockInitiateRtcSession = jest.fn().mockResolvedValue(undefined);
      sdk._streamingConnection = {
        webrtcSessions: {
          initiateRtcSession: mockInitiateRtcSession
        },
        disconnect: jest.fn().mockResolvedValue(undefined)
      } as any;

      const requestApiSpy = jest.spyOn(utils, 'requestApi');

      const result = await handler.startSession({
        jid: 'test-room@conference.com',
        sessionType: SessionTypes.collaborateVideo
      });

      expect(mockInitiateRtcSession).toHaveBeenCalledWith({
        jid: mockDecodedJwt.data.jid,
        conversationId: mockDecodedJwt.data.conversationId,
        sourceCommunicationId: mockDecodedJwt.data.sourceCommunicationId,
        mediaPurpose: SessionTypes.collaborateVideo,
        sessionType: SessionTypes.collaborateVideo
      });

      expect(result).toEqual({
        conversationId: mockDecodedJwt.data.conversationId
      });

      expect(requestApiSpy).not.toHaveBeenCalled();
    });
  });

  describe('startVideoMeeting()', () => {
    it('should call session manager to start video meeting', async () => {
      sdk = constructSdk();

      sessionManagerMock.startSession.mockResolvedValue({});
      await sdk.startVideoMeeting('123abc');
      expect(sessionManagerMock.startSession).toBeCalledWith({ meetingId: '123abc', sessionType: SessionTypes.collaborateVideo });
    });

    it('should throw if guest user', async () => {
      sdk = constructSdk({ organizationId: 'some-org' }); // no access_token is a guest user
      try {
        await sdk.startVideoMeeting('123');
        fail('should have failed');
      } catch (e) {
        expect(e).toEqual(new Error('video conferencing meetings not supported for guests'));
        expect(sessionManagerMock.startSession).not.toHaveBeenCalled();
      }
    });
  });

  describe('isLiveScreenMonitoringSession', () => {
    beforeEach(() => {
      sdk = constructSdk();
    });

    it('should be true', () => {
      expect(sdk.isLiveScreenMonitoringSession({ sessionType: SessionTypes.liveScreenMonitoring } as any)).toBeTruthy();
    });

    it('should be false', () => {
      expect(sdk.isLiveScreenMonitoringSession({ sessionType: SessionTypes.acdScreenShare } as any)).toBeFalsy();
      expect(sdk.isLiveScreenMonitoringSession({ sessionType: SessionTypes.softphone } as any)).toBeFalsy();
      expect(sdk.isLiveScreenMonitoringSession({ sessionType: SessionTypes.screenRecording } as any)).toBeFalsy();
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

      const conversationId = '5512551';
      await sdk.acceptPendingSession({ conversationId });
      expect(sdk.sessionManager.proceedWithSession).toBeCalledWith({ conversationId });
    });
  });

  describe('rejectPendingSession()', () => {
    it('proxies the call to the sessionManager', async () => {
      sdk = constructSdk();

      sessionManagerMock.rejectPendingSession.mockResolvedValue();

      const conversationId = '5512551';
      await sdk.rejectPendingSession({ conversationId });
      expect(sdk.sessionManager.rejectPendingSession).toBeCalledWith({ conversationId });
    });
  });

  describe('acceptSession()', () => {
    it('proxies the call to the sessionManager', async () => {
      sdk = constructSdk();

      sessionManagerMock.acceptSession.mockResolvedValue({ conversationId: 'some-convo' });

      const params = { conversationId: '5512551' };
      await sdk.acceptSession(params);
      expect(sdk.sessionManager.acceptSession).toBeCalledWith(params);
    });
  });

  describe('endSession()', () => {
    it('should proxy to sessionManager', async () => {
      sdk = constructSdk();

      sessionManagerMock.endSession.mockResolvedValue();
      const params = { conversationId: random() };
      await sdk.endSession(params);
      expect(sdk.sessionManager.endSession).toBeCalledWith(params);
    });
  });

  describe('forceTerminateSession()', () => {
    it('should proxy to sessionManager', async () => {
      sdk = constructSdk();

      sessionManagerMock.forceTerminateSession.mockResolvedValue();
      await sdk.forceTerminateSession('sessionId');
      expect(sdk.sessionManager.forceTerminateSession).toBeCalledWith('sessionId', undefined);
    });
  });

  describe('fetchUsersStation()', () => {
    let station: IStation;
    let user: IPersonDetails;
    let mockStationResponse: Promise<{ data: IStation }>;

    beforeEach(() => {
      const stationId = 'the-bat-phone';
      user = {
        id: 'bat-123-man',
        name: 'THE Batman',
        chat: {
          jabberId: 'bat.com',
        },
        station: {
          effectiveStation: { id: stationId } as any
        }
      };
      station = {
        id: stationId,
        name: 'Batman WebRTC station',
        status: 'ASSOCIATED',
        userId: user.id,
        webRtcUserId: user.id,
        type: 'inin_webrtc_softphone',
        webRtcPersistentEnabled: false,
        webRtcForceTurn: false,
        webRtcCallAppearances: 100
      };
      jest.spyOn(utils, 'requestApiWithRetry').mockImplementation(() => {
        return {
          promise: mockStationResponse || Promise.resolve({ data: station })
        } as RetryPromise<{ data: IStation }>;
      });
      sdk = constructSdk();
    });

    it('should fetch the station and emit the necessary events', async () => {
      sdk._personDetails = user;

      const concurrentSessionEvent = new Promise<void>(res => {
        sdk.once('concurrentSoftphoneSessionsEnabled', (bool) => {
          expect(bool).toBe(true);
          res();
        });
      });

      const stationEvent = new Promise<void>(res => {
        sdk.once('station', (evt) => {
          expect(evt).toEqual({ action: 'Associated', station });
          res();
        });
      });

      expect(await sdk.fetchUsersStation()).toEqual(station);

      await concurrentSessionEvent;
      await stationEvent;
    });

    it('should fetch the user before the station if the user was not previously loaded', async () => {
      const fetchAuthenticatedUserSpy = jest.spyOn(sdk, 'fetchAuthenticatedUser').mockImplementation(() => {
        sdk._personDetails = user;
        return Promise.resolve(user);
      });

      expect(await sdk.fetchUsersStation()).toEqual(station);
      expect(fetchAuthenticatedUserSpy).toHaveBeenCalled();
      expect(sdk._personDetails).toBe(user);
    });

    it('should throw an error if fetching the user fails', async () => {
      const error = new Error('Bad HTTP happenings');
      const fetchAuthenticatedUserSpy = jest.spyOn(sdk, 'fetchAuthenticatedUser').mockRejectedValue(error);

      try {
        await sdk.fetchUsersStation();
        fail('should have throw');
      } catch (e) {
        expect(e).toEqual(error);
      }

      expect(fetchAuthenticatedUserSpy).toHaveBeenCalled();
    });

    it('should throw if the user does not have an effective station', async () => {
      const expectThrow = async () => {
        try {
          await sdk.fetchUsersStation();
          fail('should have throw');
        } catch (e) {
          expect(e.message).toBe('User does not have an effective station');
        }
      };

      /* no user, even after trying to load one */
      jest.spyOn(sdk, 'fetchAuthenticatedUser').mockResolvedValue({} as any);
      await expectThrow();

      /* no station for the user */
      sdk._personDetails = { ...user, station: undefined };
      await expectThrow();

      /* no station Id on the station */
      sdk._personDetails = { ...user, station: {} };
      await expectThrow();
    });

    it('should throw an error if fetching the station fails', async () => {
      sdk._personDetails = user;

      mockStationResponse = Promise.reject(new Error('Bad Request'));

      try {
        await sdk.fetchUsersStation();
        fail('should have throw');
      } catch (e) {
        expect(e.message).toEqual('Bad Request');
      }
    });
  });

  describe('isPersistentConnectionEnabled()', () => {
    beforeEach(() => {
      sdk = constructSdk();
      sdk.station = {
        type: 'inin_webrtc_softphone',
        webRtcPersistentEnabled: true,
      } as IStation;
    });

    it('should return "true" if persistent connection is enabled for a webrtc softphone', () => {
      expect(sdk.isPersistentConnectionEnabled()).toBe(true);
    });

    it('should return "false" if there is no station', () => {
      delete (sdk as any).station;
      expect(sdk.isPersistentConnectionEnabled()).toBe(false);
    });

    it('should return "false" if persistent connection is not enabled', () => {
      delete (sdk.station as any).webRtcPersistentEnabled;
      expect(sdk.isPersistentConnectionEnabled()).toBe(false);

      (sdk as any).station.webRtcPersistentEnabled = false;
      expect(sdk.isPersistentConnectionEnabled()).toBe(false);
    });

    it('should return "false" if not a webrt softphone', () => {
      (sdk as any).station.type = 'inin_remote';
      expect(sdk.isPersistentConnectionEnabled()).toBe(false);

      delete (sdk as any).station.type;
      expect(sdk.isPersistentConnectionEnabled()).toBe(false);
    });
  });

  describe('isConcurrentSoftphoneSessionsEnabled()', () => {
    beforeEach(() => {
      sdk = constructSdk();
      sdk.station = {
        webRtcCallAppearances: 100
      } as IStation;
    });

    it('should return "true" if station has lineCallAppearance > 1', () => {
      expect(sdk.isConcurrentSoftphoneSessionsEnabled()).toBe(true);
    });

    it('should return "false" if station has lineCallAppearance === 1', () => {
      (sdk as any).station.webRtcCallAppearances = 1;
      expect(sdk.isConcurrentSoftphoneSessionsEnabled()).toBe(false);
    });

    it('should return "false" if there is no station', () => {
      delete (sdk as any).station;
      expect(sdk.isConcurrentSoftphoneSessionsEnabled()).toBe(false);
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
        conversationId: 'convo-id',
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
        conversationId: 'convo-id',
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
        conversationId: 'conversation-id',
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

      expect(sdk._config.defaults!.audioDeviceId).toBe(null);
      expect(sdk._config.defaults!.videoDeviceId).toBe(null);
      expect(sdk._config.defaults!.outputDeviceId).toBe(null);
    });

    it('should set defaultDevice Ids if values are passed in and sessionManager is not defined', async () => {
      sdk = constructSdk();
      const options: IMediaDeviceIds = {
        videoDeviceId: 'new-video-device',
        audioDeviceId: 'new-audio-device',
        outputDeviceId: 'new-output-device',
      };

      sdk.headset.updateAudioInputDevice = jest.fn();
      (sdk as any).sessionManager = null;
      await sdk.updateDefaultDevices({ ...options, updateActiveSessions: true });

      expect(sdk._config.defaults!.audioDeviceId).toBe(options.audioDeviceId);
      expect(sdk.headset.updateAudioInputDevice).toHaveBeenCalledWith(options.audioDeviceId);
      expect(sdk._config.defaults!.videoDeviceId).toBe(options.videoDeviceId);
      expect(sdk._config.defaults!.outputDeviceId).toBe(options.outputDeviceId);
    });

    it('should set defaultDevice Ids if values are passed in', async () => {
      sdk = constructSdk();
      const options: IMediaDeviceIds = {
        videoDeviceId: 'new-video-device',
        audioDeviceId: 'new-audio-device',
        outputDeviceId: 'new-output-device',
      };

      sdk.headset.updateAudioInputDevice = jest.fn();
      await sdk.updateDefaultDevices(options);

      expect(sdk._config.defaults!.audioDeviceId).toBe(options.audioDeviceId);
      expect(sdk.headset.updateAudioInputDevice).toHaveBeenCalledWith(options.audioDeviceId);
      expect(sdk._config.defaults!.videoDeviceId).toBe(options.videoDeviceId);
      expect(sdk._config.defaults!.outputDeviceId).toBe(options.outputDeviceId);
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

      sdk.headset.updateAudioInputDevice = jest.fn();
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
      sdk.headset.updateAudioInputDevice = jest.fn();
      options.videoDeviceId = undefined;
      options.outputDeviceId = undefined;
      options.audioDeviceId = 'new-audio-device-id';

      await sdk.updateDefaultDevices(options);

      expect(sdk.headset.updateAudioInputDevice).toHaveBeenCalledWith(options.audioDeviceId);
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

  describe('updateDefaultResolution()', () => {
    it ('should do nothing if updateActiveSessions is false', () => {
      sdk = constructSdk();
      const eventEmitSpy = jest.spyOn(sdk, 'emit');
      sdk.updateDefaultResolution({ width: 1920, height: 1080 }, false);
      expect(sdk._config.defaults?.videoResolution).toStrictEqual({ width: 1920, height: 1080 });
      expect(eventEmitSpy).not.toHaveBeenCalled();
    })
    it('will attempt to update the videos resolution to the requested value; resolution is defined', async () => {
      sdk = constructSdk();
      const stream = new MockStream() as any as MediaStream;
      stream.getVideoTracks = jest.fn().mockReturnValue([{
        applyConstraints: jest.fn(),
        getConstraints: jest.fn(),
        getSettings: jest.fn().mockReturnValue({
          width: 1920,
          height: 1080
        })
      }]);
      jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([{
        id: 'test-id-123',
        conversationId: 'test-convo-id-123',
        sessionType: SessionTypes.collaborateVideo,
        _outboundStream: stream
      } as IExtendedMediaSession])
      const eventEmitSpy = jest.spyOn(sdk, 'emit');
      await sdk.updateDefaultResolution({width: 1920, height: 1080}, true);
      expect(sdk._config.defaults?.videoResolution).toStrictEqual({ width: 1920, height: 1080 });
      expect(eventEmitSpy).toHaveBeenCalledWith('resolutionUpdated', {
        requestedResolution: { width: 1920, height: 1080 },
        actualResolution: stream.getVideoTracks()[0].getSettings(),
        videoTrack: stream.getVideoTracks()[0],
        sessionId: 'test-id-123',
        conversationId: 'test-convo-id-123'
      })
    })

    it('will attempt to update the videos resolution to the requested value; resolution is undefined', async () => {
      sdk = constructSdk();
      const stream = new MockStream() as any as MediaStream;
      stream.getVideoTracks = jest.fn().mockReturnValue([{
        applyConstraints: jest.fn(),
        getConstraints: jest.fn(),
        getSettings: jest.fn().mockReturnValue({
          width: 1920,
          height: 1080
        }),
        stop: jest.fn()
      }]);
      jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([{
        id: 'test-id-123',
        conversationId: 'test-convo-id-123',
        sessionType: SessionTypes.collaborateVideo,
        _outboundStream: stream
      } as IExtendedMediaSession])
      const updateSessionSpy = jest.spyOn(sdk.sessionManager, 'addOrReplaceTrackOnSession').mockReturnValue(Promise.resolve());
      const startMediaSpy = jest.spyOn(sdk.media, 'startMedia').mockReturnValue(Promise.resolve(stream));
      const eventEmitSpy = jest.spyOn(sdk, 'emit');
      await sdk.updateDefaultResolution(undefined, true);
      expect(startMediaSpy).toHaveBeenCalled();
      expect(await updateSessionSpy).toHaveBeenCalled();
      expect(eventEmitSpy).toHaveBeenCalledWith('resolutionUpdated', {
        requestedResolution: undefined,
        actualResolution: stream.getVideoTracks()[0].getSettings(),
        videoTrack: stream.getVideoTracks()[0],
        sessionId: 'test-id-123',
        conversationId: 'test-convo-id-123'
      })
    })

    it('will attempt to update the videos resolution to the requested value but fail', async () => {
      sdk = constructSdk();
      const stream = new MockStream() as any as MediaStream;
      stream.getVideoTracks = jest.fn().mockReturnValue([{
        applyConstraints: jest.fn().mockImplementation(() => {
          throw(new SdkError(SdkErrorTypes.generic, '', {}));
        }),
        getConstraints: jest.fn(),
        getSettings: jest.fn().mockReturnValue({
          width: 1920,
          height: 1080
        })
      }]);
      jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([{
        id: 'test-id-123',
        conversationId: 'test-convo-id-123',
        sessionType: SessionTypes.collaborateVideo,
        _outboundStream: stream
      } as IExtendedMediaSession])
      const eventEmitSpy = jest.spyOn(sdk, 'emit');
      const createAndEmitSdkErrorSpy = jest.spyOn(utils, 'createAndEmitSdkError');
      await sdk.updateDefaultResolution({ width: 206589741, height: 987652378 }, true);
      expect(createAndEmitSdkErrorSpy).toHaveBeenCalled();
      expect(eventEmitSpy).toHaveBeenCalledWith('resolutionUpdated', {
        requestedResolution: { width: 206589741, height: 987652378},
        actualResolution: stream.getVideoTracks()[0].getSettings(),
        videoTrack: stream.getVideoTracks()[0],
        sessionId: 'test-id-123',
        conversationId: 'test-convo-id-123'
      })
    })

    it('will update the SDK defaults if the actualResolution differs from the requested', async () => {
      sdk = constructSdk();
      const stream1 = new MockStream() as any as MediaStream;
      stream1.getVideoTracks = jest.fn().mockReturnValue([{
        applyConstraints: jest.fn(),
        getConstraints: jest.fn(),
        getSettings: jest.fn().mockReturnValue({
          width: 1920,
          height: 1080
        })
      }]);

      const stream2 = new MockStream() as any as MediaStream;
      stream2.getVideoTracks = jest.fn().mockReturnValue([{
        applyConstraints: jest.fn(),
        getConstraints: jest.fn(),
        getSettings: jest.fn().mockReturnValue({
          width: 3840,
          height: 1440
        })
      }]);

      /* Impossible scenario but put in place to satisfy coverage */
      const stream3 = new MockStream() as any as MediaStream;
      stream3.getVideoTracks = jest.fn().mockReturnValue([{
        applyConstraints: jest.fn(),
        getConstraints: jest.fn(),
        getSettings: jest.fn().mockReturnValue({
          width: undefined,
          height: 1440
        })
      }]);

      jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValueOnce([{
        id: 'test-id-123',
        conversationId: 'test-convo-id-123',
        sessionType: SessionTypes.collaborateVideo,
        _outboundStream: stream1
      } as IExtendedMediaSession])
      .mockReturnValueOnce([{
        id: 'test-id-123',
        conversationId: 'test-convo-id-123',
        sessionType: SessionTypes.collaborateVideo,
        _outboundStream: stream2
      } as IExtendedMediaSession])
      .mockReturnValueOnce([{
        id: 'test-id-123',
        conversationId: 'test-convo-id-123',
        sessionType: SessionTypes.collaborateVideo,
        _outboundStream: stream3
      } as IExtendedMediaSession])

      const eventEmitSpy = jest.spyOn(sdk, 'emit');
      await sdk.updateDefaultResolution({ width: 3840, height: 2160 }, true);
      expect(sdk._config.defaults?.videoResolution).toStrictEqual({ width: 1920, height: 1080 });
      expect(eventEmitSpy).toHaveBeenCalledWith('resolutionUpdated', {
        requestedResolution: { width: 3840, height: 2160 },
        actualResolution: stream1.getVideoTracks()[0].getSettings(),
        videoTrack: stream1.getVideoTracks()[0],
        sessionId: 'test-id-123',
        conversationId: 'test-convo-id-123'
      })

      await sdk.updateDefaultResolution({ width: 3840, height: 2160 }, true);
      expect(sdk._config.defaults?.videoResolution).toStrictEqual({ width: 3840, height: 1440 });
      expect(eventEmitSpy).toHaveBeenCalledWith('resolutionUpdated', {
        requestedResolution: { width: 3840, height: 2160 },
        actualResolution: stream2.getVideoTracks()[0].getSettings(),
        videoTrack: stream2.getVideoTracks()[0],
        sessionId: 'test-id-123',
        conversationId: 'test-convo-id-123'
      })

      /* Impossible scenario, but put in place to satisfy coverage */
      await sdk.updateDefaultResolution(undefined, true);
      expect(sdk._config.defaults?.videoResolution).toStrictEqual(undefined);
      expect(eventEmitSpy).toHaveBeenCalledWith('resolutionUpdated', {
        requestedResolution: undefined,
        actualResolution: stream3.getVideoTracks()[0].getSettings(),
        videoTrack: stream3.getVideoTracks()[0],
        sessionId: 'test-id-123',
        conversationId: 'test-convo-id-123'
      })
    })
  })

  describe('setAudioMute()', () => {
    it('proxies the call to the sessionManager', async () => {
      sdk = constructSdk();
      sessionManagerMock.setAudioMute.mockResolvedValue();

      const params = { conversationId: '5512551', mute: true };

      await sdk.setAudioMute(params);
      expect(sdk.sessionManager.setAudioMute).toBeCalledWith(params);
    });
  });

  describe('setVideoMute()', () => {
    it('proxies the call to the sessionManager', async () => {
      sdk = constructSdk();

      sessionManagerMock.setVideoMute.mockResolvedValue();

      const params = { conversationId: '5512551', mute: true };

      await sdk.setVideoMute(params);
      expect(sdk.sessionManager.setVideoMute).toBeCalledWith(params);
    });
  });

  describe('setConversationHeld()', () => {
    it('proxies the call to the sessionManager', async () => {
      sdk = constructSdk();

      sessionManagerMock.setConversationHeld.mockResolvedValue();

      const params = { conversationId: '5512551', held: true };

      await sdk.setConversationHeld(params);
      expect(sdk.sessionManager.setConversationHeld).toBeCalledWith(params);
    });
  });

  describe('setAccessToken()', () => {
    it('should set _config.accessToken and pass it to logger and streamingclient', () => {
      sdk = constructSdk();

      expect(sdk._config.accessToken).toBe('secure');
      expect(sdk._streamingConnection.config.authToken).toBe(undefined);

      const newToken = 'hi-auth-token';
      sdk.setAccessToken(newToken);

      expect(sdk._config.accessToken).toBe(newToken);
      expect(mockLogger.setAccessToken).toHaveBeenCalledWith(newToken);
      expect(sdk._streamingConnection.config.authToken).toBe(newToken);
    });

    it('should not pass it to the streaming-client if it does not exist', () => {
      sdk = constructSdk();

      /* mock that we haven't initialized yet */
      delete (sdk as any)._streamingConnection;
      expect(sdk._config.accessToken).toBe('secure');

      const newToken = 'hi-auth-token';
      sdk.setAccessToken(newToken);

      expect(sdk._config.accessToken).toBe(newToken);
      expect(mockLogger.setAccessToken).toHaveBeenCalledWith(newToken);
      expect(sdk._streamingConnection).toBeFalsy();

      // add streamingConnection
    });
  });

  describe('setJwt()', () => {
    it('should set _config.jwt and pass it to logger and streamingclient', () => {
      sdk = constructSdk();

      expect(sdk._config.jwt).toBe('test-jwt');
      expect(sdk._streamingConnection.config.jwt).toBe(undefined);

      const newToken = 'hi-jwt-token';
      sdk.setJwt(newToken);

      expect(sdk._config.jwt).toBe(newToken);
      // expect(mockLogger.setAccessToken).toHaveBeenCalledWith(newToken);
      expect(sdk._streamingConnection.config.jwt).toBe(newToken);
    });

    it('should not pass it to the streaming-client if it does not exist', () => {
      sdk = constructSdk();

      /* mock that we haven't initialized yet */
      delete (sdk as any)._streamingConnection;
      expect(sdk._config.jwt).toBe('test-jwt');

      const newToken = 'hi-jwt-token';
      sdk.setJwt(newToken);

      expect(sdk._config.jwt).toBe(newToken);
      // expect(mockLogger.setAccessToken).toHaveBeenCalledWith(newToken);
      expect(sdk._streamingConnection).toBeFalsy();
    });
  });

  describe('setDefaultAudioStream()', () => {
    it('should call through to media.setDefaultAudioStream()', () => {
      sdk = constructSdk();
      const spy = jest.spyOn(sdk.media, 'setDefaultAudioStream');
      const media = new MockStream() as any as MediaStream;

      sdk.setDefaultAudioStream(media);
      expect(spy).toHaveBeenCalledWith(media);
    });
  });

  describe('destroy()', () => {
    it('should log, end all sessions, remove listeners, destory media, and disconnect ws', async () => {
      sdk = constructSdk();

      const session1 = new MockSession();
      const session2 = new MockSession();

      sessionManagerMock.getAllSessions.mockReturnValue([session1, session2] as any);
      sessionManagerMock.forceTerminateSession.mockResolvedValue();
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
      expect(sdk.sessionManager.forceTerminateSession).toHaveBeenCalledWith(session1.id);
      expect(sdk.sessionManager.forceTerminateSession).toHaveBeenCalledWith(session2.id);
      expect(sdk.removeAllListeners).toHaveBeenCalled();
      expect(sdk.media.destroy).toHaveBeenCalled();
      expect(sdk.disconnect).toHaveBeenCalled();
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
      const customerData: any = undefined;
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

    it('should only update specified defaults if no sessionManager', async () => {
      (sdk as any).sessionManager = null;

      await sdk.updateDefaultMediaSettings({
        micAutoGainControl: false,
        updateActiveSessions: true
      });

      expect(sdk._config.defaults).toMatchObject({
        micAutoGainControl: false,
        micEchoCancellation: false,
        micNoiseSuppression: true
      });
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

    it('should validate allowed volume levels even if theres no session manager', async () => {
      expect(() => sdk.updateAudioVolume(-1)).toThrowError('Invalid volume level');
      expect(() => sdk.updateAudioVolume(101)).toThrowError('Invalid volume level');
      (sdk as any).sessionManager = null;

      sdk.updateAudioVolume(0);
      expect((sdk as any)._config.defaults.audioVolume).toBe(0);

      sdk.updateAudioVolume(100);
      expect((sdk as any)._config.defaults.audioVolume).toBe(100);

      sdk.updateAudioVolume(50);
      expect((sdk as any)._config.defaults.audioVolume).toBe(50);
    });
  });

  describe('startSoftphoneSession()', () => {
    it('should call session manager to start softphone session', async () => {
      sdk = constructSdk();

      sessionManagerMock.startSession.mockResolvedValue({});
      await sdk.startSoftphoneSession({ phoneNumber: '123' } as any);
      expect(sessionManagerMock.startSession).toBeCalledWith({ phoneNumber: '123', sessionType: 'softphone' });
    });
  });

  describe('listenForStationEvents()', () => {
    let listenForStationEventsFn: typeof sdk['listenForStationEvents'];
    let emitEvent;
    beforeEach(() => {
      sdk = constructSdk();
      sdk._personDetails = {
        id: 'peter-parker'
      } as IPersonDetails;

      listenForStationEventsFn = sdk['listenForStationEvents'].bind(sdk);
      streamingClientMock._notifications = {
        subscribe: jest.fn()
          .mockImplementation((_event, callback) => emitEvent = callback)
      } as any;
    });

    it('should subscribe to station events', async () => {
      await listenForStationEventsFn();
      expect(streamingClientMock._notifications.subscribe)
        .toHaveBeenCalledWith(`v2.users.${sdk._personDetails.id}.station`, expect.any(Function));
    });

    it('should handle handle DISASSOCIATED_EVENT', async () => {
      const station = { id: 'bane' } as IStation;
      sdk.station = station;

      await listenForStationEventsFn();

      // this event isn't async so we don't have to wait for a promise
      sdk.on('station', (evt) => {
        expect(evt).toEqual({ action: 'Disassociated', station: null });
      });

      emitEvent({ metadata: { action: 'Disassociated' } });
      expect(sdk.logger.info).toHaveBeenCalledWith('station disassociated', { stationId: station.id });

      /* handle duplicate messages */
      emitEvent({ metadata: { action: 'Disassociated' } });
      expect(sdk.logger.info).toHaveBeenCalledWith('station disassociated', { stationId: undefined });
    });

    it('should handle handle ASSOCIATED_EVENT', async () => {
      await listenForStationEventsFn();
      jest.spyOn(sdk, 'fetchUsersStation').mockResolvedValue({} as any);

      emitEvent({
        metadata: { action: 'Associated' },
        eventBody: { associatedStation: { id: 'webrtc-station' } }
      });
      expect(sdk._personDetails.station?.effectiveStation?.id).toEqual('webrtc-station');
      expect(sdk.fetchUsersStation).toHaveBeenCalled();
    });

    it('should handle migration event', async () => {
      const station = { id: 'bane' } as IStation;
      sdk.station = station;
      sdk._personDetails.station = {
        effectiveStation: station
      };

      await listenForStationEventsFn();
      jest.spyOn(sdk, 'fetchUsersStation').mockResolvedValue(station);

      emitEvent({ metadata: { action: 'WebRTCMigration' } });
      expect(sdk.fetchUsersStation).toHaveBeenCalled();
    });

    it('should ignore other events', async () => {
      await listenForStationEventsFn();

      jest.spyOn(sdk, 'fetchUsersStation').mockResolvedValue({} as any);
      sdk.on('station', (_evt) => {
        fail('should not emit unknown events');
      });

      emitEvent({
        metadata: { action: 'Something-Not-Station-Related' }
      });

      expect(sdk.fetchUsersStation).not.toHaveBeenCalled();
    });
  });

  describe('initialize', () => {
    let orgSpy: jest.SpyInstance;
    let userSpy: jest.SpyInstance;
    let setupScSpy: jest.SpyInstance;
    let proxySpy: jest.SpyInstance;
    let requestSpy: jest.SpyInstance;

    function setupSpys () {
      orgSpy = jest.spyOn(sdk, 'fetchOrganization');
      userSpy = jest.spyOn(sdk, 'fetchAuthenticatedUser');
    }

    beforeEach(() => {
      setupScSpy = jest.spyOn(clientPrivate, 'setupStreamingClient').mockResolvedValue();
      proxySpy = jest.spyOn(clientPrivate, 'proxyStreamingClientEvents').mockResolvedValue();
      requestSpy = jest.spyOn(utils, 'requestApi');
    });

    it('should init with jwt', async () => {
      jwtDecodeSpy.mockReturnValue({
        name: 'scooby',
        org: 'myorg',
        data: {
          uid: 'myuserid',
          jid: 'myjid',
        }
      } as any);

      constructSdk({jwt: 'lsdjf'});
      setupSpys();
      jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockResolvedValue();
      proxySpy.mockImplementation(() => {
        sdk._streamingConnection = {
          _webrtcSessions: {
            iceServers: []
          },
          messenger: {
            on: jest.fn()
          },
          disconnect: jest.fn()
        } as any;
      });

      await sdk.initialize();

      expect(orgSpy).not.toHaveBeenCalled();
      expect(userSpy).not.toHaveBeenCalled();
      expect(setupScSpy).toHaveBeenCalled();
      expect(proxySpy).toHaveBeenCalled();
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('should blow up with malformed jwt', async () => {
      jwtDecodeSpy.mockImplementation(() => {
        throw new Error('testError');
      });

      constructSdk({jwt: 'lsdjf'});
      setupSpys();

      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e.message).toContain('Failed to parse provided jwt');
      }
    });

    it('should call window11 setup', async () => {
      jwtDecodeSpy.mockReturnValue({
        name: 'scooby',
        org: 'myorg',
        data: {
          uid: 'myuserid',
          jid: 'myjid',
        }
      } as any);

      constructSdk({ accessToken: 'fakeToken', optOutOfTelemetry: true, allowedSessionTypes: [SessionTypes.collaborateVideo] });
      setupSpys();
      orgSpy.mockResolvedValue({});
      userSpy.mockResolvedValue({});
      proxySpy.mockImplementation(() => {
        sdk._streamingConnection = {
          _webrtcSessions: {
            iceServers: []
          },
          messenger: {
            on: jest.fn()
          },
          disconnect: jest.fn()
        } as any;
      });
      const windows11Hack = jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockImplementation();
      await sdk.initialize();

      expect(windows11Hack).toHaveBeenCalled();
    });

    it('should call addAllowedSessionType for each sessionType in the config', async () => {
      constructSdk({ accessToken: 'fakeToken', optOutOfTelemetry: true, allowedSessionTypes: [SessionTypes.collaborateVideo] });
      setupSpys();
      orgSpy.mockResolvedValue(Promise.resolve());
      userSpy.mockResolvedValue(Promise.resolve());
      jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockImplementation();

      const spy = jest.spyOn(sdk, 'addAllowedSessionType').mockResolvedValue();
      sdk._streamingConnection = {
        _webrtcSessions: { iceServers: [] },
        disconnect: jest.fn(),
        messenger: {
          on: jest.fn(),
        },
      } as any;

      await sdk.initialize();
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockReset();
      sdk._config.allowedSessionTypes = [SessionTypes.softphone, SessionTypes.acdScreenShare, SessionTypes.collaborateVideo];
      await sdk.initialize();
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('should set mediaHelper headsetRequestType if mediaHelper resource', async () => {
      constructSdk({ accessToken: 'fakeToken', optOutOfTelemetry: true, allowedSessionTypes: [SessionTypes.collaborateVideo] });
      setupSpys();
      orgSpy.mockResolvedValue(Promise.resolve());
      userSpy.mockResolvedValue(Promise.resolve());
      jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockImplementation();

      const spy = jest.spyOn(sdk, 'addAllowedSessionType').mockResolvedValue();
      sdk._streamingConnection = {
        _webrtcSessions: { iceServers: [] },
        disconnect: jest.fn(),
        messenger: {
          on: jest.fn(),
        },
      } as any;

      sdk._config.jidResource = 'mediahelper_sdlkf';
      sdk._config.headsetRequestType = 'standard';

      await sdk.initialize();
      expect(sdk._config.headsetRequestType).toBe('mediaHelper');
    });
  });

  describe('addAllowedSessionType', () => {
    let sessionManagerSpy;

    beforeEach(() => {
      constructSdk({ accessToken: 'fakeToken', optOutOfTelemetry: true, allowedSessionTypes: [] });
      sessionManagerSpy = jest.spyOn(sdk.sessionManager, 'addAllowedSessionType').mockImplementation();
    });

    it('happy path - should call session manager', async () => {
      expect(sdk._config.allowedSessionTypes).not.toContain(SessionTypes.screenRecording);
      await sdk.addAllowedSessionType(SessionTypes.screenRecording);
      expect(sessionManagerSpy).toHaveBeenCalled();
      expect(sdk._config.allowedSessionTypes).toContain(SessionTypes.screenRecording);
    });

    it('should fetch station and subscribe for softphone', async () => {
      const fetchSpy = jest.spyOn(sdk, 'fetchUsersStation').mockResolvedValue(null as any);
      const subSpy = jest.spyOn(sdk as any, 'listenForStationEvents').mockResolvedValue(null as any);

      expect(sdk._config.allowedSessionTypes).not.toContain(SessionTypes.softphone);
      await sdk.addAllowedSessionType(SessionTypes.softphone);
      expect(fetchSpy).toHaveBeenCalled();
      expect(subSpy).toHaveBeenCalled();
      expect(sessionManagerSpy).toHaveBeenCalled();
      expect(sdk._config.allowedSessionTypes).toContain(SessionTypes.softphone);
    });

    it('should not add if it is a duplicate', async () => {
      sdk._config.allowedSessionTypes = [SessionTypes.screenRecording];
      await sdk.addAllowedSessionType(SessionTypes.screenRecording);
      expect(sessionManagerSpy).not.toHaveBeenCalled();
    });
  });

  describe('removeAllowedSessionType', () => {
    let sessionManagerSpy;

    beforeEach(() => {
      constructSdk({ accessToken: 'fakeToken', optOutOfTelemetry: true, allowedSessionTypes: [SessionTypes.screenRecording] });
      sessionManagerSpy = jest.spyOn(sdk.sessionManager, 'removeAllowedSessionType').mockImplementation();
    });

    it('happy path - should call session manager', async () => {
      expect(sdk._config.allowedSessionTypes).toContain(SessionTypes.screenRecording);
      await sdk.removeAllowedSessionType(SessionTypes.screenRecording);
      expect(sessionManagerSpy).toHaveBeenCalled();
      expect(sdk._config.allowedSessionTypes).not.toContain(SessionTypes.screenRecording);
    });

    it('should not remove if it is not already allowed', async () => {
      sdk._config.allowedSessionTypes = [];
      await sdk.removeAllowedSessionType(SessionTypes.screenRecording);
      expect(sessionManagerSpy).not.toHaveBeenCalled();
    });
  });

  describe('setUseHeadsets', () => {
    it('should update config and call the proxy', () => {
      sdk = constructSdk();
      sdk._config.useHeadsets = true;
      const spy = jest.spyOn((sdk.headset as HeadsetProxyService), 'setUseHeadsets');

      sdk.setUseHeadsets(false);

      expect(sdk._config.useHeadsets).toBeFalsy();
      expect(spy).toHaveBeenCalled();
    });
  });
});
