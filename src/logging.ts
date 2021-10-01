import Logger from 'genesys-cloud-client-logger';

import { GenesysCloudWebrtcSdk } from './client';
import { ILogger } from './types/interfaces';

let APP_VERSION = '[AIV]{version}[/AIV]'; // injected by webpack auto-inject-version

// check if it was replaced.
// if it wasn't we're being imported or required from source, so get it from package.json
/* istanbul ignore next */
if (APP_VERSION.indexOf('AIV') > -1 &&
  APP_VERSION.indexOf('{version}') > -1 &&
  APP_VERSION.indexOf('/AIV') > -1) {
  APP_VERSION = require('../package.json').version;
}

export function setupLogging (this: GenesysCloudWebrtcSdk, logger?: ILogger) {
  this.logger = logger || console;

  if (logger || this._config.optOutOfTelemetry) {
    // using provided logger, do nothing
    return;
  }

  this.logger = new Logger({
    accessToken: this._config.accessToken,
    url: `https://api.${this._config.environment}/api/v2/diagnostics/trace`,
    appVersion: APP_VERSION,
    logTopic: 'genesys-cloud-webrtc-sdk',
    logLevel: this._config.logLevel,
    uploadDebounceTime: 1000,
    initializeServerLogging: !this.isGuest
  });

  if (this.isGuest) {
    this.logger.debug('Guest user. Not logging to server', null, true);
    return;
  }

  this.logger.debug('Authenticated user. Initializing server logging', null, true);
}
