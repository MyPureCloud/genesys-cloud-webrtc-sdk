import { Observable, Subject } from 'rxjs';
import HeadsetService, { ConsumedHeadsetEvents, VendorImplementation } from 'softphone-vendor-headsets';

import GenesysCloudWebrtcSdk from '../client';

export interface ISdkHeadset {
  headsetEvents$: Observable<ConsumedHeadsetEvents>;

  /**
   * Gets the currently selected vendor implementation from the headset library
   * @params none
   * @returns VendorImplementation
   */
  get currentSelectedImplementation (): VendorImplementation;

  /**
   * Updates the selected device and implementation within the headset library
   * @param newMicId ID associated with the newly selected device
   * @returns void
   */
  updateAudioInputDevice (newMicId: string): void;

  /**
   * Determines if the retry button is necessary to be rendered
   * @params none
   * @returns boolean
   */
  showRetry (): boolean;

  /**
   * Attempts to reconnect to the selected vendor's SDK
   * @param micLabel the label that matches the currently selected device
   * @returns Promise<void>
   */
  retryConnection (micLabel: string): Promise<void>;

  /**
   * Calls the headset library's incomingCall function to signal to the device
   * to flash the answer call button's light to show an incoming call
   * @param callInfo an object containing the conversationId and possible
   * contactName for the incoming call that will be accepted or rejected
   * @param hasOtherActiveCalls boolean determining if there are other active calls
   * @returns Promise<void>
   */
  setRinging (callInfo: { conversationId: string, contactName?: string }, hasOtherActiveCalls: boolean): Promise<void>;

  /**
   * Calls the headset library's outgoingCall function to signal to the device
   * to switch on the answer call button's light to show an active call
   * @param callInfo an object containing the conversationId and possible
   * contactName for the call that is outgoing
   * @returns Promise<void>
   */
  outgoingCall (callInfo: { conversationId: string, contactName: string }): Promise<void>;

  /**
   * Calls the headset library's endCall function to signal to the device
   * to switch off the answer call button's light to show the active call has ended
   * @param conversationId a string representing the conversation that needs to be ended
   * @returns Promise<void>
   */
  endCurrentCall (conversationId: string): Promise<void>;

  /**
   * Calls the headset library's endAllCalls() function to signal the device
   * to switch off the answer call button's light to show the active calls have all ended
   * @returns Promise<void>
   */
  endAllCalls (): Promise<void>;

  /**
   * Calls the headset library's answerIncomingCall function to signal the device
   * to switch on the answer call button's light to show the call is now active
   * @param conversationId a string representing the incoming call that is being
   * answered
   * @returns Promise<void>
   */
  answerIncomingCall (conversationId: string): Promise<void>;

  /**
   * Calls the headset library's rejectIncomingCall function to signal the device
   * to switch on the answer call button's light to show the call has been rejected
   * @param conversationId a string representing the incoming call that is being
   * rejected
   * @returns Promise<void>
   */
  rejectIncomingCall (conversationId: string): Promise<void>;

  /**
   * Calls the headset library's setMute function to signal the device to switch on
   * or off (depending on the value of the passed in param) the mute call button's
   * light to show the call has been muted or unmuted respectively
   * @param isMuted boolean to show if the call should be muted(true) or unmuted(false)
   * @returns Promise<void>
   */
  setMute (isMuted: boolean): Promise<void>;

  /**
   * Calls the headset library's setHold function to signal the device to switch on
   * or off (depending on the value of the passed in param, isHeld) the hold call button's
   * light to show the call has been held or resumed respectively
   * @param conversationId string representing the call that is to be held or resumed
   * @param isHeld boolean to show if the call should be held(true) or resumed(false)
   * @returns Promise<void>
   */
  setHold (conversationId: string, isHeld: boolean): Promise<void>;
}

export class SdkHeadset implements ISdkHeadset {
  private sdk: GenesysCloudWebrtcSdk;
  private headsetLibrary: HeadsetService;
  headsetEvents$: Observable<ConsumedHeadsetEvents>;

  get currentSelectedImplementation (): VendorImplementation {
    return this.headsetLibrary.selectedImplementation;
  }

  constructor (sdk: GenesysCloudWebrtcSdk) {
    this.sdk = sdk;
    this.headsetLibrary = HeadsetService.getInstance({ logger: sdk.logger });
    this.headsetEvents$ = this.headsetLibrary.headsetEvents$;
  }

  updateAudioInputDevice (newMicId: string): void {
    const completeDeviceInfo = this.sdk.media.findCachedDeviceByIdAndKind(newMicId, 'audioinput');
    this.headsetLibrary.activeMicChange(completeDeviceInfo?.label?.toLowerCase());
  }

  showRetry (): boolean {
    const selectedImplementation = this.currentSelectedImplementation;
    if (selectedImplementation?.disableRetry) {
      return false;
    }

    return !!selectedImplementation
      && !selectedImplementation.isConnected
      && !selectedImplementation.isConnecting;
  }

  async retryConnection (micLabel: string): Promise<void> {
    return micLabel && this.headsetLibrary.retryConnection(micLabel);
  }

  setRinging (callInfo: { conversationId: string, contactName?: string }, hasOtherActiveCalls: boolean): Promise<void> {
    return this.headsetLibrary.incomingCall(callInfo, hasOtherActiveCalls);
  }

  outgoingCall (callInfo: { conversationId: string, contactName: string }): Promise<void> {
    return this.headsetLibrary.outgoingCall(callInfo);
  }

  async endCurrentCall (conversationId: string): Promise<void> {
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

  rejectIncomingCall (conversationId: string): Promise<void> {
    return this.headsetLibrary.rejectCall(conversationId);
  }

  setMute (isMuted: boolean): Promise<void> {
    return this.headsetLibrary.setMute(isMuted);
  }

  setHold (conversationId: string, isHeld: boolean): Promise<void> {
    return this.headsetLibrary.setHold(conversationId, isHeld);
  }
}

export class SdkHeadsetStub implements ISdkHeadset {
  _fakeObservable: Subject<ConsumedHeadsetEvents>;
  headsetEvents$: Observable<ConsumedHeadsetEvents>;

  get currentSelectedImplementation (): VendorImplementation { return null; /* no-op */ }

  constructor () {
    this._fakeObservable = new Subject();
    this.headsetEvents$ = this._fakeObservable.asObservable();
  }

  updateAudioInputDevice (_newMicId: string): void { /* no-op  */ }
  showRetry (): boolean { return false; /* no-op */ }
  async retryConnection (_micLabel: string): Promise<void> { /* no-op */ }
  async setRinging (_callInfo: { conversationId: string, contactName?: string }, _hasOtherActiveCalls: boolean): Promise<void> { /* no-op */ }
  async outgoingCall (_callInfo: { conversationId: string, contactName: string }): Promise<void> { /* no-op */ }
  async endCurrentCall (_conversationId: string): Promise<void> { /* no-op */ }
  async endAllCalls (): Promise<void> {/* no-op */ }
  async answerIncomingCall (_conversationId: string): Promise<void> { /* no-op */ }
  async rejectIncomingCall (_conversationId: string): Promise<void> { /* no-op */ }
  async setMute (_isMuted: boolean): Promise<void> { /* no-op */ }
  async setHold (_conversationId: string, _isHeld: boolean): Promise<void> { /* no-op */ }
}