import { GenesysCloudWebrtcSdk, ISdkConfig, ISdkConversationUpdateEvent, ISessionIdAndConversationId } from 'genesys-cloud-webrtc-sdk';
import { v4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from "react-redux";
import {
  updatePendingSessions
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
    webrtcSdk.on("cancelPendingSession", (pendingSession) => handlePendingSession(pendingSession));
    webrtcSdk.on("handledPendingSession", pendingSessionHandled);
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

  function pendingSessionHandled() {}

  function handleSessionStarted() {}

  function handleSessionEnded(session) {}

  function handleDisconnected() {}

  function handleConnected() {}

  function handleConversationUpdate(update: ISdkConversationUpdateEvent) {}

  return { initWebrtcSDK, startSoftphoneSession }
}
