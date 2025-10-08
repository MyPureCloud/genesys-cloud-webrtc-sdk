import {
  GenesysCloudWebrtcSdk,
  ISdkConfig,
  ISdkConversationUpdateEvent,
  SessionTypes,
  ISessionIdAndConversationId,
  SdkMediaStateWithType,
  MemberStatusMessage,
  VideoMediaSession,
  IParticipantsUpdate,
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
import {
  addParticipantUpdateToVideoConversation,
  addVideoConversationToActive, removeVideoConversationFromActive,
  setActiveParticipants, setUsersTalking,
  updateConversationMediaStreams
} from "../features/videoConversationsSlice.ts";
import { AppDispatch } from "../types/store.ts";

interface IAuthData {
  token: string;
  environment: {
    clientId: string;
    uri: string;
  };
}

export default function useSdk() {
  let webrtcSdk: GenesysCloudWebrtcSdk;
  const dispatch = useDispatch<AppDispatch>();
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
    dispatch(updatePendingSessions(pendingSession));
  }
  // If a pendingSession was cancelled or handled, we can remove it from our state.
  function handleCancelPendingSession(sessionInfo: ISessionIdAndConversationId): void {
    dispatch(removePendingSession(sessionInfo));
  }

  function handledPendingSession(sessionInfo: ISessionIdAndConversationId): void {
    dispatch(removePendingSession(sessionInfo));
    dispatch(storeHandledPendingSession(sessionInfo))
  }

  async function handleSessionStarted(session: IExtendedMediaSession) {
    if (session.sessionType === 'collaborateVideo') {

      session.on('participantsUpdate', (e: IParticipantsUpdate) => console.log('participantsUpdate', e));

      const localMediaStream = await webrtcSdk.media.startMedia({ video: true, audio: true });

      const audioElement = document.getElementById('audio1') as HTMLAudioElement;
      const videoElement = document.getElementById('video1') as HTMLVideoElement;
      webrtcSdk.acceptSession({
        conversationId: session.conversationId,
        audioElement: audioElement ?? undefined,
        videoElement: videoElement ?? undefined,
        mediaStream: localMediaStream
      });

      dispatch(addVideoConversationToActive({
        session: session,
        conversationId: session.conversationId,
      }));

      if (session?._outboundStream) {
        dispatch(updateConversationMediaStreams({
          conversationId: session.conversationId,
          outboundStream: session._outboundStream,
        }));
      }

      setupSessionListeners(session);
    }
  }

  const updateMemberStatus = (memberStatusMessage: MemberStatusMessage, convId: string) => {
    // Detect which remote user is shown
    if (memberStatusMessage?.params?.incomingStreams) {
      const userId = memberStatusMessage.params.incomingStreams[0].appId?.sourceUserId;
      dispatch(setActiveParticipants({
        conversationId: convId,
        activeParticipant: userId
      }));
    }
    // Detect if the user that is shown is 'speaking'
    if (memberStatusMessage?.params?.speakers) {
      const usersTalking = memberStatusMessage.params.speakers.reduce((acc, speaker) =>
          ({
            ...acc,
            [speaker.appId.sourceUserId]: speaker.activity === 'speaking'
          }),
        {});

      dispatch(setUsersTalking({
        conversationId: convId,
        usersTalking
      }));
    }
  }

  const setupSessionListeners = (session: IExtendedMediaSession) => {
    // Save the incoming media stream to allow switching between conversations
    session.on('incomingMedia', () => {
      if (session.pc.getReceivers) {
        const receivers = session.pc.getReceivers();
        const inboundTracks = receivers
          .map(receiver => receiver.track)
          .filter(track => track);
        if (inboundTracks.length > 0) {
          const inboundStream = new MediaStream(inboundTracks);
          dispatch(updateConversationMediaStreams({
            conversationId: session.conversationId,
            inboundStream: inboundStream,
          }));
        }
      }
    });

    // Used for mute/unmute, screen share
    session.on('participantsUpdate', (partsUpdate: IParticipantsUpdate) => {
      dispatch(addParticipantUpdateToVideoConversation(partsUpdate));
    });

    // Remove conversation from store
    session.on('terminated', reason => {
      dispatch(removeVideoConversationFromActive({ conversationId: session.conversationId, reason: reason }));
    });

    // detect active participant and set green border when talking
    session.on('memberStatusUpdate', (memberStatusMessage: MemberStatusMessage) => updateMemberStatus(memberStatusMessage, session.conversationId));
  }

  function startVideoConference(roomJid: string): Promise<{ conversationId: string; }> {
    if (!sdk) {
      return Promise.reject();
    }
    return sdk.startVideoConference(roomJid);
  }


  function startVideoMeeting(roomJid: string): Promise<{ conversationId: string; }> {
    if (!sdk) {
      return Promise.reject();
    }
    return sdk?.startVideoMeeting(roomJid);
  }

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

  async function toggleVideoMute(mute: boolean, conversationId: string): Promise<void> {
    if (!sdk) {
      return Promise.reject();
    }
    await sdk.setVideoMute({ mute, conversationId });
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

  function updateDefaultDevices(options: {
    audioDeviceId?: string;
    videoDeviceId?: string;
    outputDeviceId?: string
  }): void {
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

  function getSession(conversationId: string): VideoMediaSession {
    if (!sdk) return { fromUserId: '', sessionType: 'collaborateVideo' } as VideoMediaSession;
    return sdk.sessionManager.getSession({ conversationId });
  }

  function getDefaultDevices(): {
    audioVolume?: number | undefined
    audioDeviceId?: string | undefined
    videoDeviceId?: string | undefined
    outputDeviceId?: string | undefined
  } | undefined {
    if (!sdk) return
    return sdk._config.defaults;
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
    startVideoConference,
    startVideoMeeting,
    getSession,
    getDefaultDevices
  };
}
