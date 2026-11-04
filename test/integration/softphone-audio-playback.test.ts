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

  const domError = (name: string): Error => {
    const error = new Error(`${name} message`);
    error.name = name;
    return error;
  };

  const constructSdk = async (overrides: Partial<ISdkConfig> = {}): Promise<GenesysCloudWebrtcSdk> => {
    seedAuthenticatedInit(api);
    sdk = new GenesysCloudWebrtcSdk({
      logger: mockLogger as any,
      accessToken: 'secure',
      environment: api.baseUrl,
      optOutOfTelemetry: true,
      ...overrides
    } as any);

    await sdk.initialize();
    return sdk;
  };

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
    const transport = sdk._streamingConnection as unknown as EventEmitter;

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
    jest.mocked(SdkMedia.prototype.getState).mockReturnValue({ hasOutputDeviceSupport: false, devices: [] } as any);
    /* the agent's microphone, from the mocked device layer */
    jest.mocked(SdkMedia.prototype.startMedia).mockResolvedValue(new MockStream({ audio: true }) as any);
    playSpy = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    originalMediaStream = (window as any).MediaStream;
    (window as any).MediaStream = MockStream;
    /* jsdom has no RTCPeerConnection; the SDK probes it once for transceiver support */
    originalPeerConnection = (window as any).RTCPeerConnection;
    (window as any).RTCPeerConnection = class {
      getTransceivers () { return []; }
      getStats () { return Promise.resolve({}); }
      close () { /* no-op */ }
    };
  });

  afterEach(async () => {
    if (sdk) {
      await sdk.destroy();
      sdk = undefined as any;
    }
    jest.restoreAllMocks();
    (window as any).MediaStream = originalMediaStream;
    (window as any).RTCPeerConnection = originalPeerConnection;
    document.querySelectorAll('audio').forEach(el => el.remove());
  });

  it('reportsBlockedPlaybackOnAutoConnectedCallWithRemoteAudioPresent', async () => {
    await constructSdk();
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
    await constructSdk({ autoConnectSessions: false });
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
    await constructSdk();
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
    await constructSdk();
    const errors = collectMediaErrors();

    const session = await deliverInboundCall({ remoteAudioPresent: true });
    await settle();

    expect(session.accept).toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(session._outputAudioElement).toBeInstanceOf(HTMLAudioElement);
    expect(session._outputAudioElement.autoplay).toBe(true);
    expect(errors).toHaveLength(0);
  });
});
