import { Observable } from 'rxjs';
import { SdkMedia } from "..";
import HeadsetService, { ConsumedHeadsetEvents } from 'softphone-vendor-headsets';

export class SdkHeadset {
    private media: SdkMedia;
    private headsetLibrary: HeadsetService;
    headsetEvents: Observable<ConsumedHeadsetEvents>

    constructor(media) {
        this.media = media;
        this.headsetLibrary = HeadsetService.getInstance({ logger: console });
        this.headsetEvents = this.headsetLibrary.getHeadSetEventsSubject().asObservable();

        this.headsetLibrary.headsetEvents$.subscribe((value) => {
            if (value.event === 'webHidPermissionRequested') {
                this.webHidPairing(value.payload);
            }
        })
    }

    getAudioDevice(newMicId: string): void {
        const completeDeviceInfo = this.media.getDeviceByIdAndType(newMicId, 'audioinput');
        this.headsetLibrary.activeMicChange(completeDeviceInfo.label.toLowerCase());
    }

    webHidPairing(payload): void {
        console.log('payload => ', payload);
        payload.body.callback();
        // payload.webHidPairing();
    }

    incomingCallRing(callInfo: { conversationId: string, contactName: string }, hasOtherActiveCalls) {
        this.headsetLibrary.incomingCall(callInfo, hasOtherActiveCalls);
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