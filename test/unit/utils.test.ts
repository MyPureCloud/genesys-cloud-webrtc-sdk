import { SimpleMockSdk, MOCK_CUSTOMER_DATA } from '../test-utils';
import { GenesysCloudWebrtcSdk } from '../../src/client';
import * as utils from '../../src/utils';
import { SdkErrorTypes } from '../../src/types/enums';
import { SdkError } from '../../src/utils';
import nock = require('nock');

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
    expect(sdkError.type).toBe('generic');
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

describe('buildUri', () => {
  it('should trim leading and trailing slashes', () => {
    expect(utils.buildUri.call(sdk, 'test')).toEqual(`${baseUri}/test`);
    expect(utils.buildUri.call(sdk, '/test')).toEqual(`${baseUri}/test`);
    expect(utils.buildUri.call(sdk, '/test/')).toEqual(`${baseUri}/test`);
    expect(utils.buildUri.call(sdk, '/test/', 'v4')).toEqual(`${baseUriWithoutVersion}/v4/test`);
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

  it('should make request with auth', async () => {
    const token = 'abrakadabra';
    sdk._config.accessToken = token;
    await utils.requestApi.call(sdk, '/');
    expect(intercept.req._headers['authorization']).toEqual(`Bearer ${token}`);
  });

  it('should make request without auth', async () => {
    const token = 'abrakadabra';
    sdk._config.accessToken = token;
    await utils.requestApi.call(sdk, '/', { auth: false });
    expect(intercept.req._headers['authorization']).toBeUndefined();
  });
});

describe('parseJwt', () => {
  it('should parse correctly', () => {
    const data = utils.parseJwt(MOCK_CUSTOMER_DATA.jwt);
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
