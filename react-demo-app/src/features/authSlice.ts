import { createSlice } from '@reduxjs/toolkit';


export interface IAuthState {
  auth: {
    isAuthenticated: boolean;
    authLoading: boolean;
  };
}

export const authSlice = createSlice({
  name: 'auth',
  initialState: {
    isAuthenticated: false,
    authLoading: false
  },
  reducers: {
    setAuthStatus: (state, action) => {
      state.isAuthenticated = action.payload;
    },
    setAuthLoading: (state, action) => {
      state.authLoading = action.payload;
    }
  }
})

export const { setAuthStatus, setAuthLoading } = authSlice.actions;
export default authSlice.reducer;
