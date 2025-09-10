import {
  GenesysCloudWebrtcSdk, IExtendedMediaSession,
  ISdkConfig,
  ISdkConversationUpdateEvent, ISdkGumRequest, SdkMediaStateWithType,
  SessionTypes, ISessionIdAndConversationId, MemberStatusMessage, VideoMediaSession, IParticipantsUpdate
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
import { RequestApiOptions, IPendingSession, SessionEvents } from 'genesys-cloud-streaming-client';
import { RootState, AppDispatch } from "../store.ts";
import {
  addParticipantUpdateToVideoConversation,
  addVideoConversationToActive, removeVideoConversationFromActive,
  setActiveParticipants, setUsersTalking,
  updateConversationMediaStreams
} from "../features/videoConversationsSlice.ts";

interface IAuthData {
  token: string;
  environment: {
    clientId: string;
    uri: string;
  };
}

type IMediaTypes = 'audio' | 'video' | 'both'

export default function useSdk() {
  let webrtcSdk: GenesysCloudWebrtcSdk;
  const dispatch = useDispatch<AppDispatch>();

  const sdk: GenesysCloudWebrtcSdk = useSelector((state: RootState) => state.sdk.sdk);

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

  async function handleSessionStarted(session: IExtendedMediaSession) {
    if (session.sessionType === 'collaborateVideo') {

      const sessionEventsToLog: Array<keyof SessionEvents> = ['participantsUpdate', 'activeVideoParticipantsUpdate', 'speakersUpdate'];
      sessionEventsToLog.forEach((eventName) => {
        session.on(eventName, (e) => console.info(eventName, e));
      })

      const localMediaStream = await webrtcSdk.media.startMedia({ video: true, audio: true });

      webrtcSdk.acceptSession({
        conversationId: session.conversationId,
        audioElement: document.createElement('audio'),
        videoElement: document.createElement('video'),
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
      const userIds = memberStatusMessage.params.incomingStreams.map(stream => {
        const appId = stream.appId || stream.appid;
        return appId?.sourceUserId
      });
      // We don't show more than one remote stream at a time
      const userId = userIds[0]
      dispatch(setActiveParticipants({
        conversationId: convId,
        activeParticipant: userId
      }));
    }
    // Detect if the user that is shown is 'speaking'
    if (memberStatusMessage?.params?.speakers) {
      const usersTalking = memberStatusMessage.params.speakers.reduce((acc, current) => {
        return { ...acc, [current.appId.sourceUserId]: current.activity === 'speaking' }
      }, {});
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
    return sdk.startVideoConference(roomJid);
  }

  function startVideoMeeting(roomJid: string): Promise<{ conversationId: string; }> {
    return sdk.startVideoMeeting(roomJid);
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
    sdk.endSession({ conversationId });
  }

  async function toggleAudioMute(mute: boolean, conversationId: string): Promise<void> {
    await sdk.setAudioMute({ mute, conversationId });
  }

  async function toggleVideoMute(mute: boolean, conversationId: string): Promise<void> {
    await sdk.setVideoMute({ mute, conversationId });
  }

  async function toggleHoldState(held: boolean, conversationId: string): Promise<void> {
    await sdk.setConversationHeld({ held, conversationId });
  }

  function handleMediaStateChange(mediaState: SdkMediaStateWithType): void {
    dispatch(updateMediaState(mediaState));
  }

  function handleGumRequest(_gumRequest: ISdkGumRequest): void {
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

  function requestDevicePermissions(type: IMediaTypes): void {
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
      presenceDefinition = systemPresences.data.find((p: { name: string; }) => p.name === 'ON_QUEUE')
    } else {
      presenceDefinition = systemPresences.data.find((p: { name: string; }) => p.name === 'AVAILABLE')
    }
    const requestOptions: RequestApiOptions = {
      method: 'patch',
      host: sdk._config.environment || 'inindca.com',
      authToken: sdk._config.accessToken,
      data: JSON.stringify({ presenceDefinition })
    };

    await sdk._http.requestApi(`users/${sdk._personDetails.id}/presences/PURECLOUD`, requestOptions);
  }

  function disconnectPersistentConnection(): void {
    const sessions = sdk.sessionManager.getAllActiveSessions().filter((session: IExtendedMediaSession) => session.sessionType === SessionTypes.softphone);
    sessions.forEach((session: IExtendedMediaSession) => sdk.forceTerminateSession(session.id));
  }

  function getSession(conversationId: string): VideoMediaSession {
    return sdk.sessionManager.getSession({ conversationId }) as VideoMediaSession;
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
    getSession
  };
}
