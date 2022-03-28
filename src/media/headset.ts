import { Observable } from 'rxjs';
import GenesysCloudWebrtcSdk from '../client';
import HeadsetService, { ConsumedHeadsetEvents, VendorImplementation} from 'softphone-vendor-headsets';

export class SdkHeadset {
    private sdk: GenesysCloudWebrtcSdk;
    private headsetLibrary: HeadsetService;
    headsetEvents$: Observable<ConsumedHeadsetEvents>;

    constructor (sdk: GenesysCloudWebrtcSdk) {
        this.sdk = sdk;
        this.headsetLibrary = HeadsetService.getInstance({ logger: sdk.logger });
        this.headsetEvents$ = this.headsetLibrary.headsetEvents$;
    }

    /**
     * Updates the selected device and implementation within the headset library
     * @param newMicId ID associated with the newly selected device
     * @returns void
     */
    updateAudioInputDevice (newMicId: string): void {
        const completeDeviceInfo = this.sdk.media.findCachedDeviceByIdAndKind(newMicId, 'audioinput');
        this.headsetLibrary.activeMicChange(completeDeviceInfo.label.toLowerCase());
    }

    /**
     * Gets the currently selected vendor implementation from the headset library
     * @params none
     * @returns VendorImplementation
     */
    get currentSelectedImplementation (): VendorImplementation {
        return this.headsetLibrary.selectedImplementation;
    }

    /**
     * Determines if the retry button is necessary to be rendered
     * @params none
     * @returns boolean
     */
    showRetry (): boolean {
        const selectedImplementation = this.currentSelectedImplementation;
        if (selectedImplementation?.disableRetry) {
            return false;
        }

        return !!selectedImplementation
            && !selectedImplementation.isConnected
            && !selectedImplementation.isConnecting;
    }

    /**
     * Attempts to reconnect to the selected vendor's SDK
     * @param micLabel the label that matches the currently selected device
     * @returns Promise<void>
     */
    async retryConnection (micLabel: string): Promise<void> {
        return micLabel && this.headsetLibrary.retryConnection(micLabel.toLowerCase());
    }

    /**
     * Calls the headset library's incomingCall function to signal to the device
     * to flash the answer call button's light to show an incoming call
     * @param callInfo an object containing the conversationId and possible
     * contactName for the incoming call that will be accepted or rejected
     * @param hasOtherActiveCalls boolean determining if there are other active calls
     * @returns Promise<void>
     */
    setRinging (callInfo: { conversationId: string, contactName?: string }, hasOtherActiveCalls): Promise<void> {
        return this.headsetLibrary.incomingCall(callInfo, hasOtherActiveCalls);
    }

    /**
     * Calls the headset library's outgoingCall function to signal to the device
     * to switch on the answer call button's light to show an active call
     * @param callInfo an object containing the conversationId and possible
     * contactName for the call that is outgoing
     * @returns Promise<void>
     */
    outgoingCall (callInfo: { conversationId: string, contactName: string }): Promise<void> {
        return this.headsetLibrary.outgoingCall(callInfo);
    }

    /**
     * Calls the headset library's endCall function to signal to the device
     * to switch off the answer call button's light to show the active call has ended
     * @param conversationId a string representing the conversation that needs to be ended
     * @returns Promise<void>
     */
    async endCurrentCall (conversationId: string): Promise<void> {
        if (conversationId) {
            return this.headsetLibrary.endCall(conversationId);
        }
    }

    /**
     * Calls the headset library's endAllCalls() function to signal the device
     * to switch off the answer call button's light to show the active calls have all ended
     * @returns Promise<void>
     */
    endAllCalls (): Promise<void> {
        return this.headsetLibrary.endAllCalls();
    }

    /**
     * Calls the headset library's answerIncomingCall function to signal the device
     * to switch on the answer call button's light to show the call is now active
     * @param conversationId a string representing the incoming call that is being
     * answered
     * @returns Promise<void>
     */
    answerIncomingCall (conversationId: string): Promise<void> {
        return this.headsetLibrary.answerCall(conversationId);
    }

    /**
     * Calls the headset library's rejectIncomingCall function to signal the device
     * to switch on the answer call button's light to show the call has been rejected
     * @param conversationId a string representing the incoming call that is being
     * rejected
     * @returns Promise<void>
     */
    rejectIncomingCall (conversationId: string): Promise<void> {
        return this.headsetLibrary.rejectCall(conversationId);
    }

    /**
     * Calls the headset library's setMute function to signal the device to switch on
     * or off (depending on the value of the passed in param) the mute call button's
     * light to show the call has been muted or unmuted respectively
     * @param isMuted boolean to show if the call should be muted(true) or unmuted(false)
     * @returns Promise<void>
     */
    setMute (isMuted: boolean): Promise<void> {
        return this.headsetLibrary.setMute(isMuted);
    }

    /**
     * Calls the headset library's setHold function to signal the device to switch on
     * or off (depending on the value of the passed in param, isHeld) the hold call button's
     * light to show the call has been held or resumed respectively
     * @param conversationId string representing the call that is to be held or resumed
     * @param isHeld boolean to show if the call should be held(true) or resumed(false)
     * @returns Promise<void>
     */
    setHold (conversationId: string, isHeld: boolean): Promise<void> {
        return this.headsetLibrary.setHold(conversationId, isHeld);
    }

}