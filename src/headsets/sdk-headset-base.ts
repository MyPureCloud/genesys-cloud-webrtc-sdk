import { Observable } from "rxjs";
import GenesysCloudWebrtcSdk from "../client";
import { ExpandedConsumedHeadsetEvents, ISdkHeadsetService } from "./headset-types";
import { UpdateReasons, VendorImplementation } from "softphone-vendor-headsets";

/* eslint-disable @typescript-eslint/no-unused-vars */
export abstract class SdkHeadsetBase implements ISdkHeadsetService {
  protected sdk: GenesysCloudWebrtcSdk;
  headsetEvents$: Observable<ExpandedConsumedHeadsetEvents>;

  /**
   * Gets the currently selected vendor implementation from the headset library
   * @params none
   * @returns VendorImplementation
   */
  get currentSelectedImplementation (): VendorImplementation { return null; /* no-op */ }

  constructor (sdk: GenesysCloudWebrtcSdk) {
    this.sdk = sdk;
  }

  /**
   * Determines if the retry button is necessary to be rendered
   * @params params: an object containing micLabel
   * @returns boolean
   */
  deviceIsSupported (params: { micLabel: string }): boolean { return false; /* no-op */ }

  /**
   * Updates the selected device and implementation within the headset library
   * @param newMicId ID associated with the newly selected device
   * @returns void
   */
  updateAudioInputDevice (_newMicId: string, changeReason?: UpdateReasons): void { /* no-op  */ }

  /**
   * Determines if the retry button is necessary to be rendered
   * @params none
   * @returns boolean
   */
  showRetry (): boolean { return false; /* no-op */ }

  /**
   * Attempts to reconnect to the selected vendor's SDK
   * @param micLabel the label that matches the currently selected device
   * @returns Promise<void>
   */
  async retryConnection (_micLabel: string): Promise<void> { /* no-op */ }

  /**
   * Calls the headset library's incomingCall function to signal to the device
   * to flash the answer call button's light to show an incoming call
   * @param callInfo an object containing the conversationId and possible
   * contactName for the incoming call that will be accepted or rejected
   * @param hasOtherActiveCalls boolean determining if there are other active calls
   * @returns Promise<void>
   */
  async setRinging (_callInfo: { conversationId: string, contactName?: string }, _hasOtherActiveCalls: boolean): Promise<void> { /* no-op */ }

  /**
   * Calls the headset library's outgoingCall function to signal to the device
   * to switch on the answer call button's light to show an active call
   * @param callInfo an object containing the conversationId and possible
   * contactName for the call that is outgoing
   * @returns Promise<void>
   */
  async outgoingCall (_callInfo: { conversationId: string, contactName?: string }): Promise<void> { /* no-op */ }

  /**
   * Calls the headset library's endCall function to signal to the device
   * to switch off the answer call button's light to show the active call has ended
   * @param conversationId a string representing the conversation that needs to be ended
   * @returns Promise<void>
   */
  async endCurrentCall (_conversationId: string, _hasOtherActiveCalls: boolean): Promise<void> { /* no-op */ }

  /**
   * Calls the headset library's endAllCalls() function to signal the device
   * to switch off the answer call button's light to show the active calls have all ended
   * @returns Promise<void>
   */
  async endAllCalls (): Promise<void> {/* no-op */ }

  /**
   * Calls the headset library's answerIncomingCall function to signal the device
   * to switch on the answer call button's light to show the call is now active
   * @param conversationId a string representing the incoming call that is being
   * answered
   * @returns Promise<void>
   */
  async answerIncomingCall (_conversationId: string, _autoAnswer: boolean): Promise<void> { /* no-op */ }

  /**
   * Calls the headset library's rejectIncomingCall function to signal the device
   * to switch on the answer call button's light to show the call has been rejected
   * @param conversationId a string representing the incoming call that is being
   * rejected
   * @returns Promise<void>
   */
  async rejectIncomingCall (_conversationId: string, expectExistingConversation: boolean): Promise<void> { /* no-op */ }

  /**
   * Calls the headset library's setMute function to signal the device to switch on
   * or off (depending on the value of the passed in param) the mute call button's
   * light to show the call has been muted or unmuted respectively
   * @param isMuted boolean to show if the call should be muted(true) or unmuted(false)
   * @returns Promise<void>
   */
  async setMute (_isMuted: boolean): Promise<void> { /* no-op */ }

  /**
   * Calls the headset library's setHold function to signal the device to switch on
   * or off (depending on the value of the passed in param, isHeld) the hold call button's
   * light to show the call has been held or resumed respectively
   * @param conversationId string representing the call that is to be held or resumed
   * @param isHeld boolean to show if the call should be held(true) or resumed(false)
   * @returns Promise<void>
   */
  async setHold (_conversationId: string, _isHeld: boolean): Promise<void> { /* no-op */ }

  /**
   * Calls the headset library's resetHeadsetStateForCall function to effectively rest
   * the selected device's state.  This is to help with certain scenarios around headset
   * orchestration where a device is signaled to start ringing but never stops ringing
   * @param conversationId string representing the call whose state will be reset
   * @returns Promise<void>
   */
  async resetHeadsetStateForCall(_conversationId: string): Promise<void> { /* no-op */}
  /* eslint-enable */
}