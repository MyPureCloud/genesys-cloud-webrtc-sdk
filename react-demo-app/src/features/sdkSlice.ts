import { createSlice } from '@reduxjs/toolkit';
import { GenesysCloudWebrtcSdk } from "genesys-cloud-webrtc-sdk";

interface SdkState {
  sdk: GenesysCloudWebrtcSdk | null;
}

const initialState: SdkState = {
  sdk: null,
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
