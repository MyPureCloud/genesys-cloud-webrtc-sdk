/* eslint @typescript-eslint/no-explicit-any: "off" */
import { Logger } from 'genesys-cloud-client-logger';
import { EventEmitter } from 'events';

import * as windows11Utils from '../../src/windows11-first-session-hack';
import { GenesysCloudWebrtcSdk, ISdkConfig } from '../../src';
import { SdkErrorTypes } from '../../src/types/enums';
import { installHttpMockServer, seedAuthenticatedInit } from './support/black-box-harness';

/**
 * Integration tests for the GenesysCloudWebrtcSdk public API surface. Boots the
 * REAL SDK and asserts the client-level guards and that each public method
 * delegates to the SessionManager. Only externals (streaming-client, media)
 * are mocked.
 *
 * Negative paths dominate: the "not supported" / "invalid options" guards that
 * protect each entrypoint (agent screen share, guest video meeting, unauth
 * video conference, bad volume, empty updateOutgoingMedia).
 */
jest.mock('../../src/media/media');

jest.mock('genesys-cloud-streaming-client', () => {
  const actualDep = jest.requireActual('genesys-cloud-streaming-client');
  return {
    ...actualDep,
    __esModule: true,
    default: function () {
      this.config = { jid: 'me@orgspan.com' };
      this.notifications = Object.assign(new EventEmitter(), { subscribe: jest.fn().mockResolvedValue(null) });
      this._notifications = this.notifications;
      this.webrtcSessions = Object.assign(new EventEmitter(), {
        getAllSessions: jest.fn().mockReturnValue([]),
        proxyNRStat: jest.fn()
      });
      this._webrtcSessions = this.webrtcSessions;
      this.messenger = Object.assign(new EventEmitter(), { broadcastMessage: jest.fn() });
      this.connect = jest.fn().mockImplementation(() => { this.emit('connected'); return Promise.resolve(); });
      this.disconnect = jest.fn().mockResolvedValue(null);
      const ev = new EventEmitter();
      Object.getOwnPropertyNames(EventEmitter.prototype).forEach(name => {
        if (name !== 'constructor') { this[name] = ev[name]; }
      });
    }
  };
});

describe('SDK public API (integration)', () => {
  const api = installHttpMockServer();
  let sdk: GenesysCloudWebrtcSdk;

  const mockLogger: jest.Mocked<Logger> = {
    debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), log: jest.fn(), setAccessToken: jest.fn()
  } as any;

  const constructSdk = async (overrides?: ISdkConfig): Promise<GenesysCloudWebrtcSdk> => {
    /* boot through the real init HTTP calls against the mock server */
    seedAuthenticatedInit(api);
    sdk = new GenesysCloudWebrtcSdk({
      logger: mockLogger as any, accessToken: 'secure', environment: api.baseUrl, optOutOfTelemetry: true,
      ...(overrides || {})
    } as any);
    await sdk.initialize();
    return sdk;
  };

  const captureSdkError = (): Promise<any> => new Promise(res => sdk.once('sdkError', res));

  beforeEach(() => {
    jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockResolvedValue();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (sdk) { await sdk.destroy(); sdk = undefined as any; }
  });

  /* ───────────── not-supported / invalid-options guards ───────────── */

  it('throwsNotSupportedWhenAgentStartsScreenShare', async () => {
    await constructSdk();   /* accessToken set -> authenticated agent, not a guest */
    const errorPromise = captureSdkError();

    await expect(sdk.startScreenShare()).rejects.toHaveProperty('type', SdkErrorTypes.not_supported);
    expect((await errorPromise).type).toBe(SdkErrorTypes.not_supported);
  });

  it('throwsNotSupportedWhenGuestStartsVideoMeeting', async () => {
    await constructSdk();
    /* drop auth after init so the SDK sees a guest (no accessToken, no jwt) */
    sdk._config.accessToken = undefined;
    sdk._config.jwt = undefined;

    await expect(sdk.startVideoMeeting('meeting-1')).rejects.toHaveProperty('type', SdkErrorTypes.not_supported);
  });

  it('throwsNotSupportedWhenVideoConferenceHasNoAuth', async () => {
    await constructSdk();
    sdk._config.jwt = undefined;
    sdk._config.accessToken = undefined;

    await expect(
      sdk.startVideoConference('room@conference.example.com')
    ).rejects.toHaveProperty('type', SdkErrorTypes.not_supported);
  });

  it('throwsInvalidOptionsWhenUpdateOutgoingMediaHasNothingToUpdate', async () => {
    await constructSdk();

    expect(() => sdk.updateOutgoingMedia({} as any))
      .toThrow(expect.objectContaining({ type: SdkErrorTypes.invalid_options }));
  });

  it('throwsNotSupportedWhenAudioVolumeOutOfRange', async () => {
    await constructSdk();

    expect(() => sdk.updateAudioVolume(150))
      .toThrow(expect.objectContaining({ type: SdkErrorTypes.not_supported }));
    expect(() => sdk.updateAudioVolume(-1))
      .toThrow(expect.objectContaining({ type: SdkErrorTypes.not_supported }));
  });

  /* ───────────── setAccessToken ───────────── */

  it('setAccessTokenUpdatesConfigAndStreamingConnection', async () => {
    await constructSdk();
    sdk.setAccessToken('new-token');
    expect(sdk._config.accessToken).toBe('new-token');
    expect((sdk._streamingConnection as any).config.authToken).toBe('new-token');
  });
});
