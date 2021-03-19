import { RequestApiOptions } from 'genesys-cloud-streaming-client/dist/es/types/interfaces';

import { GenesysCloudWebrtcSdk } from './client';
import { SdkErrorTypes, LogLevels } from './types/enums';
import { IPendingSession, ISessionInfo, ILogger } from './types/interfaces';

export class SdkError extends Error {
  type: SdkErrorTypes;
  details: any;

  // ignoring this due to a coverage issue relating to babel. https://github.com/Microsoft/TypeScript/issues/13029
  /* istanbul ignore next */
  constructor (errorType: SdkErrorTypes | null, message: string | null, details?: any) {
    super(message);
    this.type = errorType || SdkErrorTypes.generic;
    this.details = details;
  }
}

export const throwSdkError = function (this: GenesysCloudWebrtcSdk, errorType: SdkErrorTypes | null, message: string | null, details?: any): void {
  const error = new SdkError(errorType, message, details);
  this.emit('sdkError', error);
  throw error;
};

export const requestApiWithRetry = function (this: GenesysCloudWebrtcSdk, path: string, opts: Partial<RequestApiOptions> = {}): Promise<any> {
  return requestApi.call(this, path, opts, true);
};

export const requestApi = function (this: GenesysCloudWebrtcSdk, path: string, opts: Partial<RequestApiOptions> = {}, withRetry: boolean = false): Promise<any> {
  /* set defaults */
  if (!opts.noAuthHeader) {
    opts.authToken = opts.authToken || this._config.accessToken;
  }

  if (!opts.host) {
    opts.host = this._config.environment;
  }

  if (!opts.method) {
    opts.method = 'get';
  }

  if (withRetry) {
    return this._http.requestApiWithRetry(path, opts as RequestApiOptions);
  }

  return this._http.requestApi(path, opts as RequestApiOptions);
};

export const isAcdJid = function (jid: string): boolean {
  return jid.startsWith('acd-');
};

export const isScreenRecordingJid = function (jid: string): boolean {
  return jid.startsWith('screenrecording-');
};

export const isSoftphoneJid = function (jid: string): boolean {
  if (!jid) {
    return false;
  }
  return !!jid.match(/.*@.*gjoll.*/i);
};

export const isPeerVideoJid = function (jid: string) {
  return isVideoJid(jid) && jid.startsWith('peer-');
};

export const isVideoJid = function (jid: string): boolean {
  return jid && !!jid.match(/@conference/) && !isAcdJid(jid);
};

export const logPendingSession = function (
  logger: ILogger,
  message: string,
  pendingSession: IPendingSession | ISessionInfo,
  level: LogLevels = 'info'
): void {
  const data: any = {
    sessionId: (pendingSession as IPendingSession).id || (pendingSession as ISessionInfo).sessionId,
    autoAnswer: pendingSession.autoAnswer,
    conversationId: pendingSession.conversationId,
    originalRoomJid: pendingSession.originalRoomJid,
    fromUserId: pendingSession.fromUserId
  };

  /* for pending sessions */
  if ((pendingSession as IPendingSession).sessionType) {
    data.sessionType = (pendingSession as IPendingSession).sessionType;
  }

  logger[level](message, data);
};
