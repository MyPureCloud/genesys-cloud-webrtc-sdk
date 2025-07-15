import { IParticipantsUpdate, VideoMediaSession } from "genesys-cloud-webrtc-sdk";
import { createAsyncThunk, createSlice, Draft, StateFromReducersMapObject } from "@reduxjs/toolkit";

export interface IActiveVideoConversationsState { // rename this to remove the 's'?
  conversationId: string;
  session: VideoMediaSession;
  participantsUpdate: IParticipantsUpdate;
  loadingVideo: boolean;
  loadingAudio: boolean;
  inboundStream?: MediaStream;
  outboundStream?: MediaStream;
}

interface IVideoConversationsState {
  activeVideoConversations: IActiveVideoConversationsState[];
  currentlyDisplayedConversationId: string | null;
}

const initialState: IVideoConversationsState = {
  activeVideoConversations: [],
  currentlyDisplayedConversationId: null
}

export const toggleVideoMute = createAsyncThunk(
  'videoConversations/toggleVideoMute',
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
  'videoConversations/toggleAudioMute',
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

function findConvInState(state: Draft<IVideoConversationsState>, convId: string) {
  const conversations = state.activeVideoConversations;
  const conversation = conversations.find((conv) => conv.conversationId === convId);
  return conversation;
}


export const videoConversationsSlice = createSlice({
  name: 'videoConversations',
  initialState,
  reducers: {
    addVideoConversationToActive: (state, action) => {
      const newConversation = {...action.payload, loadingVideo: false, loadingAudio: false} // change this back to false if broken
      state.activeVideoConversations.push(newConversation);
      state.currentlyDisplayedConversationId = action.payload.conversationId;
    },
    addParticipantUpdateToVideoConversation: (state, action) => {
      const conv = findConvInState(state, action.payload.conversationId);
      if (conv) {
        conv.participantsUpdate = action.payload;
      }
    },
    removeVideoConversationFromActive: (state, action) => {
      const index = state.activeVideoConversations.findIndex(
        convo => convo.conversationId === action.payload.conversationId)
      if (index !== -1) {
        state.activeVideoConversations.splice(index, 1);

        if (state.currentlyDisplayedConversationId === action.payload.conversationId) {
          state.currentlyDisplayedConversationId = state.activeVideoConversations.length > 0
            ? state.activeVideoConversations[state.activeVideoConversations.length - 1].conversationId
            : null;
        }
      }
    },
    setCurrentlyDisplayedConversation: (state, action) => {
      state.currentlyDisplayedConversationId = action.payload.conversationId;
    },
    updateConversationMediaStreams: (state, action) => {
      const conv = findConvInState(state, action.payload.conversationId);
      if (conv) {
        if (action.payload.inboundStream !== undefined) {
          conv.inboundStream = action.payload.inboundStream;
        }
        if (action.payload.outboundStream !== undefined) {
          conv.outboundStream = action.payload.outboundStream;
        }
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(toggleVideoMute.pending, (state, action) => {
        const conv = findConvInState(state, action.meta.arg.conversationId);
        if (conv) {
          conv.loadingVideo = true;
        }
      })
      .addCase(toggleVideoMute.fulfilled, (state, action) => {
        const conv = findConvInState(state, action.meta.arg.conversationId);
        if (conv) {
          conv.loadingVideo = false;
          const participant = conv.participantsUpdate.activeParticipants.find(p => p.userId === action.meta.arg.userId);
          if (participant) {
            participant.videoMuted = action.meta.arg.mute;
          }
        }
      })
      .addCase(toggleAudioMute.pending, (state, action) => {
        const conv = findConvInState(state, action.meta.arg.conversationId);
        if (conv) {
          conv.loadingAudio = true;
        }
      })
      .addCase(toggleAudioMute.fulfilled, (state, action) => {
        const conv = findConvInState(state, action.meta.arg.conversationId);
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
  addVideoConversationToActive,
  addParticipantUpdateToVideoConversation,
  removeVideoConversationFromActive,
  setCurrentlyDisplayedConversation,
  updateConversationMediaStreams
} = videoConversationsSlice.actions;
export default videoConversationsSlice.reducer;
