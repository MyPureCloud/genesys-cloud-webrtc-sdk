import type {
  GenesysCloudWebrtcSdk,
  ISdkConversationUpdateEvent,
  ISessionIdAndConversationId,
  SdkMediaStateWithType,
  IExtendedMediaSession,
  SdkError
} from 'genesys-cloud-webrtc-sdk';
import type { IPendingSession } from 'genesys-cloud-streaming-client';
import type { Dispatch } from '@reduxjs/toolkit';
import {
  removePendingSession,
  updatePendingSessions,
  updateConversations,
  storeHandledPendingSession
} from '../features/conversationsSlice';
import { updateGumRequests, updateMediaState } from '../features/devicesSlice';
import {
  connectionChanged,
  conversationsRemoved,
  sdkErrorReceived,
  sessionEndedReceived,
  sessionStartedReceived
} from '../features/sdkSignalsSlice';

export type SdkEventSource = Pick<GenesysCloudWebrtcSdk, 'on'> & {
  media: Pick<GenesysCloudWebrtcSdk['media'], 'on'>;
};

function sessionSignal(session: IExtendedMediaSession) {
  return {
    sessionId: session.id,
    conversationId: session.conversationId,
    sessionType: String(session.sessionType)
  };
}

export function connectSdkEventHandlers(sdk: SdkEventSource, dispatch: Dispatch): void {
  sdk.on('ready', () => console.warn('ready!'));
  sdk.on('sdkError', (error: SdkError) => {
    console.error(error);
    dispatch(sdkErrorReceived({ type: String(error?.type), message: String(error?.message) }));
  });
  sdk.on('pendingSession', (pendingSession: IPendingSession) => {
    dispatch(updatePendingSessions({ ...pendingSession }));
  });
  // If a pendingSession was cancelled or handled, we can remove it from our state.
  sdk.on('cancelPendingSession', (sessionInfo: ISessionIdAndConversationId) => {
    dispatch(removePendingSession(sessionInfo));
  });
  sdk.on('handledPendingSession', (sessionInfo: ISessionIdAndConversationId) => {
    dispatch(removePendingSession(sessionInfo));
    dispatch(storeHandledPendingSession(sessionInfo));
  });
  sdk.on('sessionStarted', (session: IExtendedMediaSession) => {
    dispatch(sessionStartedReceived(sessionSignal(session)));
  });
  sdk.on('sessionEnded', (session: IExtendedMediaSession, reason) => {
    dispatch(sessionEndedReceived({
      ...sessionSignal(session),
      reason: reason?.condition ?? null,
      state: session.state ?? null
    }));
  });
  // sdk.on('trace', trace);
  sdk.on('disconnected', () => {
    dispatch(connectionChanged(false));
  });
  sdk.on('connected', () => {
    dispatch(connectionChanged(true));
  });
  sdk.on('conversationUpdate', (update: ISdkConversationUpdateEvent) => {
    dispatch(updateConversations(update));
    if (update.removed?.length) {
      dispatch(conversationsRemoved(update.removed.map(conversation => ({
        conversationId: conversation.conversationId,
        sessionId: conversation.session?.id ?? null,
        finalState: conversation.mostRecentCallState?.state ?? null
      }))));
    }
  });

  sdk.media.on('state', (state: SdkMediaStateWithType) => {
    dispatch(updateMediaState(state));
  });
  sdk.media.on('gumRequest', () => {
    dispatch(updateGumRequests());
  });
}
