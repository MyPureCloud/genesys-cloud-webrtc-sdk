import { Observable, Subject } from 'rxjs';
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

    getAudioDevice(newMicId): void {
        const completeDeviceInfo = this.media.getDeviceByIdAndType(newMicId, 'audioinput');
        this.headsetLibrary.activeMicChange(completeDeviceInfo.label.toLowerCase());
    }

    webHidPairing(payload): void {
        console.log('testing testing');
        console.log('payload => ', payload);
        payload.body.callback();
        // payload.webHidPairing();
    }

    incomingCallRing(pendingCalls) {
        console.log('ringing for incoming call', pendingCalls);
        const callInfo = {
            conversationId: pendingCalls[pendingCalls.length - 1].conversationId,
            contactName: pendingCalls[pendingCalls.length - 1].userName
        }
        this.headsetLibrary.incomingCall(callInfo, pendingCalls.length > 1);
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
        console.log('answered call', currentCallId);
        this.headsetLibrary.answerCall(currentCallId);
    }

    toggleMute(isMuted: boolean) {
        console.log('toggle mute', isMuted);
        this.headsetLibrary.setMute(isMuted);
    }

    toggleHold(currentCallId: string, isHeld: boolean) {
        this.headsetLibrary.setHold(currentCallId, isHeld);
    }

}