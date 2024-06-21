import { configureStore } from "@reduxjs/toolkit";
import conversationsReducer from './features/conversationsSlice';


export const store= configureStore({
  reducer: {
    conversations: conversationsReducer
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware({serializableCheck: false})
})
