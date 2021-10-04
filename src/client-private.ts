import StreamingClient from 'genesys-cloud-streaming-client';

import { GenesysCloudWebrtcSdk } from './client';
import { SessionManager } from './sessions/session-manager';
import { SubscriptionEvent } from './types/interfaces';
import { ConversationUpdate } from './types/conversation-update';

/**
 * Establish the connection with the streaming client.
 *  Must be called after construction _before_ the SDK is used.
 * @param this must be called with a GenesysCloudWebrtcSdk as `this`
 */
export async function setupStreamingClient (this: GenesysCloudWebrtcSdk): Promise<void> {
  if (this.isInitialized && this.connected) {
    this.logger.warn('Existing streaming connection detected. Disconnecting and creating a new connection.');
    await this._streamingConnection.disconnect();
  }

  const connectionOptions: any = {
    signalIceConnected: true,
    host: this._config.wsHost || `wss://streaming.${this._config.environment}`,
    apiHost: this._config.environment,
    logger: this.logger,
    appName: 'webrtc-sdk',
    appVersion: this.VERSION
  };

  if (this._personDetails) {
    connectionOptions.jid = this._personDetails.chat.jabberId;
  }

  connectionOptions.jidResource = this._config.jidResource;

  if (this._config.accessToken) {
    connectionOptions.authToken = this._config.accessToken;
  }

  if (this._customerData && this._customerData.jwt) {
    connectionOptions.jwt = this._customerData.jwt;
  }

  this.logger.debug('Streaming client WebSocket connection options', connectionOptions);
  this._hasConnected = false;

  const connection = new StreamingClient(connectionOptions);
  this._streamingConnection = connection;

  const initialPromise = new Promise<void>((resolve) => {
    connection.on('connected', async () => {
      this.emit('connected', { reconnect: this._hasConnected });
      this.logger.info('GenesysCloud streaming client connected', { reconnect: this._hasConnected });
      this._hasConnected = true;
      // refresh turn servers every 6 hours
      this.logger.info('GenesysCloud streaming client ready for use');
      resolve();
    });

    connection.on('disconnected', async () => {
      this.logger.info('GenesysCloud streaming client disconnected');
    });
  });

  await connection.connect();
  await initialPromise;
}

/**
 * Set up proxy for streaming client events
 * @param this must be called with a GenesysCloudWebrtcSdk as `this`
 */
export async function proxyStreamingClientEvents (this: GenesysCloudWebrtcSdk): Promise<void> {
  this.sessionManager = new SessionManager(this);

  if (this._personDetails) {
    await this._streamingConnection.notifications.subscribe(`v2.users.${this._personDetails.id}.conversations`, handleConversationUpdate.bind(this), true);
  }

  // webrtc events
  const on = this._streamingConnection.webrtcSessions.on.bind(this._streamingConnection);
  on('requestIncomingRtcSession', this.sessionManager.onPropose.bind(this.sessionManager));
  on('incomingRtcSession', this.sessionManager.onSessionInit.bind(this.sessionManager));
  on('rtcSessionError', this.emit.bind(this, 'error'));
  on('cancelIncomingRtcSession', (sessionId: string) => this.emit('cancelPendingSession', sessionId));
  on('handledIncomingRtcSession', (sessionId: string) => this.emit('handledPendingSession', sessionId));
  on('traceRtcSession', this.emit.bind(this, 'trace'));

  // other events
  this._streamingConnection.on('error', this.emit.bind(this, 'sdkError'));
  this._streamingConnection.on('disconnected', () => this.emit('disconnected', 'Streaming API connection disconnected'));
}

export const handleConversationUpdate = function (this: GenesysCloudWebrtcSdk, updateEvent: SubscriptionEvent) {
  const update = new ConversationUpdate(updateEvent.eventBody);
  this.sessionManager.handleConversationUpdate(update);
};
