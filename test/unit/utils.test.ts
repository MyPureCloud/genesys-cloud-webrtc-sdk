import { RequestApiOptions } from 'genesys-cloud-streaming-client/dist/es/types/interfaces';
import { parseJwt, ISessionInfo } from 'genesys-cloud-streaming-client';
import AxiosMockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { SimpleMockSdk } from '../test-utils';
import { GenesysCloudWebrtcSdk } from '../../src/client';
import * as utils from '../../src/utils';
import { SdkErrorTypes, SessionTypes, SdkError } from '../../src/';
import { MOCK_CUSTOMER_DATA } from '../mock-apis';
import { IPendingSession } from '../../src/types/interfaces';
import { ILogger } from 'genesys-cloud-client-logger';

let sdk: GenesysCloudWebrtcSdk;
const baseUriWithoutVersion = 'https://api.mypurecloud.com/api';
const baseUri = `${baseUriWithoutVersion}/v2`;

beforeEach(() => {
  sdk = new SimpleMockSdk() as any;
});

describe('SdkError', () => {
  it('should create with defaults', () => {
    const sdkError = new SdkError(null, 'erroring');
    expect(sdkError.name).toBe('Error');
    expect(sdkError.type).toBe(SdkErrorTypes.generic);
    expect(sdkError.message).toBe('erroring');
    expect(sdkError.details).toBe(undefined);
  });

  it('should "extend" any base error passed in', () => {
    const origError = new TypeError('Cannot use array here');
    const details = { sessionId: '123' };
    const sdkError = new SdkError(SdkErrorTypes.invalid_options, origError, details);

    expect(sdkError.name).toBe('TypeError');
    expect(sdkError.type).toBe('invalid_options');
    expect(sdkError.message).toBe('Cannot use array here');
    expect(sdkError.details).toBe(details);
  });
});

describe('createAndEmitSdkError', () => {
  it('should emit and return an SdkError', () => {
    const spy = jest.fn();
    const origError = new Error('Something broke');
    sdk.on('sdkError', spy);

    expect(
      utils.createAndEmitSdkError.call(sdk, SdkErrorTypes.generic, origError)
    ).toEqual(origError);
    expect(spy).toHaveBeenCalledWith(origError);
  });
});

describe('defaultConfigOption', () => {
  describe('undefined condition', () => {
    it('should return default', () => {
      const provided = undefined;
      const defaultVal = 'default';

      expect(utils.defaultConfigOption(provided, defaultVal, { undefined: true })).toBe(defaultVal);
    });

    it('should return provided', () => {
      const provided = 'provided';
      const defaultVal = 'default';

      expect(utils.defaultConfigOption(provided, defaultVal, { undefined: true })).toBe(provided);
    });
  });

  describe('null condition', () => {
    it('should return default', () => {
      const provided = null;
      const defaultVal = 'default';

      expect(utils.defaultConfigOption(provided, defaultVal, { null: true })).toBe(defaultVal);
    });

    it('should return provided', () => {
      const provided = 'provided';
      const defaultVal = 'default';

      expect(utils.defaultConfigOption(provided, defaultVal, { null: true })).toBe(provided);
    });
  });

  describe('falsy condition', () => {
    it('should return default', () => {
      const provided = false;
      const defaultVal = 'default';

      expect(utils.defaultConfigOption(provided, defaultVal, { falsy: true })).toBe(defaultVal);
    });

    it('should return provided', () => {
      const provided = 'provided';
      const defaultVal = false;

      expect(utils.defaultConfigOption(provided, defaultVal, { falsy: true })).toBe(provided);
    });
  });
});

