import { GenesysCloudWebrtcSdk, ISdkConfig, ISdkConversationUpdateEvent } from 'genesys-cloud-webrtc-sdk';
import { v4 } from 'uuid';
import { useNavigate } from 'react-router-dom';

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

  function handlePendingSession(pendingSession) {}

  function pendingSessionHandled() {}

  function handleSessionStarted() {}

  function handleSessionEnded(session) {}

  function handleDisconnected() {}

  function handleConnected() {}

  function handleConversationUpdate(update: ISdkConversationUpdateEvent) {}

  return { initWebrtcSDK }
}
