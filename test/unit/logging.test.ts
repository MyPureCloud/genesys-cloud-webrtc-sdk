import { log, setupLogging } from '../../src/logging';
import { mockApis, SimpleMockSdk } from '../test-utils';
import { LogLevels } from '../../src/types/enums';

let { timeout, wss, ws, closeWebSocketServer } = require('../test-utils');

describe('Logging', () => {

  beforeAll(async () => {
    await closeWebSocketServer();
  });
  afterAll(async () => {
    await closeWebSocketServer();
  });

  afterEach(async () => {
    if (ws) {
      await Promise.resolve(ws.close());
      ws = null;
    }
    if (wss) {
      wss.removeAllListeners();
    }
    jest.resetAllMocks();
  });

  describe('_log()', () => {
    it('should use default log level', () => {
      const mockSdk = new SimpleMockSdk();
      log.call(mockSdk as any, undefined, 'test');
      expect(mockSdk.logger.log).toHaveBeenLastCalledWith('[webrtc-sdk] test', undefined);
    });

    test('will not notify logs if the logLevel is lower than configured', async () => {
      const { sdk } = mockApis({ withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();
      jest.spyOn(sdk._backoff, 'backoff'); // called in notifyLogs
      log.call(sdk, LogLevels.debug, 'test', { details: 'etc' });
      await timeout(1100);
      expect(sdk._backoff.backoff).not.toHaveBeenCalled();
      sdk._logBuffer = [];
    });

    test('will not notify logs if opted out', async () => {
      const { sdk } = mockApis({ withLogs: true });
      sdk._config.logLevel = LogLevels.debug;
      sdk._config.optOutOfTelemetry = true;
      await sdk.initialize();
      jest.spyOn(sdk._backoff, 'backoff'); // called in notifyLogs
      log.call(sdk, LogLevels.warn, 'test', { details: 'etc' });
      await timeout(1100);
      expect(sdk._backoff.backoff).not.toHaveBeenCalled();
      sdk._logBuffer = [];
    });

    test('will not notify logs if guest user', async () => {
      const { sdk } = mockApis({ guestSdk: true, withLogs: true });
      sdk._config.logLevel = LogLevels.debug;
      await sdk.initialize({ securityCode: '123456' });
      expect(sdk._backoff).toEqual(undefined);
      log.call(sdk, LogLevels.warn, 'test', { details: 'etc' });
      await timeout(1100);
      expect(sdk._logBuffer).toEqual([]);
    });

    test('will buffer a log and notify it if the logLevel is gte configured', async () => {
      const { sdk } = mockApis({ withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();
      jest.spyOn(sdk._backoff, 'backoff').mockImplementation(() => null); // called in notifyLogs
      console.log(sdk._logBuffer[0]);
      expect(sdk._logBuffer.length).toBe(0);
      log.call(sdk, LogLevels.warn, 'test', { details: 'etc' });
      await timeout(1100);
      expect(sdk._backoff.backoff).toHaveBeenCalledTimes(1);
      expect(sdk._logBuffer.length).toBe(1);
      sdk._logBuffer = [];
    });
  });

  describe('_notifyLogs()', () => {
    test('will debounce logs and only send logs once at the end', async () => {
      const { sdk, sendLogs } = mockApis({ withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();

      expect(sdk._logBuffer.length).toBe(0);
      log.call(sdk, LogLevels.warn, 'test', { details: 'etc' });
      expect(false).toBe(sendLogs.isDone());
      for (let i = 1; i < 6; i++) {
        await timeout(100 * i);
        log.call(sdk, LogLevels.warn, 'test' + i);
      }
      expect(false).toBe(sendLogs.isDone());
      expect(sdk._logBuffer.length).toBe(6);
      await timeout(1100);
      expect(true).toBe(sendLogs.isDone());
      sdk._logBuffer = [];
    });
  });

  describe('_sendLogs()', () => {
    test('resets all flags related to backoff on success', async () => {
      const { sdk } = mockApis({ withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();

      sdk._backoffActive = true;
      sdk._failedLogAttempts = 2;
      sdk._reduceLogPayload = true;
      sdk._logBuffer.push('log1');

      sdk._backoff.backoff();
      await timeout(100);
      expect(sdk._backoffActive).toBe(false);
      expect(sdk._failedLogAttempts).toBe(0);
      expect(sdk._reduceLogPayload).toBe(false);
      sdk._logBuffer = [];
    });

    test('resets the backoff on success', async () => {
      const { sdk } = mockApis({ withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();

      const backoffResetSpy = jest.spyOn(sdk._backoff, 'reset');
      sdk._logBuffer.push('log1');
      sdk._logBuffer.push('log2');

      sdk._backoff.backoff();
      await timeout(100);
      expect(backoffResetSpy).toHaveBeenCalledTimes(1);
      sdk._logBuffer = [];
    });

    test('should call backoff.backoff() again if there are still items in the _logBuffer after a successfull call to api', async () => {
      const { sdk } = mockApis({ withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();

      const backoffSpy = jest.spyOn(sdk._backoff, 'backoff');
      sdk._reduceLogPayload = true;
      sdk._logBuffer.push('log1');
      sdk._logBuffer.push('log2');
      sdk._logBuffer.push('log3');
      sdk._logBuffer.push('log4');

      sdk._backoff.backoff();
      await timeout(100);
      expect(backoffSpy).toHaveBeenCalledTimes(2);
      sdk._logBuffer = [];
    });

    test('will add logs back to buffer if request fails', async () => {
      const expectedFirstLog = 'log1';
      const expectedSecondLog = 'log2';
      const expectedThirdLog = 'log3';
      let { sdk } = mockApis({ failLogs: true, withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();

      expect(sdk._logBuffer.length).toBe(0);
      sdk._logBuffer.push(expectedFirstLog);
      sdk._logBuffer.push(expectedSecondLog);
      sdk._logBuffer.push(expectedThirdLog);

      sdk._backoff.backoff();
      await timeout(100);

      expect(sdk._logBuffer.length).toBe(3);
      expect(sdk._logBuffer[0]).toBe(expectedFirstLog);
      expect(sdk._logBuffer[1]).toBe(expectedSecondLog);
      expect(sdk._logBuffer[2]).toBe(expectedThirdLog);
      sdk._logBuffer = [];
      sdk._config.optOutOfTelemetry = true;
    });

    test('increments _failedLogAttemps on failure', async () => {
      const { sdk } = mockApis({ failLogsPayload: true, withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();
      expect(sdk._logBuffer.length).toBe(0);
      sdk._logBuffer.push('log1');
      sdk._logBuffer.push('log2');
      expect(sdk._failedLogAttempts).toBe(0);

      sdk._backoff.backoff();
      await timeout(100);
      expect(sdk._failedLogAttempts).toBe(1);
      sdk._logBuffer = [];
    });

    test('_sendLogs | set backoffActive to false if the backoff fails', async () => {
      const { sdk, sendLogs } = mockApis({ failLogs: true, withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();
      log.call(sdk, LogLevels.error, 'log1');
      log.call(sdk, LogLevels.error, 'log2');
      sdk._backoff.failAfter(1); // means it will retry once, or 2 tries total
      await timeout(1000);
      log.call(sdk, LogLevels.error, 'log3');
      await timeout(5000);
      expect(true).toBe(sendLogs.isDone());
      expect(sdk._backoffActive).toBe(false);
      sdk._logBuffer = [];
    }, 10 * 1000);

    test('sets _reduceLogPayload to true if error status is 413 (payload too large)', async () => {
      const { sdk } = mockApis({ failLogsPayload: true, withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();
      expect(sdk._logBuffer.length).toBe(0);
      sdk._logBuffer.push('log1');
      sdk._logBuffer.push('log2');
      expect(sdk._reduceLogPayload).toBe(false);

      sdk._backoff.backoff();
      await timeout(100);
      expect(sdk._reduceLogPayload).toBe(true);
      sdk._logBuffer = [];
    });

    test('should reset all backoff flags and reset the backoff if api request returns error and payload was only 1 log', async () => {
      const { sdk } = mockApis({ failLogsPayload: true, withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();
      sdk._logBuffer.push('log1');
      const backoffResetSpy = jest.spyOn(sdk._backoff, 'reset');

      sdk._backoff.backoff();
      await timeout(100);
      expect(sdk._backoffActive).toBe(false);
      expect(sdk._failedLogAttempts).toBe(0);
      expect(sdk._reduceLogPayload).toBe(false);
      expect(backoffResetSpy).toHaveBeenCalledTimes(1);
      sdk._logBuffer = [];
    });

    test('set backoffActive to false if the backoff fails', async () => {
      const { sdk, sendLogs } = mockApis({ failLogs: true, withLogs: true });
      sdk._config.logLevel = LogLevels.warn;
      await sdk.initialize();
      log.call(sdk, LogLevels.error, 'log1');
      log.call(sdk, LogLevels.error, 'log2');
      sdk._backoff.failAfter(1); // means it will retry once, or 2 tries total
      await timeout(1000);
      log.call(sdk, LogLevels.error, 'log3');
      await timeout(5000);
      expect(true).toBe(sendLogs.isDone());
      expect(sdk._backoffActive).toBe(false);
      sdk._logBuffer = [];
    }, 10 * 1000);
  });

  describe('_getLogPayload()', () => {
    test('returns the entire _logBuffer if _reduceLogPayload is false', async () => {
      const { sdk, sendLogs } = mockApis({ withLogs: true });
      await sdk.initialize();
      sdk._reduceLogPayload = false;
      sdk._logBuffer = [0, 1, 2, 3, 4];

      expect.assertions(3);

      let callCount = 1;
      sendLogs.filteringRequestBody((body: string): any => {
        const traces = JSON.parse(body).traces;
        if (callCount === 1) {
          expect(traces).toEqual([0, 1, 2, 3, 4]);
        } else {
          fail();
        }
        callCount += 1;
      });
      sdk._backoff.backoff();
      await timeout(1000);
      expect(true).toBe(sendLogs.isDone());
      expect(sdk._logBuffer.length).toBe(0);
      sdk._backoff.reset();
      sdk._logBuffer = [];
    }, 10 * 1000);

    test('returns part of _logBuffer if _reduceLogPayload is true', async () => {
      const { sdk, sendLogs } = mockApis({ withLogs: true });
      await sdk.initialize();
      sdk._reduceLogPayload = true;
      sdk._failedLogAttempts = 1;
      sdk._logBuffer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

      expect.assertions(4);
      let callCount = 1;
      sendLogs.filteringRequestBody((body: string): any => {
        const traces = JSON.parse(body).traces;
        if (callCount === 1) {
          expect(traces).toEqual([0, 1, 2, 3, 4]);
        } else if (callCount === 2) {
          expect(traces).toEqual([5, 6, 7, 8, 9]);
        }
        callCount += 1;
      });

      sdk._backoff.backoff();
      await timeout(100);

      expect(sdk._logBuffer.length).toBe(0);
      expect(sdk._logBuffer).toEqual([]);
    });

    test('returns part of _logBuffer if _reduceLogPayload is true and _failedLogAttempts is 0', async () => {
      const { sdk, sendLogs } = mockApis({ withLogs: true });
      await sdk.initialize();
      sdk._reduceLogPayload = true;
      sdk._failedLogAttempts = 0;
      sdk._logBuffer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

      expect.assertions(4);
      let callCount = 1;
      sendLogs.filteringRequestBody((body: string): any => {
        const traces = JSON.parse(body).traces;
        if (callCount === 1) {
          expect(traces).toEqual([0, 1, 2, 3, 4]);
        } else if (callCount === 2) {
          expect(traces).toEqual([5, 6, 7, 8, 9]);
        }
        callCount += 1;
      });

      sdk._backoff.backoff();
      await timeout(100);

      expect(sdk._logBuffer.length).toBe(0);
      expect(sdk._logBuffer).toEqual([]);
    });
  });

  describe('_getReducedLogPayload()', () => {
    test('should return at least one log item', async () => {
      const { sdk, sendLogs } = mockApis({ withLogs: true });
      await sdk.initialize();

      sdk._logBuffer = [1, 2, 3, 4, 5];
      sdk._reduceLogPayload = true;
      sdk._failedLogAttempts = 6;

      expect.assertions(4);
      let callCount = 1;
      sendLogs.filteringRequestBody((body: string): any => {
        const traces = JSON.parse(body).traces;
        if (callCount === 1) {
          expect(traces).toEqual([1]);
        } else if (callCount === 2) {
          expect(traces).toEqual([2, 3, 4, 5]);
        }
        callCount += 1;
      });

      sdk._backoff.backoff();
      await timeout(100);

      expect(sdk._logBuffer.length).toBe(0);
      expect(sdk._logBuffer).toEqual([]);
    });
  });
});

describe('setupLogging', () => {
  it('should warn about invalid log level', () => {
    const mockSdk = new SimpleMockSdk();
    setupLogging.call(mockSdk as any, mockSdk.logger as any, 'lskdfjjs' as any);

    expect(mockSdk.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid log level'));
  });

  it('should not blow up if log level not provided', () => {
    const mockSdk = new SimpleMockSdk();
    expect(() => setupLogging.call(mockSdk as any, mockSdk.logger as any, undefined)).not.toThrow();
  });
});
