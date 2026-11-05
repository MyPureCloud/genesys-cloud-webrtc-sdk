import {
  GenesysCloudWebrtcSdk,
  ISdkConfig,
  SessionTypes,
  IExtendedMediaSession
} from 'genesys-cloud-webrtc-sdk';
import { useDispatch } from 'react-redux';
import { setSdk } from '../features/sdkSlice';
import { useSelector } from 'react-redux';
import { RootState } from '../types/store';
import { MinimalSdk } from '../types/sdk';
import { connectSdkEventHandlers } from './sdkEventHandlers';

// Uncomment for audio processor testing.
// The SDK accepts any audio processor that implements the IAudioProcessor interface.
// GenesysIrisClient is used here as a concrete example implementation.
// Manually add these in either the src or public folder of the demo app.
// import licenseText from '../assets/iris.lic?raw';
// import keyText from '../assets/iris.key?raw';
// Without the imports these stay undefined and no audio processor is constructed; delete them when uncommenting.
const licenseText: string | undefined = undefined;
const keyText: string | undefined = undefined;
import { GenesysIrisClient } from 'genesys-iris-client';
import { setAudioProcessor } from '../features/audioProcessorSlice';
import { IAudioProcessor } from 'genesys-cloud-webrtc-sdk';

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
    const audioProcessor = await constructAudioProcessor();

    const options: ISdkConfig = {
      accessToken: authData.token,
      environment: authData.environment.uri,
      originAppId: globalThis.crypto.randomUUID(),
      originAppName: 'webrtc-demo-app',
      optOutOfTelemetry: true,
      logLevel: 'info',
      useServerSidePings: true,
      defaults: {
        audioProcessor: audioProcessor || undefined,
        micNoiseSuppression: false,
        micEchoCancellation: false,
        micAutoGainControl: false
      }
    };

    if (!audioProcessor && options.defaults) {
      options.defaults.micNoiseSuppression = false;
      options.defaults.micEchoCancellation = false;
      options.defaults.micAutoGainControl = false;
    }

    webrtcSdk = new GenesysCloudWebrtcSdk(options);
    dispatch(setSdk(webrtcSdk as MinimalSdk));
    dispatch(setAudioProcessor(audioProcessor));

    connectSdkEventHandlers(webrtcSdk, dispatch);

    await webrtcSdk.initialize();
  }

  // Construct a concrete audio processor. GenesysIrisClient is used here as an
  // example implementation of the IAudioProcessor interface.
  async function constructAudioProcessor(): Promise<IAudioProcessor | undefined> {
    if (!keyText || !licenseText) {
      return;
    }
    const irisClient = new GenesysIrisClient({
      company: 'GENESYS_TEST',
      key: keyText,
      license: licenseText,
      team: 'Dev Team',
      user: 'The Omnissiah'
    });

    return irisClient as unknown as IAudioProcessor;
  }

  async function initAudioProcessor()  {
    const audioProcessor = await constructAudioProcessor();
    dispatch(setAudioProcessor(audioProcessor));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sdk as any).audioProcessor.setAudioProcessor(audioProcessor);
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
    disconnectPersistentConnection,
    initAudioProcessor
  };
}
