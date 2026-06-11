import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { IAudioProcessor } from 'genesys-cloud-webrtc-sdk';


interface AudioProcessorState {
  audioProcessor: IAudioProcessor | undefined;
}

const initialState: AudioProcessorState = {
  audioProcessor: undefined
}

export const audioProcessorSlice = createSlice({
  name: 'audioProcessor',
  initialState: initialState,
  reducers: {
    setAudioProcessor: (state, action: PayloadAction<IAudioProcessor | undefined>) => {
      state.audioProcessor = action.payload;
    }
  }
})

export const { setAudioProcessor } = audioProcessorSlice.actions;
export default audioProcessorSlice.reducer;
