import sinon from 'sinon';

let { timeout, mockApis, wss, ws } = require('../test-utils');

const { log } = require('../../src/logging');

afterAll(() => {
  if (wss) {
    wss.close();
  }
});

const sandbox = sinon.createSandbox();

afterEach(() => {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (wss) {
    wss.removeAllListeners();
  }
  sandbox.restore();
});

test(
  '_log | will not notify logs if the logLevel is lower than configured',
  async () => {
    const { sdk } = mockApis({ withLogs: true });
    sdk._logLevel = 'warn';
    await sdk.initialize();
    sinon.stub(sdk._backoff, 'backoff'); // called in notifyLogs
    log.call(sdk, 'debug', 'test', { details: 'etc' });
    await timeout(1100);
    sinon.assert.notCalled(sdk._backoff.backoff);
    sdk._logBuffer = [];
  }
);

test('_log | will not notify logs if opted out', async () => {
  const { sdk } = mockApis({ withLogs: true });
  sdk._logLevel = 'debug';
  sdk._optOutOfTelemetry = true;
  await sdk.initialize();
  sinon.stub(sdk._backoff, 'backoff'); // called in notifyLogs
  log.call(sdk, 'warn', 'test', { details: 'etc' });
  await timeout(1100);
  sinon.assert.notCalled(sdk._backoff.backoff);
  sdk._logBuffer = [];
});

test(
  '_log | will buffer a log and notify it if the logLevel is gte configured',
  async () => {
    const { sdk } = mockApis({ withLogs: true });
    sdk._logLevel = 'warn';
    await sdk.initialize();
    sinon.stub(sdk._backoff, 'backoff'); // called in notifyLogs
    console.log(sdk._logBuffer[0]);
    expect(sdk._logBuffer.length).toBe(0);
    log.call(sdk, 'warn', 'test', { details: 'etc' });
    await timeout(1100);
    sinon.assert.calledOnce(sdk._backoff.backoff);
    expect(sdk._logBuffer.length).toBe(1);
    sdk._logBuffer = [];
  }
);

test(
  '_notifyLogs | will debounce logs and only send logs once at the end',
  async () => {
    const { sdk, sendLogs } = mockApis({ withLogs: true });
    sdk._logLevel = 'warn';
    await sdk.initialize();

    expect(sdk._logBuffer.length).toBe(0);
    log.call(sdk, 'warn', 'test', { details: 'etc' });
    expect(false).toBe(sendLogs.isDone());
    for (let i = 1; i < 6; i++) {
      await timeout(100 * i);
      log.call(sdk, 'warn', 'test' + i);
    }
    expect(false).toBe(sendLogs.isDone());
    expect(sdk._logBuffer.length).toBe(6);
    await timeout(1100);
    expect(true).toBe(sendLogs.isDone());
    sdk._logBuffer = [];
  }
);

test(
  '_sendLogs | resets all flags related to backoff on success',
  async () => {
    const { sdk } = mockApis({ withLogs: true });
    sdk._logLevel = 'warn';
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
  }
);

test('_sendLogs | resets the backoff on success', async () => {
  const { sdk } = mockApis({ withLogs: true });
  sdk._logLevel = 'warn';
  await sdk.initialize();

  const backoffResetSpy = sinon.spy(sdk._backoff, 'reset');
  sdk._logBuffer.push('log1');
  sdk._logBuffer.push('log2');

  sdk._backoff.backoff();
  await timeout(100);
  sinon.assert.calledOnce(backoffResetSpy);
  sdk._logBuffer = [];
});

test(
  '_sendLogs | should call backoff.backoff() again if there are still items in the _logBuffer after a successfull call to api',
  async () => {
    const { sdk } = mockApis({ withLogs: true });
    sdk._logLevel = 'warn';
    await sdk.initialize();

    const backoffSpy = sinon.spy(sdk._backoff, 'backoff');
    sdk._reduceLogPayload = true;
    sdk._logBuffer.push('log1');
    sdk._logBuffer.push('log2');
    sdk._logBuffer.push('log3');
    sdk._logBuffer.push('log4');

    sdk._backoff.backoff();
    await timeout(100);
    sinon.assert.calledTwice(backoffSpy);
    sdk._logBuffer = [];
  }
);

test('_sendLogs | will add logs back to buffer if request fails', async () => {
  const expectedFirstLog = 'log1';
  const expectedSecondLog = 'log2';
  const expectedThirdLog = 'log3';
  let { sdk } = mockApis({ failLogs: true, withLogs: true });
  sdk._logLevel = 'warn';
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
  sdk._optOutOfTelemetry = true;
});

