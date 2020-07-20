/* global MediaStream */

import * as mediaUtils from '../../src/media-utils';
import { GenesysCloudWebrtcSdk } from '../../src/client';
import { SimpleMockSdk, MockStream, MockTrack } from '../test-utils';
import browserama from 'browserama';
import { IEnumeratedDevices } from '../../src/types/interfaces';
import { SdkErrorTypes } from '../../src/types/enums';
import { hasOutputDeviceSupport } from '../../src/media-utils';

const defaultResolution = {
  height: {
    ideal: 2160
  },
  width: {
    ideal: 4096
  }
};
const mockVideoDevice1 = { kind: 'videoinput', deviceId: 'mockVideoDevice1' } as MediaDeviceInfo;
const mockVideoDevice2 = { kind: 'videoinput', deviceId: 'mockVideoDevice2' } as MediaDeviceInfo;
const mockAudioDevice1 = { kind: 'audioinput', deviceId: 'mockAudioDevice1' } as MediaDeviceInfo;
const mockAudioDevice2 = { kind: 'audioinput', deviceId: 'mockAudioDevice2' } as MediaDeviceInfo;
const mockOutputDevice1 = { kind: 'audiooutput', deviceId: 'mockOutputDevice1' } as MediaDeviceInfo;
const mockOutputDevice2 = { kind: 'audiooutput', deviceId: 'mockOutputDevice2' } as MediaDeviceInfo;
const mockedDevices = [
  mockVideoDevice1,
  mockVideoDevice2,
  mockAudioDevice1,
  mockAudioDevice2,
  mockOutputDevice1,
  mockOutputDevice2
];

let mockSdk: GenesysCloudWebrtcSdk;
let mediaDevices: {
  getDisplayMedia: jest.SpyInstance,
  getUserMedia: jest.SpyInstance,
  enumerateDevices: jest.SpyInstance
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSdk = new SimpleMockSdk() as any;
  mediaDevices = (window.navigator as any).mediaDevices = {
    getDisplayMedia: jest.fn(),
    getUserMedia: jest.fn(),
    enumerateDevices: jest.fn().mockResolvedValue(mockedDevices),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  };
});

afterAll(() => {
  jest.clearAllMocks();
});

describe('startDisplayMedia()', () => {
  describe('getScreenShareConstraints', () => {
    it('should be simple if hasDisplayMedia', async () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });

      await mediaUtils.startDisplayMedia();
      const constraints = (mediaDevices.getDisplayMedia as jest.Mock).mock.calls[0][0];

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
      delete mediaDevices.getDisplayMedia;
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });

      await mediaUtils.startDisplayMedia();
      const constraints = (mediaDevices.getUserMedia as jest.Mock).mock.calls[0][0];

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

      await mediaUtils.startDisplayMedia();
      const constraints = (mediaDevices.getDisplayMedia as jest.Mock).mock.calls[0][0];

      expect(constraints).toEqual({
        audio: false,
        video: {
          mediaSource: 'window'
        }
      });
    });
  });

  it('should use getDisplayMedia if available', async () => {
    await mediaUtils.startDisplayMedia();

    expect(mediaDevices.getDisplayMedia).toHaveBeenCalled();
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('should use getUserMedia if no getUserMedia', async () => {
    delete mediaDevices.getDisplayMedia;

    await mediaUtils.startDisplayMedia();

    expect(mediaDevices.getUserMedia).toHaveBeenCalled();
  });
});

