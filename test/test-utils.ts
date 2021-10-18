
import { EventEmitter } from 'events';

import { IPendingSession, ISdkConfig, ISessionInfo } from '../src/types/interfaces';
import { SessionTypes } from '../src/types/enums';
import { GenesysCloudWebrtcSdk } from '../src/index';
import { SdkMedia } from '../src/media/media';
import { HttpClient } from 'genesys-cloud-streaming-client';

/* spy here and in the constructor because some tests restoreMocks before initializing a SimpleMockSdk */
jest.spyOn(SdkMedia.prototype, 'initialize' as any).mockReturnValue(null);

export class SimpleMockSdk extends EventEmitter {
  constructor () {
    super();
    this.on(EventEmitter.errorMonitor, () => null);

    /* have to spy here to avoid issues with tests that restore mocks before initializing a SimplemockSdk */
    jest.spyOn(SdkMedia.prototype, 'initialize' as any).mockReturnValue(null);
    this.media = new SdkMedia(this as any as GenesysCloudWebrtcSdk);
    this._http = new HttpClient();
  }

  media: SdkMedia;
  _http: HttpClient;
  _config: ISdkConfig = {
    environment: 'mypurecloud.com',
    logLevel: 'debug',
    wsHost: 'wshost',
    allowedSessionTypes: Object.values(SessionTypes),
    defaults: {
      micAutoGainControl: true,
      micEchoCancellation: true,
      micNoiseSuppression: true
    }
  };
  _personDetails = {
    id: 'USER_GUID'
  };
  _logBuffer = [];
  logger = {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  _streamingConnection = {
    notifications: {
      subscribe: jest.fn(),
      unsubscribe: jest.fn()
    },
    webrtcSessions: {
      initiateRtcSession: jest.fn(),
      acceptRtcSession: jest.fn(),
      rejectRtcSession: jest.fn(),
      rtcSessionAccepted: jest.fn(),
      notifyScreenShareStart: jest.fn(),
      notifyScreenShareStop: jest.fn()
    },
    _webrtcSessions: {
      refreshIceServers: jest.fn()
    }
  };
  sessionManager = {
    validateOutgoingMediaTracks: jest.fn()
  };
  setAudioMute = jest.fn();
  updateOutgoingMedia = jest.fn();
}

export class MockSender {
  track: MockTrack;
  constructor (track: MockTrack) {
    this.track = track;
  }
  async replaceTrack (track?: MockTrack): Promise<void> {
    this.track = track;
  }
}

class MockReceiver {
  track: MockTrack;
  constructor (track: MockTrack) {
    this.track = track;
  }
}

class MockTransceiver {
  sender: MockSender;
  receiver: MockReceiver;

  constructor (receiverTrack: MockTrack, senderTrack: MockTrack) {
    this.sender = new MockSender(senderTrack);
    this.receiver = new MockSender(receiverTrack);
  }
}

class MockPC extends EventTarget {
  _mockSession: MockSession;
  _transceivers: MockTransceiver[] = [];
  _senders: MockSender[] = [];
  _receivers: MockReceiver[] = [];
  constructor (session: MockSession) {
    super();
    // this._mockSession = session;
  }

  getTransceivers (): MockTransceiver[] {
    return this._transceivers;
  }

  getSenders (): MockSender[] {
    return this._senders;
  }

  getReceivers (): MockReceiver[] {
    return this._receivers;
  }

  _addTransceiver (receiverTrack: MockTrack, senderTrack: MockTrack): MockTransceiver {
    const transceiver = new MockTransceiver(receiverTrack, senderTrack);
    this._transceivers.push(transceiver);
    this._senders.push(transceiver.sender);
    this._receivers.push(transceiver.receiver);
    return transceiver;
  }

  _addSender (track: MockTrack) {
    this._senders.push(new MockSender(track));
  }

  _addReceiver (track: MockTrack) {
    this._receivers.push(new MockReceiver(track));
  }
}

export class MockSession extends EventEmitter {
  streams: MockStream[] = [];
  tracks: MockTrack[] = [];
  id: any;
  sid = random().toString();
  conversationId = random().toString();
  pc = new MockPC(this);
  _statsGatherer: any;
  _outboundStream: any;
  _screenShareStream: MockStream;
  _outputAudioElement: any;
  sessionType: SessionTypes;
  accept = jest.fn();
  addStream = jest.fn();
  end = jest.fn();
  mute = jest.fn();
  unmute = jest.fn();
  videoMuted: boolean = false;
  audioMuted: boolean = false;
  state = 'active';

