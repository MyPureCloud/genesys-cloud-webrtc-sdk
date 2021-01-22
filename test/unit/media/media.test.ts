import browserama from 'browserama';

import { SdkMedia } from '../../../src/media/media';
import GenesysCloudWebrtcSdk from '../../../src/client';
import { getRandomIntInclusive, MockAudioContext, MockSession, MockStream, MockTrack, SimpleMockSdk, wait, MockAnalyser } from '../../test-utils';
import { SdkErrorTypes } from '../../../src/types/enums';
import { SdkError } from '../../../src/utils';
import { IMediaRequestOptions } from '../../../src/types/interfaces';
import { ISdkMediaState } from '../../../src';

declare var window: {
  navigator: {
    mediaDevices: {
      getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    } & MediaDevices;
  } & Navigator;
  webkitAudioContext: typeof AudioContext;
} & Window & typeof globalThis;

const mockVideoDevice1 = { kind: 'videoinput', deviceId: 'mockVideoDevice1', label: 'Mock Video Device #1' } as MediaDeviceInfo;
const mockVideoDevice2 = { kind: 'videoinput', deviceId: 'mockVideoDevice2', label: 'Mock Video Device #2' } as MediaDeviceInfo;
const mockAudioDevice1 = { kind: 'audioinput', deviceId: 'mockAudioDevice1', label: 'Mock Mic Device #1' } as MediaDeviceInfo;
const mockAudioDevice2 = { kind: 'audioinput', deviceId: 'mockAudioDevice2', label: 'Mock Mic Device #2' } as MediaDeviceInfo;
const mockOutputDevice1 = { kind: 'audiooutput', deviceId: 'mockOutputDevice1', label: 'Mock Speaker Device #1' } as MediaDeviceInfo;
const mockOutputDevice2 = { kind: 'audiooutput', deviceId: 'mockOutputDevice2', label: 'Mock Speaker Device #2' } as MediaDeviceInfo;

const mockedDevices = [
  mockVideoDevice1,
  mockVideoDevice2,
  mockAudioDevice1,
  mockAudioDevice2,
  mockOutputDevice1,
  mockOutputDevice2
];

let sdkMedia: SdkMedia;
let sdk: GenesysCloudWebrtcSdk;
let navigatorMediaDevicesMock: {
  getDisplayMedia: jest.SpyInstance;
  getUserMedia: jest.SpyInstance;
  enumerateDevices: jest.SpyInstance;
  addEventListener: jest.SpyInstance;
  removeEventListener: jest.SpyInstance;
};



