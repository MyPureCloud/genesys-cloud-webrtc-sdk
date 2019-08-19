import fetch from 'superagent';
import PureCloudWebrtcSdk from './client';

interface RequestApiOptions {
  method?: string;
  data?: any;
  version?: string;
  contentType?: string;
  auth?: string | boolean;
}

export function buildUri (this: PureCloudWebrtcSdk, path: string, version: string = 'v2'): string {
  path = path.replace(/^\/+|\/+$/g, ''); // trim leading/trailing /
  return `https://api.${this._environment}/api/${version}/${path}`;
}

export function requestApi (this: PureCloudWebrtcSdk, path: string, { method, data, version, contentType, auth }: RequestApiOptions = {}): Promise<any> {
  let request = fetch[method || 'get'](buildUri.call(this, path, version));
  if (auth !== false) {
    request.set('Authorization', `Bearer ${auth || this._accessToken}`);
  }
  request.type(contentType || 'json');

  return request.send(data); // trigger request
}

export function rejectErr (this: PureCloudWebrtcSdk, message: string, details: any) {
  const error = new Error(message);
  error['details'] = details;
  this.emit('error', message, details);
  throw error;
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
