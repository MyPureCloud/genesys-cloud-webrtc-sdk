import { Logger } from 'genesys-cloud-client-logger';
import { EventEmitter } from 'events';

import * as windows11Utils from '../../src/windows11-first-session-hack';
import { GenesysCloudWebrtcSdk, ISdkConfig, SessionTypes } from '../../src';
import { SdkMedia } from '../../src/media/media';
import { SdkErrorTypes } from '../../src/types/enums';
import { ISdkMediaState } from '../../src/types/interfaces';
import { SdkError } from '../../src/utils';
import { installHttpMockServer, seedAuthenticatedInit } from './support/black-box-harness';
import { MockSession, MockStream, MockTrack, flushPromises } from '../test-utils';

jest.mock('../../src/media/media');

/**
 * Integration tests for remote call audio playback on inbound softphone calls.
 *
 * Boots the REAL GenesysCloudWebrtcSdk (real SessionManager, softphone handler
 * and media utils) and mocks only external systems: the streaming-client
 * transport, the SdkMedia device layer, and the browser's media element and
 * MediaStream. `HTMLMediaElement.prototype.play` is where the browser decides
 * whether playback may start, so stubbing it lets each test choose that outcome
 * and assert how the SDK reports it through the public `sdkError` event.
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
          subscribe: jest.fn().mockResolvedValue(null)
        }
      );
      this._notifications = this.notifications;

      this.webrtcSessions = Object.assign(
        new EventEmitter(),
        {
          getAllSessions: jest.fn().mockReturnValue([]),
          proxyNRStat: jest.fn(),
          acceptRtcSession: jest.fn(),
          rtcSessionAccepted: jest.fn()
        }
      );
      this._webrtcSessions = this.webrtcSessions;

      this.messenger = Object.assign(new EventEmitter(), { broadcastMessage: jest.fn() });

      this.connect = jest.fn().mockImplementation(() => {
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

describe('Softphone remote audio playback (integration)', () => {
  const api = installHttpMockServer();
  let sdk: GenesysCloudWebrtcSdk;
  let playSpy: jest.SpyInstance;
  let originalMediaStream: typeof window.MediaStream;
  let originalPeerConnection: typeof window.RTCPeerConnection;

  /* a Logger that never runs its constructor; the methods the SDK calls are stubbed in beforeEach */
  const mockLogger: Logger = Object.create(Logger.prototype);

  /* what the mocked device layer reports: no devices, no output-device support */
  const mediaState: ISdkMediaState = {
    devices: [],
    oldDevices: [],
    audioDevices: [],
    videoDevices: [],
    outputDevices: [],
    hasOutputDeviceSupport: false,
    hasMic: false,
    hasCamera: false,
    hasMicPermissions: false,
    hasCameraPermissions: false,
    micPermissionsRequested: false,
    cameraPermissionsRequested: false
  };

  const domError = (name: string): Error => {
    const error = new Error(`${name} message`);
    error.name = name;
    return error;
  };

  const constructSdk = async (overrides: Partial<ISdkConfig> = {}): Promise<GenesysCloudWebrtcSdk> => {
    seedAuthenticatedInit(api);
    sdk = new GenesysCloudWebrtcSdk({
      logger: mockLogger,
      accessToken: 'secure',
      environment: api.baseUrl,
      optOutOfTelemetry: true,
      ...overrides
    });

    await sdk.initialize();
    return sdk;
  };

  /* Genesys-internal gate (GCP-1237); absent or false leaves develop behaviour unchanged */
  const playbackReportingOn: Partial<ISdkConfig> = { experimentalFeatures: { reportRemoteAudioPlaybackBlocked: true } };

  const settle = async (): Promise<void> => {
    await flushPromises();
    await new Promise(resolve => setTimeout(resolve, 0));
    await flushPromises();
  };

  /** Deliver an inbound softphone call the way streaming-client does: propose, then the jingle session. */
  const deliverInboundCall = async (options: { remoteAudioPresent: boolean }): Promise<MockSession> => {
    const sessionId = globalThis.crypto.randomUUID();
    const conversationId = globalThis.crypto.randomUUID();
    const fromJid = `call-${globalThis.crypto.randomUUID()}@gjoll.com`;
    /* the SDK binds its webrtc listeners to the streaming connection itself (client-private.ts) */
    const transport: EventEmitter = sdk._streamingConnection;

    transport.emit('requestIncomingRtcSession', {
      sessionId,
      id: sessionId,
      conversationId,
      autoAnswer: false,
      fromJid,
      toJid: 'someone@genesys.com',
      sessionType: SessionTypes.softphone
    });
    await settle();

    const session = new MockSession(SessionTypes.softphone);
    session.id = sessionId;
    session.sid = sessionId;
    session.conversationId = conversationId;
    session.peerID = fromJid;
    session.end.mockImplementation(() => session.emit('terminated', { condition: 'success' }));
    if (options.remoteAudioPresent) {
      session.peerConnection._addReceiver(new MockTrack('audio'));
    }
    (sdk._streamingConnection.webrtcSessions.getAllSessions as jest.Mock).mockReturnValue([session]);

    transport.emit('incomingRtcSession', session);
    await settle();
    return session;
  };

  /** Collect every `sdkError` of type media (emitted on a setTimeout after the playback promise settles). */
  const collectMediaErrors = (): SdkError[] => {
    const errors: SdkError[] = [];
    sdk.on('sdkError', (error: SdkError) => {
      if (error.type === SdkErrorTypes.media) {
        errors.push(error);
      }
    });
    return errors;
  };

  beforeEach(() => {
    jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockResolvedValue();
    jest.mocked(SdkMedia.prototype.getState).mockReturnValue(mediaState);
    for (const level of ['debug', 'info', 'warn', 'error', 'log', 'setAccessToken'] as const) {
      jest.spyOn(mockLogger, level).mockImplementation(() => undefined);
    }
    playSpy = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    originalMediaStream = window.MediaStream;
    Object.defineProperty(window, 'MediaStream', { value: MockStream, writable: true, configurable: true });
    /* the agent's microphone, from the mocked device layer: window.MediaStream is MockStream here, given one audio track */
    jest.mocked(SdkMedia.prototype.startMedia).mockImplementation(() =>
      Promise.resolve(Object.assign(new MediaStream(), { _tracks: [new MockTrack('audio')] })));
    /* jsdom has no RTCPeerConnection; the SDK probes it once for transceiver support */
    originalPeerConnection = window.RTCPeerConnection;
    Object.defineProperty(window, 'RTCPeerConnection', { writable: true, configurable: true, value: class {
      getTransceivers () { return []; }
      getStats () { return Promise.resolve({}); }
      close () { /* no-op */ }
    } });
  });

  afterEach(async () => {
    if (sdk) {
      await sdk.destroy();
      sdk = undefined;
    }
    jest.restoreAllMocks();
    Object.defineProperty(window, 'MediaStream', { value: originalMediaStream, writable: true, configurable: true });
    Object.defineProperty(window, 'RTCPeerConnection', { value: originalPeerConnection, writable: true, configurable: true });
    document.querySelectorAll('audio').forEach(el => el.remove());
  });

  it('reportsBlockedPlaybackOnAutoConnectedCallWithRemoteAudioPresent', async () => {
    await constructSdk(playbackReportingOn);
    playSpy.mockRejectedValue(domError('NotAllowedError'));
    const errors = collectMediaErrors();

    const session = await deliverInboundCall({ remoteAudioPresent: true });
    await settle();

    expect(session.accept).toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Remote audio playback was blocked');
    expect(errors[0].details).toEqual({
      conversationId: session.conversationId,
      sessionId: session.id,
      error: 'NotAllowedError'
    });
  });

  it('reportsBlockedPlaybackWhenRemoteAudioArrivesAfterPublicAccept', async () => {
    await constructSdk({ ...playbackReportingOn, autoConnectSessions: false });
    playSpy.mockRejectedValue(domError('NotAllowedError'));
    const errors = collectMediaErrors();
    const audioElement = document.createElement('audio');

    const session = await deliverInboundCall({ remoteAudioPresent: false });
    await sdk.acceptSession({ conversationId: session.conversationId, audioElement });
    expect(playSpy).not.toHaveBeenCalled();

    const remoteStream = new MockStream({ audio: true });
    session.emit('peerTrackAdded', remoteStream.getAudioTracks()[0], remoteStream);
    await settle();

    expect(audioElement.srcObject).toBe(remoteStream);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].details).toEqual({
      conversationId: session.conversationId,
      sessionId: session.id,
      error: 'NotAllowedError'
    });
  });

  it('reportsInterruptedPlaybackWithTheBrowserErrorName', async () => {
    await constructSdk(playbackReportingOn);
    playSpy.mockRejectedValue(domError('AbortError'));
    const errors = collectMediaErrors();

    const session = await deliverInboundCall({ remoteAudioPresent: true });
    await settle();

    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe(SdkErrorTypes.media);
    expect(errors[0].details).toEqual({
      conversationId: session.conversationId,
      sessionId: session.id,
      error: 'AbortError'
    });
  });

  it('emitsNoMediaErrorWhenPlaybackStarts', async () => {
    await constructSdk(playbackReportingOn);
    const errors = collectMediaErrors();

    const session = await deliverInboundCall({ remoteAudioPresent: true });
    await settle();

    expect(session.accept).toHaveBeenCalled();
    /* the agent's microphone track reached the peer connection */
    expect(session.getTracks().map(track => track.kind)).toEqual(['audio']);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(session._outputAudioElement).toBeInstanceOf(HTMLAudioElement);
    expect(session._outputAudioElement.autoplay).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it.each<[string, Partial<ISdkConfig>]>([
    ['absent', {}],
    ['false', { experimentalFeatures: { reportRemoteAudioPlaybackBlocked: false } }]
  ])('doesNotStartPlaybackOrReportWhenTheExperimentalFeatureIs %s', async (_label, overrides) => {
    await constructSdk(overrides);
    playSpy.mockRejectedValue(domError('NotAllowedError'));
    const errors = collectMediaErrors();

    const session = await deliverInboundCall({ remoteAudioPresent: true });
    await settle();

    expect(session.accept).toHaveBeenCalled();
    expect(playSpy).not.toHaveBeenCalled();
    expect(session._outputAudioElement).toBeInstanceOf(HTMLAudioElement);
    expect(session._outputAudioElement.autoplay).toBe(true);
    expect(errors).toHaveLength(0);
  });
});
