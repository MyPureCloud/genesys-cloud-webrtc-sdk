/* eslint @typescript-eslint/no-explicit-any: "off" */
import { ConnectionState, RequestApiOptions } from 'genesys-cloud-streaming-client';
import { RetryPromise } from 'genesys-cloud-streaming-client/dist/es/utils';

import { GenesysCloudWebrtcSdk } from './client';
import { SdkErrorTypes, LogLevels } from './types/enums';
import { IPendingSession, ISessionInfo } from './types/interfaces';
import { ILogger } from 'genesys-cloud-client-logger';
import { ConversationUpdate } from './conversations/conversation-update';

export class SdkError extends Error {
  type: SdkErrorTypes;
  details: any;

  // ignoring this due to a coverage issue relating to babel. https://github.com/Microsoft/TypeScript/issues/13029
  /* istanbul ignore next */
  constructor (errorType: SdkErrorTypes | null, messageOrError: string | Error, details?: any) {
    /* if a Error is passed in, use its message and name properties */
    const isError = messageOrError && messageOrError instanceof Error;
    super(isError ? (messageOrError as any).message : messageOrError);

    if (isError) {
      this.name = (messageOrError as any).name;
    }

    this.type = errorType || SdkErrorTypes.generic;
    this.details = details;
  }
}

/**
 * This will create an `SdkError`, emit the error on `sdk.on('sdkError', error)`,
 *  and return the error. It will not `throw` the error. It is up to the caller
 *  on what to do with it.
 * @param this sdk instance
 * @param errorType SdkError type
 * @param message message as string or Error instance
 * @param details any additional details to log with the error
 */
export const createAndEmitSdkError = function (this: GenesysCloudWebrtcSdk, errorType: SdkErrorTypes | null, messageOrError?: string | Error, details?: any): SdkError {
  const error = new SdkError(errorType, messageOrError, details);
  // Isolate us from any downstream throws
  setTimeout(() => {
    this.emit('sdkError', error);
  }, 0);
  return error;
};

export const defaultConfigOption = function (
  providedOption: any,
  defaultValue: any,
  defaultConditions: { undefined?: boolean, null?: boolean, falsy?: boolean } = { undefined: true, null: true, falsy: false }
): any {
  const undefCondition = typeof providedOption === 'undefined' && defaultConditions.undefined;
  const nullCondition = providedOption === null && defaultConditions.null;
  const falsyCondition = !providedOption && defaultConditions.falsy;

  if (undefCondition || nullCondition || falsyCondition) {
    return defaultValue;
  }

  return providedOption;
};

export const requestApiWithRetry = function (this: GenesysCloudWebrtcSdk, path: string, opts: Partial<RequestApiOptions> = {}): RetryPromise<any> {
  opts = buildRequestApiOptions(this, opts);
  const request = this._http.requestApiWithRetry(path, opts as RequestApiOptions);
  request.promise.catch(e => createAndEmitSdkError.call(this, SdkErrorTypes.http, e.message, e));

  return request;
};

export const requestApi = function (this: GenesysCloudWebrtcSdk, path: string, opts: Partial<RequestApiOptions> = {}): Promise<any> {
  opts = buildRequestApiOptions(this, opts);
  return this._http.requestApi(path, opts as RequestApiOptions)
    .catch(e => { createAndEmitSdkError.call(this, SdkErrorTypes.http, e.message, e); throw e; });
};

export function buildRequestApiOptions (sdk: GenesysCloudWebrtcSdk, opts: Partial<RequestApiOptions> = {}): Partial<RequestApiOptions> {
  if (!opts.noAuthHeader) {
    opts.authToken = opts.authToken || sdk._config.accessToken;
  }

  if (!opts.host) {
    opts.host = sdk._config.environment;
  }

  if (!opts.method) {
    opts.method = 'get';
  }

  if (!opts.customHeaders && sdk._config.customHeaders) {
    opts.customHeaders = sdk._config.customHeaders;
  }

  opts.customHeaders = {
    ...(sdk._config.customHeaders || {}),
    ...(opts.customHeaders || {})
  }

  return opts;
}

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

export const isAgentVideoJid = function (jid: string) {
  return isVideoJid(jid) && jid.startsWith('agent-');
};

export const isLiveScreenMonitorJid = function (jid: string) {
  return jid.startsWith('livemonitor-');
};

export const isVideoJid = function (jid: string): boolean {
  return jid && !!jid.match(/@conference/) && !isAcdJid(jid) && !isScreenRecordingJid(jid) && !isLiveScreenMonitorJid(jid);
};

export const isPeerConnectionDisconnected = function (state: ConnectionState) {
  const disconnectedStates: ConnectionState[] = ['interrupted', 'disconnected', 'failed', 'closed'];
  return disconnectedStates.includes(state);
}

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
    fromUserId: pendingSession.fromUserId,
    meetingId: pendingSession.meetingId
  };

  /* for pending sessions */
  if ((pendingSession as IPendingSession).sessionType) {
    data.sessionType = (pendingSession as IPendingSession).sessionType;
  }

  logger[level](message, data);
};

export function getBareJid (sdk: GenesysCloudWebrtcSdk) {
  return sdk._streamingConnection.config.jid;
}

export async function delay (timeMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, timeMs);
  });
}

export function removeAddressFieldFromConversationUpdate(update: ConversationUpdate) {
  if (Array.isArray(update)) {
    return update.map(removeAddressFieldFromConversationUpdate);
  } else if (update && typeof update === 'object') {
    const clone = {};
    for (const [key, value] of Object.entries(update)) {
      if (key !== 'address') {
        clone[key] = removeAddressFieldFromConversationUpdate(value);
      }
    }
    return clone;
  }
  return update;
}
