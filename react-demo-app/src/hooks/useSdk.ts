import {
  GenesysCloudWebrtcSdk, IAcceptSessionRequest, IExtendedMediaSession,
  ISdkConfig,
  ISdkConversationUpdateEvent, ISdkGumRequest, SdkMediaStateWithType,
  SessionTypes, VideoMediaSession, ISessionIdAndConversationId
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
import { RequestApiOptions, IPendingSession } from 'genesys-cloud-streaming-client';

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
  const sdk: GenesysCloudWebrtcSdk = useSelector((state) => state.sdk.sdk);

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
    // webrtcSdk.on('sessionStarted', handleSessionStarted);
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
    sdk.startSoftphoneSession({phoneNumber});
  }

  function sessionStarted(callback: (arg0: VideoMediaSession) => Promise<void>) {
    sdk.on('sessionStarted', (session: any) => callback(session));
  }

  function removeSessionStarted() {
    sdk.removeAllListeners('sessionStarted');
  }

  function acceptSession(opts: IAcceptSessionRequest) {
    sdk.acceptSession(opts);
  }

  function handlePendingSession(pendingSession: IPendingSession): void {
    dispatch(updatePendingSessions(pendingSession));
  }

  // If a pendingSession was cancelled or handled, we can remove it from our state.
  function handleCancelPendingSession(pendingSession: ISessionIdAndConversationId): void {
    dispatch(removePendingSession(pendingSession));
  }

  function handledPendingSession(pendingSession: ISessionIdAndConversationId): void {
    dispatch(removePendingSession(pendingSession));
    dispatch(storeHandledPendingSession(pendingSession))
  }

  function handleSessionStarted() {
  }

  function startVideoConference(roomJid: string): Promise<{conversationId: string;}> {
    return sdk.startVideoConference(roomJid);
  }

  function startVideoMeeting(roomJid: string): Promise<{conversationId: string;}> {
    return sdk.startVideoMeeting(roomJid);
  }

  async function startMedia(opts: {video: boolean, audio: boolean}): Promise<MediaStream> {
    return await sdk.media.startMedia(opts);
  }

  function handleSessionEnded(_session: IExtendedMediaSession) {
  }

  function handleDisconnected() {
  }

  function handleConnected() {
  }

  function handleConversationUpdate(update: ISdkConversationUpdateEvent): void {
    dispatch(updateConversations(update));
  }

  function endSession(conversationId: string): void {
    sdk.endSession({conversationId});
  }

  async function toggleAudioMute(mute: boolean, conversationId: string): Promise<void> {
    await sdk.setAudioMute({mute, conversationId});
  }

  async function toggleVideoMute(mute: boolean, conversationId: string): Promise<void> {
    await sdk.setVideoMute({mute, conversationId});
  }

  async function toggleHoldState(held: boolean, conversationId: string): Promise<void> {
    await sdk.setConversationHeld({held, conversationId});
  }

  function handleMediaStateChange(state: SdkMediaStateWithType): void {
    dispatch(updateMediaState(state));
  }

  function handleGumRequest(_state: ISdkGumRequest): void {
    dispatch(updateGumRequests());
  }

  function updateDefaultDevices(options: any): void {
    sdk.updateDefaultDevices({
      ...options,
      updateActiveSessions: true,
    });
  }

  function enumerateDevices(): void {
    sdk.media.enumerateDevices(true);
  }

  function requestDevicePermissions(type: 'audio' | 'video' | 'both'): void {
    sdk.media.requestMediaPermissions(type);
  }

  function updateAudioVolume(volume: number): void {
    sdk.updateAudioVolume(volume);
  }

  async function destroySdk(): Promise<void> {
    await sdk.destroy();
  }

  /* Misc Functions */
  async function updateOnQueueStatus(onQueue: boolean): Promise<void> {
    const systemPresences = await sdk._http.requestApi(`systempresences`, {
      method: 'get',
      host: sdk._config.environment || 'inindca.com',
      authToken: sdk._config.accessToken
    });

    let presenceDefinition;
    if (onQueue) {
      presenceDefinition = systemPresences.data.find((p: {name: string;}) => p.name === 'ON_QUEUE')
    } else {
      presenceDefinition = systemPresences.data.find((p: {name: string;}) => p.name === 'AVAILABLE')
    }
    const requestOptions: RequestApiOptions = {
      method: 'patch',
      host: sdk._config.environment || 'inindca.com',
      authToken: sdk._config.accessToken,
      data: JSON.stringify({presenceDefinition})
    };

    await sdk._http.requestApi(`users/${sdk._personDetails.id}/presences/PURECLOUD`, requestOptions);
  }

  function disconnectPersistentConnection(): void {
    const sessions = sdk.sessionManager.getAllActiveSessions().filter((session: IExtendedMediaSession) => session.sessionType === SessionTypes.softphone);
    sessions.forEach((session: IExtendedMediaSession) => sdk.forceTerminateSession(session.id));
  }

  return {
    initWebrtcSDK,
    startSoftphoneSession,
    endSession,
    toggleAudioMute,
    toggleVideoMute,
    toggleHoldState,
    updateDefaultDevices,
    enumerateDevices,
    requestDevicePermissions,
    updateAudioVolume,
    destroySdk,
    updateOnQueueStatus,
    disconnectPersistentConnection,
    handleSessionStarted,
    startVideoConference,
    startVideoMeeting,
    startMedia,
    acceptSession,
    sessionStarted,
    removeSessionStarted
  };
}
