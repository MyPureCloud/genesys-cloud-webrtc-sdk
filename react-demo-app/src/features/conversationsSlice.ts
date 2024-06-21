import { createSlice } from '@reduxjs/toolkit';
import { IPendingSession, IStoredConversationState } from '../../../dist/es';

interface IConversationsState {
  pendingSessions: IPendingSession[],
  activeConversations: IActiveConversationsState
}

interface IActiveConversationsState {
  [key: string]: IStoredConversationState;
}

const initialState: IConversationsState = {
  pendingSessions: [],
  activeConversations: {}
}

export const conversationsSlice = createSlice({
  name: 'conversations',
  initialState,
  reducers: {
    updatePendingSessions: (state, action) => {
      console.warn(action.payload);
      const existingSession = state.pendingSessions.find(session => session.id === action.payload.id);
      if (!existingSession) {
        state.pendingSessions = [...state.pendingSessions, action.payload];
        console.warn(state.pendingSessions);
      }
    }
  }
})

export const { updatePendingSessions } = conversationsSlice.actions;
export default conversationsSlice.reducer;
