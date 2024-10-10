import { createSlice } from '@reduxjs/toolkit';
import { ISdkMediaState } from '../../../dist/es';

const initialState = {
  currentState: {
    audioDevices: [],
    cameraPermissionsRequested: false,
    devices: [],
    hasCamera: false,
    hasCameraPermissions: false,
    hasMic: false,
    hasMicPermissions: false,
    hasOutputDeviceSupport: false,
    micPermissionsRequested: false,
    oldDevices: [],
    outputDevices: [],
    videoDevices: []
  } as ISdkMediaState,
  stateChanges: 0,
  gumRequests: 0
};

export const devicesSlice = createSlice({
  name: 'devices',
  initialState: initialState,
  reducers: {
    updateMediaState: (state, action) => {
      state.currentState = action.payload;
      state.stateChanges++;
    },
    updateGumRequests: (state) => {
      state.gumRequests++;
    }
  }
})

export const { updateMediaState, updateGumRequests } = devicesSlice.actions;
export default devicesSlice.reducer;
