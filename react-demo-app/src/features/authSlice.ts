import { createSlice } from '@reduxjs/toolkit';


export interface IAuthState {
  auth: {
    isAuthenticated: boolean;
    authLoading: boolean;
    authError?: string;
  };
}

export const authSlice = createSlice({
  name: 'auth',
  initialState: {
    isAuthenticated: false,
    authLoading: false,
    authError: undefined,
  },
  reducers: {
    setAuthError: (state, action) => {
      state.authError = action.payload;
    },
    setAuthStatus: (state, action) => {
      state.isAuthenticated = action.payload;
    },
    setAuthLoading: (state, action) => {
      state.authLoading = action.payload;
    }
  }
})

export const { setAuthStatus, setAuthLoading, setAuthError } = authSlice.actions;
export default authSlice.reducer;
