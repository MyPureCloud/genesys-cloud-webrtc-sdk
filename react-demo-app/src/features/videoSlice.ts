import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  audioElement: null,
  videoElement: null
}

export const videoSlice = createSlice({
  name: 'video',
  initialState: initialState,
  reducers: {
    setVideoElement: (state, action) => {
      state.videoElement = action.payload;
    },
    setAudioElement: (state, action) => {
      state.audioElement = action.payload;
    }
  }
})

export const { setVideoElement, setAudioElement } = videoSlice.actions;
export default videoSlice.reducer;
