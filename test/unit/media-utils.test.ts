/* global MediaStream */

import * as mediaUtils from '../../src/media-utils';
import { PureCloudWebrtcSdk } from '../../src/client';
import { SimpleMockSdk, MockStream, MockTrack } from '../test-utils';
import browserama from 'browserama';

let mockSdk: PureCloudWebrtcSdk;
let mediaDevices: any;

beforeEach(() => {
  jest.clearAllMocks();
  mockSdk = new SimpleMockSdk() as any;
  mediaDevices = (window.navigator as any).mediaDevices = {
    getDisplayMedia: jest.fn(),
    getUserMedia: jest.fn()
  };
});

afterAll(() => {
  jest.clearAllMocks();
});

describe('startDisplayMedia', () => {
  describe('getScreenShareConstraints', () => {
    it('should be simple if hasDisplayMedia', async () => {
      Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });

      await mediaUtils.startDisplayMedia();
      const constraints = (mediaDevices.getDisplayMedia as jest.Mock).mock.calls[0][0];

      expect(constraints).toEqual({
        audio: false,
        video: true
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
            maxWidth: window.screen.width,
            maxHeight: window.screen.height,
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

describe('startMedia', () => {
  it('should request audio only', async () => {
    await mediaUtils.startMedia({ audio: true });

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it('should request video only', async () => {
    await mediaUtils.startMedia({ video: true });

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: {}, audio: false });
  });

  it('should request audio and video', async () => {
    await mediaUtils.startMedia();

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: {}, audio: {} });
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
    await mediaUtils.startMedia();

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: { googNoiseReduction: true }, audio: expectedAudioConstraints });
  });
});

describe('createNewStreamWithTrack', () => {
  it('should create a new stream and add the track to it', () => {
    const track = {} as any;
    (window as any).MediaStream = function () {};
    MediaStream.prototype.addTrack = jest.fn();
    const spy = jest.spyOn(MediaStream.prototype, 'addTrack').mockImplementation();
    const stream = mediaUtils.createNewStreamWithTrack(track);
    expect(spy).toHaveBeenCalledWith(track);
  });
});

describe('createAudioMediaElement', () => {
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

describe('attachAudioMedia', () => {
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

describe('checkAllTracksHaveEnded', () => {
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

describe('checkHasTransceiverFunctionality', () => {
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
