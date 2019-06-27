const fetch = require('superagent');

function buildUri (path, version = 'v2') {
  path = path.replace(/^\/+|\/+$/g, ''); // trim leading/trailing /
  return `https://api.${this._environment}/api/${version}/${path}`;
}

function requestApi (path, { method, data, version, contentType, auth } = {}) {
  let request = fetch[method || 'get'](buildUri.call(this, path, version));
  if (auth !== false) {
    request.set('Authorization', `Bearer ${auth || this._accessToken}`);
  }
  request.type(contentType || 'json');

  return request.send(data); // trigger request
}

function rejectErr (message, details) {
  const error = new Error(message);
  error.details = details;
  this.emit('error', message, details);
  throw error;
}

module.exports = {
  buildUri,
  requestApi,
  rejectErr
};