describe('SdkMedia', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    sdk = new SimpleMockSdk() as any;

    /* SimpleMockSdk constructs an SdkMedia class and spies on the `initialize` function */
    sdkMedia = sdk.media as any;

    navigatorMediaDevicesMock = (window.navigator as any).mediaDevices = {
      getDisplayMedia: jest.fn().mockResolvedValue(new MockStream()),
      getUserMedia: jest.fn().mockResolvedValue(new MockStream()),
      enumerateDevices: jest.fn().mockResolvedValue([]),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
  });

  afterEach(() => {
    sdkMedia.destroy();
    jest.restoreAllMocks();
  });

  describe('constructor()', () => {
    it('should set default state and start initialization', () => {
      const initSpy = jest.spyOn(SdkMedia.prototype, 'initialize' as any).mockReturnValue(null);
      const media = new SdkMedia(sdk as any);

      expect(media['sdk']).toBe(sdk);
      expect(initSpy).toHaveBeenCalled();
      expect(media['state']).toEqual({
        devices: [],
        oldDevices: [],
        audioDevices: [],
        videoDevices: [],
        outputDevices: [],
        hasMic: false,
        hasCamera: false,
        hasMicPermissions: false,
        hasCameraPermissions: false,
        micPermissionsRequested: false,
        cameraPermissionsRequested: false,
        hasOutputDeviceSupport: false
      });

    });
  });

  describe('enumerateDevices()', () => {
    it('should enumerate devices and emit', async () => {
      const setDevicesSpy = jest.spyOn(sdkMedia, 'setDevices' as any);
      navigatorMediaDevicesMock.enumerateDevices.mockResolvedValue(mockedDevices);

      const enumeratedDevices = await sdkMedia.enumerateDevices();
      const state = sdkMedia.getState();

      expect(navigatorMediaDevicesMock.enumerateDevices).toHaveBeenCalled();
      expect(setDevicesSpy).toHaveBeenCalled();
      expect(enumeratedDevices).toEqual(mockedDevices);
      expect(state.devices).toEqual(mockedDevices);
    });

    it('should map new devices without labels with old devices with labels', async () => {
      /* set current ('old') devices */
      sdkMedia['setDevices'](mockedDevices);
      const setDevicesSpy = jest.spyOn(sdkMedia, 'setDevices' as any);

      /* enumerate the 'new' devices without labels */
      const newDevicesWithoutLabels = mockedDevices.map(d => ({ ...d, label: '' }));
      navigatorMediaDevicesMock.enumerateDevices.mockResolvedValue(newDevicesWithoutLabels);

      const enumeratedDevices = await sdkMedia.enumerateDevices();
      const state = sdkMedia.getState();

      expect(navigatorMediaDevicesMock.enumerateDevices).toHaveBeenCalled();
      expect(setDevicesSpy).toHaveBeenCalled();
      expect(enumeratedDevices).toEqual(mockedDevices);
      expect(state.devices).toEqual(mockedDevices);
    });

    it('should not emit devices again if the list has not changed', async () => {
      /* set current devices */
      sdkMedia['setDevices'](mockedDevices);
      const setDevicesSpy = jest.spyOn(sdkMedia, 'setDevices' as any);

      /* enumerate the same devices */
      navigatorMediaDevicesMock.enumerateDevices.mockResolvedValue(mockedDevices);

      const enumeratedDevices = await sdkMedia.enumerateDevices();
      const state = sdkMedia.getState();

      expect(navigatorMediaDevicesMock.enumerateDevices).toHaveBeenCalled();
      expect(setDevicesSpy).not.toHaveBeenCalled();
      expect(enumeratedDevices).toEqual(mockedDevices);
      expect(state.devices).toEqual(mockedDevices);
    });

    it('should emit devices again if the list has not changed but forceEmit is `true`', async () => {
      /* set current devices */
      sdkMedia['setDevices'](mockedDevices);
      const setDevicesSpy = jest.spyOn(sdkMedia, 'setDevices' as any);

      /* enumerate the same devices */
      navigatorMediaDevicesMock.enumerateDevices.mockResolvedValue(mockedDevices);

      const enumeratedDevices = await sdkMedia.enumerateDevices(true);
      const state = sdkMedia.getState();

      expect(navigatorMediaDevicesMock.enumerateDevices).toHaveBeenCalled();
      expect(setDevicesSpy).toHaveBeenCalled();
      expect(enumeratedDevices).toEqual(mockedDevices);
      expect(state.devices).toEqual(mockedDevices);
    });
  });

  describe('startDisplayMedia()', () => {
    it('should use getDisplayMedia if available', async () => {
      await sdkMedia.startDisplayMedia();

      expect(navigatorMediaDevicesMock.getDisplayMedia).toHaveBeenCalled();
      expect(navigatorMediaDevicesMock.getUserMedia).not.toHaveBeenCalled();
    });

    it('should use getUserMedia if no getUserMedia', async () => {
      delete navigatorMediaDevicesMock.getDisplayMedia;

      await sdkMedia.startDisplayMedia();

      expect(navigatorMediaDevicesMock.getUserMedia).toHaveBeenCalled();
    });

    it('should track media', async () => {
      const trackMediaSpy = jest.spyOn(sdkMedia, 'trackMedia' as any);

      const stream = await sdkMedia.startDisplayMedia();

      expect(trackMediaSpy).toHaveBeenCalledWith(stream);
    });

    it('should emit SdkError for failures', async () => {
      const error = new TypeError('Something is wrong with the type');
      const errorEmitted = new Promise(res => {
        sdk.once('sdkError', res);
      });

      navigatorMediaDevicesMock.getDisplayMedia.mockRejectedValue(error);

      try {
        await sdkMedia.startDisplayMedia();
        fail('it should have thrown');
      } catch (e) {
        const emittedError = await errorEmitted;
        expect(emittedError).toEqual(new SdkError(SdkErrorTypes.media, error.message));
      }
    });
  });

  describe('startMedia()', () => {
    let requestMediaPermissionsSpy: jest.SpyInstance;
    let startSingleMediaSpy: jest.SpyInstance;

    beforeEach(() => {
      requestMediaPermissionsSpy = jest.spyOn(sdkMedia, 'requestMediaPermissions')
        .mockResolvedValue(new MockStream() as any);
      startSingleMediaSpy = jest.spyOn(sdkMedia, 'startSingleMedia' as any)
        .mockResolvedValue(new MockStream() as any);
    });

    it('should use function defaults and log session information safely', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: false, cameraPermissionsRequested: false });
      const expectedLogDetails = {
        mediaReqOptions: { video: true, audio: true, session: undefined },
        retryOnFailure: true,
        conversationId: undefined,
        sessionId: undefined,
        micPermissionsRequested: false,
        cameraPermissionsRequested: false
      };

      /* with function defaults */
      await sdkMedia.startMedia();
      expect(sdk.logger.info).toHaveBeenCalledWith('calling sdk.media.startMedia()', expectedLogDetails);

      /* with session info */
      const session = new MockSession();
      await sdkMedia.startMedia({ audio: true, video: true, session: session as any });

      expect(sdk.logger.info).toHaveBeenCalledWith('calling sdk.media.startMedia()', {
        ...expectedLogDetails,
        sessionId: session.id,
        conversationId: session.conversationId
      });
    });

    it('should requestPermissions for `audio` & `video` if not already requested', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: false, cameraPermissionsRequested: false });
      const requestOptions: IMediaRequestOptions = { audio: true, video: true };

      /* setup our mocks */
      const mockAudioStream = new MockStream({ audio: true });
      const mockVideoStream = new MockStream({ video: true });
      requestMediaPermissionsSpy
        .mockResolvedValueOnce(mockAudioStream)
        .mockResolvedValueOnce(mockVideoStream);

      const stream = await sdkMedia.startMedia(requestOptions);

      expect(requestMediaPermissionsSpy).toHaveBeenNthCalledWith(1, 'audio', true, requestOptions);
      expect(requestMediaPermissionsSpy).toHaveBeenNthCalledWith(2, 'video', true, requestOptions);
      expect(startSingleMediaSpy).not.toHaveBeenCalled();
      expect(stream.getTracks()).toEqual([
        mockAudioStream.getTracks()[0],
        mockVideoStream.getTracks()[0]
      ]);
    });

    it('should startSingleMedia for `audio` & `video` if already requested permissions', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: null, video: null };

      /* setup our mocks */
      const mockAudioStream = new MockStream({ audio: true });
      const mockVideoStream = new MockStream({ video: true });
      startSingleMediaSpy
        .mockResolvedValueOnce(mockAudioStream)
        .mockResolvedValueOnce(mockVideoStream);

      const stream = await sdkMedia.startMedia(requestOptions);

      expect(startSingleMediaSpy).toHaveBeenNthCalledWith(1, 'audio', requestOptions, true);
      expect(startSingleMediaSpy).toHaveBeenNthCalledWith(2, 'video', requestOptions, true);
      expect(requestMediaPermissionsSpy).not.toHaveBeenCalled();
      expect(stream.getTracks()).toEqual([
        mockAudioStream.getTracks()[0],
        mockVideoStream.getTracks()[0]
      ]);
    });

    it('should only request audio and return the stream', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: true, video: false };

      /* setup our mocks */
      const mockAudioStream = new MockStream({ audio: true });
      startSingleMediaSpy.mockResolvedValueOnce(mockAudioStream);

      const stream = await sdkMedia.startMedia(requestOptions);

      expect(startSingleMediaSpy).toHaveBeenCalledTimes(1);
      expect(startSingleMediaSpy).toHaveBeenCalledWith('audio', requestOptions, true);
      expect(startSingleMediaSpy).not.toHaveBeenCalledWith('video', requestOptions, true);
      expect(requestMediaPermissionsSpy).not.toHaveBeenCalled();
      expect(stream.getTracks()).toEqual([mockAudioStream.getTracks()[0]]);
      expect(stream).toBe(mockAudioStream);
    });

    it('should only request video and return the stream', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: false, video: true };

      /* setup our mocks */
      const mockVideoStream = new MockStream({ video: true });
      startSingleMediaSpy.mockResolvedValueOnce(mockVideoStream);

      const stream = await sdkMedia.startMedia(requestOptions);

      expect(startSingleMediaSpy).toHaveBeenCalledTimes(1);
      expect(startSingleMediaSpy).toHaveBeenCalledWith('video', requestOptions, true);
      expect(startSingleMediaSpy).not.toHaveBeenCalledWith('audio', requestOptions, true);
      expect(requestMediaPermissionsSpy).not.toHaveBeenCalled();
      expect(stream.getTracks()).toEqual([mockVideoStream.getTracks()[0]]);
      expect(stream).toBe(mockVideoStream);
    });

    it('should throw an error before `video` is requested if `audio` failed and both media types were requested', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: null, video: null };
      const error = new Error('Permission Denied');

      /* setup our mocks */
      const mockVideoStream = new MockStream({ video: true });
      startSingleMediaSpy
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(mockVideoStream);

      try {
        await sdkMedia.startMedia(requestOptions);
        fail('should have thrown');
      } catch (e) {
        expect(startSingleMediaSpy).toHaveBeenCalledTimes(1);
        expect(e).toBe(error);
      }
    });

    it('should stop any existing `audio` tracks, if both media types were requested and only `video` failed', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: 'deviceId-audio', video: 'deviceId-video' };
      const error = new Error('Permission Denied');

      /* setup our mocks */
      const mockAudioStream = new MockStream({ audio: true });
      startSingleMediaSpy
        .mockResolvedValueOnce(mockAudioStream)
        .mockRejectedValueOnce(error);

      try {
        await sdkMedia.startMedia(requestOptions);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBe(error);
        expect(startSingleMediaSpy).toHaveBeenCalledTimes(2);
        expect(mockAudioStream.getTracks()[0].stop).toHaveBeenCalled();
      }
    });

    it('should not have to stop existing `audio` tracks, if only `video` was requested and failed', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: false, video: 'deviceId-video' };
      const error = new Error('Permission Denied');

      /* setup our mocks */
      startSingleMediaSpy
        .mockRejectedValueOnce(error);

      try {
        await sdkMedia.startMedia(requestOptions);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBe(error);
        expect(startSingleMediaSpy).toHaveBeenCalledTimes(1);
      }
    });

    it('should call through to `startSingleMedia` to force throw a gUM error if no constraints were passed in', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { /* no constraints */ };
      const error = new TypeError("Failed to execute 'getUserMedia' on 'MediaDevices': At least one of audio and video must be requested");

      /* setup our mocks */
      startSingleMediaSpy.mockRejectedValue(error);

      try {
        await sdkMedia.startMedia(requestOptions);
        fail('should have thrown');
      } catch (e) {
        expect(startSingleMediaSpy).toHaveBeenCalledWith('none', {}, false);
        expect(e).toBe(error);
      }
    });
  });

  describe('requestMediaPermissions()', () => {
    let enumerateDevicesSpy: jest.SpyInstance;
    let startMediaSpy: jest.SpyInstance;

    beforeEach(() => {
      enumerateDevicesSpy = jest.spyOn(sdkMedia, 'enumerateDevices').mockResolvedValue(null);
      startMediaSpy = jest.spyOn(sdkMedia, 'startMedia').mockResolvedValue(new MockStream() as any);
    });

    it('should set params correctly', async () => {
      const requestOptions: IMediaRequestOptions = {};
      const expectedLogDetails = {
        mediaType: 'audio',
        preserveMedia: false,
        requestOptions: { audio: true, video: false, session: undefined },
        sessionId: undefined,
        conversationId: undefined,
      };

      /* with no preserveMedia flag or session */
      await sdkMedia.requestMediaPermissions('audio');
      expect(sdk.logger.info).toHaveBeenCalledWith('requesting media to gain permissions', expectedLogDetails);

      /* with no session */
      const session = new MockSession();
      requestOptions.session = session as any;
      expectedLogDetails.sessionId = session.id;
      expectedLogDetails.conversationId = session.conversationId;

      await sdkMedia.requestMediaPermissions('audio', false, requestOptions);
      expect(sdk.logger.info).toHaveBeenCalledWith('requesting media to gain permissions', expectedLogDetails);
    });

    it('should enumerateDevices() before requesting permissions and after permissions have been gained', async () => {
      await sdkMedia.requestMediaPermissions('audio');

      expect(enumerateDevicesSpy).toHaveBeenCalledTimes(2);
      expect(startMediaSpy).toHaveBeenCalledTimes(1);
    });

    it('should always request the desired media type and never with the opposite media type', async () => {
      /* AUDIO */
      /* if `false` */
      const reqOptions: IMediaRequestOptions = { audio: false, video: true };

      await sdkMedia.requestMediaPermissions('audio', false, reqOptions);

      expect(startMediaSpy).toHaveBeenCalledWith({ audio: true, video: false });

      /* if `undefined` */
      reqOptions.audio = undefined;

      await sdkMedia.requestMediaPermissions('audio', false, reqOptions);

      expect(startMediaSpy).toHaveBeenCalledWith({ audio: true, video: false });

      /* if with deviceId */
      reqOptions.audio = 'deviceId';

      await sdkMedia.requestMediaPermissions('audio', false, reqOptions);

      expect(startMediaSpy).toHaveBeenCalledWith({ audio: reqOptions.audio, video: false });
    });

    it('should setPermissions to requested before starting media and to true after media gained', async () => {
      const getPermissionsStateFn = () => {
        const state = sdkMedia.getState();
        return {
          micPermissionsRequested: state.micPermissionsRequested,
          hasMicPermissions: state.hasMicPermissions,
          cameraPermissionsRequested: state.cameraPermissionsRequested,
          hasCameraPermissions: state.hasCameraPermissions
        };
      }

      let promise: Promise<any>;
      startMediaSpy.mockImplementation(() => new Promise(res => setTimeout(() => res(new MockStream()), 10)));

      /* expect initial state */
      expect(getPermissionsStateFn()).toEqual({
        micPermissionsRequested: false,
        cameraPermissionsRequested: false,
        hasMicPermissions: false,
        hasCameraPermissions: false
      });

      /* AUDIO */
      promise = sdkMedia.requestMediaPermissions('audio');
      expect(getPermissionsStateFn()).toEqual({
        micPermissionsRequested: true, // set "requested"
        hasMicPermissions: false,
        cameraPermissionsRequested: false,
        hasCameraPermissions: false
      });
      await promise;
      expect(getPermissionsStateFn()).toEqual({
        micPermissionsRequested: true,
        hasMicPermissions: true, // now we have permissions
        cameraPermissionsRequested: false,
        hasCameraPermissions: false
      });

      /* VIDEO */
      promise = sdkMedia.requestMediaPermissions('video');
      expect(getPermissionsStateFn()).toEqual({
        micPermissionsRequested: true,
        hasMicPermissions: true,
        cameraPermissionsRequested: true, // set "requested"
        hasCameraPermissions: false
      });
      await promise;
      expect(getPermissionsStateFn()).toEqual({
        micPermissionsRequested: true,
        hasMicPermissions: true,
        cameraPermissionsRequested: true,
        hasCameraPermissions: true // now we have permissions
      });
    });

    it('should return the media if `preserveMedia` was `true`', async () => {
      const mockStream = new MockStream({ audio: true });

      startMediaSpy.mockResolvedValue(mockStream);

      const stream = await sdkMedia.requestMediaPermissions('audio', true);

      expect(stream).toBe(mockStream);
    });

    it('should destroy the media if `preserveMedia` was `false`', async () => {
      const mockStream = new MockStream({ audio: true });

      startMediaSpy.mockResolvedValue(mockStream);

      const noStream = await sdkMedia.requestMediaPermissions('audio', false);

      expect(noStream).toBe(undefined);
      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    });
  });

  describe('getValidDeviceId()', () => {
    beforeEach(() => {
      sdkMedia['setDevices'](mockedDevices);
    });

    it('should return the found deviceId for specific kinds', () => {
      /* audio device */
      let result = sdkMedia.getValidDeviceId('audioinput', mockAudioDevice1.deviceId);
      expect(result).toBe(mockAudioDevice1.deviceId);

      /* video device */
      result = sdkMedia.getValidDeviceId('videoinput', mockVideoDevice1.deviceId);
      expect(result).toBe(mockVideoDevice1.deviceId);

      /* output device */
      result = sdkMedia.getValidDeviceId('audiooutput', mockOutputDevice1.deviceId);
      expect(result).toBe(mockOutputDevice1.deviceId);
    });

    it('should use the sdk default deviceId if the request deviceId cannot be found', () => {
      sdk._config.defaults.audioDeviceId = mockAudioDevice1.deviceId;
      sdk._config.defaults.videoDeviceId = mockVideoDevice1.deviceId;
      sdk._config.defaults.outputDeviceId = mockOutputDevice1.deviceId;

      /* audio device */
      let result = sdkMedia.getValidDeviceId('audioinput', 'non-existent-device-id');
      expect(result).toBe(mockAudioDevice1.deviceId);
      expect(sdk.logger.warn).toHaveBeenCalledWith('Unable to find requested deviceId', {
        kind: 'audioinput',
        deviceId: 'non-existent-device-id',
        sessionInfos: []
      });

      /* video device */
      result = sdkMedia.getValidDeviceId('videoinput', 'non-existent-device-id');
      expect(result).toBe(mockVideoDevice1.deviceId);

      /* output device */
      result = sdkMedia.getValidDeviceId('audiooutput', 'non-existent-device-id');
      expect(result).toBe(mockOutputDevice1.deviceId);
    });

    it('should use the sdk default device if `true` was passed in', () => {
      sdk._config.defaults.audioDeviceId = mockAudioDevice1.deviceId;

      expect(sdkMedia.getValidDeviceId('audioinput', true)).toBe(mockAudioDevice1.deviceId);
    });

    it('should return `undefined` if `true` passed in but there is no sdk default', () => {
      sdk._config.defaults.audioDeviceId = 'this-device-does-not-exist';

      expect(sdkMedia.getValidDeviceId('audioinput', true)).toBe(undefined);
      expect(sdk.logger.warn).toHaveBeenCalledWith('Unable to find the sdk default deviceId', {
        kind: 'audioinput',
        deviceId: sdk._config.defaults.audioDeviceId,
        sessionInfos: []
      });
    });

    it('should return `undefined` if `true` passed in but there is no sdk default', () => {
      expect(sdkMedia.getValidDeviceId('audioinput', true)).toBe(undefined);
    });

    it('should return `undefined` if `falsey` was passed in', () => {
      expect(sdkMedia.getValidDeviceId('audioinput', false)).toBe(undefined);
      expect(sdkMedia.getValidDeviceId('audioinput', undefined)).toBe(undefined);
      expect(sdkMedia.getValidDeviceId('audioinput', null)).toBe(undefined);
    });

    it('should return `undefined` if no deviceId can be found', () => {
      sdk._config.defaults.audioDeviceId = null;
      sdk._config.defaults.videoDeviceId = null;
      sdk._config.defaults.outputDeviceId = null;

      /* audio device */
      let result = sdkMedia.getValidDeviceId('audioinput', 'non-existent-device-id');
      expect(result).toBe(undefined);

      /* video device */
      result = sdkMedia.getValidDeviceId('videoinput', 'non-existent-device-id');
      expect(result).toBe(undefined);

      /* output device */
      result = sdkMedia.getValidDeviceId('audiooutput', 'non-existent-device-id');
      expect(result).toBe(undefined);
    });

    it('should log session info', () => {
      const mockSession = new MockSession();
      const sessions = [
        mockSession,
        undefined,
      ];

      sdkMedia.getValidDeviceId('audioinput', 'non-existent-device-id', ...sessions as any);

      expect(sdk.logger.info).toHaveBeenCalledWith('Unable to find a valid deviceId', {
        kind: 'audioinput',
        requestedDeviceId: 'non-existent-device-id',
        sdkConfigDefaultDeviceId: undefined,
        sessionInfos: [{ sessionId: mockSession.id, conversationId: mockSession.conversationId }]
      });
    });
  });

  describe('getDevices()', () => {
    it('should return the list of devices', () => {
      sdkMedia['setDevices'](mockedDevices);
      expect(sdkMedia.getDevices()).toEqual(mockedDevices);
    });
  });

  describe('getAudioDevices()', () => {
    it('should return the list of devices', () => {
      sdkMedia['setDevices'](mockedDevices);

      expect(sdkMedia.getAudioDevices()).toEqual(
        mockedDevices.filter(d => d.kind === 'audioinput')
      );
    });
  });

  describe('getVideoDevices()', () => {
    it('should return the list of devices', () => {
      sdkMedia['setDevices'](mockedDevices);

      expect(sdkMedia.getVideoDevices()).toEqual(
        mockedDevices.filter(d => d.kind === 'videoinput')
      );
    });
  });

  describe('getOutputDevices()', () => {
    it('should return the list of devices', () => {
      sdkMedia['setDevices'](mockedDevices);

      expect(sdkMedia.getOutputDevices()).toEqual(
        mockedDevices.filter(d => d.kind === 'audiooutput')
      );
    });
  });

  describe('getAllActiveMediaTracks()', () => {
    it('should return all tracks that have been created by the sdk and are still active', () => {
      const mockTrack = new MockTrack('audio');
      sdkMedia['allMediaTracksCreated'].set(mockTrack.id, mockTrack as any);

      expect(sdkMedia.getAllActiveMediaTracks()).toEqual([mockTrack]);
    });
  });

  describe('findCachedDeviceByTrackLabel()', () => {
    beforeEach(() => {
      sdkMedia['setDevices'](mockedDevices);
    });

    it('should return `undefined` if there is no track', () => {
      expect(sdkMedia.findCachedDeviceByTrackLabel()).toBe(undefined);
    });

    it('should find the available video & audio device depending on the track kind', async () => {
      const videoTrack = new MockTrack('video', mockVideoDevice1.label);
      const audioTrack = new MockTrack('audio', mockAudioDevice1.label);

      expect(sdkMedia.findCachedDeviceByTrackLabel(videoTrack as any as MediaStreamTrack)).toEqual(mockVideoDevice1);
      expect(sdkMedia.findCachedDeviceByTrackLabel(audioTrack as any as MediaStreamTrack)).toEqual(mockAudioDevice1);
    });

    it('should return `unefined` if it cannot find the track by label in available devices', async () => {
      const videoTrack = new MockTrack('video', 'A video device that does not exist');
      const audioTrack = new MockTrack('audio', 'An audio device that does not exist');

      expect(sdkMedia.findCachedDeviceByTrackLabel(videoTrack as any as MediaStreamTrack)).toBe(undefined);
      expect(sdkMedia.findCachedDeviceByTrackLabel(audioTrack as any as MediaStreamTrack)).toBe(undefined);
    });
  });

  describe('doesDeviceExistInCache()', () => {
    beforeEach(() => {
      sdkMedia['setDevices'](mockedDevices);
    });

    it('should return `false` if device is not passed in', () => {
      expect(sdkMedia.doesDeviceExistInCache()).toBe(false);
    });

    it('should return `false` if device is not found', () => {
      const randomDevice = { kind: 'videoinput', label: 'CamCorder', deviceId: 'hash', groupId: '2nd hash' } as MediaDeviceInfo;
      expect(sdkMedia.doesDeviceExistInCache(randomDevice)).toBe(false);
    });

    it('should return `true` if a device is found in the cache', () => {
      expect(sdkMedia.doesDeviceExistInCache(mockOutputDevice1)).toBe(true);
    });
  });

  describe('findCachedOutputDeviceById()', () => {
    beforeEach(() => {
      sdkMedia['setDevices'](mockedDevices);
    });

    it('should return `undefined` if there is id passed in', () => {
      expect(sdkMedia.findCachedOutputDeviceById()).toBe(undefined);
    });

    it('should return the found output device', async () => {
      const deviceIdToFind = mockOutputDevice1.deviceId;

      expect(sdkMedia.findCachedOutputDeviceById(deviceIdToFind)).toEqual(mockOutputDevice1);
    });

    it('should return `undefined` if the output device cannot be found', async () => {
      const deviceIdToFind = 'output123';

      expect(sdkMedia.findCachedOutputDeviceById(deviceIdToFind)).toBe(undefined);
    });
  });

  describe('destroy()', () => {
    it('should clean up the sdk media', () => {
      jest.spyOn(sdkMedia, 'removeAllListeners');
      const mockTrack = new MockTrack('audio');
      sdkMedia['allMediaTracksCreated'].set(mockTrack.id, mockTrack as any);

      sdkMedia.destroy();

      expect(sdkMedia.removeAllListeners).toHaveBeenCalled();
      expect(navigatorMediaDevicesMock.removeEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
      expect(mockTrack.stop).toHaveBeenCalled();
    });
  });

  describe('initialize()', () => {
    it('should enumerateDevices and add device listener', () => {
      (sdkMedia['initialize'] as any as jest.SpyInstance).mockRestore();
      const enumerateDevicesSpy = jest.spyOn(sdkMedia, 'enumerateDevices').mockResolvedValue([]);

      sdkMedia['initialize']();

      expect(enumerateDevicesSpy).toHaveBeenCalled();
      expect(navigatorMediaDevicesMock.addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
    });
  });

  describe('setDevices()', () => {
    it('should set devices on media state and call to emit new state', () => {
      const setStateAndEmitSpy = jest.spyOn(sdkMedia, 'setStateAndEmit' as any);
      sdkMedia['setDevices'](mockedDevices);

      const outputDevices = mockedDevices.filter(d => d.kind === 'audiooutput');
      const audioDevices = mockedDevices.filter(d => d.kind === 'audioinput');
      const videoDevices = mockedDevices.filter(d => d.kind === 'videoinput');

      expect(setStateAndEmitSpy).toHaveBeenCalledWith({
        devices: mockedDevices,
        oldDevices: [],
        outputDevices,
        audioDevices,
        videoDevices,
        hasCamera: true,
        hasMic: true,
      }, 'devices');
    });
  });

  describe('setPermissions()', () => {
    it('should call through to set and emit state', () => {
      const setStateAndEmitSpy = jest.spyOn(sdkMedia, 'setStateAndEmit' as any);
      const newPermissions: Partial<ISdkMediaState> = { hasCameraPermissions: true };

      sdkMedia['setPermissions'](newPermissions);

      expect(setStateAndEmitSpy).toHaveBeenCalledWith(newPermissions, 'permissions');
    });
  });

  describe('setStateAndEmit()', () => {
    it('should merge the old and new states and emit on `state` and `{eventType}`', async () => {
      const originalState = {
        devices: [],
        oldDevices: [],
        audioDevices: [],
        videoDevices: [],
        outputDevices: [],
        hasMic: false,
        hasCamera: false,
        hasMicPermissions: false,
        hasCameraPermissions: false,
        micPermissionsRequested: false,
        cameraPermissionsRequested: false,
        hasOutputDeviceSupport: false
      };
      const updatesToState = {
        hasMicPermissions: true,
        hasCameraPermissions: true,
      };
      const eventType = 'permissions';

      const emitSpy = jest.spyOn(sdkMedia, 'emit');
      const statePromise = new Promise(res => sdkMedia.once('state', res));
      const permissionsPromise = new Promise(res => sdkMedia.once(eventType, res));

      sdkMedia['setStateAndEmit'](updatesToState, eventType);
      expect(sdkMedia.getState()).toEqual({ ...originalState, ...updatesToState });
      expect(emitSpy).toHaveBeenCalledWith('state', { ...originalState, ...updatesToState, eventType });
      expect(emitSpy).toHaveBeenCalledWith(eventType, { ...originalState, ...updatesToState, eventType });

      await Promise.all([statePromise, permissionsPromise]);
    });
  });

  describe('monitorMicVolume()', () => {
    let monitorMicVolumeFn: typeof SdkMedia.prototype['monitorMicVolume'];
    beforeEach(() => {
      monitorMicVolumeFn = sdkMedia['monitorMicVolume'].bind(sdkMedia);
      jest.useFakeTimers();

      Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, writable: true });
      Object.defineProperty(window, 'webkitAudioContext', { value: MockAudioContext, writable: true });
    });

    afterEach(() => {
      jest.clearAllTimers();
    });

    it('should not process non audio tracks or tracks that have already been processed', () => {
      const mockStream = new MockStream({ audio: true, video: true }) as any as MediaStream
      const mockAudioTrack = mockStream.getAudioTracks()[0] as any as MediaStreamTrack;
      const mockVideoTrack = mockStream.getVideoTracks()[0] as any as MediaStreamTrack;

      const emitSpy = jest.spyOn(sdkMedia, 'emit');

      /* 'video' track should be ignored */
      monitorMicVolumeFn(mockStream, mockVideoTrack);
      jest.advanceTimersByTime(110);

      expect(emitSpy).not.toHaveBeenCalled();

      /* already tracked audio tracks should be ignored */
      sdkMedia['audioTracksBeingMonitored'][mockAudioTrack.id] = 123123;
      monitorMicVolumeFn(mockStream, mockAudioTrack);
      jest.advanceTimersByTime(110);

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should track which media tracks are being monitored', () => {
      const mockStream = new MockStream({ audio: true }) as any as MediaStream
      const mockAudioTrack = mockStream.getAudioTracks()[0] as any as MediaStreamTrack;

      monitorMicVolumeFn(mockStream, mockAudioTrack);
      jest.advanceTimersByTime(110);

      expect(sdkMedia['audioTracksBeingMonitored'][mockAudioTrack.id]).toBeTruthy();
    });

    it('should use the webkitAudioContext if AudioContext does not exist', () => {
      let mockStream = new MockStream({ audio: true, video: true }) as any as MediaStream
      let mockAudioTrack = mockStream.getAudioTracks()[0] as any as MediaStreamTrack;

      /* no AudioContext */
      Object.defineProperty(window, 'AudioContext', { value: undefined });

      monitorMicVolumeFn(mockStream, mockAudioTrack);
      jest.advanceTimersByTime(110);
      mockAudioTrack.stop();

      expect('it would have thrown an error if webkitAudioContext did not exist').toBeTruthy();

      /* no webkitAudioContext */
      Object.defineProperty(window, 'webkitAudioContext', { value: undefined });

      mockStream = new MockStream({ audio: true, video: true }) as any as MediaStream
      mockAudioTrack = mockStream.getAudioTracks()[0] as any as MediaStreamTrack;

      try {
        monitorMicVolumeFn(mockStream, mockAudioTrack);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeTruthy();
      }
    });

    it('should emit the average volume every 100 with the correct muted state', () => {
      /* variables to ensure emitted values are correct */
      let lastAvg: number;
      let callbackCount = 0;

      /* setup spies */
      const emitSpy = jest.spyOn(sdkMedia, 'emit');
      const getByteFrequencyDataSpy = jest.spyOn(MockAnalyser.prototype, 'getByteFrequencyData')
        .mockImplementation((volumes: Uint8Array) => {
          /* mock some volume changes */
          for (let i = 0; i < volumes.length; i++) {
            volumes[i] = getRandomIntInclusive(0, 70);
          }
          /* to ensure our avg calc is correct */
          const volumeSum = volumes.reduce((total, current) => total + current, 0);
          lastAvg = volumeSum / volumes.length;
        });

      /* testing variables */
      const sessionId = '123456789';
      const mockStream = new MockStream({ audio: true });
      const mockAudioTrack = mockStream.getAudioTracks()[0];

      monitorMicVolumeFn(mockStream as any as MediaStream, mockAudioTrack as any as MediaStreamTrack, sessionId);
      expect(sdkMedia['audioTracksBeingMonitored'][mockAudioTrack.id]).toBeTruthy();

      /* 1st emit */
      // jest.advanceTimersByTime(100);
      jest.advanceTimersToNextTimer();

      expect(getByteFrequencyDataSpy).toHaveBeenCalledTimes(++callbackCount);
      expect(emitSpy).toHaveBeenNthCalledWith(callbackCount, 'audioTrackVolume', {
        track: mockAudioTrack,
        volume: lastAvg,
        sessionId,
        muted: false
      });

      /* 2nd emit, (track enabled but muted) */
      mockAudioTrack.muted = true;
      jest.advanceTimersToNextTimer();
      // jest.advanceTimersByTime(101);

      expect(getByteFrequencyDataSpy).toHaveBeenCalledTimes(++callbackCount);
      expect(emitSpy).toHaveBeenNthCalledWith(callbackCount, 'audioTrackVolume', {
        track: mockAudioTrack,
        volume: lastAvg,
        sessionId,
        muted: true
      });

      /* 3rd emit, (track disable but not muted) */
      mockAudioTrack.muted = false;
      mockAudioTrack.enabled = false;

      jest.advanceTimersByTime(101);
      // jest.advanceTimersToNextTimer();

      expect(getByteFrequencyDataSpy).toHaveBeenCalledTimes(++callbackCount);
      expect(emitSpy).toHaveBeenNthCalledWith(callbackCount, 'audioTrackVolume', {
        track: mockAudioTrack,
        volume: lastAvg,
        sessionId,
        muted: true
      });
    });
  });

  describe('clearAudioInputMonitor()', () => {
    let clearIntervalSpy: jest.SpyInstance;
    beforeEach(() => {
      clearIntervalSpy = jest.spyOn(window, 'clearInterval');
    });

    it('should do nothing if trackId is not being monitored', () => {
      sdkMedia['clearAudioInputMonitor'](undefined);
      expect(clearIntervalSpy).not.toHaveBeenCalled();

      sdkMedia['clearAudioInputMonitor']('some-track-id');
      expect(clearIntervalSpy).not.toHaveBeenCalled();
    });

    it('should clearInterval and remove trackId', () => {
      const trackId = 'some-track-id';
      const intId = sdkMedia['audioTracksBeingMonitored'][trackId] = setInterval(() => { }, 1000000);

      sdkMedia['clearAudioInputMonitor'](trackId);
      expect(clearIntervalSpy).toHaveBeenCalledWith(intId);
    });
  });

  describe('hasGetDisplayMedia()', () => {
    it('should return `true` if browser does support getDisplayMedia', () => {
      expect(sdkMedia['hasGetDisplayMedia']()).toBe(true);
    });

    it('should return `false` if browser does not support getDisplayMedia', () => {
      const originalNavigator = window.navigator;
      const originalMediaDevices = window.navigator.mediaDevices;

      Object.defineProperty(window.navigator.mediaDevices, 'getDisplayMedia', { value: undefined, writable: true });
      expect(sdkMedia['hasGetDisplayMedia']()).toBe(false);

      Object.defineProperty(window.navigator, 'mediaDevices', { value: undefined, writable: true });
      expect(sdkMedia['hasGetDisplayMedia']()).toBe(false);

      Object.defineProperty(window, 'navigator', { value: undefined, writable: true });
      expect(sdkMedia['hasGetDisplayMedia']()).toBe(false);

      /* restore props */
      Object.defineProperty(window, 'navigator', { value: originalNavigator });
      Object.defineProperty(window.navigator, 'mediaDevices', { value: originalMediaDevices });
    });
  });

  describe('hasOutputDeviceSupport()', () => {
    it('should return `true` if browser does support output devices', () => {
      jest.spyOn(window.HTMLMediaElement.prototype, 'hasOwnProperty' as any).mockReturnValue(true);
      expect(sdkMedia['hasOutputDeviceSupport']()).toBe(true);
    });

    it('should return `false` if browser does not support output devices', () => {
      jest.spyOn(window.HTMLMediaElement.prototype, 'hasOwnProperty' as any).mockReturnValue(false);
      expect(sdkMedia['hasOutputDeviceSupport']()).toBe(false);
    });
  });

  describe('getStandardConstraints()', () => {
    let getStandardConstraintsFn: typeof SdkMedia.prototype['getStandardConstraints'];
    beforeEach(() => {
      getStandardConstraintsFn = sdkMedia['getStandardConstraints'].bind(sdkMedia);
    });

    it('should return audio/video constraints for chrome/chromium', () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });
      const options: IMediaRequestOptions = { audio: true, video: true };

      expect(getStandardConstraintsFn(options)).toEqual({
        video: {
          googNoiseReduction: true,
          frameRate: { ideal: 30 }
        },
        audio: {
          googAudioMirroring: false,
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          googDucking: false,
          googHighpassFilter: true
        }
      });
    });

    it('should return audio constraints for non chrome/chromium', () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });
      const options: IMediaRequestOptions = { audio: true, video: true };

      expect(getStandardConstraintsFn(options)).toEqual({
        video: {
          frameRate: { ideal: 30 }
        },
        audio: {}
      });
    });

    it('should return video `frameRate` and `resolution` constraints', () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });
      const options: IMediaRequestOptions = {
        video: true,
        videoFrameRate: { ideal: 45 },
        videoResolution: {
          width: 1920,
          height: 1080
        }
      };

      expect(getStandardConstraintsFn(options)).toEqual({
        video: {
          frameRate: { ideal: 45 },
          height: 1080,
          width: 1920
        },
        audio: false
      });
    });

    it('should use default sdk videoResolution', () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });
      sdk._config.defaults.videoResolution = {
        width: 900,
        height: 900
      };
      const options: IMediaRequestOptions = {
        video: true,
      };

      expect(getStandardConstraintsFn(options)).toEqual({
        video: {
          frameRate: { ideal: 30 },
          height: 900,
          width: 900
        },
        audio: false
      });
    });

    it('should be able to override video `frameRate` and `resolution` to nothing', () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });
      sdk._config.defaults.videoResolution = {
        width: 900,
        height: 900
      };
      const options: IMediaRequestOptions = {
        video: true,
        videoFrameRate: false,
        videoResolution: false
      };

      expect(getStandardConstraintsFn(options)).toEqual({
        video: {},
        audio: false
      });
    });

    it('should return video/audio deviceId constraint if deviceId was passed in', () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });
      const options: IMediaRequestOptions = {
        video: 'video-device-id',
        audio: 'audio-device-id',
      };

      expect(getStandardConstraintsFn(options)).toEqual({
        video: {
          deviceId: { exact: options.video },
          frameRate: { ideal: 30 }
        },
        audio: {
          deviceId: { exact: options.audio }
        }
      });
    });

    it('should return video/audio deviceId constraint with sdk default', () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });
      sdk._config.defaults.videoDeviceId = 'video-device-id';
      sdk._config.defaults.audioDeviceId = 'audio-device-id';

      const options: IMediaRequestOptions = {
        video: true,
        audio: true,
      };

      expect(getStandardConstraintsFn(options)).toEqual({
        video: {
          deviceId: { exact: 'video-device-id' },
          frameRate: { ideal: 30 }
        },
        audio: {
          deviceId: { exact: 'audio-device-id' }
        }
      });
    });

    it('should return video/audio system default if `null` was passed in even if sdk has defaults', () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });
      sdk._config.defaults.videoDeviceId = 'video-device-id';
      sdk._config.defaults.audioDeviceId = 'audio-device-id';

      const options: IMediaRequestOptions = {
        video: null,
        audio: null,
      };

      expect(getStandardConstraintsFn(options)).toEqual({
        video: {
          frameRate: { ideal: 30 }
        },
        audio: {}
      });
    });
  });

  describe('getScreenShareConstraints', () => {
    it('should be simple if hasDisplayMedia', async () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });

      await sdkMedia.startDisplayMedia();
      const constraints = (navigatorMediaDevicesMock.getDisplayMedia as jest.Mock).mock.calls[0][0];

      expect(constraints).toEqual({
        audio: false,
        video: {
          frameRate: { ideal: 30 },
          height: { max: 10000 },
          width: { max: 10000 }
        }
      });
    });

    it('chrome getUserMedia constraints', async () => {
      delete navigatorMediaDevicesMock.getDisplayMedia;
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });

      await sdkMedia.startDisplayMedia();
      const constraints = (navigatorMediaDevicesMock.getUserMedia as jest.Mock).mock.calls[0][0];

      expect(constraints).toEqual({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            maxWidth: 10000,
            maxHeight: 10000,
            maxFrameRate: 15
          }
        }
      });
    });

    it('non chrome constraints', async () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });

      await sdkMedia.startDisplayMedia();
      const constraints = (navigatorMediaDevicesMock.getDisplayMedia as jest.Mock).mock.calls[0][0];

      expect(constraints).toEqual({
        audio: false,
        video: {
          mediaSource: 'window'
        }
      });
    });
  });

  describe('mapOldToNewDevices()', () => {
    it('should return the new devices if they have labels and old devices do not', () => {
      const oldDevices = mockedDevices.map(d => ({ ...d, label: '' }));
      const newDevices = mockedDevices.slice();

      expect(sdkMedia['mapOldToNewDevices'](oldDevices, newDevices)).toEqual(newDevices);
    });

    it('should map old devices with labels to new devices without labels', () => {
      const oldDevices = mockedDevices.slice();
      const newDevices = mockedDevices.map(d => ({ ...d, label: '' }));

      expect(sdkMedia['mapOldToNewDevices'](oldDevices, newDevices)).toEqual(oldDevices);
    });
  });

  describe('doDeviceListsMatch()', () => {
    it('should return `false` for uneven array lengths', () => {
      expect(sdkMedia['doDeviceListsMatch']([], [mockAudioDevice1])).toBe(false);
    });

    it('should return `false` for a device existing in one list and not the other', () => {
      expect(sdkMedia['doDeviceListsMatch'](
        [mockAudioDevice1, mockAudioDevice2],
        [mockAudioDevice1])
      ).toBe(false);
    });

    it('should return `true` if both lists contain the same devices', () => {
      expect(sdkMedia['doDeviceListsMatch'](
        [mockAudioDevice1, mockAudioDevice2],
        [mockAudioDevice2, mockAudioDevice1])
      ).toBe(true);
    });
  });

  describe('compareDevices()', () => {
    it('should return `false` if any device field does not match', () => {
      expect(sdkMedia['compareDevices'](
        mockAudioDevice1,
        { ...mockAudioDevice1, deviceId: 'different' }
      )).toBe(false);

      expect(sdkMedia['compareDevices'](
        mockAudioDevice1,
        { ...mockAudioDevice1, groupId: 'different' }
      )).toBe(false);

      expect(sdkMedia['compareDevices'](
        mockAudioDevice1,
        { ...mockAudioDevice1, kind: 'videoinput' }
      )).toBe(false);

      expect(sdkMedia['compareDevices'](
        mockAudioDevice1,
        { ...mockAudioDevice1, label: 'different' }
      )).toBe(false);
    });

    it('should return `true` if all device fields match', () => {
      expect(sdkMedia['compareDevices'](
        mockAudioDevice1,
        mockAudioDevice1
      )).toBe(true);
    });
  });

  describe('handleDeviceChange()', () => {
    it('should enumerateDevices again and call sessionManager to validate outgoing media', async () => {
      const enumerateDevicesSpy = jest.spyOn(sdkMedia, 'enumerateDevices').mockResolvedValue([]);

      await sdkMedia['handleDeviceChange']();

      expect(enumerateDevicesSpy).toHaveBeenCalled();
      expect(sdk.sessionManager.validateOutgoingMediaTracks).toHaveBeenCalled();
      expect(sdk.logger.debug).toHaveBeenCalled();
    });
  });

  describe('startSingleMedia()', () => {
    let startSingleMediaFn: typeof SdkMedia.prototype['startSingleMedia'];
    let getUserMediaSpy: jest.SpyInstance;

    const createError = (name: string, message: string) => {
      const error = new Error(message);
      error.name = name;
      return error;
    };

    beforeEach(() => {
      startSingleMediaFn = sdkMedia['startSingleMedia'].bind(sdkMedia);
      getUserMediaSpy = jest.spyOn(window.navigator.mediaDevices, 'getUserMedia')
        .mockResolvedValue(new MockStream() as any as MediaStream);
    });

    it('should throw an error from gUM is "none" was passed in as the media type', async () => {
      const error = createError('TypeError', "Failed to execute 'getUserMedia' on 'MediaDevices': At least one of audio and video must be requested");
      getUserMediaSpy.mockRejectedValue(error);

      try {
        await startSingleMediaFn('none', { audio: true, video: true }, false);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBe(error);
      }
    });

    it('should track media stream returned and log appropriate messages', async () => {
      const mockStream = new MockStream({ audio: true });
      const requestOptions: IMediaRequestOptions = { audio: true, monitorMicVolume: false, session: { id: 'sessId', conversationId: 'convoId' } as any };
      const trackMediaSpy = jest.spyOn(sdkMedia, 'trackMedia' as any);

      const expectedLogExtras = {
        mediaRequestOptions: { ...requestOptions, session: undefined },
        retryOnFailure: true,
        mediaType: 'audio',
        constraints: { video: false, audio: {} },
        sessionId: requestOptions.session.id,
        conversationId: requestOptions.session.conversationId,
        sdkDefaultDeviceId: undefined,
        availableDevices: [],
        permissions: {
          micPermissionsRequested: false,
          cameraPermissionsRequested: false,
          hasMicPermissions: false,
          hasCameraPermissions: false,
        }
      };

      getUserMediaSpy.mockResolvedValue(mockStream);

      await startSingleMediaFn('audio', requestOptions);

      expect(sdk.logger.info).toHaveBeenCalledWith('requesting getUserMedia', expectedLogExtras);
      expect(sdk.logger.info).toHaveBeenCalledWith('returning media from getUserMedia', {
        ...expectedLogExtras,
        mediaTracks: mockStream.getTracks()
      });
      expect(trackMediaSpy).toHaveBeenCalledWith(mockStream, requestOptions.monitorMicVolume, requestOptions.session.id);
    });

    it('should request `audio` and set `video` to false', async () => {
      await startSingleMediaFn('audio', { audio: true, video: true });

      expect(getUserMediaSpy).toHaveBeenCalledWith({ video: false, audio: {} });
    });

    it('should request `video` and set `audio` to false', async () => {
      await startSingleMediaFn('video', { audio: true, video: true });

      expect(getUserMediaSpy).toHaveBeenCalledWith({ audio: false, video: { frameRate: { ideal: 30 } } });
    });

    it('should set `monitorMicVolume`', async () => {
      const requestOptions: IMediaRequestOptions = { audio: true };
      const trackMediaSpy = jest.spyOn(sdkMedia, 'trackMedia' as any);

      /* monitorMicVolume should be `undefined` */
      await startSingleMediaFn('audio', requestOptions);
      expect(trackMediaSpy).toHaveBeenCalledWith(expect.any(Object), undefined, undefined);

      /* monitorMicVolume should be sdk default */
      sdk._config.defaults.monitorMicVolume = true;
      await startSingleMediaFn('audio', requestOptions);
      expect(trackMediaSpy).toHaveBeenCalledWith(expect.any(Object), true, undefined);

      /* monitorMicVolume should override the sdk default with the passed in value */
      sdk._config.defaults.monitorMicVolume = true;
      await startSingleMediaFn('audio', { ...requestOptions, monitorMicVolume: false });
      expect(trackMediaSpy).toHaveBeenCalledWith(expect.any(Object), false, undefined);
    });

    it('on permissions errors it should set state and throw error for `audio`', async () => {
      const error = createError('NotAllowedError', 'this error message does not matter');
      getUserMediaSpy.mockRejectedValue(error);

      /* set state (to verify it changes – it would never actually get into this state) */
      sdkMedia['state'].hasMicPermissions = true;
      sdkMedia['state'].micPermissionsRequested = false;

      try {
        await startSingleMediaFn('audio', { audio: true });
        fail('should have thrown');
      } catch (e) {
        const { hasMicPermissions, micPermissionsRequested } = sdkMedia.getState();

        expect(e).toBe(error);
        expect(getUserMediaSpy).toHaveBeenCalledTimes(1); // no retry
        expect(hasMicPermissions).toBe(false);
        expect(micPermissionsRequested).toBe(true);
      }
    });

    it('on permissions errors it should set state and throw error for `video`', async () => {
      const error = createError('NotAllowedError', 'this error message does not matter');
      getUserMediaSpy.mockRejectedValue(error);

      /* set state (to verify it changes – it would never actually get into this state) */
      sdkMedia['state'].hasCameraPermissions = true;
      sdkMedia['state'].cameraPermissionsRequested = false;

      try {
        await startSingleMediaFn('video', { video: true });
        fail('should have thrown');
      } catch (e) {
        expect(e).toBe(error);
      }

      const { hasCameraPermissions, cameraPermissionsRequested } = sdkMedia.getState();

      expect(getUserMediaSpy).toHaveBeenCalledTimes(1); // no retry
      expect(hasCameraPermissions).toBe(false);
      expect(cameraPermissionsRequested).toBe(true);
    });

    it('specific FF video errors, it should retry without resolution', async () => {
      const error = createError('AbortError', 'Starting video failed');
      getUserMediaSpy
        .mockRejectedValueOnce(error)
        .mockResolvedValue(new MockStream());

      const requestOptions: IMediaRequestOptions = { video: true, videoResolution: { height: 20, width: 14 } };

      await startSingleMediaFn('video', requestOptions);

      expect(getUserMediaSpy).toHaveBeenCalledTimes(2);
      /* 1st with resolution */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(1, {
        audio: false,
        video: { ...requestOptions.videoResolution, frameRate: { ideal: 30 } }
      });
      /* 2nd without resolution */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(2, {
        audio: false,
        video: { frameRate: { ideal: 30 } }
      });
      /* specific log message */
      expect(sdk.logger.warn).toHaveBeenCalledWith(
        'starting video was aborted. trying again without a video resolution constraint',
        expect.any(Object)
      );
    });

    it('on errors for it should retry with sdk defaults if available (including frameRate)', async () => {
      const error = createError('NotFoundError', 'Device not found');
      getUserMediaSpy
        .mockRejectedValueOnce(error)
        .mockResolvedValue(new MockStream());

      sdk._config.defaults.videoDeviceId = 'sdk-default-device-id';

      const requestOptions: IMediaRequestOptions = { video: 'this-device-id-does-not-exist', videoFrameRate: { ideal: 45 } };

      await startSingleMediaFn('video', requestOptions);

      expect(getUserMediaSpy).toHaveBeenCalledTimes(2);
      /* 1st with requested device */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(1, {
        video: { deviceId: { exact: requestOptions.video }, frameRate: { ideal: 45 } },
        audio: false
      });
      /* 2nd with sdk default (and default frameRate) */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(2, {
        video: { deviceId: { exact: sdk._config.defaults.videoDeviceId }, frameRate: { ideal: 30 } },
        audio: false
      });
      /* specific log message */
      expect(sdk.logger.warn).toHaveBeenCalledWith(
        'starting media failed. attempting retry with different mediaRequestOptions',
        expect.any(Object)
      );
    });

    it('on errors for `video` it should respect the `videoFrameRate` value of `false` on retries', async () => {
      const error = createError('NotFoundError', 'Device not found');
      getUserMediaSpy
        .mockRejectedValueOnce(error)
        .mockResolvedValue(new MockStream());

      const requestOptions: IMediaRequestOptions = { video: 'device-id-not-existing', videoFrameRate: false };

      await startSingleMediaFn('video', requestOptions);

      expect(getUserMediaSpy).toHaveBeenCalledTimes(2);
      /* 1st with requested device */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(1, {
        video: { deviceId: { exact: requestOptions.video } },
        audio: false
      });
      /* 2nd with sdk default (and default frameRate) */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(2, {
        video: {}, // respects the frameRate of false on retry
        audio: false
      });
      /* specific log message */
      expect(sdk.logger.warn).toHaveBeenCalledWith(
        'starting media failed. attempting retry with different mediaRequestOptions',
        expect.any(Object)
      );
    });

    it('on errors it should retry with system defaults if sdk defaults throw errors', async () => {
      const error = createError('NotFoundError', 'Device not found');
      getUserMediaSpy
        .mockRejectedValueOnce(error) // deviceId
        .mockRejectedValueOnce(error) // sdk default deviceId 
        .mockResolvedValue(new MockStream()); // sys default

      const requestOptions: IMediaRequestOptions = { audio: 'this-device-id-does-not-exist' };
      sdk._config.defaults.audioDeviceId = 'this-device-id-also-does-not-exist';
      await startSingleMediaFn('audio', requestOptions);

      expect(getUserMediaSpy).toHaveBeenCalledTimes(3);
      /* 1st with requested device */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(1, {
        audio: { deviceId: { exact: requestOptions.audio } },
        video: false
      });
      /* 2nd with sdk default */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(2, {
        audio: { deviceId: { exact: sdk._config.defaults.audioDeviceId } },
        video: false
      });
      /* 3rd with system default */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(3, {
        audio: {},
        video: false
      });
    });

    it('on errors it should retry with system default is requested with sdk default', async () => {
      const error = createError('NotFoundError', 'Device not found');
      getUserMediaSpy
        .mockRejectedValueOnce(error) // sdk default deviceId
        .mockResolvedValue(new MockStream()); // sys default

      const requestOptions: IMediaRequestOptions = { audio: true };
      sdk._config.defaults.audioDeviceId = 'this-device-id-also-does-not-exist';
      await startSingleMediaFn('audio', requestOptions);

      expect(getUserMediaSpy).toHaveBeenCalledTimes(2);
      /* 1st with requested device */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(1, {
        audio: { deviceId: { exact: sdk._config.defaults.audioDeviceId } },
        video: false
      });
      /* 2nd with system default */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(2, {
        audio: {},
        video: false
      });
    });

    it('on errors it should throw if already requested with system defaults', async () => {
      const error = createError('BadThing', 'media is just not going to work for this browser');
      getUserMediaSpy
        .mockRejectedValue(error);

      const requestOptions: IMediaRequestOptions = { audio: null };
      try {
        await startSingleMediaFn('audio', requestOptions);
        fail('it should have thrown');
      } catch (e) {
        expect(e).toBe(error);
        expect(getUserMediaSpy).toHaveBeenCalledTimes(1);
        expect(sdk.logger.warn).toHaveBeenCalledWith(
          'starting media failed. no valid retry parameters available',
          expect.any(Object)
        );
      }
    });

    it('on errors it should throw the error if it exhausts all retries', async () => {
      const error = createError('BadThing', 'media is just not going to work for this browser');
      getUserMediaSpy.mockRejectedValue(error);

      sdk._config.defaults.audioDeviceId = 'sdk-default-device-id';

      const requestOptions: IMediaRequestOptions = { audio: 'this-device-id-does-not-exist' };

      try {
        await startSingleMediaFn('audio', requestOptions);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBe(error);
      }

      expect(getUserMediaSpy).toHaveBeenCalledTimes(3);
      /* 1st with requested device */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(1, {
        audio: { deviceId: { exact: requestOptions.audio } },
        video: false
      });
      /* 2nd with sdk default */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(2, {
        audio: { deviceId: { exact: sdk._config.defaults.audioDeviceId } },
        video: false
      });
      /* 3rd with system default */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(3, {
        audio: {},
        video: false
      });
    });

    it('on errors it should not retry if the flag is `false`', async () => {
      const error = createError('NotFoundError', 'Device not found');
      getUserMediaSpy.mockRejectedValue(error);

      const requestOptions: IMediaRequestOptions = { audio: 'this-device-id-does-not-exist' };

      try {
        await startSingleMediaFn('audio', requestOptions, false);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBe(error);
      }

      expect(getUserMediaSpy).toHaveBeenCalledTimes(1);
      /* 1st with requested device */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(1, {
        audio: { deviceId: { exact: requestOptions.audio } },
        video: false
      });
      /* specific log message */
      expect(sdk.logger.error).toHaveBeenCalledWith(
        'error requesting getUserMedia from the sdk',
        expect.any(Object)
      );
    });
  });

  describe('trackMedia()', () => {
    let allMediaTracksCreatedMap: typeof SdkMedia.prototype['allMediaTracksCreated'];
    let trackMediaFn: typeof SdkMedia.prototype['trackMedia'];
    let mockStream: MediaStream;
    beforeEach(() => {
      allMediaTracksCreatedMap = sdkMedia['allMediaTracksCreated'];
      trackMediaFn = sdkMedia['trackMedia'].bind(sdkMedia);
      mockStream = new MockStream() as any as MediaStream;
    });

    it('should push all tracks into local Map', () => {
      const mockTrack = new MockTrack('video');
      mockStream.addTrack(mockTrack as any);

      trackMediaFn(mockStream);

      expect(allMediaTracksCreatedMap.get(mockTrack.id)).toBe(mockTrack);
    });

    it('should call through to monitor mic volumes', () => {
      const monitorMicVolumeSpy = jest.spyOn(sdkMedia, 'monitorMicVolume' as any).mockImplementation();
      const mockTrack = new MockTrack('audio');
      const sessionId = 'does not matter';

      mockStream.addTrack(mockTrack as any);

      trackMediaFn(mockStream, true, sessionId);

      expect(monitorMicVolumeSpy).toHaveBeenCalledWith(mockStream, mockTrack, sessionId);
      expect(allMediaTracksCreatedMap.has(mockTrack.id)).toBe(true);
    });

    it('should remove track if track.stop() was called', () => {
      jest.spyOn(sdkMedia, 'monitorMicVolume' as any).mockImplementation();
      const clearAudioInputMonitorSpy = jest.spyOn(sdkMedia, 'clearAudioInputMonitor' as any).mockImplementation();
      const mockTrack = new MockTrack('audio');
      mockStream.addTrack(mockTrack as any);

      trackMediaFn(mockStream, true);

      expect(allMediaTracksCreatedMap.has(mockTrack.id)).toBe(true);

      /* stop the track */
      mockTrack.stop();

      expect(clearAudioInputMonitorSpy).toHaveBeenCalled();
      expect(allMediaTracksCreatedMap.has(mockTrack.id)).toBe(false);
    });

    it('should remove track if track `ended` event fire', () => {
      jest.spyOn(sdkMedia, 'monitorMicVolume' as any).mockImplementation();
      const clearAudioInputMonitorSpy = jest.spyOn(sdkMedia, 'clearAudioInputMonitor' as any).mockImplementation();
      const mockTrack = new MockTrack('audio');
      mockStream.addTrack(mockTrack as any);

      trackMediaFn(mockStream, true);

      expect(allMediaTracksCreatedMap.has(mockTrack.id)).toBe(true);

      /* stop the track */
      mockTrack._listeners
        .filter(l => l.event === 'ended')
        .forEach(l => l.callback());

      expect(clearAudioInputMonitorSpy).toHaveBeenCalled();
      expect(allMediaTracksCreatedMap.has(mockTrack.id)).toBe(false);
    });
  });

  describe('isPermissionsError()', () => {
    let isPermissionsErrorFn: typeof SdkMedia.prototype['isPermissionsError'];
    beforeEach(() => {
      isPermissionsErrorFn = sdkMedia['isPermissionsError'].bind(sdkMedia);
    });

    it('should return `true` for permissions errors', () => {
      /* NotAllowedError */
      const NotAllowedError = new Error('Nope');
      NotAllowedError.name = 'NotAllowedError';
      expect(isPermissionsErrorFn(NotAllowedError)).toBe(true);

      /* DOMException */
      const DOMException = new Error('Could not start video source');
      DOMException.name = 'DOMException';
      expect(isPermissionsErrorFn(DOMException)).toBe(true);

      /* NotFoundError */
      const NotFoundError = new Error('The object can not be found here.');
      NotFoundError.name = 'NotFoundError';
      expect(isPermissionsErrorFn(NotFoundError)).toBe(true);
    });

    it('should return `false` for any other errors', () => {
      const error = new Error('Device not found');
      expect(isPermissionsErrorFn(error)).toBe(false);
    });
  });
});