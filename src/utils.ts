import fetch from 'superagent';
import { GenesysCloudWebrtcSdk } from './client';
import { SdkErrorTypes } from './types/enums';

interface RequestApiOptions {
  method?: string;
  data?: any;
  version?: string;
  contentType?: string;
  auth?: string | boolean;
}

export class SdkError extends Error {
  type: SdkErrorTypes;
  details: any;

  // ignoring this due to a coverage issue relating to babel. https://github.com/Microsoft/TypeScript/issues/13029
  /* istanbul ignore next */
  constructor (errorType: SdkErrorTypes | null, messageOrError: string | Error, details?: any) {
    /* if a Error is passed in, use its message and name properties */
    const isError = messageOrError && messageOrError instanceof Error;
    super(isError ? (messageOrError as any).message : messageOrError);

    if (isError) {
      this.name = (messageOrError as any).name;
    }

    this.type = errorType || SdkErrorTypes.generic;
    this.details = details;
  }
}

/**
 * This will create an `SdkError`, emit the error on `sdk.on('sdkError', error)`,
 *  and return the error. It will not `throw` the error. It is up to the caller 
 *  on what to do with it. 
 * @param this sdk instance
 * @param errorType SdkError type
 * @param message message as string or Error instance
 * @param details any additional details to log with the error
 */
export const createAndEmitSdkError = function (this: GenesysCloudWebrtcSdk, errorType: SdkErrorTypes | null, messageOrError?: string | Error, details?: any): SdkError {
  const error = new SdkError(errorType, messageOrError, details);
  this.emit('sdkError', error);
  return error;
};

export const buildUri = function (this: GenesysCloudWebrtcSdk, path: string, version: string = 'v2'): string {
  path = path.replace(/^\/+|\/+$/g, ''); // trim leading/trailing /
  return `https://api.${this._config.environment}/api/${version}/${path}`;
};

export const requestApi = function (this: GenesysCloudWebrtcSdk, path: string, { method, data, version, contentType, auth }: RequestApiOptions = {}): Promise<any> {
  let request = fetch[method || 'get'](buildUri.call(this, path, version));
  if (auth !== false) {
    request.set('Authorization', `Bearer ${auth || this._config.accessToken}`);
  }
  request.type(contentType || 'json');

  return request.send(data); // trigger request
};

// this is duplicated in streaming-client and valve. It may need to be its own package.
export const parseJwt = function (token: string): any {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));

  return JSON.parse(jsonPayload);
};

export const isAcdJid = function (jid: string): boolean {
  return jid.startsWith('acd-');
};

export const isScreenRecordingJid = function (jid: string): boolean {
  return jid.startsWith('screenrecording-');
};

export const isSoftphoneJid = function (jid: string): boolean {
  if (!jid) {
    return false;
  }
  return !!jid.match(/.*@.*gjoll.*/i);
};

export const isPeerVideoJid = function (jid: string) {
  return isVideoJid(jid) && jid.startsWith('peer-');
};

export const isVideoJid = function (jid: string): boolean {
  return jid && !!jid.match(/@conference/) && !isAcdJid(jid);
};
