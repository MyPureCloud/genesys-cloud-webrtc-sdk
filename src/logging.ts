import Logger, { ILogger } from 'genesys-cloud-client-logger';

import { GenesysCloudWebrtcSdk } from './client';

export function setupLogging (this: GenesysCloudWebrtcSdk, logger?: ILogger) {
  const {
    logLevel,
    accessToken,
    optOutOfTelemetry,
    originAppId,
    originAppName,
    originAppVersion,
    logFormatters,
  } = this._config;

  this.logger = new Logger({
    accessToken,
    logLevel,
    url: `https://api.${this._config.environment}/api/v2/diagnostics/trace`,
    appVersion: this.VERSION,
    appName: 'webrtc-sdk',
    uploadDebounceTime: 1000,
    initializeServerLogging: !(this.isGuest || optOutOfTelemetry),
    logger,
    formatters: logFormatters,
    /* consumerApp info */
    originAppId,
    originAppName,
    originAppVersion
  });

  if (this.isGuest) {
    this.logger.debug('Guest user. Not logging to server', null, { skipServer: true });
    return;
  }

  this.logger.debug('Authenticated user. Initializing server logging', null, { skipServer: true });
}
