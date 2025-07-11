import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { IPendingSession, IStoredConversationState } from '../../../dist/es';
import { IParticipantsUpdate, VideoMediaSession } from "../../../src";

interface IConversationsState {
  pendingSessions: IPendingSession[],
  handledPendingSessions: IPendingSession[],
  activeConversations: IActiveConversationsState,
  activeVideoConversations: IActiveVideoConversationsState[],
}

interface IActiveConversationsState {
  [key: string]: IStoredConversationState;
}

export interface IActiveVideoConversationsState {
  conversationId: string;
  session: VideoMediaSession;
  participantsUpdate: IParticipantsUpdate;
  loadingVideo: boolean;
  loadingAudio: boolean;
}

const initialState: IConversationsState = {
  pendingSessions: [],
  handledPendingSessions: [],
  activeConversations: {},
  activeVideoConversations: [],
}

export const toggleVideoMute2 = createAsyncThunk(
  'conversations/toggleVideoMute2',
  async (data: {mute: boolean; conversationId: string, userId: string}, thunkAPI) => {
    const state = thunkAPI.getState() as any;
    const sdk = state.sdk.sdk;
    if (!sdk) {
      throw new Error('SDK is not initialized');
    }

    await sdk.setVideoMute({mute: data.mute, conversationId: data.conversationId});
    return {mute: data.mute, conversationId: data.conversationId, userId: data.userId};
  }
);

export const toggleAudioMute2 = createAsyncThunk(
  'conversations/toggleAudioMute2',
  async (data: {mute: boolean; conversationId: string, userId: string}, thunkAPI) => {
    const state = thunkAPI.getState() as any;
    const sdk = state.sdk.sdk;
    if (!sdk) {
      throw new Error('SDK is not initialized');
    }

    await sdk.setAudioMute({mute: data.mute, conversationId: data.conversationId});
    return {mute: data.mute, conversationId: data.conversationId, userId: data.userId};
  }
)

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
    updateAudioLoading: (state, action) => {
      const conv = state.activeVideoConversations.find(
        conv => conv.conversationId === action.payload.convId);
      if (conv) {
        conv.loadingAudio = action.payload.loading
      }
    },
    updateVideoLoading: (state, action) => {
      const conv = state.activeVideoConversations.find(
        conv => conv.conversationId === action.payload.convId);
      if (conv) {
        conv.loadingVideo = action.payload.loading
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(toggleVideoMute2.pending, (state, action) => {
        const conv = state.activeVideoConversations.find(
          conv => conv.conversationId === action.meta.arg.conversationId);
        if (conv) {
          conv.loadingVideo = true;
        }
      })
      .addCase(toggleAudioMute2.pending, (state, action) => {
        const conv = state.activeVideoConversations.find(
          conv => conv.conversationId === action.meta.arg.conversationId);
        if (conv) {
          conv.loadingAudio = true;
        }
      });
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
  updateAudioLoading,
  updateVideoLoading,
} = conversationsSlice.actions;
export default conversationsSlice.reducer;
