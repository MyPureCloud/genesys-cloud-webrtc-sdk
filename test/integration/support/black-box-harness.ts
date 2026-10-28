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
