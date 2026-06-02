import StreamingClient, { IClientOptions } from 'genesys-cloud-streaming-client';

import { GenesysCloudWebrtcSdk } from './client';
import { SessionManager } from './sessions/session-manager';
import { SubscriptionEvent } from './types/interfaces';
import { ConversationUpdate } from './conversations/conversation-update';
import { isAgentVideoJid, isPeerConnectionDisconnected } from "./utils";
import {Constants} from "stanza";

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

  const {
    optOutOfTelemetry,
    wsHost,
    environment,
    originAppId,
    originAppName,
    originAppVersion,
    customHeaders
  } = this._config;

  const connectionOptions: IClientOptions = {
    signalIceConnected: true,
    host: wsHost || `wss://streaming.${environment}`,
    apiHost: environment,
    logger: this.logger['secondaryLogger'],
    logLevel: this._config.logLevel,
    appName: originAppName || 'webrtc-sdk',
    appVersion: originAppVersion || this.VERSION,
    appId: originAppId || this.logger.clientId,
    optOutOfWebrtcStatsTelemetry: optOutOfTelemetry,
    customHeaders: customHeaders || undefined
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

  if (this.isJwtAuth) {
    connectionOptions.jwt = this._config.jwt;
  }

  connectionOptions.useServerSidePings = !!this._config.useServerSidePings;
  connectionOptions.alertableInteractionTypes = this._config.alertableInteractionTypes;

  connectionOptions.logFormatters = this._config.logFormatters;
  this.logger.debug('Streaming client WebSocket connection options', connectionOptions);
  this._hasConnected = false;

  const connection = new StreamingClient(connectionOptions);
  this._streamingConnection = connection;
  this._pauseDisconnectedMessages = false;

  const initialPromise = new Promise<void>((resolve) => {
    connection.on('connected', async () => {
      this._pauseDisconnectedMessages = false;
      this.emit('connected', { reconnect: this._hasConnected });
      this.logger.info('GenesysCloud streaming client connected', { reconnect: this._hasConnected });

      /* on reconnect, clean up any sessions that were active before the disconnect but whose peer connections are now dead */
      if (this._hasConnected && this.sessionManager) {
        cleanupOrphanedSessions.call(this);
      }

      this._hasConnected = true;
      // refresh turn servers every 6 hours
      this.logger.info('GenesysCloud streaming client ready for use');
      resolve();
    });

    connection.on('disconnected', handleDisconnectedEvent.bind(this));
  });

  await connection.connect({ maxConnectionAttempts: Infinity });
  await initialPromise;
}

/**
 * Set up proxy for streaming client events
 * @param this must be called with a GenesysCloudWebrtcSdk as `this`
 */
export async function proxyStreamingClientEvents (this: GenesysCloudWebrtcSdk): Promise<void> {
  this.sessionManager = new SessionManager(this);

  if (this._personDetails) {
    if (this.isJwtAuth) {
      const convId = this._customerData.conversation?.id;
      const isGuest = !this._personDetails?.id;
      const roomJid = this._personDetails.chat?.jabberId;
      if (convId && isGuest && isAgentVideoJid(roomJid)) {
        this._streamingConnection.on(`notify:v2.guest.conversations.${convId}`, (conversationEvent) => {
          handleConversationUpdate.call(this, conversationEvent);
        });
      }
    } else {
      await this._streamingConnection.notifications.subscribe(`v2.users.${this._personDetails.id}.conversations`, handleConversationUpdate.bind(this), true);
    }
  }

  // webrtc events
  const on = this._streamingConnection.webrtcSessions.on.bind(this._streamingConnection);
  on('requestIncomingRtcSession', this.sessionManager.onPropose.bind(this.sessionManager));
  on('incomingRtcSession', this.sessionManager.onSessionInit.bind(this.sessionManager));
  on('rtcSessionError', this.emit.bind(this, 'error' as unknown as Parameters<typeof this.emit>[0]));
  on('traceRtcSession', this.emit.bind(this, 'trace' as unknown as Parameters<typeof this.emit>[0]));

  /* if streaming-client is emitting these events, that means we should have the pendingSession stored where we can look up the corresponding conversationId – and it won't interfere with any persistent connection */
  on('cancelIncomingRtcSession', this.sessionManager.onCancelPendingSession.bind(this.sessionManager));
  on('handledIncomingRtcSession', this.sessionManager.onHandledPendingSession.bind(this.sessionManager));

  // other events
  this._streamingConnection.on('error', this.emit.bind(this, 'sdkError' as unknown as Parameters<typeof this.emit>[0]));
}

export const handleConversationUpdate = function (this: GenesysCloudWebrtcSdk, updateEvent: SubscriptionEvent) {
  const update = new ConversationUpdate(updateEvent.eventBody);
  this.sessionManager.handleConversationUpdate(update);
  this.sessionManager.handleConversationUpdateRaw(updateEvent);
};

export const handleDisconnectedEvent = function (this: GenesysCloudWebrtcSdk, eventData: { reconnecting: boolean }) {
  const message = 'Streaming API connection disconnected';
  this.logger.error(message);

  /* snapshot active session IDs so we can check for orphans after reconnect */
  if (this.sessionManager) {
    this._preDisconnectSessionIds = this.sessionManager.getAllSessions().map(s => s.id);
    this.logger.info('Snapshotted pre-disconnect sessions', { sessionIds: this._preDisconnectSessionIds });
  }

  this.emit('disconnected', message, eventData);
}

/**
 * After a reconnect, check sessions that existed before the disconnect.
 * If their peer connection is now dead, clean them up to prevent leaked
 * event listeners (e.g. visibilitychange) and media tracks.
 */
export const cleanupOrphanedSessions = function (this: GenesysCloudWebrtcSdk) {
  const preDisconnectIds = this._preDisconnectSessionIds;
  this._preDisconnectSessionIds = [];

  if (!preDisconnectIds.length) {
    return;
  }

  const allSessions = this.sessionManager.getAllSessions();

  for (const sessionId of preDisconnectIds) {
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) {
      continue;
    }

    const pcState = session.peerConnection?.connectionState;
    if (!pcState || isPeerConnectionDisconnected(pcState)) {
      this.logger.warn('Cleaning up orphaned session after reconnect', {
        sessionId: session.id,
        conversationId: session.conversationId,
        sessionType: session.sessionType,
        peerConnectionState: pcState
      });

      try {
        const handler = this.sessionManager.getSessionHandler({ jingleSession: session });
        handler.onSessionTerminated(session, { condition: Constants.JingleReasonCondition.Gone });
      } catch (e) {
        this.logger.warn('Failed to clean up orphaned session', { sessionId, error: e.message });
      }
    } else {
      this.logger.info('Pre-disconnect session still has live peer connection after reconnect, keeping it', {
        sessionId: session.id,
        conversationId: session.conversationId,
        peerConnectionState: pcState
      });
    }
  }
}
