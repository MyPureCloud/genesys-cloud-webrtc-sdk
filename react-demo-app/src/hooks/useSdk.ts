import {
  GenesysCloudWebrtcSdk,
  ISdkConfig,
  ISdkConversationUpdateEvent,
} from 'genesys-cloud-webrtc-sdk';
import { v4 } from 'uuid';
import { useDispatch } from 'react-redux';
import {
  removePendingSession,
  updatePendingSessions,
  updateConversations,
  storeHandledPendingSession
} from '../features/conversationsSlice';
import { setSdk } from '../features/sdkSlice';
import { updateGumRequests, updateMediaState } from '../features/devicesSlice';
import { useSelector } from 'react-redux';

interface IAuthData {
  token: string;
  environment: {
    clientId: string;
    uri: string;
  };
}

export default function useSdk() {
  let webrtcSdk: GenesysCloudWebrtcSdk;
  const dispatch = useDispatch();
  const sdk = useSelector((state) => state.sdk.sdk);

  async function initWebrtcSDK(authData: IAuthData) {
    const options: ISdkConfig = {
      accessToken: authData.token,
      environment: authData.environment.uri,
      originAppId: v4(),
      originAppName: 'webrtc-demo-app',
      optOutOfTelemetry: true,
      logLevel: 'info',
    };

    webrtcSdk = new GenesysCloudWebrtcSdk(options);
    dispatch(setSdk(webrtcSdk));

    connectEventHandlers();

    await webrtcSdk.initialize();
  }

  function connectEventHandlers() {
    webrtcSdk.on('ready', () => console.warn('ready!'));
    webrtcSdk.on('sdkError', (error) => console.error(error));
    webrtcSdk.on('pendingSession', handlePendingSession);
    webrtcSdk.on('cancelPendingSession', handleCancelPendingSession);
    webrtcSdk.on('handledPendingSession', handledPendingSession);
    webrtcSdk.on('sessionStarted', handleSessionStarted);
    webrtcSdk.on('sessionEnded', (session) => handleSessionEnded(session));
    // webrtcSdk.on('trace', trace);
    webrtcSdk.on('disconnected', handleDisconnected);
    webrtcSdk.on('connected', handleConnected);
    webrtcSdk.on('conversationUpdate', (event: ISdkConversationUpdateEvent) =>
      handleConversationUpdate(event)
    );

    webrtcSdk.media.on('state', handleMediaStateChange);
    webrtcSdk.media.on('gumRequest', handleGumRequest);
  }

  function startSoftphoneSession(phoneNumber: string) {
    if (!phoneNumber) {
      console.error('Must enter a valid phone number.');
      return;
    }
    sdk.startSoftphoneSession({ phoneNumber });
  }

  function handlePendingSession(pendingSession) {
    dispatch(updatePendingSessions(pendingSession));
  }
  // If a pendingSession was cancelled or handled, we can remove it from our state.
  function handleCancelPendingSession(pendingSession) {
    dispatch(removePendingSession(pendingSession));
  }

  function handledPendingSession(pendingSession) {
    dispatch(removePendingSession(pendingSession));
    dispatch(storeHandledPendingSession(pendingSession))
  }

  function handleSessionStarted() {}

  function handleSessionEnded(session) {}

  function handleDisconnected() {}

  function handleConnected() {}

  function handleConversationUpdate(update: ISdkConversationUpdateEvent) {
    dispatch(updateConversations(update));
  }

  function endSession(conversationId: string) {
    sdk.endSession({ conversationId });
  }
  async function toggleAudioMute(mute: boolean, conversationId: string) {
    await sdk.setAudioMute({ mute, conversationId });
  }
  async function toggleHoldState(held: boolean, conversationId: string) {
    await sdk.setConversationHeld({ held, conversationId });
  }

  function handleMediaStateChange(state: void) {
    dispatch(updateMediaState(state));
  }
  function handleGumRequest(state: void) {
    dispatch(updateGumRequests(state));
  }

  function updateDefaultDevices(options): void {
    sdk.updateDefaultDevices({
      ...options,
      updateActiveSessions: true,
    });
  }
  function enumerateDevices(): void {
    sdk.media.enumerateDevices(true);
  }
  function requestDevicePermissions(type: string): void {
    sdk.media.requestMediaPermissions(type);
  }
  function updateAudioVolume(volume: string): void {
    sdk.updateAudioVolume(volume);
  }

  async function destroySdk(): Promise<void> {
    await sdk.destroy();
  }

  /* Misc Functions */
  async function updateOnQueueStatus(onQueue: boolean) {
    const systemPresences = await sdk._http.requestApi(`systempresences`, {
      method: 'get',
      host: sdk._config.environment,
      authToken: sdk._config.accessToken
    });

    let presenceDefinition;
    if (onQueue) {
      presenceDefinition = systemPresences.data.find((p: { name: string; }) => p.name === 'ON_QUEUE')
    } else {
      presenceDefinition = systemPresences.data.find((p: { name: string; }) => p.name === 'AVAILABLE')
    }
    const requestOptions = {
      method: 'patch',
      host: sdk._config.environment,
      authToken: sdk._config.accessToken,
      data: JSON.stringify({ presenceDefinition })
    };

    await sdk._http.requestApi(`users/${sdk._personDetails.id}/presences/PURECLOUD`, requestOptions);
  }

  return {
    initWebrtcSDK,
    startSoftphoneSession,
    endSession,
    toggleAudioMute,
    toggleHoldState,
    updateDefaultDevices,
    enumerateDevices,
    requestDevicePermissions,
    updateAudioVolume,
    destroySdk,
    updateOnQueueStatus
  };
}
