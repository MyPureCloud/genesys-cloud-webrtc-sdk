/* eslint @typescript-eslint/no-explicit-any: "off" */
import axios from 'axios';
import { MockApiServer } from './mock-api-server';

/**
 * Shared black-box HTTP harness for SDK integration tests.
 *
 * Wires the one non-obvious bit of setup: the SDK is a browser library (needs
 * jsdom's `window`), but a real mock server needs a real socket. We keep the
 * jsdom test environment and force axios onto its node `http` adapter so the
 * SDK's internal `axios()` call actually reaches the MockApiServer socket.
 *
 * Call installHttpMockServer() inside a describe block; it registers the
 * beforeAll/afterAll/afterEach lifecycle and returns the server instance.
 * Point the SDK at it with `sdk._config.environment = api.baseUrl`.
 */
export function installHttpMockServer (): MockApiServer {
  const api = new MockApiServer();
  let prevAdapter: any;

  beforeAll(async () => {
    await api.start();
    prevAdapter = axios.defaults.adapter;
    axios.defaults.adapter = 'http';
  });

  afterAll(async () => {
    axios.defaults.adapter = prevAdapter;
    await api.stop();
  });

  afterEach(() => api.reset());

  return api;
}

/**
 * Seed the mock server with the platform API responses `sdk.initialize()` needs
 * for an authenticated (non-guest) user, so ITs boot the SDK through its real
 * HTTP calls instead of stubbing `fetchOrganization` / `fetchAuthenticatedUser`
 * / `fetchUsersStation`.
 */
export function seedAuthenticatedInit (api: MockApiServer, station: Record<string, any> = {}): void {
  const stationId = station.id || 'stationId';
  api
    .stub('get', /\/organizations\/me$/, { status: 200, body: { id: 'myorgid', name: 'my org name' } })
    .stub('get', /\/users\/me$/, {
      status: 200,
      body: {
        id: 'userId',
        name: 'user name',
        chat: { jabberId: 'user@jid.com' },
        station: { effectiveStation: { id: stationId } }
      }
    })
    .stub('get', new RegExp(`/stations/${stationId}$`), {
      status: 200,
      body: {
        id: stationId,
        name: 'my webrtc phone',
        status: 'ASSOCIATED',
        userId: 'userId',
        webRtcUserId: 'webrtcUserId',
        type: 'inin_webrtc_softphone',
        webRtcPersistentEnabled: false,
        webRtcForceTurn: false,
        webRtcCallAppearances: 100,
        ...station
      }
    });
}
