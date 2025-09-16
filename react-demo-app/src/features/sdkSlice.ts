import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SdkState {
  sdk: any;
}

const initialState: SdkState = {
  sdk: null
}

export const sdkSlice = createSlice({
  name: 'sdk',
  initialState: initialState,
  reducers: {
    setSdk: (state, action: PayloadAction<any>) => {
      state.sdk = action.payload;
    }
  }
})

export const { setSdk } = sdkSlice.actions;
export default sdkSlice.reducer;
