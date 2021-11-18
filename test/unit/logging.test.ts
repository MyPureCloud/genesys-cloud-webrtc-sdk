/* set this before we import it */
let loggerConstructorSpy: jest.SpyInstance;
jest.mock('genesys-cloud-client-logger', () => {
  loggerConstructorSpy = jest.fn((_config) => mockLogger)
  return loggerConstructorSpy;
});

import { ILogger } from 'genesys-cloud-client-logger';

import { GenesysCloudWebrtcSdk } from '../../src/client';
import { SimpleMockSdk } from '../test-utils';
import { setupLogging } from '../../src/logging';
import { ISdkConfig } from '../../src/types/interfaces';

let sdk: GenesysCloudWebrtcSdk;
let mockLogger: ILogger;
let sdkConfig: ISdkConfig;

beforeEach(() => {
  sdk = new SimpleMockSdk() as any;
  mockLogger = {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  sdkConfig = {
    accessToken: 'token',
    logLevel: 'debug',
    environment: 'apes.com'
  };
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('setupLogging', () => {
  it('should create a logger with defaults', () => {
    sdk._config = sdkConfig;
    setupLogging.call(sdk);

    expect(loggerConstructorSpy).toHaveBeenCalledWith({
      accessToken: sdkConfig.accessToken,
      url: `https://api.${sdkConfig.environment}/api/v2/diagnostics/trace`,
      logLevel: sdkConfig.logLevel,
      appName: 'webrtc-sdk',
      appVersion: undefined,
      initializeServerLogging: true,
      logger: undefined,
      secondaryAppId: undefined,
      secondaryAppName: undefined,
      secondaryAppVersion: undefined,
      uploadDebounceTime: 1000
    });
  });

  it('should not initialize server logging for guests', () => {
    sdkConfig.optOutOfTelemetry = false;
    sdk._config = sdkConfig;
    (sdk as any).isGuest = true;
    setupLogging.call(sdk);

    expect(loggerConstructorSpy).toHaveBeenCalledWith({
      accessToken: sdkConfig.accessToken,
      url: `https://api.${sdkConfig.environment}/api/v2/diagnostics/trace`,
      logLevel: sdkConfig.logLevel,
      appName: 'webrtc-sdk',
      appVersion: undefined,
      initializeServerLogging: false,
      logger: undefined,
      secondaryAppId: undefined,
      secondaryAppName: undefined,
      secondaryAppVersion: undefined,
      uploadDebounceTime: 1000
    });
   });

  it('should respect passed in params', () => {
    sdkConfig.optOutOfTelemetry = true;
    sdkConfig.originAppId = 'nanana-batman';
    sdkConfig.originAppName = 'batman';
    sdkConfig.originAppVersion = '1.4.5';

    sdk._config = sdkConfig;
    (sdk as any).VERSION = '1990';
    setupLogging.call(sdk, console);

    expect(loggerConstructorSpy).toHaveBeenCalledWith({
      accessToken: sdkConfig.accessToken,
      url: `https://api.${sdkConfig.environment}/api/v2/diagnostics/trace`,
      logLevel: sdkConfig.logLevel,
      appName: 'webrtc-sdk',
      appVersion: '1990',
      initializeServerLogging: false,
      logger: console,
      originAppId: sdkConfig.originAppId,
      originAppName: sdkConfig.originAppName,
      originAppVersion: sdkConfig.originAppVersion,
      uploadDebounceTime: 1000
    });
  });
});
