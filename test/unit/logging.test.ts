import * as genesysCloudClientLogger from 'genesys-cloud-client-logger';

import { GenesysCloudWebrtcSdk } from '../../src/client';
import { SimpleMockSdk } from '../test-utils';
import { setupLogging } from '../../src/logging';

let sdk: GenesysCloudWebrtcSdk;

beforeEach(() => {
  sdk = new SimpleMockSdk() as any;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('setupLogging', () => {
  it('should not create a logger if one is passed in', () => {
    const spy = jest.spyOn(genesysCloudClientLogger, 'createLogger');
    sdk._config = {} as any;
    setupLogging.call(sdk, {} as any);

    expect(spy).not.toHaveBeenCalled();
  });

  it('should not create logger if noTelemetry', () => {
    const spy = jest.spyOn(genesysCloudClientLogger, 'createLogger');
    sdk._config = { optOutOfTelemetry: true } as any;
    setupLogging.call(sdk);

    expect(spy).not.toHaveBeenCalled();
  });

  it('should create logger', () => {
    const initializeSpy = jest.fn();
    const mockLogger = {
      initializeServerLogging: initializeSpy,
      debug: jest.fn()
    };
    const spy = jest.spyOn(genesysCloudClientLogger, 'createLogger').mockReturnValue(mockLogger as any);
    sdk._config = {} as any;
    setupLogging.call(sdk);

    expect(spy).toHaveBeenCalled();
    expect(initializeSpy).toHaveBeenCalled();
  });

  it('should not initialize server logging for guests', () => {
    const initializeSpy = jest.fn();
    const mockLogger = {
      initializeServerLogging: initializeSpy,
      debug: jest.fn()
    };
    const spy = jest.spyOn(genesysCloudClientLogger, 'createLogger').mockReturnValue(mockLogger as any);
    sdk._config = {} as any;
    (sdk as any).isGuest = true;
    setupLogging.call(sdk);

    expect(spy).toHaveBeenCalled();
    expect(initializeSpy).not.toHaveBeenCalled();
  });
});
