import HeadsetService, { UpdateReasons, VendorImplementation } from "softphone-vendor-headsets";
import { SdkHeadsetBase } from "./sdk-headset-base";
import { ExpandedConsumedHeadsetEvents } from "./headset-types";
import { Observable } from "rxjs";
import GenesysCloudWebrtcSdk from "../client";
import { ILogMessageOptions, ILogger } from "genesys-cloud-client-logger";
import { HeadsetChangesQueue } from '../headsets/headset-utils';

export class SdkHeadsetService extends SdkHeadsetBase {
  private headsetLibrary: HeadsetService;
  headsetEvents$: Observable<ExpandedConsumedHeadsetEvents>;

  constructor (sdk: GenesysCloudWebrtcSdk) {
    super(sdk);
    this.headsetLibrary = HeadsetService.getInstance({ logger: this.createDecoratedLogger(), appName: sdk._config.originAppName });
    this.headsetEvents$ = this.headsetLibrary.headsetEvents$;
  }

  private createDecoratedLogger (): ILogger {
    const fns = ['debug', 'log', 'info', 'warn', 'error'];

    const customLogger: any = {};
    fns.forEach(fn => {
      const orig = this.sdk.logger[fn].bind(this.sdk.logger);
      customLogger[fn] = (message: string | Error, details?: any, opts?: ILogMessageOptions) => {
        orig(message, {...details, conversationInfo: this.sdk.sessionManager.getAllActiveConversations()}, opts);
      }
    });

    return customLogger;
  }

  deviceIsSupported (params: { micLabel: string }): boolean {
    return this.headsetLibrary.deviceIsSupported(params);
  }

  /**
   * Updates the selected device and implementation within the headset library
   * @param newMicId ID associated with the newly selected device
   * @returns void
   */
  updateAudioInputDevice (newMicId: string, changeReason?: UpdateReasons): void {
    const completeDeviceInfo = this.sdk.media.findCachedDeviceByIdAndKind(newMicId, 'audioinput');
    HeadsetChangesQueue.clearQueue();
    this.headsetLibrary.activeMicChange(completeDeviceInfo?.label?.toLowerCase(), changeReason);
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
  async endCurrentCall (conversationId: string, hasOtherActiveCalls: boolean): Promise<void> {
    if (conversationId) {
      return this.headsetLibrary.endCall(conversationId, hasOtherActiveCalls);
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
  rejectIncomingCall (conversationId: string, expectExistingConversation = true): Promise<void> {
    return this.headsetLibrary.rejectCall(conversationId, expectExistingConversation);
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

  /**
   * Calls the headset library's resetHeadsetStateForCall function to effectively rest
   * the selected device's state.  This is to help with certain scenarios around headset
   * orchestration where a device is signaled to start ringing but never stops ringing
   * @param conversationId string representing the call whose state will be reset
   * @returns Promise<void>
   */
    resetHeadsetStateForCall(conversationId: string): Promise<void> {
      return this.headsetLibrary.resetHeadsetStateForCall(conversationId);
    }
}