  constructor (sessionType?: SessionTypes) {
    super();
    this.id = this.sid;
    this.sessionType = sessionType;
  }
  addTrack (track: MockTrack) {
    // this.tracks.push(track);
    this.pc._addSender(track);
  }
  getTracks (): MockTrack[] {
    return this.pc.getSenders().map(s => s.track).filter(t => !!t);
  }
}

export class MockTrack {
  _listeners: { event: string, callback: Function }[] = [];
  readyState = 'live';
  id = random();
  kind = 'video';
  label: string;
  enabled = true;
  muted = false;
  constructor (kind: 'video' | 'audio' = 'video', label?: string) {
    this.kind = kind;
    this.label = label || '';
  }

  addEventListener (event: string, callback: Function) {
    this._listeners.push({ event, callback });
  }

  _mockTrackEnded () {
    this.stop();
    this._listeners
      .filter(l => l.event === 'ended')
      .forEach(l => l.callback());
  }

  stop = jest.fn().mockImplementation(() => this.readyState = 'ended');
  getSettings = jest.fn().mockReturnValue({ height: 1080, width: 1920, frameRate: 30 });
  applyConstraints = jest.fn();
}

export class MockStream {
  constructor (options:
    Array<MockTrack> |
    { video?: boolean, audio?: boolean } |
    boolean = false) {
    /* if true, add both types of media tracks */
    if (options === true) {
      this._tracks.push(new MockTrack('video'));
      this._tracks.push(new MockTrack('audio'));
    }
    /* array of tracks */
    else if (Array.isArray(options)) {
      this._tracks = options;
    }
    /* we have a `truthy` value */
    else if (options) {
      if (options.video) this._tracks.push(new MockTrack('video'));
      if (options.audio) this._tracks.push(new MockTrack('audio'));
    } /* else `falsey`, don't add any tracks */
  }
  id = random();
  _tracks: MockTrack[] = [];
  getVideoTracks () {
    return this.getTracks().filter((t) => t.kind === 'video');
  }
  getAudioTracks () {
    return this.getTracks().filter((t) => t.kind === 'audio');
  }
  getTracks () {
    return this._tracks;
  }

  addTrack (track) {
    this._tracks.push(track);
  }

  removeTrack (track: MockTrack): void {
    const index = this._tracks.findIndex(t => t.id === track.id);
    this._tracks.splice(index, 1);
  }
}

export class MockAudioContext {
  createMediaStreamSource (stream: MediaStream | MockStream): MockAudioSource {
    return new MockAudioSource();
  }
  createAnalyser (): MockAnalyser {
    return new MockAnalyser();
  }
}

export class MockAudioSource {
  connect (_analyzer: MockAnalyser) { }
}

export class MockAnalyser {
  fftSize: number;
  minDecibels: number;
  maxDecibels: number;
  smoothingTimeConstant: number;
  frequencyBinCount = 10;
  getByteFrequencyData (array: Uint8Array): void { }
}

export function addTrackToMockStream (stream: MockStream, trackKind: 'video' | 'audio'): string {
  const mockTrack = new MockTrack(trackKind);
  stream._tracks.push(mockTrack);
  return mockTrack.id;
}

export function random (): string {
  return `${Math.random()}`.split('.')[1];
}

export function getRandomIntInclusive (min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min); //The maximum is inclusive and the minimum is inclusive
}

export function timeout (n: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, n));
}


export function wait (milliseconds: number = 10): Promise<void> {
  return new Promise(res => setTimeout(res, milliseconds));
}

export function createSessionInfo (): ISessionInfo {
  const roomJid = `${random()}@${random()}.com`;

  return {
    autoAnswer: true,
    conversationId: random().toString(),
    fromJid: roomJid,
    sessionId: random().toString(),
    originalRoomJid: roomJid
  };
}

export function createPendingSession (type: SessionTypes = SessionTypes.softphone): IPendingSession {
  const base = {
    id: random(),
    conversationId: random(),
    autoAnswer: false,
    sessionType: type
  };

  let specifics;
  switch (type) {
    case SessionTypes.acdScreenShare: {
      specifics = { address: `acd-${random()}@org.com` };
      break;
    }
    default: {
      specifics = { address: `${random()}@gjoll.com` };
    }
  }
  return Object.assign(base, specifics);
}
