import { IParticipantsUpdate } from "genesys-cloud-webrtc-sdk";
import { createAsyncThunk, createSlice, Draft } from "@reduxjs/toolkit";
import { RootState } from "../types/store.ts";

export interface IActiveVideoConversationState {
  conversationId: string;
  participantsUpdate?: IParticipantsUpdate;
  loadingVideo: boolean;
  loadingAudio: boolean;
  inboundStream?: MediaStream;
  outboundStream?: MediaStream;
  screenOutboundStream?: MediaStream;
  activeParticipant?: string;
  usersTalking?: { [userId: string]: boolean };
}

export interface IVideoConversationsState {
  activeVideoConversations: IActiveVideoConversationState[];
  currentlyDisplayedConversationId: string | null;
}

const initialState: IVideoConversationsState = {
  activeVideoConversations: [],
  currentlyDisplayedConversationId: null
}

export const toggleVideoMute = createAsyncThunk(
  'videoConversations/toggleVideoMute',
  async (data: { mute: boolean; conversationId: string, userId: string }, thunkAPI) => {
    const state = thunkAPI.getState() as RootState;
    const sdk = state.sdk.sdk;
    if (!sdk) return

    await sdk.setVideoMute({ mute: data.mute, conversationId: data.conversationId });
    return { mute: data.mute, conversationId: data.conversationId, userId: data.userId };
  }
);

export const toggleAudioMute = createAsyncThunk(
  'videoConversations/toggleAudioMute',
  async (data: { mute: boolean; conversationId: string, userId: string }, thunkAPI) => {
    const state = thunkAPI.getState() as RootState;
    const sdk = state.sdk.sdk;
    if (!sdk) return

    await sdk.setAudioMute({ mute: data.mute, conversationId: data.conversationId });
    return { mute: data.mute, conversationId: data.conversationId, userId: data.userId };
  }
);

function findConversationInState(state: Draft<IVideoConversationsState>, convId: string) {
  const conversations = state.activeVideoConversations;
  const conversation = conversations.find((conv) => conv.conversationId === convId);
  return conversation;
}

export const videoConversationsSlice = createSlice({
  name: 'videoConversations',
  initialState,
  reducers: {
    addVideoConversationToActive: (state, action) => {
      const newConversation = { ...action.payload, loadingVideo: false, loadingAudio: false }
      state.activeVideoConversations.push(newConversation);
      state.currentlyDisplayedConversationId = action.payload.conversationId;
    },
    addParticipantUpdateToVideoConversation: (state, action) => {
      const conv = findConversationInState(state, action.payload.conversationId);
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
      const conv = findConversationInState(state, action.payload.conversationId);
      if (conv) {
        if (action.payload.inboundStream !== undefined) {
          conv.inboundStream = action.payload.inboundStream;
        }
        if (action.payload.outboundStream !== undefined) {
          conv.outboundStream = action.payload.outboundStream;
        }
        if (action.payload.screenOutboundStream !== undefined) {
          conv.screenOutboundStream = action.payload.screenOutboundStream;
        }
      }
    },
    setActiveParticipants: (state, action) => {
      const conv = findConversationInState(state, action.payload.conversationId);
      if (conv) {
        conv.activeParticipant = action.payload.activeParticipant;
      }
    },
    setUsersTalking: (state, action) => {
      const conv = findConversationInState(state, action.payload.conversationId);
      if (conv) {
        if (!conv.usersTalking) {
          conv.usersTalking = {};
        }
        const usersTalkingObj = action.payload.usersTalking;
        for (const userId in usersTalkingObj) {
          if (conv.usersTalking && conv.usersTalking[userId] !== usersTalkingObj[userId]) {
            conv.usersTalking = action.payload.usersTalking;
            break;
          }
        }
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(toggleVideoMute.pending, (state, action) => {
        const conv = findConversationInState(state, action.meta.arg.conversationId);
        if (conv) {
          conv.loadingVideo = true;
        }
      })
      .addCase(toggleVideoMute.fulfilled, (state, action) => {
        const conv = findConversationInState(state, action.meta.arg.conversationId);
        if (conv) {
          conv.loadingVideo = false;
          const participant = conv.participantsUpdate?.activeParticipants.find(p => p.userId === action.meta.arg.userId);
          if (participant) {
            participant.videoMuted = action.meta.arg.mute;
          }
        }
      })
      .addCase(toggleAudioMute.pending, (state, action) => {
        const conv = findConversationInState(state, action.meta.arg.conversationId);
        if (conv) {
          conv.loadingAudio = true;
        }
      })
      .addCase(toggleAudioMute.fulfilled, (state, action) => {
        const conv = findConversationInState(state, action.meta.arg.conversationId);
        if (conv) {
          conv.loadingAudio = false;
          const participant = conv.participantsUpdate?.activeParticipants.find(p => p.userId === action.meta.arg.userId);
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
  updateConversationMediaStreams,
  setActiveParticipants,
  setUsersTalking
} = videoConversationsSlice.actions;
export default videoConversationsSlice.reducer;
