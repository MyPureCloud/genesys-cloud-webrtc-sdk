import {
  GenesysCloudWebrtcSdk,
  ISdkConfig,
  ISdkConversationUpdateEvent,
  SessionTypes,
  ISessionIdAndConversationId,
  SdkMediaStateWithType,
  ISdkGumRequest,
  IExtendedMediaSession
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
import { IPendingSession } from 'genesys-cloud-streaming-client';
import { RootState } from '../types/store';
import { MinimalSdk } from '../types/sdk';

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
  const sdk = useSelector((state: RootState) => state.sdk.sdk);

  async function initWebrtcSDK(authData: IAuthData) {
    const options: ISdkConfig = {
      accessToken: authData.token,
      environment: authData.environment.uri,
      originAppId: v4(),
      originAppName: 'webrtc-demo-app',
      optOutOfTelemetry: true,
      logLevel: 'info',
      useServerSidePings: true
    };

    webrtcSdk = new GenesysCloudWebrtcSdk(options);
    dispatch(setSdk(webrtcSdk as MinimalSdk));

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
    webrtcSdk.on('sessionEnded', handleSessionEnded);
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
    if (!sdk) {
      console.error('SDK not initialized');
      return;
    }
    sdk.startSoftphoneSession({ phoneNumber });
  }

  function handlePendingSession(pendingSession: IPendingSession): void {
    dispatch(updatePendingSessions({ ...pendingSession }));
  }
  // If a pendingSession was cancelled or handled, we can remove it from our state.
  function handleCancelPendingSession(sessionInfo: ISessionIdAndConversationId): void {
    dispatch(removePendingSession(sessionInfo));
  }

  function handledPendingSession(sessionInfo: ISessionIdAndConversationId): void {
    dispatch(removePendingSession(sessionInfo));
    dispatch(storeHandledPendingSession(sessionInfo))
  }

  function handleSessionStarted() {}

  function handleSessionEnded() {}

  function handleDisconnected() {}

  function handleConnected() {}

  function handleConversationUpdate(update: ISdkConversationUpdateEvent): void {
    dispatch(updateConversations(update));
  }

  function endSession(conversationId: string): void {
    if (!sdk) return;
    sdk.endSession({ conversationId });
  }
  async function toggleAudioMute(mute: boolean, conversationId: string): Promise<void> {
    if (!sdk) return;
    await sdk.setAudioMute({ mute, conversationId });
  }
  async function toggleHoldState(held: boolean, conversationId: string): Promise<void> {
    if (!sdk) return;
    await sdk.setConversationHeld({ held, conversationId });
  }

  function handleMediaStateChange(state: SdkMediaStateWithType): void {
    dispatch(updateMediaState(state));
  }
  function handleGumRequest(_request: ISdkGumRequest): void {
    dispatch(updateGumRequests());
  }

  function updateDefaultDevices(options: { audioDeviceId?: string; videoDeviceId?: string; outputDeviceId?: string }): void {
    if (!sdk) return;
    sdk.updateDefaultDevices({
      ...options,
      updateActiveSessions: true,
    });
  }
  function enumerateDevices(): void {
    if (!sdk) return;
    sdk.media.enumerateDevices(true);
  }
  function requestDevicePermissions(type: string): void {
    if (!sdk) return;
    sdk.media.requestMediaPermissions(type as 'audio' | 'video' | 'both');
  }
  function updateAudioVolume(volume: string): void {
    if (!sdk) return;
    sdk.updateAudioVolume(parseInt(volume));
  }

  async function destroySdk(): Promise<void> {
    if (!sdk) return;
    await sdk.destroy();
  }

  /* Misc Functions */
  async function updateOnQueueStatus(onQueue: boolean): Promise<void> {
    if (!sdk || !sdk._http || !sdk._config || !sdk._personDetails) return;
    const systemPresences = await sdk._http.requestApi(`systempresences`, {
      method: 'get' as const,
      host: sdk._config.environment || '',
      authToken: sdk._config.accessToken
    });

    let presenceDefinition;
    const presences = systemPresences.data as Array<{ name: string }>;
    if (onQueue) {
      presenceDefinition = presences.find((p: { name: string; }) => p.name === 'ON_QUEUE')
    } else {
      presenceDefinition = presences.find((p: { name: string; }) => p.name === 'AVAILABLE')
    }
    const requestOptions = {
      method: 'patch' as const,
      host: sdk._config.environment || '',
      authToken: sdk._config.accessToken,
      data: JSON.stringify({ presenceDefinition })
    };

    await sdk._http.requestApi(`users/${sdk._personDetails.id}/presences/PURECLOUD`, requestOptions);
  }

  function disconnectPersistentConnection(): void {
    if (!sdk) return;
    const sessions = sdk.sessionManager.getAllActiveSessions().filter((session: IExtendedMediaSession) => session.sessionType === SessionTypes.softphone);
    sessions.forEach((session: IExtendedMediaSession) => sdk.forceTerminateSession(session.id));
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
    updateOnQueueStatus,
    disconnectPersistentConnection
  };
}
