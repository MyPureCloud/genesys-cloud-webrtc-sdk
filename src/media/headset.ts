import { Observable } from 'rxjs';
import { SdkMedia } from "..";
import HeadsetService, { ConsumedHeadsetEvents, VendorImplementation} from 'softphone-vendor-headsets';

export class SdkHeadset {
    private media: SdkMedia;
    private headsetLibrary: HeadsetService;
    headsetEvents: Observable<ConsumedHeadsetEvents>;

    constructor(media) {
        this.media = media;
        this.headsetLibrary = HeadsetService.getInstance({ logger: console });
        this.headsetEvents = this.headsetLibrary.getHeadSetEventsSubject().asObservable();
    }

    getAudioDevice(newMicId: string): void {
        const completeDeviceInfo = this.media.getDeviceByIdAndType(newMicId, 'audioinput');
        this.headsetLibrary.activeMicChange(completeDeviceInfo.label.toLowerCase());
    }

    getCurrentSelectedImplementation(): VendorImplementation {
        return this.headsetLibrary.selectedImplementation;
    }

    getConnectionStatus(): string {
        return this.headsetLibrary.connectionStatus;
    }

    showRetry(): boolean {
        const selectedImplementation = this.getCurrentSelectedImplementation();
        if (selectedImplementation.disableRetry) {
            return false;
        }

        return selectedImplementation
            && !selectedImplementation.isConnected
            && ! selectedImplementation.isConnecting;
    }

    retryConnection(micLabel): void {
        const selectedImplementation = this.getCurrentSelectedImplementation();
        selectedImplementation.connect(micLabel.toLowerCase());
    }

    incomingCallRing(callInfo: { conversationId: string, contactName: string }, hasOtherActiveCalls) {
        this.headsetLibrary.incomingCall(callInfo, hasOtherActiveCalls);
    }

    outgoingCall(callInfo: { conversationId: string, contactName: string }) {
        this.headsetLibrary.outgoingCall(callInfo);
    }

    endCurrentCall(currentCallId: string) {
        if (currentCallId) {
            this.headsetLibrary.endCall(currentCallId);
        }
    }

    endAllCalls() {
        this.headsetLibrary.endAllCalls();
    }

    answerIncomingCall(currentCallId: string) {
        this.headsetLibrary.answerCall(currentCallId);
    }

    toggleMute(isMuted: boolean) {
        this.headsetLibrary.setMute(isMuted);
    }

    toggleHold(currentCallId: string, isHeld: boolean) {
        this.headsetLibrary.setHold(currentCallId, isHeld);
    }

}