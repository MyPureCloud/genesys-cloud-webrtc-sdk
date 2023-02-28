import { Observable, Subject, Subscription } from 'rxjs';
import HeadsetService, { ConsumedHeadsetEvents, VendorImplementation } from 'softphone-vendor-headsets';

import GenesysCloudWebrtcSdk from '../client';

export interface ISdkHeadsetService {
  headsetEvents$: Observable<ConsumedHeadsetEvents>;
  currentSelectedImplementation: VendorImplementation;

  updateAudioInputDevice (newMicId: string): void;
  showRetry (): boolean;
  retryConnection (micLabel: string): Promise<void>;
  setRinging (callInfo: { conversationId: string, contactName?: string }, hasOtherActiveCalls: boolean): Promise<void>;
  outgoingCall (callInfo: { conversationId: string, contactName: string }): Promise<void>;
  endCurrentCall (conversationId: string): Promise<void>;
  endAllCalls (): Promise<void>;
  answerIncomingCall (conversationId: string, autoAnswer: boolean): Promise<void>;
  rejectIncomingCall (conversationId: string): Promise<void>;
  setMute (isMuted: boolean): Promise<void>;
  setHold (conversationId: string, isHeld: boolean): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
export abstract class SdkHeadsetBase implements ISdkHeadsetService {
  protected sdk: GenesysCloudWebrtcSdk;
  headsetEvents$: Observable<ConsumedHeadsetEvents>;

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
   * Updates the selected device and implementation within the headset library
   * @param newMicId ID associated with the newly selected device
   * @returns void
   */
  updateAudioInputDevice (_newMicId: string): void { /* no-op  */ }

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
  async outgoingCall (_callInfo: { conversationId: string, contactName: string }): Promise<void> { /* no-op */ }

  /**
   * Calls the headset library's endCall function to signal to the device
   * to switch off the answer call button's light to show the active call has ended
   * @param conversationId a string representing the conversation that needs to be ended
   * @returns Promise<void>
   */
  async endCurrentCall (_conversationId: string): Promise<void> { /* no-op */ }

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
  async rejectIncomingCall (_conversationId: string): Promise<void> { /* no-op */ }

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
  /* eslint-enable */
}

export class SdkHeadsetService extends SdkHeadsetBase {
  private headsetLibrary: HeadsetService;
  headsetEvents$: Observable<ConsumedHeadsetEvents>;

  constructor (sdk: GenesysCloudWebrtcSdk) {
    super(sdk);
    this.headsetLibrary = HeadsetService.getInstance({ logger: sdk.logger, appName: sdk._config.originAppName });
    this.headsetEvents$ = this.headsetLibrary.headsetEvents$;
    this.listenForSessionEvents();
    this.updateAudioInputDevice(this.sdk._config.defaults.audioDeviceId);
  }

  listenForSessionEvents (): void {
    this.sdk.on('cancelPendingSession', ({ conversationId }) => this.rejectIncomingCall(conversationId));
    this.sdk.on('sessionEnded', ({ conversationId }) => this.endCurrentCall(conversationId));
    this.sdk.on('pendingSession', ({ conversationId, autoAnswer }) => {
      if (!autoAnswer) {
        this.setRinging({ conversationId, contactName: null }, !!this.sdk.sessionManager.getAllActiveSessions().length);
      }
    });
  }

  /**
   * Updates the selected device and implementation within the headset library
   * @param newMicId ID associated with the newly selected device
   * @returns void
   */
  updateAudioInputDevice (newMicId: string): void {
    const completeDeviceInfo = this.sdk.media.findCachedDeviceByIdAndKind(newMicId, 'audioinput');
    this.headsetLibrary.activeMicChange(completeDeviceInfo?.label?.toLowerCase());
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
    return micLabel && this.headsetLibrary.retryConnection(micLabel);
  }

