import PureCloudWebrtcSdk from './client';
import stringify from 'safe-json-stringify';
import backoff from 'backoff-web';

import { requestApi } from './utils';
const LOG_LEVELS = ['debug', 'log', 'info', 'warn', 'error'];
const PAYLOAD_TOO_LARGE = 413;
// declare const log: CallableFunction;

let APP_VERSION = '[AIV]{version}[/AIV]'; // injected by webpack auto-inject-version

// check if it was replaced.
// if it wasn't we're being imported or required from source, so get it from package.json
if (APP_VERSION.indexOf('AIV') > -1 &&
  APP_VERSION.indexOf('{version}') > -1 &&
  APP_VERSION.indexOf('/AIV') > -1) {
  APP_VERSION = require('../package.json').version;
}

function log (this: PureCloudWebrtcSdk, level, message, details?: any) {
  // immediately log it locally
  this.logger[level]('SDK:', message, details);

  // ex: if level is debug and config is warn, then debug is less than warn, don't push
  if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(this._logLevel)) {
    return;
  }

  if (this._optOutOfTelemetry) {
    return;
  }

  const log = {
    clientTime: new Date().toISOString(),
    clientId: this._clientId,
    message,
    details
  };
  const logContainer = {
    topic: `purecloud-webrtc-sdk`,
    level: level.toUpperCase(),
    message: stringify(log)
  };
  this._logBuffer.push(logContainer);
  notifyLogs.call(this); // debounced sendLogs
}

function notifyLogs (this: PureCloudWebrtcSdk) {
  if (this._logTimer) {
    clearTimeout(this._logTimer);
  }
  this._logTimer = setTimeout(() => {
    if (!this._backoffActive) {
      this._backoff.backoff();
    }
  }, 1000);
}

function sendLogs (this: PureCloudWebrtcSdk) {
  const traces = getLogPayload.call(this);
  const payload = {
    app: {
      appId: 'webrtc-sdk',
      appVersion: APP_VERSION
    },
    traces
  };

  if (traces.length === 0) {
    return Promise.resolve();
  }

  return requestApi.call(this, '/diagnostics/trace', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    data: JSON.stringify(payload)
  }).then(() => {
    this.logger.log('Log data sent successfully');
    resetBackoffFlags.call(this);
    this._backoff.reset();

    if (this._logBuffer.length) {
      this.logger.log('Data still left in log buffer, preparing to send again');
      this._backoff.backoff();
    }
  }).catch((error) => {
    this._failedLogAttempts++;

    if (error.status === PAYLOAD_TOO_LARGE) {
      this.logger.error(error);

      // If sending a single log is too big, then scrap it and reset backoff
      if (traces.length === 1) {
        resetBackoffFlags.call(this);
        this._backoff.reset();
        return;
      }

      this._reduceLogPayload = true;
    } else {
      this.logger.error('Failed to post logs to server', traces);
    }

    // Put traces back into buffer in their original order
    const reverseTraces = traces.reverse(); // Reverse traces so they will be unshifted into their original order
    reverseTraces.forEach((log) => this._logBuffer.unshift(log));
  });
}

function setupLogging (this: PureCloudWebrtcSdk, logger, logLevel) {
  this._logBuffer = [];
  this._logTimer = null;
  this.logger = logger || console;
  if (LOG_LEVELS.indexOf(logLevel) === -1) {
    if (logLevel) {
      this.logger.warn(`Invalid log level: '${logLevel}'. Default 'info' will be used instead.`);
    }
    this._logLevel = 'info';
  } else {
    this._logLevel = logLevel;
  }

  this._backoffActive = false;
  this._failedLogAttempts = 0;
  this._reduceLogPayload = false;
  this._backoff = backoff.exponential({
    randomisationFactor: 0.2,
    initialDelay: 500,
    maxDelay: 5000,
    factor: 2
  });
  initializeBackoff.call(this);
}

function initializeBackoff (this: PureCloudWebrtcSdk) {
  this._backoff.failAfter(20);

  this._backoff.on('backoff', (num, delay) => {
    this._backoffActive = true;
    return sendLogs.call(this);
  });

  this._backoff.on('ready', (num, delay) => {
    this._backoff.backoff();
  });

  this._backoff.on('fail', (num, delay) => {
    this._backoffActive = false;
  });
}

function getLogPayload (this: PureCloudWebrtcSdk) {
  let traces;
  if (this._reduceLogPayload) {
    const bufferDivisionFactor = this._failedLogAttempts || 1;
    traces = getReducedLogPayload.call(this, bufferDivisionFactor);
  } else {
    traces = this._logBuffer.splice(0, this._logBuffer.length);
  }

  return traces;
}

function getReducedLogPayload (this: PureCloudWebrtcSdk, reduceFactor) {
  const reduceBy = reduceFactor * 2;
  const itemsToGet = Math.floor(this._logBuffer.length / reduceBy) || 1;
  const traces = this._logBuffer.splice(0, itemsToGet);
  return traces;
}

function resetBackoffFlags (this: PureCloudWebrtcSdk) {
  this._backoffActive = false;
  this._failedLogAttempts = 0;
  this._reduceLogPayload = false;
}

export {
  log,
  setupLogging
};
