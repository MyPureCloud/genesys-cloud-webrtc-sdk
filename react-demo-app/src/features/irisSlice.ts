import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { GenesysIrisClient } from 'genesys-iris-client';


interface IrisState {
  irisClient: GenesysIrisClient | null;
}

const initialState: IrisState = {
  irisClient: null
}

export const irisSlice = createSlice({
  name: 'iris',
  initialState: initialState,
  reducers: {
    setIrisClient: (state, action: PayloadAction<GenesysIrisClient>) => {
      state.irisClient = action.payload;
    }
  }
})

export const { setIrisClient } = irisSlice.actions;
export default irisSlice.reducer;