  /**
   * Calls the headset library's incomingCall function to signal to the device
   * to flash the answer call button's light to show an incoming call
   * @param callInfo an object containing the conversationId and possible
   * contactName for the incoming call that will be accepted or rejected
   * @param hasOtherActiveCalls boolean determining if there are other active calls
   * @returns Promise<void>
   */
  setRinging (callInfo: { conversationId: string, contactName?: string }, hasOtherActiveCalls: boolean): Promise<void> {
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
  answerIncomingCall (conversationId: string, autoAnswer: boolean): Promise<void> {
    return this.headsetLibrary.answerCall(conversationId, autoAnswer);
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

export class SdkHeadsetServiceStub extends SdkHeadsetBase {
  _fakeObservable: Subject<ConsumedHeadsetEvents>;
  headsetEvents$: Observable<ConsumedHeadsetEvents>;

  constructor (sdk: GenesysCloudWebrtcSdk) {
    super(sdk);
    this._fakeObservable = new Subject();
    this.headsetEvents$ = this._fakeObservable.asObservable();
  }
}

export class HeadsetProxyService implements ISdkHeadsetService {
  private currentHeadsetService: SdkHeadsetBase;
  private currentEventSubscription: Subscription;
  private headsetEventsSub: Subject<ConsumedHeadsetEvents>;
  headsetEvents$: Observable<ConsumedHeadsetEvents>;

  constructor (protected sdk: GenesysCloudWebrtcSdk) {
    this.headsetEventsSub = new Subject();
    this.headsetEvents$ = this.headsetEventsSub.asObservable();
    this.setUseHeadsets(!!sdk._config.useHeadsets);
  }

  setUseHeadsets (useHeadsets: boolean) {
    if (this.currentHeadsetService) {
      // if this is the real headset service, this will clean up the current device
      this.currentHeadsetService.updateAudioInputDevice(null);
    }

    if (useHeadsets) {
      this.currentHeadsetService = new SdkHeadsetService(this.sdk);
    } else {
      this.currentHeadsetService = new SdkHeadsetServiceStub(this.sdk);
    }

    if (this.currentEventSubscription) {
      this.currentEventSubscription.unsubscribe();
    }

    // proxy events
    this.currentEventSubscription = this.currentHeadsetService.headsetEvents$.subscribe((event) => this.headsetEventsSub.next(event));
  }

  get currentSelectedImplementation (): VendorImplementation {
    return this.currentHeadsetService.currentSelectedImplementation;
  }

  updateAudioInputDevice (newMicDeviceId: string): void {
    return this.currentHeadsetService.updateAudioInputDevice(newMicDeviceId);
  }

  showRetry (): boolean {
    return this.currentHeadsetService.showRetry();
  }

  retryConnection (micDeviceLabel: string): Promise<void> {
    return this.currentHeadsetService.retryConnection(micDeviceLabel);
  }

  setRinging (callInfo: { conversationId: string, contactName?: string }, hasOtherActiveCalls: boolean): Promise<void> {
    return this.currentHeadsetService.setRinging(callInfo, hasOtherActiveCalls);
  }

  outgoingCall (callInfo: { conversationId: string, contactName: string }): Promise<void> {
    return this.currentHeadsetService.outgoingCall(callInfo);
  }

  endCurrentCall (conversationId: string): Promise<void> {
    return this.currentHeadsetService.endCurrentCall(conversationId);
  }

  endAllCalls (): Promise<void> {
    return this.currentHeadsetService.endAllCalls();
  }
  
  answerIncomingCall (conversationId: string, autoAnswer: boolean): Promise<void> {
    return this.currentHeadsetService.answerIncomingCall(conversationId, autoAnswer);
  }

  rejectIncomingCall (conversationId: string): Promise<void> {
    return this.currentHeadsetService.rejectIncomingCall(conversationId);
  }

  setMute (isMuted: boolean): Promise<void> {
    return this.currentHeadsetService.setMute(isMuted);
  }

  setHold (conversationId: string, isHeld: boolean): Promise<void> {
    return this.currentHeadsetService.setHold(conversationId, isHeld);
  }
}