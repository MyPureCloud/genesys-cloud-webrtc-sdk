import { createSlice } from '@reduxjs/toolkit';
import { IPendingSession, IStoredConversationState } from '../../../dist/es';
import {SessionTypes} from "genesys-cloud-webrtc-sdk";
import {IParticipantsUpdate, IParticipantUpdate, VideoMediaSession} from "../../../src";

interface IConversationsState {
  pendingSessions: IPendingSession[],
  handledPendingSessions: IPendingSession[],
  activeConversations: IActiveConversationsState[],
  activeVideoConversations: IActiveVideoConversationsState[]
}

interface IActiveConversationsState {
  [key: string]: IStoredConversationState;
}

export interface IActiveVideoConversationsState {
  // [key: string]: {
    conversationId: string;
    session: VideoMediaSession;
    participantsUpdate: IParticipantsUpdate;

  // }
}

const initialState: IConversationsState = {
  pendingSessions: [],
  handledPendingSessions: [],
  activeConversations: [], // set this back to {}
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


    addVideoConversationToActive: (state, action) => {
      state.activeVideoConversations = [...state.activeVideoConversations, action.payload]
    },

    participantUpdate: (state, action) => {
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

    // addConvToActive: (state, action) => {
    //   const thing = {
    //     conversationId: action.payload.conversationId,
    //     session: action.payload,
    //   }
    //   state.activeConversations = [...state.activeConversations, thing];
    //   console.log('1addConvToActive', state.activeConversations);
    // },
    // updateActiveConv: (state, action) => {
    //   const theConv = state.activeConversations.find(conv => conv.conversationId === action.payload.conversationId);
    //   if (!theConv) {
    //     return;
    //   }
    //   console.log('updating the state to', action.payload.state);
    //   if (action.payload.state === 'ended') {
    //     theConv.state = action.payload.state;
    //     theConv.connectionState = action.payload.connectionState;
    //     state.activeConversations = state.activeConversations.filter(conv => theConv !== conv);
    //   } else {
    //     theConv.state = action.payload.state;
    //     theConv.connectionState = action.payload.connectionState;
    //   }
    // },
    // addOwnParticipantData: (state, action) => {
    //   const existingConversation = state.activeConversations.find(
    //     conv =>
    //       action.payload.conversationId === conv.conversationId &&
    //       conv.session.state === 'active'); // I wanted to use sessionId but thats not part of the action.payload
    //   const userId = existingConversation?.session.fromUserId;
    //   if (existingConversation) {
    //     existingConversation.ownCallState = action.payload.activeParticipants.find(activePart => userId === activePart.userId);
    //   }
    // }
  }
});

export const {
  updatePendingSessions,
  removePendingSession,
  updateConversations,
  storeHandledPendingSession,
  // addConvToActive,
  // updateActiveConv,
  // addOwnParticipantData,
  addVideoConversationToActive,
  participantUpdate,
  removeVideoConversationFromActive
} = conversationsSlice.actions;
export default conversationsSlice.reducer;
