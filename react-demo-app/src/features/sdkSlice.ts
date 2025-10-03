import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { MinimalSdk } from '../types/sdk';

interface SdkState {
  sdk: MinimalSdk | null;
}

const initialState: SdkState = {
  sdk: null
}

export const sdkSlice = createSlice({
  name: 'sdk',
  initialState: initialState,
  reducers: {
    setSdk: (state, action: PayloadAction<MinimalSdk>) => {
      state.sdk = action.payload;
    }
  }
})

export const { setSdk } = sdkSlice.actions;
export default sdkSlice.reducer;
