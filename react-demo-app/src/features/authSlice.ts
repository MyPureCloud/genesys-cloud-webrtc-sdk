import { createSlice } from '@reduxjs/toolkit';


export interface IAuthState {
  auth: {
    isAuthenticated: boolean;
  };
}

export const authSlice = createSlice({
  name: 'auth',
  initialState: {
    isAuthenticated: false
  },
  reducers: {
    setAuthStatus: (state, action) => {
      state.isAuthenticated = action.payload;
    }
  }
})

export const { setAuthStatus } = authSlice.actions;
export default authSlice.reducer;
