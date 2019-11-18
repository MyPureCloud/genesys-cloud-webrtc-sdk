import fetch from 'superagent';
import { PureCloudWebrtcSdk } from './client';
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

  constructor (errorType: SdkErrorTypes | null, message: string | null, details?: any) {
    super(message);
    this.type = errorType || SdkErrorTypes.generic;
    this.details = details;
  }
}

export function throwSdkError (this: PureCloudWebrtcSdk, errorType: SdkErrorTypes | null, message: string | null, details?: any): void {
  const error = new SdkError(errorType, message, details);
  this.emit('error', error);
  throw error;
}

export function buildUri (this: PureCloudWebrtcSdk, path: string, version: string = 'v2'): string {
  path = path.replace(/^\/+|\/+$/g, ''); // trim leading/trailing /
  return `https://api.${this._config.environment}/api/${version}/${path}`;
}

export function requestApi (this: PureCloudWebrtcSdk, path: string, { method, data, version, contentType, auth }: RequestApiOptions = {}): Promise<any> {
  let request = fetch[method || 'get'](buildUri.call(this, path, version));
  if (auth !== false) {
    request.set('Authorization', `Bearer ${auth || this._config.accessToken}`);
  }
  request.type(contentType || 'json');

  return request.send(data); // trigger request
}

// this is duplicated in streaming-client and valve. It may need to be its own package.
export function parseJwt (token: string): any {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));

  return JSON.parse(jsonPayload);
}

export function isAcdJid (jid: string): boolean {
  return jid.startsWith('acd-');
}

export function isScreenRecordingJid (jid: string): boolean {
  return jid.startsWith('screenrecording-');
}

export function isSoftphoneJid (jid: string): boolean {
  if (!jid) {
    return false;
  }
  return !!jid.match(/.*@.*gjoll.*/i);
}

export function isVideoJid (jid: string): boolean {
  return jid && !!jid.match(/@conference/);
}
