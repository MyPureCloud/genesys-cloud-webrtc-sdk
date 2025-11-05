// Minimal SDK interface for type safety
import { IExtendedMediaSession } from 'genesys-cloud-webrtc-sdk';
export interface MinimalSdk {
  startSoftphoneSession: (params: { phoneNumber: string }) => void;
  endSession: (params: { conversationId: string }) => void;
  setAudioMute: (params: { mute: boolean; conversationId: string }) => Promise<void>;
  setConversationHeld: (params: { held: boolean; conversationId: string }) => Promise<void>;
  updateDefaultDevices: (options: { audioDeviceId?: string; videoDeviceId?: string; outputDeviceId?: string; updateActiveSessions?: boolean }) => void;
  updateAudioVolume: (volume: number) => void;
  destroy: () => Promise<void>;
  acceptPendingSession: (params: { conversationId: string }) => void;
  rejectPendingSession: (params: { conversationId: string }) => void;
  forceTerminateSession: (sessionId: string) => void;
  media: {
    enumerateDevices: (force?: boolean) => void;
    requestMediaPermissions: (type: 'audio' | 'video' | 'both') => void;
  };
  sessionManager: {
    getAllActiveSessions: () => IExtendedMediaSession[];
  };
  station?: {
    webRtcPersistentEnabled?: boolean;
    name?: string;
    id?: string;
    status?: string;
    type?: string;
    webRtcCallAppearances?: number;
    webRtcForceTurn?: boolean;
    [key: string]: unknown;
  } | null;
  _config?: {
    environment?: string;
    accessToken?: string;
    defaults?: {
      audioVolume?: number;
    };
  };
  _http?: {
    requestApi: (endpoint: string, options: { method: 'get' | 'post' | 'patch' | 'put' | 'delete'; host: string; authToken?: string; data?: string }) => Promise<{ data: unknown }>;
  };
  _personDetails?: {
    id: string;
  };
}