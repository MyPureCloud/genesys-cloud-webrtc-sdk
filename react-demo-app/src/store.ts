import { configureStore } from "@reduxjs/toolkit";
import conversationsReducer from './features/conversationsSlice';
import devicesReducer from './features/devicesSlice';


export const store= configureStore({
  reducer: {
    conversations: conversationsReducer,
    devices: devicesReducer
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware({serializableCheck: false})
})
