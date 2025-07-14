import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { IPendingSession, IStoredConversationState } from '../../../dist/es';
import { IParticipantsUpdate, VideoMediaSession } from "../../../src";

interface IConversationsState {
  pendingSessions: IPendingSession[],
  handledPendingSessions: IPendingSession[],
  activeConversations: IActiveConversationsState,
  activeVideoConversations: IActiveVideoConversationsState[],
  currentlyDisplayedConversationId: string | null,
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
  inboundStream?: MediaStream;
  outboundStream?: MediaStream;
}

const initialState: IConversationsState = {
  pendingSessions: [],
  handledPendingSessions: [],
  activeConversations: {},
  activeVideoConversations: [],
  currentlyDisplayedConversationId: null,
}

export const toggleVideoMute = createAsyncThunk(
  'conversations/toggleVideoMute',
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

export const toggleAudioMute = createAsyncThunk(
  'conversations/toggleAudioMute',
  async (data: {mute: boolean; conversationId: string, userId: string}, thunkAPI) => {
    const state = thunkAPI.getState() as any;
    const sdk = state.sdk.sdk;
    if (!sdk) {
      throw new Error('SDK is not initialized');
    }

    await sdk.setAudioMute({mute: data.mute, conversationId: data.conversationId});
    return {mute: data.mute, conversationId: data.conversationId, userId: data.userId};
  }
);

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
      const newConversation = {
        ...action.payload,
        loadingVideo: false,
        loadingAudio: false,
        inboundStream: undefined,
        outboundStream: undefined,
      };
      state.activeVideoConversations.push(newConversation);
      const noPreviousConversations = state.activeVideoConversations.length === 1;
      if (noPreviousConversations) {
        state.currentlyDisplayedConversationId = action.payload.conversationId;
      }
    },
    addParticipantUpdateToVideoConversation: (state, action) => {
      const conv = state.activeVideoConversations.find(
        conv => conv.conversationId === action.payload.conversationId);
      if (conv) {
        conv.participantsUpdate = action.payload;
      }
    },
    removeVideoConversationFromActive: (state, action) => {
      const index = state.activeVideoConversations.findIndex(
        convo => convo.conversationId === action.payload.conversationId);
      if (index !== -1) {
        state.activeVideoConversations.splice(index, 1);

        if (state.currentlyDisplayedConversationId === action.payload.conversationId) {
          state.currentlyDisplayedConversationId = state.activeVideoConversations.length > 0
            ? state.activeVideoConversations[0].conversationId
            : null;
        }
      }
    },
    updateAudioLoading: (state, action) => {
      const conv = state.activeVideoConversations.find(
        conv => conv.conversationId === action.payload.convId);
      if (conv) {
        conv.loadingAudio = action.payload.loading;
      }
    },
    updateVideoLoading: (state, action) => {
      const conv = state.activeVideoConversations.find(
        conv => conv.conversationId === action.payload.convId);
      if (conv) {
        conv.loadingVideo = action.payload.loading;
      }
    },
    setCurrentlyDisplayedConversation: (state, action) => {
      state.currentlyDisplayedConversationId = action.payload.conversationId;
    },
    updateConversationMediaStreams: (state, action) => {
      const conv = state.activeVideoConversations.find(
        conv => conv.conversationId === action.payload.conversationId);
      if (conv) {
        if (action.payload.inboundStream !== undefined) {
          conv.inboundStream = action.payload.inboundStream;
        }
        if (action.payload.outboundStream !== undefined) {
          conv.outboundStream = action.payload.outboundStream;
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(toggleVideoMute.pending, (state, action) => {
        const conv = state.activeVideoConversations.find(
          conv => conv.conversationId === action.meta.arg.conversationId);
        if (conv) {
          conv.loadingVideo = true;
        }
      })
      .addCase(toggleVideoMute.fulfilled, (state, action) => {
        const conv = state.activeVideoConversations.find(
          conv => conv.conversationId === action.meta.arg.conversationId);
        if (conv) {
          conv.loadingVideo = false;
          const participant = conv.participantsUpdate.activeParticipants.find(p => p.userId === action.meta.arg.userId);
          if (participant) {
            participant.videoMuted = action.meta.arg.mute;
          }
        }
      })
      .addCase(toggleAudioMute.pending, (state, action) => {
        const conv = state.activeVideoConversations.find(
          conv => conv.conversationId === action.meta.arg.conversationId);
        if (conv) {
          conv.loadingAudio = true;
        }
      })
      .addCase(toggleAudioMute.fulfilled, (state, action) => {
        const conv = state.activeVideoConversations.find(
          conv => conv.conversationId === action.meta.arg.conversationId);
        if (conv) {
          conv.loadingAudio = false;
          const participant = conv.participantsUpdate.activeParticipants.find(p => p.userId === action.meta.arg.userId);
          if (participant) {
            participant.audioMuted = action.meta.arg.mute;
          }
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
  updateAudioLoading,
  updateVideoLoading,
  setCurrentlyDisplayedConversation,
  updateConversationMediaStreams,
} = conversationsSlice.actions;
export default conversationsSlice.reducer;
