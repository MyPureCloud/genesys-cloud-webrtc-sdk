/* eslint @typescript-eslint/no-explicit-any: "off" */
import { Logger } from 'genesys-cloud-client-logger';
import { EventEmitter } from 'events';

import * as windows11Utils from '../../src/windows11-first-session-hack';
import { GenesysCloudWebrtcSdk, ISdkConfig, SessionTypes } from '../../src';
import { SdkMedia } from '../../src/media/media';
import { SdkErrorTypes } from '../../src/types/enums';
import { SdkError } from '../../src/utils';
import { installHttpMockServer, seedAuthenticatedInit } from './support/black-box-harness';
import { MockSession, MockStream, MockTrack, flushPromises } from '../test-utils';

jest.mock('../../src/media/media');

/* sessions the mocked streaming client is tracking; it forgets a session once it terminates */
const mockSessions: any[] = [];

/**
 * Integration tests for the customer's remote video in a video conference.
 *
 * Boots the REAL GenesysCloudWebrtcSdk (real SessionManager and video handler)
 * against the mock API server, and mocks only external systems: the
 * streaming-client transport, the SdkMedia device layer and the browser's
 * MediaStream and RTCPeerConnection. jsdom does not play media, so a test
 * dispatches the video element's `playing` event where a browser would, and
 * asserts what the SDK does with the element and the public `sdkError` event.
 */
jest.mock('genesys-cloud-streaming-client', () => {
  const actualDep = jest.requireActual('genesys-cloud-streaming-client');
  return {
    ...actualDep,
    __esModule: true,
    default: function () {
      this.notifications = Object.assign(
        new EventEmitter(),
        {
          subscribe: jest.fn().mockResolvedValue(null),
          unsubscribe: jest.fn().mockResolvedValue(null)
        }
      );
      this._notifications = this.notifications;

      this.webrtcSessions = Object.assign(
        new EventEmitter(),
        {
          getAllSessions: jest.fn(() => mockSessions),
          proxyNRStat: jest.fn(),
          acceptRtcSession: jest.fn(),
          rtcSessionAccepted: jest.fn()
        }
      );
      this._webrtcSessions = this.webrtcSessions;

      this.messenger = Object.assign(new EventEmitter(), { broadcastMessage: jest.fn() });

      this.connect = jest.fn().mockImplementation(() => {
        this.connected = true;
        this.emit('connected');
        return Promise.resolve();
      });

      this.disconnect = jest.fn().mockResolvedValue(null);

      const ev = new EventEmitter();
      Object.getOwnPropertyNames(EventEmitter.prototype).forEach(name => {
        if (name !== 'constructor') {
          this[name] = ev[name];
        }
      });
    }
  };
});