test('_sendLogs | increments _failedLogAttemps on failure', async () => {
  const { sdk } = mockApis({ failLogsPayload: true, withLogs: true });
  sdk._logLevel = 'warn';
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

test(
  '_sendLogs | sets _reduceLogPayload to true if error status is 413 (payload too large)',
  async () => {
    const { sdk } = mockApis({ failLogsPayload: true, withLogs: true });
    sdk._logLevel = 'warn';
    await sdk.initialize();
    expect(sdk._logBuffer.length).toBe(0);
    sdk._logBuffer.push('log1');
    sdk._logBuffer.push('log2');
    expect(sdk._reduceLogPayload).toBe(false);

    sdk._backoff.backoff();
    await timeout(100);
    expect(sdk._reduceLogPayload).toBe(true);
    sdk._logBuffer = [];
  }
);

test(
  '_sendLogs | should reset all backoff flags and reset the backoff if api request returns error and payload was only 1 log',
  async () => {
    const { sdk } = mockApis({ failLogsPayload: true, withLogs: true });
    sdk._logLevel = 'warn';
    await sdk.initialize();
    sdk._logBuffer.push('log1');
    const backoffResetSpy = sinon.spy(sdk._backoff, 'reset');

    sdk._backoff.backoff();
    await timeout(100);
    expect(sdk._backoffActive).toBe(false);
    expect(sdk._failedLogAttempts).toBe(0);
    expect(sdk._reduceLogPayload).toBe(false);
    sinon.assert.calledOnce(backoffResetSpy);
    sdk._logBuffer = [];
  }
);

test(
  '_sendLogs | set backoffActive to false if the backoff fails',
  async () => {
    const { sdk, sendLogs } = mockApis({ failLogs: true, withLogs: true });
    sdk._logLevel = 'warn';
    await sdk.initialize();
    log.call(sdk, 'error', 'log1');
    log.call(sdk, 'error', 'log2');
    sdk._backoff.failAfter(1); // means it will retry once, or 2 tries total
    await timeout(1000);
    log.call(sdk, 'error', 'log3');
    await timeout(5000);
    expect(true).toBe(sendLogs.isDone());
    expect(sdk._backoffActive).toBe(false);
    sdk._logBuffer = [];
  }
);

test.skip(
  '_getLogPayload | returns the entire _logBuffer if _reduceLogPayload is false',
  async done => {
    const { sdk, sendLogs } = mockApis({ withLogs: true });
    await sdk.initialize();
    sdk._reduceLogPayload = false;
    sdk._logBuffer = [0, 1, 2, 3, 4];

    let callCount = 1;
    sendLogs.filteringRequestBody((body) => {
      const traces = JSON.parse(body).traces;
      if (callCount === 1) {
        expect(traces).toEqual([0, 1, 2, 3, 4]);
      } else {
        done.fail();
      }
      callCount += 1;
    });
    sdk._backoff.backoff();
    await timeout(1000);
    expect(true).toBe(sendLogs.isDone());
    expect(sdk._logBuffer.length).toBe(0);
    sdk._logBuffer = [];
  }
);

test(
  '_getLogPayload | returns part of _logBuffer if _reduceLogPayload is true',
  async () => {
    const { sdk, sendLogs } = mockApis({ withLogs: true });
    await sdk.initialize();
    sdk._reduceLogPayload = true;
    sdk._failedLogAttempts = 1;
    sdk._logBuffer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

    expect.assertions(4);
    let callCount = 1;
    sendLogs.filteringRequestBody((body) => {
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
  }
);

test(
  '_getLogPayload | returns part of _logBuffer if _reduceLogPayload is true and _failedLogAttempts is 0',
  async () => {
    const { sdk, sendLogs } = mockApis({ withLogs: true });
    await sdk.initialize();
    sdk._reduceLogPayload = true;
    sdk._failedLogAttempts = 0;
    sdk._logBuffer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

    expect.assertions(4);
    let callCount = 1;
    sendLogs.filteringRequestBody((body) => {
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
  }
);

test(
  '_getReducedLogPayload | should return at least one log item',
  async () => {
    const { sdk, sendLogs } = mockApis({ withLogs: true });
    await sdk.initialize();

    sdk._logBuffer = [1, 2, 3, 4, 5];
    sdk._reduceLogPayload = true;
    sdk._failedLogAttempts = 6;

    expect.assertions(4);
    let callCount = 1;
    sendLogs.filteringRequestBody((body) => {
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
  }
);
