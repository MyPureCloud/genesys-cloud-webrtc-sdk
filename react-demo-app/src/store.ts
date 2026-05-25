import { configureStore } from "@reduxjs/toolkit";
import authReducer from './features/authSlice';
import conversationsReducer from './features/conversationsSlice';
import videoConversationReducer from './features/videoConversationsSlice';
import devicesReducer from './features/devicesSlice';
import sdkReducer from './features/sdkSlice';


export const store= configureStore({
  reducer: {
    auth: authReducer,
    conversations: conversationsReducer,
    videoConversations: videoConversationReducer,
    devices: devicesReducer,
    sdk: sdkReducer
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware({serializableCheck: false})
})