describe('requestApiWithRetry', () => {
  it('should make request with retry enabled', async () => {
    const httpSpy = jest.spyOn(sdk._http, 'requestApiWithRetry').mockReturnValue({ promise: Promise.resolve() } as any);

    await utils.requestApiWithRetry.call(sdk, '/path');

    expect(httpSpy).toHaveBeenCalled();
  });

  it('should emit any errors thrown', async () => {
    const error = new Error('This request ruptured. Good luck fixing it.');
    const sdkError = new SdkError(SdkErrorTypes.http, error.message, error);

    const waitForErrorToEmit = new Promise<void>((res, rej) => {
      sdk.on('sdkError', (sdkErr) => {
        expect(sdkErr).toEqual(sdkError);
        res();
      });
      setTimeout(rej, 1000);
    });

    jest.spyOn(sdk._http, 'requestApiWithRetry').mockReturnValue({ promise: Promise.reject(error) } as any);

    try {
      await utils.requestApiWithRetry.call(sdk, '/doo').promise;
      fail('it should have thrown');
    } catch (error) {
      expect(error).toEqual(error);
    }

    await waitForErrorToEmit;
  });
});

describe('requestApi', () => {
  beforeEach(() => {
    const mockAxios = new AxiosMockAdapter(axios)
    mockAxios.onGet('/path').reply(200, {});
  });

  it('should set defaults', async () => {
    sdk._config.accessToken = 'abrakadabra';
    sdk._config.environment = 'inindca.notreally';

    const httpSpy = jest.spyOn(sdk._http, 'requestApi').mockResolvedValue({});

    await utils.requestApi.call(sdk, '/path');

    expect(httpSpy).toHaveBeenCalledWith('/path', {
      authToken: sdk._config.accessToken,
      host: sdk._config.environment,
      method: 'get'
    });
  });

  it('should use passed in params', async () => {
    const authToken = 'abrakadabra';
    const host = 'notreally.dca';
    const method = 'put';

    const httpSpy = jest.spyOn(sdk._http, 'requestApi').mockResolvedValue({});

    await utils.requestApi.call(sdk, '/path', { authToken, method, host });

    expect(httpSpy).toHaveBeenCalledWith('/path', {
      authToken,
      method,
      host
    });
  });

  it('should make request with auth', async () => {
    const token = 'abrakadabra';
    sdk._config.accessToken = token;
    const httpSpy = jest.spyOn(sdk._http, 'requestApi').mockResolvedValue({});
    await utils.requestApi.call(sdk, '/');
    expect(httpSpy).toHaveBeenCalledWith('/', expect.objectContaining({ authToken: token}));
  });

  it('should make request without auth', async () => {
    sdk._config.accessToken = 'abrakadabra';

    const httpSpy = jest.spyOn(sdk._http, 'requestApi').mockResolvedValue({});

    await utils.requestApi.call(sdk, '/', { noAuthHeader: true });

    expect(httpSpy).toHaveBeenCalledWith('/', {
      method: 'get',
      host: 'mypurecloud.com',
      noAuthHeader: true
    });
  });
});

describe('buildRequestApiOptions', () => {
  it('should return with defaults', () => {
    const authToken = 'secret';
    const host = 'inindca.com';

    sdk._config.accessToken = authToken;
    sdk._config.environment = host;

    const expected: Partial<RequestApiOptions> = {
      authToken,
      host,
      method: 'get'
    };

    expect(utils.buildRequestApiOptions(sdk)).toEqual(expected);
  });

  it('should use passed in params', () => {
    const authToken = 'secret';
    const host = 'inindca.com';
    const method = 'post';

    const expected: Partial<RequestApiOptions> = {
      authToken,
      host,
      method
    };

    expect(utils.buildRequestApiOptions(sdk, {
      host,
      authToken,
      method
    })).toEqual(expected);
  });

  it('should use the correct auth token', () => {
    const noAuthHeader = true;
    const host = 'inindca.com';
    const method = 'get';

    const expected: Partial<RequestApiOptions> = {
      noAuthHeader,
      host,
      method
    };

    expect(utils.buildRequestApiOptions(sdk, {
      host,
      noAuthHeader,
      method
    })).toEqual(expected);
  });
});

