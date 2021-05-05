import { Logger } from 'genesys-cloud-client-logger';

import { GenesysCloudWebrtcSdk } from '../../src/client';
import { SimpleMockSdk } from '../test-utils';
import { setupLogging } from '../../src/logging';

/* mock this class out so we don't accidentally try to POST logs */
jest.mock('genesys-cloud-client-logger/dist/src/server-logger');

let sdk: GenesysCloudWebrtcSdk;

beforeEach(() => {
  sdk = new SimpleMockSdk() as any;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('setupLogging', () => {
  it('should not create a logger if one is passed in', () => {
    sdk._config = {} as any;
    setupLogging.call(sdk, {} as any);

    expect(sdk.logger instanceof Logger).toBe(false);
  });

  it('should not create logger if noTelemetry', () => {
    sdk._config = { optOutOfTelemetry: true } as any;
    setupLogging.call(sdk, {} as any);

    expect(sdk.logger instanceof Logger).toBe(false);
  });

  it('should create logger', () => {
    sdk._config = {} as any;

    setupLogging.call(sdk);

    expect(sdk.logger instanceof Logger).toBe(true);
    expect(sdk.logger['serverLogger']).toBeTruthy();
  });

  it('should not initialize server logging for guests', () => {
    sdk._config = {} as any;
    (sdk as any).isGuest = true;

    setupLogging.call(sdk);

    expect(sdk.logger instanceof Logger).toBe(true);
    expect(sdk.logger['serverLogger']).toBeFalsy();
  });
});
