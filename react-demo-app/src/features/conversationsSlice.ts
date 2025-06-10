import { createSlice } from '@reduxjs/toolkit';
import { IPendingSession, IStoredConversationState } from '../../../dist/es';
import {SessionTypes} from "genesys-cloud-webrtc-sdk";

interface IConversationsState {
  pendingSessions: IPendingSession[],
  handledPendingSessions: IPendingSession[],
  activeConversations: IActiveConversationsState[]
}

interface IActiveConversationsState {
  [key: string]: IStoredConversationState;
}

const initialState: IConversationsState = {
  pendingSessions: [],
  handledPendingSessions: [],
  activeConversations: []
}

export const conversationsSlice = createSlice({
  name: 'conversations',
  initialState,
  reducers: {
    updatePendingSessions: (state, action) => {
      const existingSession = state.pendingSessions.find(session => session.id === action.payload.id);
      if (!existingSession) {
        state.pendingSessions = [...state.pendingSessions, action.payload];
      }
    },
    removePendingSession: (state, action) => {
      const updatedPendingSessions = state.pendingSessions.filter(session => session.conversationId !== action.payload.conversationId);
      state.pendingSessions = updatedPendingSessions;
    },
    updateConversations: (state, action) => {
      const currentConversations = action.payload.current;
      const videoConvs = state.activeConversations.filter(
        conv => conv.session.sessionType === SessionTypes.collaborateVideo
      );
      state.activeConversations = [...videoConvs, ...currentConversations];
      // state.activeConversations = currentConversations;
    },
    removeConversations: (state, action) => {
      const removedConversations = action.payload.removed;
      for (const id in removedConversations) {
        delete state.activeConversations[id];
      }
    },
    storeHandledPendingSession: (state, action) => {
      const existingSession = state.handledPendingSessions.find(session => session.conversationId === action.payload.conversationId);
      if (!existingSession) {
        state.handledPendingSessions = [...state.handledPendingSessions, action.payload];
      }
    },
    addConvToActive: (state, action) => {
      const thing = {
        conversationId: action.payload.conversationId,
        session: action.payload,
      }
      state.activeConversations = [...state.activeConversations, thing];
      console.log('1addConvToActive', state.activeConversations);
    },
    updateActiveConv: (state, action) => {
      const theConv = state.activeConversations.find(conv => conv.conversationId === action.payload.conversationId);
      if (theConv) {
        theConv.state = action.payload.state;
        theConv.connectionState = action.payload.connectionState;
      }
    },
    addOwnParticipantData: (state, action) => {
      const existingConversation = state.activeConversations.find(
        conv =>
          action.payload.conversationId === conv.conversationId &&
          conv.session.state === 'active'); // I wanted to use sessionId but thats not part of the action.payload
      const userId = existingConversation?.session.fromUserId;
      if (existingConversation) {
        existingConversation.ownCallState = action.payload.activeParticipants.find(activePart => userId === activePart.userId);
      }
    }
  }
});

export const {
  updatePendingSessions,
  removePendingSession,
  updateConversations,
  storeHandledPendingSession,
  addConvToActive,
  updateActiveConv,
  addOwnParticipantData
} = conversationsSlice.actions;
export default conversationsSlice.reducer;
