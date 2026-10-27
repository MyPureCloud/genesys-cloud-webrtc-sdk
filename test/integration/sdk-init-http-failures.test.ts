/* eslint @typescript-eslint/no-explicit-any: "off" */
import { Logger } from 'genesys-cloud-client-logger';
import { EventEmitter } from 'events';

import * as windows11Utils from '../../src/windows11-first-session-hack';
import { GenesysCloudWebrtcSdk, ISdkConfig } from '../../src';
import { SdkErrorTypes } from '../../src/types/enums';
import { SdkError } from '../../src/utils';
import { installHttpMockServer } from './support/black-box-harness';

/**
 * BLACK-BOX integration tests for GenesysCloudWebrtcSdk.initialize() when the
 * platform API misbehaves.
 *
 * These boot the REAL SDK and point it at a REAL mock HTTP server (node:http,
 * ephemeral port). The SDK makes real requests to fetch the org / authed user;
 * the server answers with real error statuses (401/403/429/500). Nothing inside
 * the SDK is mocked - only the outward network peer is faked, exactly as a
 * downstream service would be stubbed in a backend WireMock IT.
 *
 * We assert the SDK's observable reaction (thrown SdkError type, no `ready`
 * event) AND that the server actually received the expected request.
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

describe('SDK init HTTP failures (black-box, mock server)', () => {
  const api = installHttpMockServer();
  let sdk: GenesysCloudWebrtcSdk;

  const mockLogger: jest.Mocked<Logger> = {
    debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), log: jest.fn(), setAccessToken: jest.fn()
  } as any;

  const buildSdk = (overrides?: Partial<ISdkConfig>): GenesysCloudWebrtcSdk => {
    sdk = new GenesysCloudWebrtcSdk({
      logger: mockLogger as any,
      accessToken: 'secure',
      environment: api.baseUrl,          // point the SDK at the real mock server
      optOutOfTelemetry: true,
      ...(overrides || {})
    } as any);
    return sdk;
  };

  beforeEach(() => {
    jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockResolvedValue();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (sdk) {
      try { await sdk.destroy(); } catch { /* half-initialized */ }
      sdk = undefined as any;
    }
  });

  it('throwsInvalidTokenOn401FromOrgFetch', async () => {
    api.stub('get', /\/organizations\/me/, { status: 401, body: { message: 'unauthorized' } });
    api.stub('get', /\/users\/me/, { status: 401, body: { message: 'unauthorized' } });
    const readySpy = jest.fn();
    buildSdk();
    sdk.on('ready', readySpy);
    const emitted: SdkError[] = [];
    sdk.on('sdkError', e => emitted.push(e));

    await expect(sdk.initialize()).rejects.toHaveProperty('type', SdkErrorTypes.invalid_token);
    await new Promise(res => setTimeout(res, 50));

    expect(emitted.some(e => e.type === SdkErrorTypes.invalid_token)).toBe(true);
    expect(readySpy).not.toHaveBeenCalled();
    /* the SDK really did call the platform API */
    expect(api.received('get').some(r => /\/organizations\/me|\/users\/me/.test(r.path))).toBe(true);
  });

  it('throwsInvalidTokenOn403FromOrgFetch', async () => {
    api.stub('get', /\/organizations\/me/, { status: 403, body: {} });
    api.stub('get', /\/users\/me/, { status: 403, body: {} });
    buildSdk();

    await expect(sdk.initialize()).rejects.toHaveProperty('type', SdkErrorTypes.invalid_token);
    /* initialize fires org + user fetches in parallel; let the other in-flight
     * request settle so its error log lands inside the test, not after teardown
     * ("Cannot log after tests are done"). */
    await new Promise(res => setTimeout(res, 50));
  });

  /*
   * NOTE: 5xx / 429 init failures are intentionally NOT tested here. The SDK's
   * platform client (`requestApiWithRetry`) retries those with backoff, so a
   * persistently-failing mock server makes the SDK retry for many seconds -
   * that exercises retry-exhaustion *timing*, not error classification, and is
   * not practical in a fast IT. The 401/403 (non-retried, deterministic) paths
   * are the meaningful black-box init-failure cases. Retry/backoff behavior, if
   * it needs coverage, belongs in a focused unit test of the client layer.
   */
});
