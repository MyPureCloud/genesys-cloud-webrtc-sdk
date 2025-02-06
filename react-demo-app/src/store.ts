import { configureStore } from "@reduxjs/toolkit";
import authReducer from './features/authSlice';
import conversationsReducer from './features/conversationsSlice';
import devicesReducer from './features/devicesSlice';
import sdkReducer from './features/sdkSlice';
import videoReducer from './features/videoSlice';



export const store= configureStore({
  reducer: {
    auth: authReducer,
    conversations: conversationsReducer,
    devices: devicesReducer,
    sdk: sdkReducer,
    video: videoReducer
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware({serializableCheck: false})
})
