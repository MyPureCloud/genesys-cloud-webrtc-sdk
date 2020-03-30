import { PureCloudWebrtcSdk } from '../../src/client';
import { SimpleMockSdk, timeout } from '../test-utils';
import * as logging from '../../src/logging';
import { LogLevels } from '../../src/types/enums';

let sdk: PureCloudWebrtcSdk;

beforeEach(() => {
  sdk = new SimpleMockSdk() as any;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('log', () => {
  it('should send immediately when full', async () => {
    const notifySpy = jest.spyOn(logging, 'notifyLogs').mockReturnValue();

    sdk._logBufferSize = 14300;
    logging.log.call(sdk, LogLevels.info, 'This is a log message that will not push the buffer over the limit');
    expect(notifySpy).toHaveBeenCalledWith();
    expect(sdk._logBufferSize).toEqual(14488);

    logging.log.call(sdk, LogLevels.info, 'This message goes over the limit');
    expect(notifySpy).toHaveBeenCalledWith(true);
  });
});

describe('notifyLogs', () => {
  it('should trigger backoff(send) immediately', async () => {
    sdk._backoff = { backoff: jest.fn() };
    logging.notifyLogs.call(sdk, true);
    expect(sdk._backoff.backoff).toHaveBeenCalled();
  });

  it('should debounce backoff(send) if not immediate', async () => {
    sdk._backoff = { backoff: jest.fn() };
    logging.notifyLogs.call(sdk);

    expect(sdk._backoff.backoff).not.toHaveBeenCalled();

    await timeout(900);
    expect(sdk._backoff.backoff).not.toHaveBeenCalled();

    logging.notifyLogs.call(sdk);
    await timeout(900);
    expect(sdk._backoff.backoff).not.toHaveBeenCalled();

    await timeout(200);
    expect(sdk._backoff.backoff).toHaveBeenCalled();
  });
});

describe('calculateLogMessageSize', () => {
  it('should calculate multibyte characters', () => {
    expect(logging.calculateLogMessageSize('a')).toBe(3);
    expect(logging.calculateLogMessageSize('¢')).toBe(4);
  });
});