describe('startMedia()', () => {
  it('should log with conversationId if session is provided', async () => {
    const conversationId = '123Convo';

    await mediaUtils.startMedia(mockSdk, { audio: true, session: { conversationId } as any });
    expect(mockSdk.logger.info).toHaveBeenCalledWith(expect.stringContaining('Using the system default audioinput'), { conversationId });
  });

  it('should request audio only', async () => {
    await mediaUtils.startMedia(mockSdk, { audio: true });

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: {}, video: false });
  });

  it('should request video only with default resolution', async () => {
    await mediaUtils.startMedia(mockSdk, { video: true });

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: Object.assign({ frameRate: { ideal: 30 } }, defaultResolution),
      audio: false
    });
  });

  it('should request video only custom resolution', async () => {
    const resolution = {
      width: {
        ideal: 555
      },
      height: {
        ideal: 333
      }
    };

    await mediaUtils.startMedia(mockSdk, { video: true, videoResolution: resolution });

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: Object.assign({ frameRate: { ideal: 30 } }, resolution), audio: false });
  });

  it('should request audio and video', async () => {
    await mediaUtils.startMedia(mockSdk);

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: Object.assign({ frameRate: { ideal: 30 } }, defaultResolution), audio: {} });
  });

  it('should request audio and video in chrome', async () => {
    Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });

    const expectedAudioConstraints = {
      googAudioMirroring: false,
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
      googDucking: false,
      googHighpassFilter: true
    };
    await mediaUtils.startMedia(mockSdk);

    const expected = Object.assign({ frameRate: { ideal: 30 }, googNoiseReduction: true }, defaultResolution);

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: expected, audio: expectedAudioConstraints });
  });

  it('should request audio and video by deviceId', async () => {
    const videoDeviceId = mockVideoDevice2.deviceId;
    const audioDeviceId = mockAudioDevice1.deviceId;
    const expectedConstraints = {
      video: Object.assign({ frameRate: { ideal: 30 }, deviceId: { exact: videoDeviceId } }, defaultResolution),
      audio: { deviceId: { exact: audioDeviceId } },
    };

    Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });

    await mediaUtils.startMedia(mockSdk, { video: videoDeviceId, audio: audioDeviceId });

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(expectedConstraints);
    Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });
  });

  it('should use the requested frameRate', async () => {
    const videoDeviceId = mockVideoDevice2.deviceId;
    const audioDeviceId = mockAudioDevice1.deviceId;
    const expectedConstraints = {
      video: Object.assign({ frameRate: { ideal: 10 }, deviceId: { exact: videoDeviceId } }, defaultResolution),
      audio: { deviceId: { exact: audioDeviceId } },
    };

    Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });

    await mediaUtils.startMedia(mockSdk, { video: videoDeviceId, audio: audioDeviceId, videoFrameRate: { ideal: 10 } });

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(expectedConstraints);
    Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });
  });

  it('should log if the requested audio/video deviceId cannot be found', async () => {
    const videoDeviceId = 'video-device-that-does-not-exist';
    const audioDeviceId = 'audio-device-that-does-not-exist';
    const expectedConstraints = {
      video: Object.assign({ frameRate: { ideal: 30 } }, defaultResolution),
      audio: {},
    };

    Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });

    await mediaUtils.startMedia(mockSdk, { video: videoDeviceId, audio: audioDeviceId });

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(expectedConstraints);
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unable to find requested audioinput'), { deviceId: audioDeviceId, conversationId: undefined });
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unable to find requested videoinput'), { deviceId: videoDeviceId, conversationId: undefined });

    Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });
  });
});

describe('createNewStreamWithTrack()', () => {
  it('should create a new stream and add the track to it', () => {
    const track = {} as any;
    (window as any).MediaStream = function () { };
    MediaStream.prototype.addTrack = jest.fn();
    const spy = jest.spyOn(MediaStream.prototype, 'addTrack').mockImplementation();
    const stream = mediaUtils.createNewStreamWithTrack(track);
    expect(spy).toHaveBeenCalledWith(track);
  });
});

describe('createAudioMediaElement()', () => {
  let element: HTMLAudioElement;

  // need to clean up element
  afterEach(() => {
    if (element) {
      document.body.removeChild(element);
    }
  });

  it('should not create element if one already exists', () => {
    element = document.createElement('audio');
    element.classList.add('__pc-webrtc-inbound');
    document.body.append(element);

    const spy = jest.spyOn(document, 'createElement');

    expect(mediaUtils.createAudioMediaElement()).toBe(element);

    expect(spy).not.toHaveBeenCalled();
  });

  it('should create a element', () => {
    const spy = jest.spyOn(document, 'createElement');

    element = mediaUtils.createAudioMediaElement();

    expect(spy).toHaveBeenCalled();
    expect(element).toBeTruthy();
  });
});