describe('parseJwt', () => {
  it('should parse correctly', () => {
    const data = parseJwt(MOCK_CUSTOMER_DATA.jwt);
    expect(data).toEqual({
      data: {
        jid: 'acd-c20165d5-a47f-4397-b9f3-7237d29abfe0-543172@conference.TEST-valve-1ym37mj1kao.orgspan.com'
      },
      exp: 1563649410,
      iat: 1563564352,
      iss: 'urn:purecloud:conversation',
      org: '80883333-8617-472f-8274-58d5b9a10033'
    });
  });
});

describe('jid utils', () => {
  it('isAcdJid', () => {
    expect(utils.isAcdJid('acd-sdkfjk@test.com')).toBeTruthy();
    expect(utils.isAcdJid('sdkfjk@test.com')).toBeFalsy();
  });

  it('isScreenRecordingJid', () => {
    expect(utils.isScreenRecordingJid('screenrecording-sdkfjk@test.com')).toBeTruthy();
    expect(utils.isScreenRecordingJid('sdkfjk@test.com')).toBeFalsy();
  });

  it('isSoftphoneJid', () => {
    expect(utils.isSoftphoneJid('sdkfjk@gjoll.test.com')).toBeTruthy();
    expect(utils.isSoftphoneJid('sdkfjk@test.com')).toBeFalsy();
    expect(utils.isSoftphoneJid('')).toBeFalsy();
  });

  it('isVideoJid', () => {
    expect(utils.isVideoJid('sdkfjk@conference.test.com')).toBeTruthy();
    expect(utils.isVideoJid('screenrecording-sdkfjk@conference.test.com')).toBeFalsy();
    expect(utils.isVideoJid('acd-sdkfjk@conference.test.com')).toBeFalsy();
    expect(utils.isVideoJid('sdkfjk@test.com')).toBeFalsy();
  });

  it('isPeerVideoJid', () => {
    expect(utils.isPeerVideoJid('acd-sdkfjk@conference.test.com')).toBeFalsy();
    expect(utils.isPeerVideoJid('sdkfjk@test.com')).toBeFalsy();
    expect(utils.isPeerVideoJid('sdkfjk@conference.test.com')).toBeFalsy();
    expect(utils.isPeerVideoJid('peer-sdkfjk@conference.test.com')).toBeTruthy();
  });
});

describe('logPendingSession()', () => {
  it('should add sessionType if a pending session', () => {
    const logger: ILogger = { debug: jest.fn() } as any;
    const loggyMessage = 'How can cows jump over the moon?';
    const pendingSession: IPendingSession = {
      sessionId: 'sessId',
      autoAnswer: false,
      conversationId: 'walkie-talkie',
      fromUserId: 'user-abc',
      sessionType: SessionTypes.collaborateVideo
    } as any;

    utils.logPendingSession(logger, loggyMessage, pendingSession, 'debug');

    expect(logger.debug).toHaveBeenCalledWith(loggyMessage, pendingSession);
  });

  it('should not add sessionType if not a pending session', () => {
    const logger: ILogger = { debug: jest.fn() } as any;
    const loggyMessage = 'What does the fox say';
    const pendingSession: ISessionInfo = {
      sessionId: 'sessId',
      autoAnswer: false,
      conversationId: 'walkie-talkie',
      fromUserId: 'user-abc'
    } as any;

    utils.logPendingSession(logger, loggyMessage, pendingSession, 'debug');

    expect(logger.debug).toHaveBeenCalledWith(loggyMessage, pendingSession);
  });
});

describe('getBareJid', () => {
  it('should get the bareJid', () => {
    const jid = 'mybarejid@myorg.orgspan.conference.com';
    const sdk = {
      _streamingConnection: {
        config: {
          jid
        }
      }
    };

    expect(utils.getBareJid(sdk as any)).toEqual(jid);
  });
});