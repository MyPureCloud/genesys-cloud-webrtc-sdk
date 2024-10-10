import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  sdk: null
}

export const sdkSlice = createSlice({
  name: 'sdk',
  initialState: initialState,
  reducers: {
    setSdk: (state, action) => {
      state.sdk = action.payload;
    }
  }
})

export const { setSdk } = sdkSlice.actions;
export default sdkSlice.reducer;
