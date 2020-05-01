import { PureCloudWebrtcSdk } from './client';

import { ILogger } from './types/interfaces';
import { createLogger } from 'genesys-cloud-client-logger';

let APP_VERSION = '[AIV]{version}[/AIV]'; // injected by webpack auto-inject-version

// check if it was replaced.
// if it wasn't we're being imported or required from source, so get it from package.json
/* istanbul ignore next */
if (APP_VERSION.indexOf('AIV') > -1 &&
  APP_VERSION.indexOf('{version}') > -1 &&
  APP_VERSION.indexOf('/AIV') > -1) {
  APP_VERSION = require('../package.json').version;
}

export function setupLogging (this: PureCloudWebrtcSdk, logger?: ILogger) {
  this.logger = logger;

  if (logger || this._config.optOutOfTelemetry) {
    // using provided logger, do nothing
    return;
  }

  const cloudLogger = this.logger = createLogger();

  if (this.isGuest) {
    this.logger.debug('Guest user. Not logging to server', null, true);
    return;
  }

  this.logger.debug('Authenticated user. Initializing server logging', null, true);

  cloudLogger.initializeServerLogging({
    accessToken: this._config.accessToken,
    environment: this._config.environment,
    appVersion: APP_VERSION,
    logTopic: 'purecloud-webrtc-sdk',
    logLevel: this._config.logLevel,
    uploadDebounceTime: 1000
  });
}
