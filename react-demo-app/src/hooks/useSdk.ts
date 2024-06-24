import { GenesysCloudWebrtcSdk, ISdkConfig, ISdkConversationUpdateEvent } from 'genesys-cloud-webrtc-sdk';
import { v4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from "react-redux";
import {
  removePendingSession,
  updatePendingSessions,
  updateConversations
} from '../features/conversationsSlice';

interface IAuthData {
  token: string,
  environment: {
    clientId: string,
    uri: string
  }
}

export default function useSdk() {
  let webrtcSdk: GenesysCloudWebrtcSdk;
  const navigate = useNavigate();
  const dispatch = useDispatch();

  async function initWebrtcSDK(authData: IAuthData) {
    const options: ISdkConfig = {
      accessToken: authData.token,
      environment: authData.environment.uri,
      originAppId: v4(),
      originAppName: "webrtc-demo-app",
      optOutOfTelemetry: true,
      logLevel: "info",
    };

    webrtcSdk = new GenesysCloudWebrtcSdk(options);
    (window as any)["webrtcSdk"] = webrtcSdk;

    connectEventHandlers();

    await webrtcSdk.initialize();
    navigate('/dashboard');
  }

  function connectEventHandlers() {
    webrtcSdk.on("ready", () => console.warn('ready!'));
    webrtcSdk.on("sdkError", (error) => console.error(error))
    webrtcSdk.on("pendingSession", handlePendingSession);
    webrtcSdk.on("cancelPendingSession", handleCancelPendingSession);
    webrtcSdk.on("handledPendingSession", handleCancelPendingSession);
    webrtcSdk.on("sessionStarted", handleSessionStarted);
    webrtcSdk.on("sessionEnded", (session) => handleSessionEnded(session));
    // webrtcSdk.on('trace', trace);
    webrtcSdk.on("disconnected", handleDisconnected);
    webrtcSdk.on("connected", handleConnected);
    webrtcSdk.on("conversationUpdate", (event: ISdkConversationUpdateEvent) => handleConversationUpdate(event));
  }

  function startSoftphoneSession(phoneNumber: string) {
    if (!phoneNumber) {
      console.error("Must enter a valid phone number.");
      return;
    }
    window['webrtcSdk'].startSoftphoneSession({ phoneNumber });
  }

  function handlePendingSession(pendingSession) {
    console.warn('pending session: ', pendingSession);
    dispatch(updatePendingSessions(pendingSession));
  }
  // If a pendingSession was cancelled or handled, we can remove it from our state.
  function handleCancelPendingSession(pendingSession) {
    dispatch(removePendingSession(pendingSession));
  }

  function handleSessionStarted() {}

  function handleSessionEnded(session) {}

  function handleDisconnected() {}

  function handleConnected() {}

  function handleConversationUpdate(update: ISdkConversationUpdateEvent) {
    console.warn('here is the active convo:', update);
    dispatch(updateConversations(update));
  }

  function endSession(conversationId: string) {
    window['webrtcSdk'].endSession({ conversationId });
  }
  function toggleAudioMute(mute:boolean, conversationId: string) {
    window['webrtcSdk'].setAudioMute({ mute, conversationId });
  }
  function toggleHoldState(held:boolean, conversationId: string) {
    window['webrtcSdk'].setConversationHeld({ held, conversationId });
  }

  return { initWebrtcSDK, startSoftphoneSession, endSession, toggleAudioMute, toggleHoldState }
}
