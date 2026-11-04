/* global MediaStream */
import * as mediaUtils from '../../../src/media/media-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SimpleMockSdk, MockStream, MockTrack, MockSession } from '../../test-utils';
import { IExtendedMediaSession } from '../../../src/types/interfaces';
import { SdkErrorTypes } from '../../../src/types/enums';

const mockVideoDevice1 = { kind: 'videoinput', deviceId: 'mockVideoDevice1', label: 'Mock Video Device #1' } as MediaDeviceInfo;
const mockVideoDevice2 = { kind: 'videoinput', deviceId: 'mockVideoDevice2', label: 'Mock Video Device #2' } as MediaDeviceInfo;
const mockAudioDevice1 = { kind: 'audioinput', deviceId: 'mockAudioDevice1', label: 'Mock Mic Device #1' } as MediaDeviceInfo;
const mockAudioDevice2 = { kind: 'audioinput', deviceId: 'mockAudioDevice2', label: 'Mock Mic Device #2' } as MediaDeviceInfo;
const mockOutputDevice1 = { kind: 'audiooutput', deviceId: 'mockOutputDevice1', label: 'Mock Speaker Device #1' } as MediaDeviceInfo;
const mockOutputDevice2 = { kind: 'audiooutput', deviceId: 'mockOutputDevice2', label: 'Mock Speaker Device #2' } as MediaDeviceInfo;


let mockSdk: GenesysCloudWebrtcSdk;
beforeEach(() => {
  jest.clearAllMocks();
  mockSdk = new SimpleMockSdk() as any;
});

afterAll(() => {
  jest.clearAllMocks();
});

describe('createNewStreamWithTrack()', () => {
  it('should create a new stream and add the track to it', () => {
    const track = {} as any;
    (window as any).MediaStream = jest.fn();
    mediaUtils.createNewStreamWithTrack(track);
    expect(window.MediaStream).toHaveBeenCalledWith([track]);
  });
});

describe('getOrCreateAudioMediaElement()', () => {
  let element: HTMLAudioElement;

  // need to clean up element
  afterEach(() => {
    if (element) {
      document.body.removeChild(element);
    }
  });

  it('should not create element if one already exists', () => {
    element = document.createElement('audio');
    element.classList.add('__gc-webrtc-inbound');
    document.body.append(element);

    const spy = jest.spyOn(document, 'createElement');

    expect(mediaUtils.getOrCreateAudioMediaElement()).toBe(element);

    expect(spy).not.toHaveBeenCalled();
  });

  it('should create a element', () => {
    const spy = jest.spyOn(document, 'createElement');

    element = mediaUtils.getOrCreateAudioMediaElement();

    expect(spy).toHaveBeenCalled();
    expect(element).toBeTruthy();
  });
});

