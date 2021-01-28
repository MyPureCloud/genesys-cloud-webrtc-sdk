/* global MediaStream */
import * as mediaUtils from '../../../src/media/media-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SimpleMockSdk, MockStream, MockTrack, MockSession } from '../../test-utils';
import { IExtendedMediaSession } from '../../../src/types/interfaces';

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

    mediaUtils.attachAudioMedia(mockSdk, stream, element);

    expect(element.srcObject).toBe(stream);
    expect(mediaUtils.getOrCreateAudioMediaElement).not.toHaveBeenCalled();
    expect(mockSdk.logger.warn).not.toHaveBeenCalled();
  });

  it('should warn if audioElement already has a src', () => {
    const stream: any = {};
    const element = document.createElement('audio');
    element.srcObject = stream;
    jest.spyOn(mediaUtils, 'getOrCreateAudioMediaElement');

    mediaUtils.attachAudioMedia(mockSdk, stream, element);

    expect(element.srcObject).toBe(stream);
    expect(mediaUtils.getOrCreateAudioMediaElement).not.toHaveBeenCalled();
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

    expect(mediaUtils.checkHasTransceiverFunctionality()).toBeTruthy();
  });

  it('should actually do the check', () => {
    let val: boolean = null;
    const def = {
      get: () => val,
      set: (newVal) => val = newVal
    };

    class Fake {
      constructor () {
        this.getTransceivers = jest.fn();
      }
      getTransceivers () { }
      close () { }
    }

    window.RTCPeerConnection = Fake as any;

    Object.defineProperty(mediaUtils, '_hasTransceiverFunctionality', def);
    expect(mediaUtils.checkHasTransceiverFunctionality()).toBeTruthy();
    expect(val).toBeTruthy();
  });

  it('should gracefully handle the case where getTransceivers doesnt exist', () => {
    let val = null;
    Object.defineProperty(mediaUtils, '_hasTransceiverFunctionality', { get: () => val, set: (v) => val = v });

    class Fake { }

    window.RTCPeerConnection = null;
    expect(mediaUtils.checkHasTransceiverFunctionality()).toBeFalsy();
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
    mockSession.pc['_addReceiver'](mockVideoReceiverTrack);
    mockSession.pc['_addReceiver']({}/* a receiver with a track with no id */);

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
      currentSessionSenderTracks: mockSession.pc.getSenders().map(s => s.track),
      requestedOutputDeviceId: mockOutputDevice2.deviceId
    });
  });
});
