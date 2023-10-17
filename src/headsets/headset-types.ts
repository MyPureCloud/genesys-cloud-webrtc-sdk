/* istanbul ignore file */
import { GenesysMediaMessageParams, JsonRpcMessage } from "genesys-cloud-streaming-client";
import { Observable } from "rxjs";
import { DeviceConnectionStatus, EventInfoWithConversationId, HeadsetEvents, HoldEventInfo, MutedEventInfo, VendorImplementation, WebHidPermissionRequest } from "softphone-vendor-headsets";

export type OrchestrationState = 'notStarted' | 'negotiating' | 'alternativeClient' | 'hasControls';
export type ExpandedDeviceConnectionStatus = DeviceConnectionStatus | OrchestrationState;

type Events = {
  [HeadsetEvents.implementationChanged]: VendorImplementation;
  [HeadsetEvents.deviceHoldStatusChanged]: HoldEventInfo;
  [HeadsetEvents.deviceMuteStatusChanged]: MutedEventInfo;
  [HeadsetEvents.deviceAnsweredCall]: EventInfoWithConversationId;
  [HeadsetEvents.deviceEndedCall]: EventInfoWithConversationId
  [HeadsetEvents.deviceRejectedCall]: EventInfoWithConversationId;
  [HeadsetEvents.loggableEvent]: any;
  [HeadsetEvents.webHidPermissionRequested]: WebHidPermissionRequest;
  [HeadsetEvents.deviceConnectionStatusChanged]: ExpandedDeviceConnectionStatus;
}

export type ExpandedConsumedHeadsetEvents<T = keyof Events> = T extends keyof Events
    ? { event: T, payload: Events[T] }
    : never;

export interface ISdkHeadsetService {
  headsetEvents$: Observable<ExpandedConsumedHeadsetEvents>;
  currentSelectedImplementation: VendorImplementation;

  updateAudioInputDevice (newMicId: string): void;
  showRetry (): boolean;
  retryConnection (micLabel: string): Promise<void>;
  setRinging (callInfo: { conversationId: string, contactName?: string }, hasOtherActiveCalls: boolean): Promise<void>;
  outgoingCall (callInfo: { conversationId: string, contactName?: string }): Promise<void>;
  endCurrentCall (conversationId: string): Promise<void>;
  endAllCalls (): Promise<void>;
  answerIncomingCall (conversationId: string, autoAnswer: boolean): Promise<void>;
  rejectIncomingCall (conversationId: string, expectExistingConversation?: boolean): Promise<void>;
  setMute (isMuted: boolean): Promise<void>;
  setHold (conversationId: string, isHeld: boolean): Promise<void>;
}

export type HeadsetRequest = JsonRpcMessage<Pick<GenesysMediaMessageParams, 'headsetControlsRequest'>>;
export type HeadsetRejection = JsonRpcMessage<Pick<GenesysMediaMessageParams, 'headsetControlsRejection'>>;
export type HeadsetControlsChanged = JsonRpcMessage<Pick<GenesysMediaMessageParams, 'headsetControlsChanged'>>;