describe('attachAudioMedia()', () => {
  let playSpy: jest.SpyInstance;

  beforeEach(() => {
    playSpy = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
  });

  it('should create element if not provided', () => {
    const element = document.createElement('audio');
    jest.spyOn(mediaUtils, 'getOrCreateAudioMediaElement').mockReturnValue(element);

    const stream: any = {};

    mediaUtils.attachAudioMedia(mockSdk, stream);

    expect(element.srcObject).toBe(stream);
    expect(mockSdk.logger.warn).not.toHaveBeenCalled();
  });

  it('should use provided element', () => {
    const element = document.createElement('audio');
    jest.spyOn(mediaUtils, 'getOrCreateAudioMediaElement');

    const stream: any = {};

    mediaUtils.attachAudioMedia(mockSdk, stream, 100, element);

    expect(element.srcObject).toBe(stream);
    expect(mediaUtils.getOrCreateAudioMediaElement).not.toHaveBeenCalled();
    expect(mockSdk.logger.warn).not.toHaveBeenCalled();
  });

  it('should warn if audioElement already has a src', () => {
    const stream: any = {};
    const element = document.createElement('audio');
    element.srcObject = stream;
    jest.spyOn(mediaUtils, 'getOrCreateAudioMediaElement');

    mediaUtils.attachAudioMedia(mockSdk, stream, 100, element);

    expect(element.srcObject).toBe(stream);
    expect(mediaUtils.getOrCreateAudioMediaElement).not.toHaveBeenCalled();
    expect(mockSdk.logger.warn).toHaveBeenCalled();
  });

  it('should set the specified volume on the element', () => {
    const element = document.createElement('audio');
    jest.spyOn(mediaUtils, 'getOrCreateAudioMediaElement').mockReturnValue(element);

    const stream: any = {};

    mediaUtils.attachAudioMedia(mockSdk, stream, 25);

    expect(element.volume).toEqual(.25);
  });

  describe('playback when experimentalFeatures.reportRemoteAudioPlaybackBlocked is off', () => {
    it.each([
      ['absent', undefined],
      ['empty', {}],
      ['false', { reportRemoteAudioPlaybackBlocked: false }]
    ])('should not call play() or emit when experimentalFeatures is %s', async (_label, experimentalFeatures) => {
      mockSdk._config.experimentalFeatures = experimentalFeatures as any;
      playSpy.mockRejectedValue(new Error('should not be called'));
      const errors: any[] = [];
      mockSdk.on('sdkError', (e) => errors.push(e));
      const element = document.createElement('audio');
      const stream: any = {};

      expect(mediaUtils.attachAudioMedia(mockSdk, stream, 50, element)).toBe(element);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(playSpy).not.toHaveBeenCalled();
      expect(errors).toHaveLength(0);
      expect(element.volume).toEqual(.5);
      expect(element.autoplay).toBe(true);
      expect(element.srcObject).toEqual({});
    });
  });

  describe('playback when experimentalFeatures.reportRemoteAudioPlaybackBlocked is on', () => {
    const ids = { conversationId: 'convo-1', sessionId: 'session-1' };

    beforeEach(() => {
      mockSdk._config.experimentalFeatures = { reportRemoteAudioPlaybackBlocked: true };
    });

    const domError = (name: string): Error => {
      const error = new Error(`${name} message`);
      error.name = name;
      return error;
    };

    const attachAndCollectErrors = async (): Promise<{ element: HTMLAudioElement, errors: any[], returned: HTMLAudioElement }> => {
      const errors: any[] = [];
      mockSdk.on('sdkError', (e) => errors.push(e));
      const element = document.createElement('audio');
      const stream: any = {};

      const returned = mediaUtils.attachAudioMedia(mockSdk, stream, 50, element, ids);

      // sdkError is emitted on a setTimeout after the rejection settles
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { element, errors, returned };
    };

    it.each(['NotAllowedError', 'AbortError'])('should emit one media sdkError when play() rejects with %s', async (name) => {
      playSpy.mockRejectedValue(domError(name));

      const { errors } = await attachAndCollectErrors();

      expect(playSpy).toHaveBeenCalledTimes(1);
      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe(SdkErrorTypes.media);
      expect(errors[0].message).toBe('Remote audio playback was blocked');
      expect(errors[0].details).toEqual({ conversationId: 'convo-1', sessionId: 'session-1', error: name });
    });

    it('should emit a media sdkError when play() throws synchronously', async () => {
      playSpy.mockImplementation(() => { throw domError('NotSupportedError'); });

      const { errors, returned, element } = await attachAndCollectErrors();

      expect(returned).toBe(element);
      expect(errors).toHaveLength(1);
      expect(errors[0].details).toEqual({ conversationId: 'convo-1', sessionId: 'session-1', error: 'NotSupportedError' });
    });

    it('should emit a media sdkError without an error name when the rejection has none', async () => {
      playSpy.mockRejectedValue(undefined);

      const { errors } = await attachAndCollectErrors();

      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe(SdkErrorTypes.media);
      expect(errors[0].details).toStrictEqual({ conversationId: 'convo-1', sessionId: 'session-1' });
      expect(Object.prototype.hasOwnProperty.call(errors[0].details, 'error')).toBe(false);
    });

    it('should omit details.error when the rejection is an object without a name', async () => {
      playSpy.mockRejectedValue({ message: 'no name' });

      const { errors } = await attachAndCollectErrors();

      expect(errors).toHaveLength(1);
      expect(Object.keys(errors[0].details)).toEqual(['conversationId', 'sessionId']);
    });

    it('should not emit when play() resolves, and still set volume, autoplay and srcObject', async () => {
      const { errors, element } = await attachAndCollectErrors();

      expect(playSpy).toHaveBeenCalledTimes(1);
      expect(errors).toHaveLength(0);
      expect(element.volume).toEqual(.5);
      expect(element.autoplay).toBe(true);
      expect(element.srcObject).toEqual({});
    });

    it('should not emit when play() returns undefined', async () => {
      playSpy.mockReturnValue(undefined);

      const { errors } = await attachAndCollectErrors();

      expect(errors).toHaveLength(0);
    });

    it('should return the element before playback settles', () => {
      playSpy.mockReturnValue(new Promise(() => undefined));
      const element = document.createElement('audio');

      expect(mediaUtils.attachAudioMedia(mockSdk, {} as any, 100, element, ids)).toBe(element);
    });
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
    const stream = new MockStream(true);
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

    expect(mediaUtils.checkHasTransceiverFunctionality()).toBe(true);
  });

  it('should actually do the check', () => {
    let val: boolean | null = null;
    const def = {
      get: () => val,
      set: (newVal: boolean) => val = newVal
    };

    class Fake {
      constructor () {
        this.getTransceivers = jest.fn();
      }
      getTransceivers () { }
      close () { }
      getStats () { return Promise.resolve(); }
    }

    window.RTCPeerConnection = Fake as any;

    Object.defineProperty(mediaUtils, '_hasTransceiverFunctionality', def);
    expect(mediaUtils.checkHasTransceiverFunctionality()).toBe(true);
    expect(val).toBe(true);
  });

  it('should catch errors from getStats after the PC has closed (only in FF, am I right)', async () => {
    let val: boolean|null = null;
    const def = {
      get: () => val,
      set: (newVal: boolean) => val = newVal
    };

    class Fake {
      constructor () {
        this.getTransceivers = jest.fn();
      }
      getTransceivers () { }
      close () { }
      getStats () {
        return Promise.reject().catch((e) => {
          expect('it caught').toBeTruthy();
          throw e;
        })
      }
    }

    window.RTCPeerConnection = Fake as any;

    Object.defineProperty(mediaUtils, '_hasTransceiverFunctionality', def);
    expect(mediaUtils.checkHasTransceiverFunctionality()).toBe(true);
    expect(val).toBe(true);
  });

  it('should gracefully handle the case where getTransceivers doesnt exist', () => {
    let val = null;
    Object.defineProperty(mediaUtils, '_hasTransceiverFunctionality', { get: () => val, set: (v) => val = v });

    (window as any).RTCPeerConnection = null;
    expect(mediaUtils.checkHasTransceiverFunctionality()).toBe(false);
  });
});

