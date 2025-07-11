import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { IPendingSession, IStoredConversationState } from '../../../dist/es';
import { IParticipantsUpdate, VideoMediaSession } from "../../../src";

interface IConversationsState {
  pendingSessions: IPendingSession[],
  handledPendingSessions: IPendingSession[],
  activeConversations: IActiveConversationsState,
  activeVideoConversations: IActiveVideoConversationsState[],
  loading: boolean,
  audioLoading: boolean
}

interface IActiveConversationsState {
  [key: string]: IStoredConversationState;
}

export interface IActiveVideoConversationsState {
  conversationId: string;
  session: VideoMediaSession;
  participantsUpdate: IParticipantsUpdate;
  loading: boolean
}

const initialState: IConversationsState = {
  pendingSessions: [],
  handledPendingSessions: [],
  activeConversations: {},
  activeVideoConversations: [],
  loading: false,
  audioLoading: false,
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
      state.audioLoading = action.payload;
    },
    updateVideoLoading: (state, action) => {
      state.loading = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(toggleVideoMute2.pending, (state) => {
        // You can add loading state here if needed
        state.loading = true;
        console.log('toggleVideoMute.pending');
      })
      .addCase(toggleVideoMute2.fulfilled, (state, action) => {
        // Video mute state successfully updated
        // state.loading = false;
        // const conversationId = action.payload.conversationId;
        // const conversation = state.activeVideoConversations.find(conv => conv.conversationId === conversationId);
        // const userId = action.payload.userId;
        // const participant = conversation?.participantsUpdate?.activeParticipants?.find(p => p.userId === userId);
        // if (participant) {
        //   participant.videoMuted = !participant?.videoMuted;
        // }
        // console.log('Video mute toggled:', action.payload);
      })
      .addCase(toggleVideoMute2.rejected, (state, action) => {
        // errors are for the weak
        console.error('Failed to toggle video mute:', action.error);
      })
      .addCase(toggleAudioMute2.pending, (state) => {
        console.log('pending');
        state.audioLoading = true;
      })
      .addCase(toggleAudioMute2.fulfilled, (state, action) => {
        // state.audioLoading = false;
        // const conversationId = action.payload.conversationId;
        // const conversation = state.activeVideoConversations.find(conv => conv.conversationId === conversationId);
        // const userId = action.payload.userId;
        // const participant = conversation?.participantsUpdate?.activeParticipants?.find(p => p.userId === userId);
        // if (participant) {
        //   participant.audioMuted = !participant?.audioMuted;
        // }
      })
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
