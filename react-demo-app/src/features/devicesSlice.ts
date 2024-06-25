import { createSlice } from '@reduxjs/toolkit';
import { ISdkMediaState } from '../../../dist/es';

const initialState: ISdkMediaState = {
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
};

export const devicesSlice = createSlice({
  name: 'devices',
  initialState: initialState,
  reducers: {
    updateMediaState: (_state, action) => {
      return action.payload;
    }
  }
})

export const { updateMediaState } = devicesSlice.actions;
export default devicesSlice.reducer;
