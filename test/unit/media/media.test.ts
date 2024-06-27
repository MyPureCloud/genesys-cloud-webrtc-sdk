import browserama from 'browserama';

import { SdkMedia } from '../../../src/media/media';
import GenesysCloudWebrtcSdk from '../../../src/client';
import { getRandomIntInclusive, MockAudioContext, MockSession, MockStream, MockTrack, SimpleMockSdk, MockAnalyser } from '../../test-utils';
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
      delete (navigatorMediaDevicesMock as any).getDisplayMedia;

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

    it('should filter out any tracks that have muted=true', async () => {
      sdkMedia['hasGetDisplayMedia'] = jest.fn().mockReturnValue(false);
      const stream = new MockStream();
      const mutedTrack = new MockTrack('video');
      const unmutedTrack = new MockTrack('video');

      mutedTrack.muted = true;
      unmutedTrack.muted = false;

      const trackMediaSpy = jest.spyOn(sdkMedia, 'trackMedia' as any);
      stream._tracks = [mutedTrack, unmutedTrack];

      jest.spyOn(window.navigator.mediaDevices, 'getUserMedia')
        .mockResolvedValue(stream as unknown as MediaStream);

      await sdkMedia.startDisplayMedia();
      expect(stream.getTracks().length).toBe(1);
      expect(trackMediaSpy).toHaveBeenCalledWith(stream);
    })
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
        mediaReqOptions: { video: true, audio: true, session: false, retryOnFailure: true, uuid: expect.any(String) },
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
        mediaReqOptions: { ...expectedLogDetails.mediaReqOptions, session: true },
        sessionId: session.id,
        conversationId: session.conversationId
      });
    });

    it('should requestPermissions for `audio` & `video` if not already requested', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: false, cameraPermissionsRequested: false });
      const requestOptions: IMediaRequestOptions = { audio: true, video: true };
      const expectedReqOptions = { ...requestOptions, retryOnFailure: true, uuid: expect.any(String) };

      /* setup our mocks */
      const mockAudioStream = new MockStream({ audio: true });
      const mockVideoStream = new MockStream({ video: true });
      requestMediaPermissionsSpy
        .mockResolvedValueOnce(mockAudioStream)
        .mockResolvedValueOnce(mockVideoStream);

      const stream = await sdkMedia.startMedia(requestOptions);

      expect(requestMediaPermissionsSpy).toHaveBeenNthCalledWith(1, 'audio', true, expectedReqOptions);
      expect(requestMediaPermissionsSpy).toHaveBeenNthCalledWith(2, 'video', true, expectedReqOptions);
      expect(startSingleMediaSpy).not.toHaveBeenCalled();
      expect(stream.getTracks()).toEqual([
        mockAudioStream.getTracks()[0],
        mockVideoStream.getTracks()[0]
      ]);
    });

    it('should startSingleMedia for `audio` & `video` if already requested permissions', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: null, video: null, retryOnFailure: false, uuid: 'kitty-hawk' };

      /* setup our mocks */
      const mockAudioStream = new MockStream({ audio: true });
      const mockVideoStream = new MockStream({ video: true });
      startSingleMediaSpy
        .mockResolvedValueOnce(mockAudioStream)
        .mockResolvedValueOnce(mockVideoStream);

      const stream = await sdkMedia.startMedia(requestOptions);

      expect(startSingleMediaSpy).toHaveBeenNthCalledWith(1, 'audio', requestOptions);
      expect(startSingleMediaSpy).toHaveBeenNthCalledWith(2, 'video', requestOptions);
      expect(requestMediaPermissionsSpy).not.toHaveBeenCalled();
      expect(stream.getTracks()).toEqual([
        mockAudioStream.getTracks()[0],
        mockVideoStream.getTracks()[0]
      ]);
    });

    it('should only request audio and return the stream', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: true, video: false, uuid: 'something-unique', retryOnFailure: true };

      /* setup our mocks */
      const mockAudioStream = new MockStream({ audio: true });
      startSingleMediaSpy.mockResolvedValueOnce(mockAudioStream);

      const stream = await sdkMedia.startMedia(requestOptions);

      expect(startSingleMediaSpy).toHaveBeenCalledTimes(1);
      expect(startSingleMediaSpy).toHaveBeenCalledWith('audio', requestOptions);
      expect(startSingleMediaSpy).not.toHaveBeenCalledWith('video', requestOptions);
      expect(requestMediaPermissionsSpy).not.toHaveBeenCalled();
      expect(stream.getTracks()).toEqual([mockAudioStream.getTracks()[0]]);
      expect(stream).toBe(mockAudioStream);
    });

    it('should only request video and return the stream', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: false, video: true, uuid: 'something-unique', retryOnFailure: false };

      /* setup our mocks */
      const mockVideoStream = new MockStream({ video: true });
      startSingleMediaSpy.mockResolvedValueOnce(mockVideoStream);

      const stream = await sdkMedia.startMedia(requestOptions);

      expect(startSingleMediaSpy).toHaveBeenCalledTimes(1);
      expect(startSingleMediaSpy).toHaveBeenCalledWith('video', requestOptions);
      expect(startSingleMediaSpy).not.toHaveBeenCalledWith('audio', requestOptions);
      expect(requestMediaPermissionsSpy).not.toHaveBeenCalled();
      expect(stream.getTracks()).toEqual([mockVideoStream.getTracks()[0]]);
      expect(stream).toBe(mockVideoStream);
    });

    it('should throw an error after `video` is requested if `audio` failed and both media types were requested', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: null, video: null, uuid: 'something-hidden', retryOnFailure: true };
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
        expect(startSingleMediaSpy).toHaveBeenNthCalledWith(1, 'audio', requestOptions);
        expect(startSingleMediaSpy).toHaveBeenNthCalledWith(2, 'video', requestOptions);
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
        expect(startSingleMediaSpy).toHaveBeenCalledWith('none', { retryOnFailure: false, uuid: expect.any(String) });
        expect(e).toBe(error);
      }
    });

    it('should swallow one media type error if `preserveMediaIfOneTypeFails` is true', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: true, video: true, preserveMediaIfOneTypeFails: true };
      const audioError = new Error('Permission Denied');
      const videoStream = new MockStream({ video: true });

      /* setup our mocks */
      startSingleMediaSpy
        /* audio is requested first  */
        .mockRejectedValueOnce(audioError)
        .mockResolvedValueOnce(videoStream);

      const returnedStream = await sdkMedia.startMedia(requestOptions);
      expect(returnedStream).toBe(videoStream);

      expect(startSingleMediaSpy).toHaveBeenCalledTimes(2);
    });

    it('should throw the audio error if both audio and video error', async () => {
      /* reset the media state */
      sdkMedia['setPermissions']({ micPermissionsRequested: true, cameraPermissionsRequested: true });
      const requestOptions: IMediaRequestOptions = { audio: true, video: true };
      const audioError = new Error('Permission Denied');
      const videoError = new Error('Permission Denied');

      /* setup our mocks */
      startSingleMediaSpy
        .mockRejectedValueOnce(audioError)
        .mockRejectedValueOnce(videoError);

      try {
        await sdkMedia.startMedia(requestOptions);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBe(audioError);
        expect(startSingleMediaSpy).toHaveBeenCalledTimes(2);
      }
    });
  });

  describe('requestMediaPermissions()', () => {
    let enumerateDevicesSpy: jest.SpyInstance;
    let startMediaSpy: jest.SpyInstance;
    let startSingleMediaSpy: jest.SpyInstance;

    beforeEach(() => {
      enumerateDevicesSpy = jest.spyOn(sdkMedia, 'enumerateDevices').mockResolvedValue([]);
      startMediaSpy = jest.spyOn(sdkMedia, 'startMedia').mockResolvedValue(new MockStream() as any);
      startSingleMediaSpy = jest.spyOn(sdkMedia, 'startSingleMedia' as any).mockResolvedValue(new MockStream() as any);
    });

    it('should set params correctly', async () => {
      const requestOptions: IMediaRequestOptions = {};
      const expectedLogDetails: any = {
        mediaType: 'audio',
        preserveMedia: false,
        requestOptions: {
          audio: true,
          video: false,
          session: undefined,
          retryOnFailure: true,
          uuid: expect.any(String)
        },
        sessionId: undefined,
        conversationId: undefined,
      };

      /* with no preserveMedia flag or session */
      await sdkMedia.requestMediaPermissions('audio');
      expect(sdk.logger.info).toHaveBeenCalledWith('requesting media to gain permissions', expectedLogDetails);

      /* with a session */
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
      expect(startSingleMediaSpy).toHaveBeenCalledTimes(1);
      expect(startSingleMediaSpy).toHaveBeenNthCalledWith(1, 'audio', { audio: true, video: false, retryOnFailure: true, uuid: expect.any(String) });
    });

    it('should always request the desired media type and never with the opposite media type', async () => {
      /* AUDIO */
      /* if `false` */
      let reqOptions: IMediaRequestOptions = { audio: false, video: true };
      await sdkMedia.requestMediaPermissions('audio', false, reqOptions);
      expect(startSingleMediaSpy).toHaveBeenCalledWith('audio', { audio: true, video: false, retryOnFailure: true, uuid: expect.any(String) });

      /* if `undefined` */
      reqOptions.audio = undefined;
      await sdkMedia.requestMediaPermissions('audio', false, reqOptions);
      expect(startSingleMediaSpy).toHaveBeenCalledWith('audio', { audio: true, video: false, retryOnFailure: true, uuid: expect.any(String) });

      /* if with deviceId */
      reqOptions.audio = 'deviceId';
      await sdkMedia.requestMediaPermissions('audio', false, reqOptions);
      expect(startSingleMediaSpy).toHaveBeenCalledWith('audio', { audio: reqOptions.audio, video: false, retryOnFailure: true, uuid: expect.any(String) });

      /* VIDEO */
      /* if `false` */
      reqOptions = { video: false, audio: true };
      await sdkMedia.requestMediaPermissions('video', false, reqOptions);
      expect(startSingleMediaSpy).toHaveBeenCalledWith('video', { video: true, audio: false, retryOnFailure: true, uuid: expect.any(String) });

      /* if `undefined` */
      reqOptions.video = undefined;
      await sdkMedia.requestMediaPermissions('video', false, reqOptions);
      expect(startSingleMediaSpy).toHaveBeenCalledWith('video', { video: true, audio: false, retryOnFailure: true, uuid: expect.any(String) });

      /* if with deviceId */
      reqOptions.video = 'deviceId';
      await sdkMedia.requestMediaPermissions('video', false, reqOptions);
      expect(startSingleMediaSpy).toHaveBeenCalledWith('video', { video: reqOptions.video, audio: false, retryOnFailure: true, uuid: expect.any(String) });
    });

    it('should always request both media types if `both` was requested', async () => {
      /* if `false` */
      const reqOptions: IMediaRequestOptions = { audio: false, video: false };
      await sdkMedia.requestMediaPermissions('both', false, reqOptions);
      expect(startMediaSpy).toHaveBeenCalledWith({ audio: true, video: true, retryOnFailure: true, uuid: expect.any(String) });

      /* if `undefined` */
      reqOptions.audio = undefined;
      reqOptions.video = undefined;
      await sdkMedia.requestMediaPermissions('both', false, reqOptions);
      expect(startMediaSpy).toHaveBeenCalledWith({ audio: true, video: true, retryOnFailure: true, uuid: expect.any(String) });

      /* if with deviceId */
      reqOptions.audio = 'audio-deviceId';
      reqOptions.video = 'video-deviceId';
      await sdkMedia.requestMediaPermissions('both', false, reqOptions);
      expect(startMediaSpy).toHaveBeenCalledWith({ audio: true, video: true, retryOnFailure: true, uuid: expect.any(String) });
    });

    it('should use `retryOnFailure` option if passed in', async () => {
      let reqOptions: IMediaRequestOptions = { audio: true, video: false, retryOnFailure: false };
      await sdkMedia.requestMediaPermissions('audio', false, reqOptions);
      expect(startSingleMediaSpy).toHaveBeenCalledWith('audio', { audio: true, video: false, retryOnFailure: false, uuid: expect.any(String) });
    });

    it('should return the media if `preserveMedia` was `true`', async () => {
      const mockStream = new MockStream({ audio: true });

      startSingleMediaSpy.mockResolvedValue(mockStream);

      const stream = await sdkMedia.requestMediaPermissions('audio', true);

      expect(stream).toBe(mockStream);
    });

    it('should destroy the media if `preserveMedia` was `false`', async () => {
      const mockStream = new MockStream({ audio: true });

      startSingleMediaSpy.mockResolvedValue(mockStream);

      const noStream = await sdkMedia.requestMediaPermissions('audio', false);

      expect(noStream).toBe(undefined);
      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    });

    it('should throw an error if media type requested is invalid', async () => {
      try {
        await sdkMedia.requestMediaPermissions('something' as any);
        fail('Should have thrown');
      } catch (e) {
        expect(e.message).toBe('Must call `requestMediaPermissions()` with at least one valid media type: `audio`, `video`, or `both`');
      }
    });
    it('should not populate uuid with v4 if one already exists in optionsCopy', () => {
      const v4Spy = jest.fn();
      jest.mock('uuid', () => ({ v4: v4Spy}));
      const reqOptions: IMediaRequestOptions = { audio: true, video: false, retryOnFailure: false, uuid: '123456-789' };
      sdkMedia.requestMediaPermissions('audio', false, reqOptions);
      expect(v4Spy).not.toHaveBeenCalled();
      jest.clearAllMocks();
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
      sdk._config.defaults!.audioDeviceId = mockAudioDevice1.deviceId;
      sdk._config.defaults!.videoDeviceId = mockVideoDevice1.deviceId;
      sdk._config.defaults!.outputDeviceId = mockOutputDevice1.deviceId;

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
      sdk._config.defaults!.audioDeviceId = mockAudioDevice1.deviceId;

      expect(sdkMedia.getValidDeviceId('audioinput', true)).toBe(mockAudioDevice1.deviceId);
    });

    it('should return `undefined` if `true` passed in but there is no sdk default', () => {
      sdk._config.defaults!.audioDeviceId = 'this-device-does-not-exist';

      expect(sdkMedia.getValidDeviceId('audioinput', true)).toBe(undefined);
      expect(sdk.logger.warn).toHaveBeenCalledWith('Unable to find the sdk default deviceId', {
        kind: 'audioinput',
        deviceId: sdk._config.defaults!.audioDeviceId,
        sessionInfos: []
      });
    });

    it('should return `undefined` if `true` passed in but there is no sdk default', () => {
      expect(sdkMedia.getValidDeviceId('audioinput', true)).toBe(undefined);
    });

    it('should return `undefined` if `falsy` was passed in', () => {
      expect(sdkMedia.getValidDeviceId('audioinput', false)).toBe(undefined);
      expect(sdkMedia.getValidDeviceId('audioinput', undefined)).toBe(undefined);
      expect(sdkMedia.getValidDeviceId('audioinput', null)).toBe(undefined);
    });

    it('should return `undefined` if no deviceId can be found', () => {
      sdk._config.defaults!.audioDeviceId = null;
      sdk._config.defaults!.videoDeviceId = null;
      sdk._config.defaults!.outputDeviceId = null;

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

  describe('getValidSdkMediaRequestDeviceId()', () => {
    it('should return `true` if `undefined|false` are passed in', () => {
      expect(sdk.media.getValidSdkMediaRequestDeviceId(undefined)).toBe(true);
      expect(sdk.media.getValidSdkMediaRequestDeviceId(false)).toBe(true);
    });

    it('should return the passed in value if `string|true|null` are passed in', () => {
      expect(sdk.media.getValidSdkMediaRequestDeviceId('deviceId-mock')).toBe('deviceId-mock');
      expect(sdk.media.getValidSdkMediaRequestDeviceId(true)).toBe(true);
      expect(sdk.media.getValidSdkMediaRequestDeviceId(null)).toBe(null);
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

  describe('setDefaultAudioStream()', () => {
    let removeDefaultAudioStreamAndListenersSpy: jest.SpyInstance;
    let setupDefaultMediaStreamListenersSpy: jest.SpyInstance;

    beforeEach(() => {
      removeDefaultAudioStreamAndListenersSpy = jest.spyOn(sdkMedia, 'removeDefaultAudioStreamAndListeners' as any).mockImplementation();
      setupDefaultMediaStreamListenersSpy = jest.spyOn(sdkMedia, 'setupDefaultMediaStreamListeners' as any).mockImplementation();
    });

    it('should remove existing stream if null was passed in', () => {
      sdk._config.defaults!.audioStream = new MockStream() as any;
      sdkMedia.setDefaultAudioStream();
      expect(removeDefaultAudioStreamAndListenersSpy).toHaveBeenCalled();
      expect(setupDefaultMediaStreamListenersSpy).not.toHaveBeenCalled();
    });

    it('should do nothing if setting to the same default stream', () => {
      const stream = new MockStream() as any as MediaStream;
      sdk._config.defaults!.audioStream = stream;

      sdkMedia.setDefaultAudioStream(stream);

      expect(removeDefaultAudioStreamAndListenersSpy).not.toHaveBeenCalled();
      expect(setupDefaultMediaStreamListenersSpy).not.toHaveBeenCalled();
    });

    it('should setup listeners on the stream and tracks and set the default sdk config', () => {
      const stream = new MockStream(true) as any as MediaStream;

      expect(sdk._config.defaults!.audioStream).toBeFalsy();

      sdkMedia.setDefaultAudioStream(stream);

      expect(removeDefaultAudioStreamAndListenersSpy).toHaveBeenCalled();
      expect(setupDefaultMediaStreamListenersSpy).toHaveBeenCalledWith(stream);
      expect(sdk._config.defaults!.audioStream).toBe(stream);
    });
  });

  describe('findCachedDeviceByTrackLabelAndKind()', () => {
    beforeEach(() => {
      sdkMedia['setDevices'](mockedDevices);
    });

    it('should return `undefined` if there is no track', () => {
      expect(sdkMedia.findCachedDeviceByTrackLabelAndKind()).toBe(undefined);
    });

    it('should find the available video & audio device depending on the track kind', async () => {
      const videoTrack = new MockTrack('video', mockVideoDevice1.label);
      const audioTrack = new MockTrack('audio', mockAudioDevice1.label);

      expect(sdkMedia.findCachedDeviceByTrackLabelAndKind(videoTrack as any as MediaStreamTrack)).toEqual(mockVideoDevice1);
      expect(sdkMedia.findCachedDeviceByTrackLabelAndKind(audioTrack as any as MediaStreamTrack)).toEqual(mockAudioDevice1);
    });

    it('should return `unefined` if it cannot find the track by label in available devices', async () => {
      const videoTrack = new MockTrack('video', 'A video device that does not exist');
      const audioTrack = new MockTrack('audio', 'An audio device that does not exist');

      expect(sdkMedia.findCachedDeviceByTrackLabelAndKind(videoTrack as any as MediaStreamTrack)).toBe(undefined);
      expect(sdkMedia.findCachedDeviceByTrackLabelAndKind(audioTrack as any as MediaStreamTrack)).toBe(undefined);
    });
  });

  describe('findCachedDeviceByTrackLabel()', () => {
    it('should call to findCachedDeviceByTrackLabelAndKind()', () => {
      const videoTrack = new MockTrack('video');
      jest.spyOn(sdkMedia, 'findCachedDeviceByTrackLabelAndKind').mockImplementation();

      sdkMedia.findCachedDeviceByTrackLabel(videoTrack as any as MediaStreamTrack);
      expect(sdkMedia.findCachedDeviceByTrackLabelAndKind).toHaveBeenCalledWith(videoTrack);
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

  describe('findCachedVideoDeviceById()', () => {
    beforeEach(() => {
      sdkMedia['setDevices'](mockedDevices);
    });

    it('should return `undefined` if there is id passed in', () => {
      expect(sdkMedia.findCachedVideoDeviceById()).toBe(undefined);
    });

    it('should return the found output device', async () => {
      const deviceIdToFind = mockVideoDevice2.deviceId;

      expect(sdkMedia.findCachedVideoDeviceById(deviceIdToFind)).toEqual(mockVideoDevice2);
    });

    it('should return `undefined` if the output device cannot be found', async () => {
      const deviceIdToFind = 'output123';

      expect(sdkMedia.findCachedVideoDeviceById(deviceIdToFind)).toBe(undefined);
    });
  });

  describe('findCachedAudioDeviceById()', () => {
    beforeEach(() => {
      sdkMedia['setDevices'](mockedDevices);
    });

    it('should return `undefined` if there is id passed in', () => {
      expect(sdkMedia.findCachedAudioDeviceById()).toBe(undefined);
    });

    it('should return the found output device', async () => {
      const deviceIdToFind = mockAudioDevice1.deviceId;

      expect(sdkMedia.findCachedAudioDeviceById(deviceIdToFind)).toEqual(mockAudioDevice1);
    });

    it('should return `undefined` if the output device cannot be found', async () => {
      const deviceIdToFind = 'output123';

      expect(sdkMedia.findCachedAudioDeviceById(deviceIdToFind)).toBe(undefined);
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
      const mockEventListenerRef = () => { console.log('mock function'); }

      sdkMedia['allMediaTracksCreated'].set(mockTrack.id, mockTrack as any);
      sdkMedia['onDeviceChangeListenerRef'] = mockEventListenerRef;
      sdkMedia.destroy();

      expect(sdkMedia.removeAllListeners).toHaveBeenCalled();
      expect(navigatorMediaDevicesMock.removeEventListener).toHaveBeenCalledWith('devicechange', mockEventListenerRef);
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
        volume: lastAvg!,
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
        volume: lastAvg!,
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
        volume: lastAvg!,
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
      sdkMedia['clearAudioInputMonitor']('sldkfnsl');
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

    it('should return audio/video constraints', () => {
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
      sdk._config.defaults!.videoResolution = {
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
      sdk._config.defaults!.videoResolution = {
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
        audio: expect.objectContaining({
          deviceId: { exact: options.audio }
        })
      });
    });

    it('should return video/audio deviceId constraint with sdk default', () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });
      sdk._config.defaults!.videoDeviceId = 'video-device-id';
      sdk._config.defaults!.audioDeviceId = 'audio-device-id';

      const options: IMediaRequestOptions = {
        video: true,
        audio: true,
      };

      expect(getStandardConstraintsFn(options)).toEqual({
        video: {
          deviceId: { exact: 'video-device-id' },
          frameRate: { ideal: 30 }
        },
        audio: expect.objectContaining({
          deviceId: { exact: 'audio-device-id' }
        })
      });
    });

    it('should return video/audio system default if `null` was passed in even if sdk has defaults', () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });
      sdk._config.defaults!.videoDeviceId = 'video-device-id';
      sdk._config.defaults!.audioDeviceId = 'audio-device-id';

      const options: IMediaRequestOptions = {
        video: null,
        audio: null,
      };

      expect(getStandardConstraintsFn(options)).toEqual({
        video: {
          frameRate: { ideal: 30 }
        },
        audio: expect.not.objectContaining({ deviceId: expect.anything() })
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
      delete (navigatorMediaDevicesMock as any).getDisplayMedia;
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

    it('should not call sessionManager if it has not been initialized yet', async () => {
      const enumerateDevicesSpy = jest.spyOn(sdkMedia, 'enumerateDevices').mockResolvedValue([]);
      const miniSdk = { logger: { debug: jest.fn() } };
      sdkMedia['sdk'] = miniSdk as any;

      await sdkMedia['handleDeviceChange']();

      expect(enumerateDevicesSpy).toHaveBeenCalled();
      expect(sdk.sessionManager.validateOutgoingMediaTracks).not.toHaveBeenCalled();
      expect(miniSdk.logger.debug).toHaveBeenCalled();
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
        constraints: { video: false, audio: expect.not.objectContaining({ deviceId: expect.anything() }) },
        sessionId: requestOptions.session!.id,
        conversationId: requestOptions.session!.conversationId,
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
      expect(trackMediaSpy).toHaveBeenCalledWith(mockStream, requestOptions.monitorMicVolume, requestOptions.session!.id);
    });

    it('should request `audio` and set `video` to false – as well as update the permissions state', async () => {
      const getPermissionsState = () => {
        const { hasMicPermissions, micPermissionsRequested } = sdkMedia.getState();
        return { hasMicPermissions, micPermissionsRequested };
      };

      expect(getPermissionsState()).toEqual({ hasMicPermissions: false, micPermissionsRequested: false });
      await startSingleMediaFn('audio', { audio: true, video: true });

      expect(getUserMediaSpy).toHaveBeenCalledWith({ video: false, audio: expect.not.objectContaining({ deviceId: expect.anything() }) });
      expect(getPermissionsState()).toEqual({ hasMicPermissions: true, micPermissionsRequested: true });
    });

    it('should request `video` and set `audio` to false – as well as update the permissions state', async () => {
      const getPermissionsState = () => {
        const { hasCameraPermissions, cameraPermissionsRequested } = sdkMedia.getState();
        return { hasCameraPermissions, cameraPermissionsRequested };
      };

      expect(getPermissionsState()).toEqual({ hasCameraPermissions: false, cameraPermissionsRequested: false });

      await startSingleMediaFn('video', { audio: true, video: true });

      expect(getUserMediaSpy).toHaveBeenCalledWith({ audio: false, video: { frameRate: { ideal: 30 } } });
      expect(getPermissionsState()).toEqual({ hasCameraPermissions: true, cameraPermissionsRequested: true });
    });

    it('should set `monitorMicVolume`', async () => {
      const requestOptions: IMediaRequestOptions = { audio: true };
      const trackMediaSpy = jest.spyOn(sdkMedia, 'trackMedia' as any);

      /* monitorMicVolume should be `undefined` */
      await startSingleMediaFn('audio', requestOptions);
      expect(trackMediaSpy).toHaveBeenCalledWith(expect.any(Object), undefined, undefined);

      /* monitorMicVolume should be sdk default */
      sdk._config.defaults!.monitorMicVolume = true;
      await startSingleMediaFn('audio', requestOptions);
      expect(trackMediaSpy).toHaveBeenCalledWith(expect.any(Object), true, undefined);

      /* monitorMicVolume should override the sdk default with the passed in value */
      sdk._config.defaults!.monitorMicVolume = true;
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

      sdk._config.defaults!.videoDeviceId = 'sdk-default-device-id';

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
        video: { deviceId: { exact: sdk._config.defaults!.videoDeviceId }, frameRate: { ideal: 30 } },
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
      sdk._config.defaults!.audioDeviceId = 'this-device-id-also-does-not-exist';
      await startSingleMediaFn('audio', requestOptions);

      expect(getUserMediaSpy).toHaveBeenCalledTimes(3);
      /* 1st with requested device */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(1, {
        audio: expect.objectContaining({ deviceId: { exact: requestOptions.audio } }),
        video: false
      });
      /* 2nd with sdk default */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(2, {
        audio: expect.objectContaining({ deviceId: { exact: sdk._config.defaults!.audioDeviceId } }),
        video: false
      });
      /* 3rd with system default */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(3, {
        audio: expect.not.objectContaining({ deviceId: expect.anything() }),
        video: false
      });
    });

    it('on errors it should retry with system default is requested with sdk default', async () => {
      const error = createError('NotFoundError', 'Device not found');
      getUserMediaSpy
        .mockRejectedValueOnce(error) // sdk default deviceId
        .mockResolvedValue(new MockStream()); // sys default

      const requestOptions: IMediaRequestOptions = { audio: true };
      sdk._config.defaults!.audioDeviceId = 'this-device-id-also-does-not-exist';
      await startSingleMediaFn('audio', requestOptions);

      expect(getUserMediaSpy).toHaveBeenCalledTimes(2);
      /* 1st with requested device */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(1, {
        audio: expect.objectContaining({ deviceId: { exact: sdk._config.defaults!.audioDeviceId } }),
        video: false
      });
      /* 2nd with system default */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(2, {
        audio: expect.not.objectContaining({ deviceId: expect.anything() }),
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

      sdk._config.defaults!.audioDeviceId = 'sdk-default-device-id';

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
        audio: expect.objectContaining({ deviceId: { exact: requestOptions.audio } }),
        video: false
      });
      /* 2nd with sdk default */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(2, {
        audio: expect.objectContaining({ deviceId: { exact: sdk._config.defaults!.audioDeviceId } }),
        video: false
      });
      /* 3rd with system default */
      expect(getUserMediaSpy).toHaveBeenNthCalledWith(3, {
        audio: expect.not.objectContaining({ deviceId: expect.anything() }),
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
        audio: expect.objectContaining({ deviceId: { exact: requestOptions.audio } }),
        video: false
      });
      /* specific log message */
      expect(sdk.logger.error).toHaveBeenCalledWith(
        'error requesting getUserMedia from the sdk',
        expect.any(Object)
      );
    });

    it('removes muted tracks after creating a new media stream', async () => {
      const mockStream = new MockStream({ audio: true });
      const requestOptions: IMediaRequestOptions = { audio: true, monitorMicVolume: false, session: { id: 'sessId', conversationId: 'convoId' } as any };
      const trackMediaSpy = jest.spyOn(sdkMedia, 'trackMedia' as any);
      const mutedTrack = new MockTrack('video');
      const unmutedTrack = new MockTrack('video');

      mutedTrack.muted = true;
      unmutedTrack.muted = false;

      mockStream._tracks = [mutedTrack, unmutedTrack];
      getUserMediaSpy.mockResolvedValue(mockStream);

      await startSingleMediaFn('video', requestOptions);

      expect(mockStream._tracks.length).toBe(1);
      expect(trackMediaSpy).toHaveBeenCalledWith(mockStream, requestOptions.monitorMicVolume, requestOptions.session?.id);
    })
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
      mockTrack._mockTrackEnded();

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

  describe('setupDefaultMediaStreamListeners()', () => {
    let setupDefaultMediaTrackListenersSpy: jest.SpyInstance;
    let removeDefaultAudioMediaTrackListenersSpy: jest.SpyInstance;
    let stream: MediaStream;

    beforeEach(() => {
      setupDefaultMediaTrackListenersSpy = jest.spyOn(sdkMedia, 'setupDefaultMediaTrackListeners' as any).mockImplementation();
      removeDefaultAudioMediaTrackListenersSpy = jest.spyOn(sdkMedia, 'removeDefaultAudioMediaTrackListeners' as any).mockImplementation();

      stream = new MockStream({ audio: true }) as any;
    });

    it('should setup default listeners that react to only "audio" tracks', () => {
      jest.spyOn(stream, 'addEventListener');

      sdkMedia['setupDefaultMediaStreamListeners'](stream);

      expect(stream.addEventListener).toHaveBeenCalledWith('addtrack', expect.any(Function));
      expect(stream.addEventListener).toHaveBeenCalledWith('removetrack', expect.any(Function));

      /* simulate an audio track being added */
      const audioTrack = new MockTrack('audio');
      (stream as any as MockStream)._mockTrackAdded(audioTrack);
      expect(setupDefaultMediaTrackListenersSpy).toHaveBeenCalledWith(stream, audioTrack);

      /* simulate an video track being added */
      const videoTrack = new MockTrack('video');
      (stream as any as MockStream)._mockTrackAdded(videoTrack);
      expect(setupDefaultMediaTrackListenersSpy).not.toHaveBeenCalledWith(stream, videoTrack);

      /* simulate tracks removed (track.kind does not matter) */
      (stream as any as MockStream)._mockTrackRemoved(audioTrack);
      (stream as any as MockStream)._mockTrackRemoved(videoTrack);

      expect(removeDefaultAudioMediaTrackListenersSpy).toHaveBeenCalledWith(audioTrack.id);
      expect(removeDefaultAudioMediaTrackListenersSpy).toHaveBeenCalledWith(videoTrack.id);
    });

    it('should override functions to react to only "audio" tracks and call through to original function', () => {
      const origAddTrack = jest.spyOn(stream, 'addTrack');
      const origRemoveTrack = jest.spyOn(stream, 'removeTrack');

      sdkMedia['setupDefaultMediaStreamListeners'](stream);

      /* simulate an audio track being added */
      const audioTrack = new MockTrack('audio') as any as MediaStreamTrack;
      stream.addTrack(audioTrack);
      expect(setupDefaultMediaTrackListenersSpy).toHaveBeenCalledWith(stream, audioTrack);
      expect(origAddTrack).toHaveBeenCalledWith(audioTrack);

      /* simulate an video track being added */
      const videoTrack = new MockTrack('video') as any as MediaStreamTrack;
      stream.addTrack(videoTrack);
      expect(setupDefaultMediaTrackListenersSpy).not.toHaveBeenCalledWith(stream, videoTrack);
      expect(origAddTrack).toHaveBeenCalledWith(videoTrack);

      /* simulate tracks removed (track.kind does not matter) */
      stream.removeTrack(audioTrack);
      stream.removeTrack(videoTrack);

      expect(removeDefaultAudioMediaTrackListenersSpy).toHaveBeenCalledWith(audioTrack.id);
      expect(removeDefaultAudioMediaTrackListenersSpy).toHaveBeenCalledWith(videoTrack.id);
      expect(origRemoveTrack).toHaveBeenCalledWith(audioTrack);
      expect(origRemoveTrack).toHaveBeenCalledWith(videoTrack);
    });

    it('should reset overridden functions, remove listeners, and stop tracking stream', () => {
      jest.spyOn(stream, 'removeEventListener');

      const origAddTrack = stream.addTrack;
      const origRemoveTrack = stream.removeTrack;

      sdkMedia['setupDefaultMediaStreamListeners'](stream);

      expect(origAddTrack).not.toBe(stream.addTrack);
      expect(origRemoveTrack).not.toBe(stream.removeTrack);

      const overriddenAddTrack = stream.addTrack;
      const overriddenRemoveTrack = stream.removeTrack;

      /* call the reset function */
      const resetFn = sdkMedia['defaultsBeingMonitored'].get(stream.id);
      resetFn!();

      /* remove listeners */
      expect(stream.removeEventListener).toHaveBeenCalledWith('addtrack', expect.any(Function));
      expect(stream.removeEventListener).toHaveBeenCalledWith('removetrack', expect.any(Function));

      /* reset functions */
      expect(stream.addTrack).not.toBe(overriddenAddTrack);
      expect(stream.removeTrack).not.toBe(overriddenRemoveTrack);
    });

    it('should setup listeners for existing tracks on the passed in stream', () => {
      stream = new MockStream(true) as any;

      sdkMedia['setupDefaultMediaStreamListeners'](stream);

      stream.getAudioTracks().forEach(t => expect(setupDefaultMediaTrackListenersSpy).toHaveBeenCalledWith(stream, t));
      stream.getVideoTracks().forEach(t => expect(setupDefaultMediaTrackListenersSpy).not.toHaveBeenCalledWith(stream, t));
    });
  });

  describe('removeDefaultAudioStreamAndListeners()', () => {
    let removeDefaultAudioMediaTrackListenersSpy: jest.SpyInstance;

    beforeEach(() => {
      removeDefaultAudioMediaTrackListenersSpy = jest.spyOn(sdkMedia, 'removeDefaultAudioMediaTrackListeners' as any).mockImplementation();
    });

    it('should do nothing if no default audio stream is found', () => {
      expect(sdk._config.defaults!.audioStream).toBeFalsy();
      sdkMedia['removeDefaultAudioStreamAndListeners']();
      expect(sdk._config.defaults!.audioStream).toBeFalsy();
    });

    it('should remove default listeners on audio tracks and clear out sdk default', () => {
      const stream = new MockStream({ audio: true }) as any as MediaStream;
      sdk._config.defaults!.audioStream = stream;

      expect(sdk._config.defaults!.audioStream).toBe(stream);

      sdkMedia['removeDefaultAudioStreamAndListeners']();

      expect(sdk._config.defaults!.audioStream).toBeFalsy();
      stream.getAudioTracks().forEach(t => expect(removeDefaultAudioMediaTrackListenersSpy).toHaveBeenCalledWith(t.id));
    });

    it('should call the remove function to stop tracking media stream', () => {
      const mockRemoveFn = jest.fn();
      const stream = new MockStream({ audio: true }) as any as MediaStream;
      sdk._config.defaults!.audioStream = stream;
      sdkMedia['defaultsBeingMonitored'].set(stream.id, mockRemoveFn);

      expect(sdk._config.defaults!.audioStream).toBe(stream);

      sdkMedia['removeDefaultAudioStreamAndListeners']();

      expect(mockRemoveFn).toHaveBeenCalled();
    });

  });

  describe('setupDefaultMediaTrackListeners()', () => {
    let stream: MediaStream;
    let audioTrack: MockTrack;

    beforeEach(() => {
      stream = new MockStream({ audio: true }) as any;
      audioTrack = stream.getAudioTracks()[0] as any;
    });

    it('should setup default listeners that react to only "audio" tracks', () => {
      /* it is unlikely we have two audio tracks, but need two for testing */
      const secondAudioTrack = new MockTrack('audio');
      const videoTrack = new MockTrack('video');
      stream.addTrack(secondAudioTrack as any);
      stream.addTrack(videoTrack as any); // having an active video track should not affect this function

      jest.spyOn(audioTrack, 'addEventListener');
      jest.spyOn(audioTrack, 'removeEventListener');
      jest.spyOn(videoTrack, 'removeEventListener');
      jest.spyOn(secondAudioTrack, 'removeEventListener');

      /* this function will call `setupDefaultMediaTrackListeners` for all audio tracks */
      sdkMedia.setDefaultAudioStream(stream);

      expect(audioTrack.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function));

      /* simulate an audio track 'ended' event */
      audioTrack._mockTrackEnded();

      /* should remove listener, remove track from stream, and NOT remove the default stream */
      expect(sdk._config.defaults!.audioStream).toBe(stream);
      expect(audioTrack.removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
      expect(stream.getAudioTracks()).toEqual([secondAudioTrack]);

      /* ending video track should do nothing */
      videoTrack._mockTrackEnded();
      expect(sdk._config.defaults!.audioStream).toBe(stream);
      expect(videoTrack.removeEventListener).not.toHaveBeenCalled();
      expect(stream.getAudioTracks()).toEqual([secondAudioTrack]);

      /* should remove track from stream and reset default since there are no more active audio tracks */
      secondAudioTrack._mockTrackEnded();
      expect(secondAudioTrack.removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
      expect(sdk._config.defaults!.audioStream).toBeFalsy();
    });

    it('should override functions to react to only "audio" tracks and call through to original function', () => {
      const origStop = jest.spyOn(audioTrack, 'stop');

      expect(audioTrack.stop).toBe(origStop);

      /* this function will call `setupDefaultMediaTrackListeners` for all audio tracks */
      sdkMedia.setDefaultAudioStream(stream);
      expect(audioTrack.stop).not.toBe(origStop);

      const overriddenStop = audioTrack.stop;

      audioTrack.stop();
      expect(audioTrack.stop).not.toBe(overriddenStop);
    });
  });

  describe('removeDefaultAudioMediaTrackListeners()', () => {
    it('should call remove function for track', () => {
      const removeFn = jest.fn();
      const track = new MockTrack('audio');

      sdkMedia['defaultsBeingMonitored'].set(track.id, removeFn);

      sdkMedia['removeDefaultAudioMediaTrackListeners'](track.id);
      expect(removeFn).toHaveBeenCalled();
    });

    it('should skip calling the removeFn if one isnt found for the passed in id', () => {
      const removeFn = jest.fn();
      const track = new MockTrack('audio');
      sdkMedia['defaultsBeingMonitored'].set(track.id, () => {});

      sdkMedia['removeDefaultAudioMediaTrackListeners'](track.id);
      expect(removeFn).not.toHaveBeenCalled();
    });
  });
  describe('findCachedDeviceByIdAndKind()', () => {
    afterAll(() => {
      jest.clearAllMocks();
    })
    it('should return the proper device with supplied ID and type (audioinput)', async () => {
      jest.spyOn(sdkMedia, 'getDevices').mockReturnValueOnce(mockedDevices);
      const returnedDevice = sdkMedia.findCachedDeviceByIdAndKind('mockAudioDevice1', 'audioinput');
      expect(returnedDevice).toStrictEqual(mockedDevices[2]);
    });
    it('should return the proper device with supplied ID and type (videoinput)', async () => {
      jest.spyOn(sdkMedia, 'getDevices').mockReturnValueOnce(mockedDevices);
      const returnedDevice = sdkMedia.findCachedDeviceByIdAndKind('mockVideoDevice1', 'videoinput');
      expect(returnedDevice).toStrictEqual(mockedDevices[0]);
    });
    it('should return the proper device with supplied ID and type (other)', async () => {
      jest.spyOn(sdkMedia, 'getDevices').mockReturnValueOnce(mockedDevices);
      const returnedDevice = sdkMedia.findCachedDeviceByIdAndKind('mockOutputDevice1', 'audiooutput');
      expect(returnedDevice).toStrictEqual(mockedDevices[4]);
    })
  });

  describe('removeDefaultAudioMediaTrackListeners()', () => {
    it('should not blow up if removeFn not found', () => {
      sdkMedia['defaultsBeingMonitored'].get = jest.fn().mockReturnValue(null);

      expect(() => sdkMedia['removeDefaultAudioMediaTrackListeners']('testTrackId')).not.toThrow();
    });
  });
});