describe('logDeviceChange()', () => {
  let setMediaStateDevices: typeof mockSdk.media['setDevices'];
  let action;
  let mockSession: IExtendedMediaSession;
  let expectedBasicInfo;

  beforeEach(() => {
    setMediaStateDevices = mockSdk.media['setDevices'].bind(mockSdk.media);
    mockSession = new MockSession() as any as IExtendedMediaSession;
    action = 'sessionStarted';

    setMediaStateDevices([]);

    /* set the basic log info to avoid repeating the basics a lot */
    expectedBasicInfo = {
      action,
      availableDevices: [],
      sessionId: mockSession.id,
      conversationId: mockSession.conversationId,

      currentVideoDevice: undefined,
      currentAudioDevice: undefined,
      currentOutputDevice: undefined,

      currentVideoTrack: undefined,
      currentAudioTrack: undefined,

      newVideoDevice: undefined,
      newAudioDevice: undefined,
      newOutputDevice: undefined,

      sdkDefaultVideoDeviceId: undefined,
      sdkDefaultAudioDeviceId: undefined,
      sdkDefaultOutputDeviceId: undefined,

      currentAudioElementSinkId: undefined,
      currentSessionSenderTracks: [],
      currentSessionReceiverTracks: [],

      sessionVideoMute: mockSession.videoMuted,
      sessionAudioMute: mockSession.audioMuted,
      hasMicPermissions: false,
      hasCameraPermissions: false,
      hasOutputDeviceSupport: false
    };
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should log basic session information', () => {
    mediaUtils.logDeviceChange(mockSdk, mockSession, action);

    expect(mockSdk.logger.info).toHaveBeenCalledWith('media devices changing for session', expectedBasicInfo);
  });

  it('should skip logging info about screen share tracks', () => {
    const ssStream = new MockStream();
    const ssTrack: any = new MockTrack('video');

    ssTrack.label = 'Screen #1';
    ssStream.addTrack(ssTrack);

    /* setup the mock screenshare sender */
    mockSession._screenShareStream = ssStream as any;
    mockSession.addTrack(ssTrack);

    mediaUtils.logDeviceChange(mockSdk, mockSession, action);

    expect(mockSdk.logger.info).toHaveBeenCalledWith('media devices changing for session', expectedBasicInfo);
  });

  it('should log current devices being used based on track passed in', () => {
    const mockVideoTrack = new MockTrack('video');
    const mockAudioTrack = new MockTrack('audio');
    mockVideoTrack.label = 'Camera that no longer exists';
    mockAudioTrack.label = 'Mic that no longer exists';

    const availableDevices = [
      mockVideoDevice1,
      mockVideoDevice2,
      mockAudioDevice1,
      mockAudioDevice2,
    ];

    /* load the devices into the cache */
    setMediaStateDevices(availableDevices);

    mediaUtils.logDeviceChange(mockSdk, mockSession, action, {
      fromVideoTrack: mockVideoTrack as any,
      fromAudioTrack: mockAudioTrack as any
    });

    expect(mockSdk.logger.info).toHaveBeenCalledWith('media devices changing for session', {
      ...expectedBasicInfo,
      availableDevices,
      currentVideoDevice: { label: mockVideoTrack.label, deviceId: undefined, groupId: undefined },
      currentAudioDevice: { label: mockAudioTrack.label, deviceId: undefined, groupId: undefined },
    });
  });

  it('should log current devices being used', () => {
    /* setup the mock senders */
    const mockVideoTrack = new MockTrack('video');
    const mockAudioTrack = new MockTrack('audio');

    mockVideoTrack.label = mockVideoDevice2.label;
    mockAudioTrack.label = mockAudioDevice2.label;

    mockSession.addTrack(mockVideoTrack as any);
    mockSession.addTrack(mockAudioTrack as any);

    /* setup mock receivers */
    const mockVideoReceiverTrack = new MockTrack('video');
    mockSession.peerConnection['_addReceiver'](mockVideoReceiverTrack);
    mockSession.peerConnection['_addReceiver']({}/* a receiver with a track with no id */);

    mockSession._outputAudioElement = {
      sinkId: mockOutputDevice2.deviceId
    } as any;

    const availableDevices = [
      mockVideoDevice1,
      mockVideoDevice2,
      mockAudioDevice1,
      mockAudioDevice2,
      mockOutputDevice1,
      mockOutputDevice2,
    ];

    /* load the devices into the cache */
    setMediaStateDevices(availableDevices);

    mediaUtils.logDeviceChange(mockSdk, mockSession, action);

    expect(mockSdk.logger.info).toHaveBeenCalledWith('media devices changing for session', {
      ...expectedBasicInfo,
      availableDevices,
      currentVideoDevice: mockVideoDevice2,
      currentAudioDevice: mockAudioDevice2,
      currentOutputDevice: mockOutputDevice2,
      currentVideoTrack: mockVideoTrack,
      currentAudioTrack: mockAudioTrack,
      currentAudioElementSinkId: mockOutputDevice2.deviceId,
      currentSessionSenderTracks: [mockVideoTrack, mockAudioTrack],
      currentSessionReceiverTracks: [mockVideoReceiverTrack]
    });
  });

  it('should log extra info if provided', () => {
    /* setup new devices */
    const requestedVideoDeviceId = 'video-device-id';
    const requestedAudioDeviceId = 'audio-device-id';

    /* setup a new stream */
    const newVideoTrack = new MockTrack('video');
    const newAudioTrack = new MockTrack('audio');
    const newStream = new MockStream();
    newStream.addTrack(newVideoTrack);
    newStream.addTrack(newAudioTrack);

    mediaUtils.logDeviceChange(mockSdk, mockSession, action, {
      requestedNewMediaStream: newStream as any,
      requestedVideoDeviceId,
      requestedAudioDeviceId
    });

    expect(mockSdk.logger.info).toHaveBeenCalledWith('media devices changing for session', {
      ...expectedBasicInfo,
      requestedAudioDeviceId,
      requestedVideoDeviceId,
      requestedNewMediaStreamTracks: newStream.getTracks()
    });
  });

  it('should log new devices', () => {
    /* setup current devices as mock devices #1 */
    const mockVideoTrack = new MockTrack('video');
    mockVideoTrack.label = mockVideoDevice1.label;
    const mockAudioTrack = new MockTrack('audio');
    mockAudioTrack.label = mockAudioDevice1.label;

    mockSession.addTrack(mockVideoTrack as any);
    mockSession.addTrack(mockAudioTrack as any);
    mockSession._outputAudioElement = {
      sinkId: mockOutputDevice1.deviceId
    } as any;

    /* create media tracks for the "new" media using devices #2 */
    const mockToVideoTrack = new MockTrack('video');
    const mockToAudioTrack = new MockTrack('audio');
    mockToVideoTrack.label = mockVideoDevice2.label;
    mockToAudioTrack.label = mockAudioDevice2.label;

    const availableDevices = [
      mockVideoDevice1,
      mockVideoDevice2,
      mockAudioDevice1,
      mockAudioDevice2,
      mockOutputDevice1,
      mockOutputDevice2,
    ];

    /* load the devices into the cache */
    setMediaStateDevices(availableDevices);

    mediaUtils.logDeviceChange(mockSdk, mockSession, action, {
      toVideoTrack: mockToVideoTrack as any,
      toAudioTrack: mockToAudioTrack as any,
      requestedOutputDeviceId: mockOutputDevice2.deviceId
    });

    expect(mockSdk.logger.info).toHaveBeenCalledWith('media devices changing for session', {
      ...expectedBasicInfo,
      availableDevices,
      currentVideoDevice: mockVideoDevice1,
      currentAudioDevice: mockAudioDevice1,
      currentOutputDevice: mockOutputDevice1,
      currentVideoTrack: mockVideoTrack,
      currentAudioTrack: mockAudioTrack,
      newVideoDevice: mockVideoDevice2,
      newAudioDevice: mockAudioDevice2,
      newOutputDevice: mockOutputDevice2,
      newAudioTrack: mockToAudioTrack,
      newVideoTrack: mockToVideoTrack,
      currentAudioElementSinkId: mockOutputDevice1.deviceId,
      currentSessionSenderTracks: mockSession.peerConnection.getSenders().map(s => s.track),
      requestedOutputDeviceId: mockOutputDevice2.deviceId
    });
  });
});
