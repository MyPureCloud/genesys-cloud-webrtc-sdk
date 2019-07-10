import fetch from 'superagent';
import PureCloudWebrtcSdk from './client';

function buildUri (this: PureCloudWebrtcSdk, path: string, version: string = 'v2'): string {
  path = path.replace(/^\/+|\/+$/g, ''); // trim leading/trailing /
  return `https://api.${this._environment}/api/${version}/${path}`;
}

function requestApi (this: PureCloudWebrtcSdk, path, { method, data, version, contentType, auth }: any = {}) {
  let request = fetch[method || 'get'](buildUri.call(this, path, version));
  if (auth !== false) {
    request.set('Authorization', `Bearer ${auth || this._accessToken}`);
  }
  request.type(contentType || 'json');

  return request.send(data); // trigger request
}

function rejectErr (this: PureCloudWebrtcSdk, message: any, details: any) {
  const error = new Error(message);
  error['details'] = details;
  this.emit('error', message, details);
  throw error;
}

export {
  buildUri,
  requestApi,
  rejectErr
};