describe('Video conference remote video release and report (integration)', () => {
  const api = installHttpMockServer();
  const REMOTE_VIDEO_WAIT_MS = 10000;
  /* the user /users/me returns in seedAuthenticatedInit */
  const localUserId = 'userId';
  let sdk: GenesysCloudWebrtcSdk;
  let originalMediaStream: any;
  let originalPeerConnection: any;

  const mockLogger: jest.Mocked<Logger> = {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    setAccessToken: jest.fn()
  } as any;

  /* Genesys-internal gate; absent or false leaves develop behaviour unchanged */
  const remoteVideoOn: Partial<ISdkConfig> = { experimentalFeatures: { releaseAndReportRemoteVideo: true } };

  const constructSdk = async (overrides: Partial<ISdkConfig> = {}): Promise<GenesysCloudWebrtcSdk> => {
    seedAuthenticatedInit(api);
    sdk = new GenesysCloudWebrtcSdk({
      logger: mockLogger as any,
      accessToken: 'secure',
      environment: api.baseUrl,
      optOutOfTelemetry: true,
      autoConnectSessions: false,
      ...overrides
    } as any);

    await sdk.initialize();
    return sdk;
  };

  const settle = async (): Promise<void> => {
    await flushPromises();
    await flushPromises();
    await flushPromises();
  };

  const stubConversation = (conversationId: string, customerVideoMuted: boolean) => {
    const video = (id: string, videoMuted: boolean) => ({
      id, state: 'connected', audioMuted: false, videoMuted, sharingScreen: false, peerCount: 1, context: 'room'
    });
    api.stub('get', new RegExp(`/conversations/${conversationId}$`), {
      status: 200,
      body: {
        id: conversationId,
        participants: [
          { id: 'agent-participant', purpose: 'user', userId: localUserId, videos: [video('agent-video', false)], calls: [] },
          { id: 'customer-participant', purpose: 'customer', userId: 'customer-user', videos: [video('customer-video', customerVideoMuted)], calls: [] }
        ]
      }
    });
  };

  /**
   * Start a conference through the public API and deliver its session the way
   * streaming-client does: propose (accepted automatically because this client
   * requested the room), then the jingle session carrying the customer's video.
   */
  const startConference = async (options: { customerVideoMuted?: boolean } = {}): Promise<MockSession> => {
    const roomJid = `${globalThis.crypto.randomUUID()}@conference.example.com`;
    const conversationId = globalThis.crypto.randomUUID();
    const sessionId = globalThis.crypto.randomUUID();
    api.stub('post', /\/conversations\/videos$/, { status: 200, body: { conversationId } });
    stubConversation(conversationId, !!options.customerVideoMuted);

    await sdk.startVideoConference(roomJid);

    /* the SDK binds its webrtc listeners to the streaming connection itself (client-private.ts) */
    const transport = sdk._streamingConnection as unknown as EventEmitter;
    transport.emit('requestIncomingRtcSession', {
      sessionId,
      id: sessionId,
      conversationId,
      autoAnswer: false,
      fromJid: roomJid,
      toJid: 'user@jid.com',
      originalRoomJid: roomJid,
      sessionType: SessionTypes.collaborateVideo
    });
    await settle();
    expect(sdk._streamingConnection.webrtcSessions.acceptRtcSession).toHaveBeenCalledWith(sessionId);

    const session = new MockSession(SessionTypes.collaborateVideo);
    session.id = sessionId;
    session.sid = sessionId;
    session.conversationId = conversationId;
    session.peerID = roomJid;
    session.originalRoomJid = roomJid;
    session.end.mockImplementation(() => session.emit('terminated', { condition: 'success' }));
    session.peerConnection._addReceiver(new MockTrack('audio'));
    session.peerConnection._addReceiver(new MockTrack('video'));
    session.once('terminated', () => mockSessions.splice(mockSessions.indexOf(session), 1));
    mockSessions.push(session);

    transport.emit('incomingRtcSession', session);
    await settle();
    return session;
  };

  /** Accept through the public API; the handler fetches conversation state 500 ms later. */
  const acceptConference = async (session: MockSession, videoElement: HTMLVideoElement): Promise<void> => {
    const participantsUpdated = new Promise(resolve => session.once('participantsUpdate', resolve));
    await sdk.acceptSession({ conversationId: session.conversationId, audioElement: document.createElement('audio'), videoElement });

    jest.advanceTimersByTime(500);
    await participantsUpdated;
  };

  /** Advance past the wait and the setTimeout(0) that sdkError is emitted on. */
  const expireWait = async (): Promise<void> => {
    jest.advanceTimersByTime(REMOTE_VIDEO_WAIT_MS);
    jest.advanceTimersByTime(1);
    await settle();
  };

  const collectSessionErrors = (): SdkError[] => {
    const errors: SdkError[] = [];
    sdk.on('sdkError', (error: SdkError) => {
      if (error.type === SdkErrorTypes.session) {
        errors.push(error);
      }
    });
    return errors;
  };

  beforeEach(() => {
    mockSessions.length = 0;
    jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockResolvedValue();
    jest.mocked(SdkMedia.prototype.getState).mockReturnValue({ hasOutputDeviceSupport: false, hasCamera: true, hasMic: true, devices: [] } as any);
    /* the agent's camera and microphone, from the mocked device layer */
    jest.mocked(SdkMedia.prototype.startMedia).mockResolvedValue(new MockStream({ audio: true, video: true }) as any);
    originalMediaStream = (window as any).MediaStream;
    (window as any).MediaStream = MockStream;
    /* jsdom has no RTCPeerConnection; the SDK probes it once for transceiver support */
    originalPeerConnection = (window as any).RTCPeerConnection;
    (window as any).RTCPeerConnection = class {
      getTransceivers () { return []; }
      addTransceiver () { /* no-op */ }
      getStats () { return Promise.resolve({}); }
      close () { /* no-op */ }
    };
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (sdk) {
      await sdk.destroy();
      sdk = undefined as any;
    }
    jest.restoreAllMocks();
    (window as any).MediaStream = originalMediaStream;
    (window as any).RTCPeerConnection = originalPeerConnection;
  });

  /* real I/O (the mock API server) keeps working while the SDK's own timers are faked */
  const fakeSdkTimers = () => jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

  it('releasesTheCustomerVideoWhenTheSessionTerminates', async () => {
    await constructSdk(remoteVideoOn);
    const session = await startConference();
    fakeSdkTimers();
    const videoElement = document.createElement('video');

    await acceptConference(session, videoElement);
    expect(videoElement.srcObject).toBeInstanceOf(MockStream);
    expect((videoElement.srcObject as any).getVideoTracks()).toHaveLength(1);

    session.emit('terminated', { condition: 'success' });

    expect(videoElement.srcObject).toBeNull();
  });

  it('reportsOneSessionErrorWhenTheCustomerVideoDoesNotPlay', async () => {
    await constructSdk(remoteVideoOn);
    const errors = collectSessionErrors();
    const session = await startConference();
    fakeSdkTimers();

    await acceptConference(session, document.createElement('video'));
    jest.advanceTimersByTime(REMOTE_VIDEO_WAIT_MS - 1000);
    await settle();
    expect(errors).toHaveLength(0);

    await expireWait();
    await expireWait();

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Remote video was not received');
    expect(errors[0].details).toEqual({ conversationId: session.conversationId, sessionId: session.id });
  });

  it('reportsNothingWhenTheCustomerVideoPlays', async () => {
    await constructSdk(remoteVideoOn);
    const errors = collectSessionErrors();
    const session = await startConference();
    fakeSdkTimers();
    const videoElement = document.createElement('video');

    await acceptConference(session, videoElement);
    videoElement.dispatchEvent(new Event('playing'));
    await expireWait();

    expect(errors).toHaveLength(0);
  });

  it('reportsNothingWhenTheSessionEndsBeforeTheWait', async () => {
    await constructSdk(remoteVideoOn);
    const errors = collectSessionErrors();
    const session = await startConference();
    fakeSdkTimers();

    await acceptConference(session, document.createElement('video'));
    session.emit('terminated', { condition: 'success' });
    await expireWait();

    expect(mockSessions).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it('reportsNothingWhenTheCustomerCameraIsOff', async () => {
    await constructSdk(remoteVideoOn);
    const errors = collectSessionErrors();
    const session = await startConference({ customerVideoMuted: true });
    fakeSdkTimers();

    await acceptConference(session, document.createElement('video'));
    await expireWait();

    expect(errors).toHaveLength(0);
  });

  it.each([
    ['absent', {}],
    ['false', { experimentalFeatures: { releaseAndReportRemoteVideo: false } }]
  ])('keepsDevelopBehaviourWhenTheExperimentalFeatureIs %s', async (_label, overrides) => {
    await constructSdk(overrides as Partial<ISdkConfig>);
    const errors = collectSessionErrors();
    const session = await startConference();
    fakeSdkTimers();
    const videoElement = document.createElement('video');

    await acceptConference(session, videoElement);
    const attached = videoElement.srcObject;
    await expireWait();
    session.emit('terminated', { condition: 'success' });

    expect(attached).toBeInstanceOf(MockStream);
    expect(videoElement.srcObject).toBe(attached);
    expect(errors).toHaveLength(0);
  });
});
