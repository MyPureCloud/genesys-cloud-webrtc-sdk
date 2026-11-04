import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ISdkErrorSignal {
  type: string;
  message: string;
}

export interface IInteractionLogEntry {
  conversationId: string;
  sessionType: string;
  endReason: string | null;
  finalState: string | null;
  recordedAt: string;
}

export interface ISessionSignal {
  sessionId: string;
  conversationId: string;
  sessionType: string;
}

export interface ISessionEndedSignal extends ISessionSignal {
  reason: string | null;
}

export interface IRemovedConversationSignal {
  conversationId: string;
  sessionId: string | null;
  finalState: string | null;
}

interface ISdkSignalsState {
  lastError: ISdkErrorSignal | null;
  connected: boolean;
  interactionLog: IInteractionLogEntry[];
  // Latest softphone `sessionEnded` per conversation, used only as the end reason of a later `removed`.
  softphoneEndings: { [conversationId: string]: { sessionId: string; reason: string | null } };
  // Video sessions seen at `sessionStarted` and not yet logged, keyed by session ID.
  observedVideoSessions: { [sessionId: string]: true };
}

// The SDK emits a call's own `sessionEnded` and its `removed` in the same synchronous call, so only the latest few
// endings can still be matched. Older ones (for example eager persistent transports that never carried a call) are dropped.
export const MAX_PENDING_SOFTPHONE_ENDINGS = 50;

const initialState: ISdkSignalsState = {
  lastError: null,
  connected: false,
  interactionLog: [],
  softphoneEndings: {},
  observedVideoSessions: {}
};

export const sdkSignalsSlice = createSlice({
  name: 'sdkSignals',
  initialState,
  reducers: {
    sdkErrorReceived: (state, action: PayloadAction<ISdkErrorSignal>) => {
      state.lastError = action.payload;
    },
    connectionChanged: (state, action: PayloadAction<boolean>) => {
      state.connected = action.payload;
    },
    sessionStartedReceived: (state, action: PayloadAction<ISessionSignal>) => {
      if (action.payload.sessionType === 'collaborateVideo') {
        state.observedVideoSessions[action.payload.sessionId] = true;
      }
    },
    sessionEndedReceived: (state, action: PayloadAction<ISessionEndedSignal>) => {
      const { sessionId, conversationId, sessionType, reason } = action.payload;
      if (sessionType === 'softphone') {
        delete state.softphoneEndings[conversationId];
        state.softphoneEndings[conversationId] = { sessionId, reason };
        const pending = Object.keys(state.softphoneEndings);
        for (const oldest of pending.slice(0, Math.max(0, pending.length - MAX_PENDING_SOFTPHONE_ENDINGS))) {
          delete state.softphoneEndings[oldest];
        }
        return;
      }
      if (sessionType === 'collaborateVideo' && state.observedVideoSessions[sessionId]) {
        delete state.observedVideoSessions[sessionId];
        state.interactionLog.push({
          conversationId,
          sessionType,
          endReason: reason,
          // `sessionEnded` is the end of a video session, but some SDK paths emit it while the session still reports
          // `active` (for example the dead peer connection clean-up, base-session-handler.ts checkPeerConnectionState).
          finalState: 'ended',
          recordedAt: new Date().toISOString()
        });
      }
    },
    conversationsRemoved: (state, action: PayloadAction<IRemovedConversationSignal[]>) => {
      for (const removed of action.payload) {
        const existing = state.interactionLog.find(
          entry => entry.sessionType === 'softphone' && entry.conversationId === removed.conversationId
        );
        if (existing) {
          existing.finalState = removed.finalState ?? existing.finalState;
          delete state.softphoneEndings[removed.conversationId];
          continue;
        }
        const ending = state.softphoneEndings[removed.conversationId];
        const reason = ending && removed.sessionId && ending.sessionId === removed.sessionId ? ending.reason : null;
        delete state.softphoneEndings[removed.conversationId];
        state.interactionLog.push({
          conversationId: removed.conversationId,
          sessionType: 'softphone',
          endReason: reason,
          finalState: removed.finalState,
          recordedAt: new Date().toISOString()
        });
      }
    }
  }
});

export const {
  sdkErrorReceived,
  connectionChanged,
  sessionStartedReceived,
  sessionEndedReceived,
  conversationsRemoved
} = sdkSignalsSlice.actions;
export default sdkSignalsSlice.reducer;
