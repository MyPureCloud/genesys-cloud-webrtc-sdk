import Logger from 'genesys-cloud-client-logger';

import { GenesysCloudWebrtcSdk } from './client';
import { ILogger } from './types/interfaces';

export function setupLogging (this: GenesysCloudWebrtcSdk, logger?: ILogger) {
  this.logger = logger || console;

  if (logger || this._config.optOutOfTelemetry) {
    // using provided logger, do nothing
    return;
  }

  this.logger = new Logger({
    accessToken: this._config.accessToken,
    url: `https://api.${this._config.environment}/api/v2/diagnostics/trace`,
    appVersion: this.VERSION,
    logTopic: 'webrtc-sdk',
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
