import Logger, { ILogger } from 'genesys-cloud-client-logger';

import { GenesysCloudWebrtcSdk } from './client';

export function setupLogging (this: GenesysCloudWebrtcSdk, logger?: ILogger) {
  const {
    logLevel,
    optOutOfTelemetry,
    originAppId,
    originAppName,
    originAppVersion,
    logFormatters,
    customHeaders
  } = this._config;

  let url = `https://api.${this._config.environment}/api/v2/diagnostics/trace`;
  let accessToken = this._config.accessToken;

  if (this.isJwtAuth) {
    url += '/backgroundassistant';
    accessToken = this._config.jwt;
  }
  
  this.logger = new Logger({
    accessToken,
    logLevel,
    url,
    appVersion: this.VERSION,
    appName: 'webrtc-sdk',
    uploadDebounceTime: 1000,
    initializeServerLogging: !(this.isGuest || optOutOfTelemetry),
    logger,
    formatters: logFormatters,
    /* consumerApp info */
    originAppId,
    originAppName,
    originAppVersion,
    customHeaders
  });

  if (this.isGuest) {
    this.logger.debug('Guest user. Not logging to server', null, { skipServer: true });
    return;
  }

  this.logger.debug('Authenticated user. Initializing server logging', null, { skipServer: true });
}
