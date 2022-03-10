import { Observable } from 'rxjs';
import GenesysCloudWebrtcSdk from '../client';
import HeadsetService, { ConsumedHeadsetEvents, VendorImplementation} from 'softphone-vendor-headsets';

export class SdkHeadset {
    private sdk: GenesysCloudWebrtcSdk;
    private headsetLibrary: HeadsetService;
    headsetEvents$: Observable<ConsumedHeadsetEvents>;

    constructor(sdk: GenesysCloudWebrtcSdk) {
        this.sdk = sdk;
        this.headsetLibrary = HeadsetService.getInstance({ logger: sdk.logger });
        this.headsetEvents$ = this.headsetLibrary.headsetEvents$;
    }

    updateAudioInputDevice (newMicId: string): void {
        const completeDeviceInfo = this.sdk.media.findCachedDeviceByIdAndKind(newMicId, 'audioinput');
        this.headsetLibrary.activeMicChange(completeDeviceInfo.label.toLowerCase());
    }

    getCurrentSelectedImplementation (): VendorImplementation {
        return this.headsetLibrary.selectedImplementation;
    }

    showRetry (): boolean {
        const selectedImplementation = this.getCurrentSelectedImplementation();
        if (selectedImplementation?.disableRetry) {
            return false;
        }

        return !!selectedImplementation
            && !selectedImplementation.isConnected
            && !selectedImplementation.isConnecting;
    }

    retryConnection (micLabel: string): void {
        this.headsetLibrary.retryConnection(micLabel);
    }

    setRinging (callInfo: { conversationId: string, contactName?: string }, hasOtherActiveCalls): Promise<void> {
        return this.headsetLibrary.incomingCall(callInfo, hasOtherActiveCalls);
    }

    outgoingCall (callInfo: { conversationId: string, contactName: string }): Promise<void> {
        return this.headsetLibrary.outgoingCall(callInfo);
    }

    endCurrentCall (conversationId: string): Promise<void> {
        if (conversationId) {
            return this.headsetLibrary.endCall(conversationId);
        }
    }

    endAllCalls (): Promise<void> {
        return this.headsetLibrary.endAllCalls();
    }

    answerIncomingCall (conversationId: string): Promise<void> {
        return this.headsetLibrary.answerCall(conversationId);
    }

    setMute (isMuted: boolean): Promise<void> {
        return this.headsetLibrary.setMute(isMuted);
    }

    setHold (conversationId: string, isHeld: boolean): Promise<void> {
        return this.headsetLibrary.setHold(conversationId, isHeld);
    }

}