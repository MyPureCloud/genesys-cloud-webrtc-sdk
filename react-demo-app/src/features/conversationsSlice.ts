import { createSlice } from '@reduxjs/toolkit';
import { IPendingSession, IStoredConversationState } from '../../../dist/es';
import {IParticipantsUpdate, VideoMediaSession} from "../../../src";

interface IConversationsState {
  pendingSessions: IPendingSession[],
  handledPendingSessions: IPendingSession[],
  activeConversations: IActiveConversationsState,
  activeVideoConversations: IActiveVideoConversationsState[]
}

interface IActiveConversationsState {
  [key: string]: IStoredConversationState;
}

export interface IActiveVideoConversationsState {
    conversationId: string;
    session: VideoMediaSession;
    participantsUpdate: IParticipantsUpdate;
}

const initialState: IConversationsState = {
  pendingSessions: [],
  handledPendingSessions: [],
  activeConversations: {},
  activeVideoConversations: []
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
      state.activeConversations = currentConversations;
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
    addVideoConversationToActive: (state, action) => {
      state.activeVideoConversations = [...state.activeVideoConversations, action.payload]
    },
    addParticipantUpdateToVideoConversation: (state, action) => {
      const conv = state.activeVideoConversations.find(
        conv => conv.conversationId === action.payload.conversationId);
      if (conv) {
        conv.participantsUpdate = action.payload;
      }
      state.activeVideoConversations = [...state.activeVideoConversations];
    },
    removeVideoConversationFromActive: (state, action) => {
      const newFilteredState = state.activeVideoConversations.filter(
        convo => action.payload.conversationId !== convo.conversationId);
      state.activeVideoConversations = [...newFilteredState];
    },
    reasignToTriggerRepaint: (state) => {
      state.activeVideoConversations = [...state.activeVideoConversations];
    },
  }
});

export const {
  updatePendingSessions,
  removePendingSession,
  updateConversations,
  storeHandledPendingSession,
  addVideoConversationToActive,
  addParticipantUpdateToVideoConversation,
  removeVideoConversationFromActive,
  reasignToTriggerRepaint,
} = conversationsSlice.actions;
export default conversationsSlice.reducer;