describe('attachAudioMedia()', () => {
  it('should create element if not provided', () => {
    const element = document.createElement('audio');
    jest.spyOn(mediaUtils, 'createAudioMediaElement').mockReturnValue(element);

    const stream: any = {};

    mediaUtils.attachAudioMedia(mockSdk, stream);

    expect(element.srcObject).toBe(stream);
    expect(mockSdk.logger.warn).not.toHaveBeenCalled();
  });

  it('should use provided element', () => {
    const element = document.createElement('audio');
    jest.spyOn(mediaUtils, 'createAudioMediaElement');

    const stream: any = {};

    mediaUtils.attachAudioMedia(mockSdk, stream, element);

    expect(element.srcObject).toBe(stream);
    expect(mediaUtils.createAudioMediaElement).not.toHaveBeenCalled();
    expect(mockSdk.logger.warn).not.toHaveBeenCalled();
  });

  it('should warn if audioElement already has a src', () => {
    const stream: any = {};
    const element = document.createElement('audio');
    element.srcObject = stream;
    jest.spyOn(mediaUtils, 'createAudioMediaElement');

    mediaUtils.attachAudioMedia(mockSdk, stream, element);

    expect(element.srcObject).toBe(stream);
    expect(mediaUtils.createAudioMediaElement).not.toHaveBeenCalled();
    expect(mockSdk.logger.warn).toHaveBeenCalled();
  });
});

describe('checkAllTracksHaveEnded()', () => {
  it('should be true if no tracks', () => {
    const stream = new MockStream();
    stream._tracks = [];
    expect(mediaUtils.checkAllTracksHaveEnded(stream as any)).toBeTruthy();
  });

  it('should be true if all tracks ended', () => {
    const stream = new MockStream();
    stream._tracks.forEach(track => track.readyState = 'ended');
    expect(mediaUtils.checkAllTracksHaveEnded(stream as any)).toBeTruthy();
  });

  it('should be true if a track hasnt ended', () => {
    const stream = new MockStream();
    stream._tracks.forEach(track => track.readyState = 'ended');
    const activeTrack = new MockTrack();
    activeTrack.readyState = 'active';
    stream._tracks.push(activeTrack);
    expect(mediaUtils.checkAllTracksHaveEnded(stream as any)).toBeFalsy();
  });
});

describe('checkHasTransceiverFunctionality()', () => {
  it('should use existing value', () => {
    let val: boolean = true;
    const def = {
      get: () => val
    };
    Object.defineProperty(mediaUtils, '_hasTransceiverFunctionality', def);

    expect(mediaUtils.checkHasTransceiverFunctionality()).toBeTruthy();
  });

  it('should actually do the check', () => {
    let val: boolean = null;
    const def = {
      get: () => val,
      set: (newVal) => val = newVal
    };

    class Fake {
      getTransceivers () {

      }
      constructor () {
        this.getTransceivers = jest.fn();
      }
    }

    window.RTCPeerConnection = Fake as any;

    Object.defineProperty(mediaUtils, '_hasTransceiverFunctionality', def);
    expect(mediaUtils.checkHasTransceiverFunctionality()).toBeTruthy();
    expect(val).toBeTruthy();
  });

  it('should gracefully handle the case where getTransceivers doesnt exist', () => {
    Object.defineProperty(mediaUtils, '_hasTransceiverFunctionality', { get: () => false });

    class Fake { }

    window.RTCPeerConnection = Fake as any;
    expect(mediaUtils.checkHasTransceiverFunctionality()).toBeFalsy();
  });
});

