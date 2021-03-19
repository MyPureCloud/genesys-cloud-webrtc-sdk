import nock = require('nock');
import { parseJwt } from 'genesys-cloud-streaming-client';

import { SimpleMockSdk, MOCK_CUSTOMER_DATA } from '../test-utils';
import { GenesysCloudWebrtcSdk } from '../../src/client';
import * as utils from '../../src/utils';
import { SdkErrorTypes } from '../../src/types/enums';

let sdk: GenesysCloudWebrtcSdk;
const baseUriWithoutVersion = 'https://api.mypurecloud.com/api';
const baseUri = `${baseUriWithoutVersion}/v2`;

beforeEach(() => {
  sdk = new SimpleMockSdk() as any;
});

describe('throwSdkError', () => {
  it('should emit the error', () => {
    const spy = jest.fn();
    sdk.on('sdkError', spy);

    expect(() => utils.throwSdkError.call(sdk, SdkErrorTypes.generic, 'fake')).toThrowError(/fake/);
  });
});

describe('requestApiWithRetry', () => {
  it('should make request with retry enabled', async () => {
    const httpSpy = jest.spyOn(sdk._http, 'requestApiWithRetry').mockResolvedValue({});

    await utils.requestApiWithRetry.call(sdk, '/path');

    expect(httpSpy).toHaveBeenCalled();
  });
});

describe('requestApi', () => {
  let scope: nock.Scope;
  let intercept;

  beforeEach(() => {
    nock.cleanAll();

    scope = nock(baseUri);
    intercept = scope.get('/');
    intercept.reply(200, {});
  });

  afterAll(() => {
    nock.cleanAll();
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
    await utils.requestApi.call(sdk, '/');
    expect(intercept.req._headers['authorization']).toEqual(`Bearer ${token}`);
  });

  it('should make request without auth', async () => {
    const token = 'abrakadabra';
    sdk._config.accessToken = token;
    await utils.requestApi.call(sdk, '/', { noAuthHeader: true });
    expect(intercept.req._headers['authorization']).toBeUndefined();
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

describe('SdkError', () => {
  it('should handle default type', () => {
    const error = new utils.SdkError(undefined, 'test');
    expect(error.type).toEqual(SdkErrorTypes.generic);
  });
});