describe('getEnumeratedDevices()', () => {
  const resetEnumeratedDevicesCache = async (devices?: { deviceId: string, kind: string }[]) => {
    // need to call the devicechange handler to reset the `refreshDevices` property
    mediaUtils.stopListeningForDeviceChanges();
    await mediaUtils.handleDeviceChange.call(mockSdk);

    jest.resetAllMocks();
    mediaDevices.enumerateDevices.mockResolvedValue(devices || mockedDevices);
  };

  afterEach(async () => {
    await resetEnumeratedDevicesCache();
  });

  it('should log a warning if mediaDevices cannot be enumerated', async () => {
    const expectedEnumeratedDevices: IEnumeratedDevices = {
      videoDevices: [],
      audioDevices: [],
      outputDevices: []
    };

    mediaDevices.enumerateDevices = undefined;
    const devices = await mediaUtils.getEnumeratedDevices(mockSdk);

    expect(mockSdk.logger.warn).toBeCalledWith(expect.stringContaining('Unable to enumerate devices'));
    expect(devices).toEqual(expectedEnumeratedDevices);

    mediaDevices.enumerateDevices = jest.fn();
  });

  it('should set devicechange listener only once', async () => {
    const addEventListener = window.navigator.mediaDevices.addEventListener;
    expect(addEventListener).not.toHaveBeenCalled();

    await mediaUtils.getEnumeratedDevices(mockSdk);
    expect(addEventListener).toHaveBeenCalled();

    const cb = (addEventListener as jest.Mock).mock.calls[0][1];
    cb();
    expect(mockSdk.logger.debug).toHaveBeenCalledWith(expect.stringContaining('devices changed'));

    (addEventListener as jest.Mock).mockReset();
    await mediaUtils.getEnumeratedDevices(mockSdk);
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('should return cached enumeratedDevices if the devices have not changed', async () => {
    const videoDeviceCached = { deviceId: 'cached-video-device', label: 'device #1', kind: 'videoinput' } as MediaDeviceInfo;
    const audioDeviceCached = { deviceId: 'cached-audio-device', label: 'device #2', kind: 'audioinput' } as MediaDeviceInfo;
    const outputDeviceCached = { deviceId: 'cached-output-device', label: 'device #3', kind: 'audiooutput' } as MediaDeviceInfo;

    const expectedEnumeratedDevices: IEnumeratedDevices = {
      videoDevices: [videoDeviceCached],
      audioDevices: [audioDeviceCached],
      outputDevices: [outputDeviceCached]
    };

    mediaDevices.enumerateDevices.mockReset();
    mediaDevices.enumerateDevices.mockResolvedValue([videoDeviceCached, audioDeviceCached, outputDeviceCached]);

    /* first call will load the cache */
    let devices = await mediaUtils.getEnumeratedDevices(mockSdk);

    expect(devices).toEqual(expectedEnumeratedDevices);
    expect((mockSdk.logger.debug as jest.Mock).mock.calls[0]).toEqual([
      'Enumerated devices',
      { devices: expectedEnumeratedDevices }
    ]);
    expect(mediaDevices.enumerateDevices).toBeCalled();

    /* second call should use the cached value */
    mediaDevices.enumerateDevices.mockReset();
    mediaDevices.enumerateDevices.mockResolvedValue(mockedDevices);
    devices = await mediaUtils.getEnumeratedDevices(mockSdk);

    expect(devices).toEqual(expectedEnumeratedDevices);
    expect(mockSdk.logger.debug).toBeCalledWith(
      expect.stringContaining('Returning cached enumerated devices'),
      { devices: expectedEnumeratedDevices }
    );
    expect(mediaDevices.enumerateDevices).not.toBeCalled();
  });

  it('should keep old devices if the same device is enumerated without a label (this happens in FF)', async () => {
    const videoDeviceCached = { deviceId: 'cached-video-device', groupId: 'groupId1', label: 'device #1', kind: 'videoinput' } as MediaDeviceInfo;

    const expectedEnumeratedDevices: IEnumeratedDevices = {
      videoDevices: [videoDeviceCached],
      audioDevices: [],
      outputDevices: []
    };

    mediaDevices.enumerateDevices.mockReset();
    mediaDevices.enumerateDevices.mockResolvedValue([videoDeviceCached]);

    /* first call will load the cache */
    let devices = await mediaUtils.getEnumeratedDevices(mockSdk);

    expect(devices).toEqual(expectedEnumeratedDevices);
    expect((mockSdk.logger.debug as jest.Mock).mock.calls[0]).toEqual([
      'Enumerated devices',
      { devices: expectedEnumeratedDevices }
    ]);
    expect(mediaDevices.enumerateDevices).toBeCalled();

    /* second call with devices that don't have labels should use the old devices */
    mediaDevices.enumerateDevices.mockReset();
    const copyOfVideoDeviceCached = { ...videoDeviceCached, label: '' } as MediaDeviceInfo;
    mediaDevices.enumerateDevices.mockResolvedValue([copyOfVideoDeviceCached]);

    devices = await mediaUtils.getEnumeratedDevices(mockSdk, true);

    expect(devices).toEqual(expectedEnumeratedDevices);
  });

  it('should return enumerated devices', async () => {
    const expectedEnumeratedDevices: IEnumeratedDevices = {
      videoDevices: [mockVideoDevice1, mockVideoDevice2],
      audioDevices: [mockAudioDevice1, mockAudioDevice2],
      outputDevices: [mockOutputDevice1, mockOutputDevice2]
    };

    const devices = await mediaUtils.getEnumeratedDevices(mockSdk);

    expect(devices).toEqual(expectedEnumeratedDevices);
    expect(mediaDevices.enumerateDevices).toBeCalled();
  });

  it('should throw if enumerateDevices() fails', async () => {
    mediaDevices.enumerateDevices.mockImplementation(() => { throw new Error('Failure'); })

    try {
      const val = await mediaUtils.getEnumeratedDevices(mockSdk);
      console.log({ val });
      fail('it should have thrown');
    } catch (e) {
      expect(e.type).toBe(SdkErrorTypes.generic);
    }
  });
});

describe('getValidDeviceId()', () => {
  it('should return the found deviceId for specific kinds', async () => {
    /* audio device */
    let result = await mediaUtils.getValidDeviceId(mockSdk, 'audioinput', mockAudioDevice1.deviceId);
    expect(result).toBe(mockAudioDevice1.deviceId);

    /* video device */
    result = await mediaUtils.getValidDeviceId(mockSdk, 'videoinput', mockVideoDevice1.deviceId);
    expect(result).toBe(mockVideoDevice1.deviceId);

    /* output device */
    result = await mediaUtils.getValidDeviceId(mockSdk, 'audiooutput', mockOutputDevice1.deviceId);
    expect(result).toBe(mockOutputDevice1.deviceId);
  });

  it('should use the sdk default deviceId if the request deviceId cannot be found', async () => {
    mockSdk._config.defaultAudioDeviceId = mockAudioDevice1.deviceId;
    mockSdk._config.defaultVideoDeviceId = mockVideoDevice1.deviceId;
    mockSdk._config.defaultOutputDeviceId = mockOutputDevice1.deviceId;

    /* audio device */
    let result = await mediaUtils.getValidDeviceId(mockSdk, 'audioinput', 'non-existent-device-id');
    expect(result).toBe(mockAudioDevice1.deviceId);

    /* video device */
    result = await mediaUtils.getValidDeviceId(mockSdk, 'videoinput', 'non-existent-device-id');
    expect(result).toBe(mockVideoDevice1.deviceId);

    /* output device */
    result = await mediaUtils.getValidDeviceId(mockSdk, 'audiooutput', 'non-existent-device-id');
    expect(result).toBe(mockOutputDevice1.deviceId);
  });

  it('should return `undefined` if no deviceId can be found', async () => {
    mockSdk._config.defaultAudioDeviceId = null;
    mockSdk._config.defaultVideoDeviceId = null;

    /* audio device */
    let result = await mediaUtils.getValidDeviceId(mockSdk, 'audioinput', 'non-existent-device-id');
    expect(result).toBe(undefined);

    /* video device */
    result = await mediaUtils.getValidDeviceId(mockSdk, 'videoinput', 'non-existent-device-id');
    expect(result).toBe(undefined);
  });

  it("should return default 'audiooutput' device if no deviceId can be found", async () => {
    mockSdk._config.defaultOutputDeviceId = null;

    /* output device */
    const result = await mediaUtils.getValidDeviceId(mockSdk, 'audiooutput', 'non-existent-device-id');
    expect(result).toBe(mockOutputDevice1.deviceId);
  });
});

describe('hasOutputDeviceSupport()', () => {
  let OriginalHTMLMediaElement: typeof HTMLMediaElement;
  let hasOwnPropertySpy: jest.SpyInstance;

  beforeEach(() => {
    OriginalHTMLMediaElement = window.HTMLMediaElement;
    hasOwnPropertySpy = jest.fn();
    Object.defineProperty(window, 'HTMLMediaElement', {
      value: {
        prototype: {
          hasOwnProperty: hasOwnPropertySpy
        }
      }
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'HTMLMediaElement', { value: OriginalHTMLMediaElement });
  });

  it('should return true for supported browsers', () => {
    hasOwnPropertySpy.mockReturnValue(true);
    expect(hasOutputDeviceSupport()).toBe(true);
    expect(hasOwnPropertySpy).toHaveBeenCalledWith('setSinkId');
  });

  it('should return false for non-supported browsers', () => {
    hasOwnPropertySpy.mockReturnValue(false);
    expect(hasOutputDeviceSupport()).toBe(false);
    expect(hasOwnPropertySpy).toHaveBeenCalledWith('setSinkId');
  });
});
