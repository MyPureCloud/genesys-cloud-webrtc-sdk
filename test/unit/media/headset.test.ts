import { Observable } from 'rxjs';
import { SdkHeadset } from "../../../src/media/headset";
import GenesysCloudWebrtcSdk from '../../../src/client';
import GenesysCloudWebrtSdk from "../../../src";
import HeadsetService, { ConsumedHeadsetEvents, VendorImplementation} from 'softphone-vendor-headsets';
import { SimpleMockSdk } from '../../test-utils';

let sdk: GenesysCloudWebrtSdk;
let sdkHeadset: SdkHeadset;
let headsetLibrary: HeadsetService;
let headsetEvents$: Observable<ConsumedHeadsetEvents>;

describe('SdkHeadset', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        headsetLibrary = HeadsetService.getInstance({ logger: console });
        headsetEvents$ = headsetLibrary.headsetEvents$;
        sdk = new SimpleMockSdk() as any;
        sdkHeadset = new SdkHeadset(sdk);
    })

    afterEach(() => {
        jest.restoreAllMocks();
    })

    describe('constructor()', () => {
        it('should start initialization', () => {
            // const headset = new SdkHeadset(sdkMedia);
            expect(sdkHeadset['sdk']).toBe(sdk);
            expect(sdkHeadset['headsetLibrary']).toBe(headsetLibrary);
            expect(sdkHeadset['headsetEvents$']).toStrictEqual(headsetEvents$);
        })
    })

    describe('updateAudioInputDevice', () => {
        it('should fetch the proper device and send it to the headset library', () => {
            const testId = "testId";
            const findCachedDeviceByIdAndKindSpy = jest.spyOn(sdk.media, 'findCachedDeviceByIdAndKind' as any).mockReturnValue({
                kind: 'audioinput',
                deviceId: 'testId',
                label: 'Test Device Mark V',
            } as MediaDeviceInfo);
            const activeMicChangeSpy = jest.spyOn(headsetLibrary, 'activeMicChange' as any);
            sdkHeadset.updateAudioInputDevice(testId);
            expect(findCachedDeviceByIdAndKindSpy).toHaveBeenCalledWith(testId, 'audioinput');
            expect(activeMicChangeSpy).toHaveBeenCalledWith('test device mark v');
        })
    })

    describe('getCurrentSelectedImplementation()', () => {
        it('should fetch the currently selected vendor implementation from the headset library', () => {
            headsetLibrary.activeMicChange('plantronics test device');
            expect(headsetLibrary.selectedImplementation).toStrictEqual(headsetLibrary['plantronics']);
        })
    })

    describe('showRetry', () => {
        it('should return false if the selected implementation has disableRetry as true', () => {
            headsetLibrary.activeMicChange('plantronics test device');
            headsetLibrary.selectedImplementation.disableRetry = true;
            const showRetryResult = sdkHeadset.showRetry();
            expect(showRetryResult).toBe(false);
        })

        it('should return true if disableRetry is false, isConnected is false and isConnecting is false', () => {
            headsetLibrary.activeMicChange('plantronics test device');
            headsetLibrary.selectedImplementation.disableRetry = false;
            headsetLibrary.selectedImplementation.isConnecting = false;
            const showRetryResult = sdkHeadset.showRetry();
            expect(showRetryResult).toBe(true);
        })

        it('should return false if disableRetry is false, isConnected is false but isConnecting is true', () => {
            headsetLibrary.activeMicChange('plantronics test device');
            headsetLibrary.selectedImplementation.isConnecting = true;
            let showRetryResult = sdkHeadset.showRetry();
            expect(showRetryResult).toBe(false);
        })

        it('should return false if disableRetry is false, isConnecting is false but isConnected is true', () => {
            headsetLibrary.activeMicChange('plantronics test device');
            headsetLibrary.selectedImplementation.isConnected = true;
            let showRetryResult = sdkHeadset.showRetry();
            expect(showRetryResult).toBe(false);
        })

        it('should return false if the selectedImplementation is falsy', () => {
            headsetLibrary.selectedImplementation = undefined;
            const showRetryResult = sdkHeadset.showRetry();
            expect(showRetryResult).toBe(false);
        })
    })

    describe('retryConnection', () => {
        it('should properly call the connect function for the corresponding implementation', () => {
            headsetLibrary.activeMicChange('plantronics test device');
            const headsetConnectSpy = jest.spyOn(headsetLibrary['plantronics'], 'connect');
            const headsetRetryConnectionSpy = jest.spyOn(headsetLibrary, 'retryConnection');
            sdkHeadset.retryConnection('plantronics test device');
            expect(headsetRetryConnectionSpy).toHaveBeenCalledWith('plantronics test device');
            expect(headsetConnectSpy).toHaveBeenCalledWith('plantronics test device');
        })
    })

    describe('setRinging', () => {
        it('should call the proper function in the headset library', () => {
            const incomingCallSpy = jest.spyOn(headsetLibrary, 'incomingCall');
            sdkHeadset.setRinging({conversationId: '123', contactName: 'Maxwell'}, false);
            expect(incomingCallSpy).toHaveBeenCalledWith({conversationId: '123', contactName: 'Maxwell'}, false);
        })
    })

    describe('outgoingCall', () => {
        it('should call the proper function in the headset library', () => {
            const outgoingCallSpy = jest.spyOn(headsetLibrary, 'outgoingCall');
            sdkHeadset.outgoingCall({conversationId: '123', contactName: 'Maxwell'});
            expect(outgoingCallSpy).toHaveBeenCalledWith({conversationId: '123', contactName: 'Maxwell'});
        })
    })

    describe('endCurrentCall', () => {
        it('should call the proper function in the headset library', () => {
            const endCurrentCallSpy = jest.spyOn(headsetLibrary, 'endCall');
            sdkHeadset.endCurrentCall('');
            expect(endCurrentCallSpy).not.toHaveBeenCalled();

            sdkHeadset.endCurrentCall('123');
            expect(endCurrentCallSpy).toHaveBeenCalledWith('123');

            const endAllCallsSpy = jest.spyOn(headsetLibrary, 'endAllCalls');
            sdkHeadset.endAllCalls();
            expect(endAllCallsSpy).toHaveBeenCalled();
        })
    })

    describe('answerIncomingCall', () => {
        it('should call the proper function in the headset library', () => {
            const answerCallSpy = jest.spyOn(headsetLibrary, 'answerCall');
            sdkHeadset.answerIncomingCall('123');
            expect(answerCallSpy).toHaveBeenCalledWith('123');
        })
    })

    describe('setMute', () => {
        it('should call the proper function in the headset library', () => {
            const setMuteSpy = jest.spyOn(headsetLibrary, 'setMute');
            sdkHeadset.setMute(true);
            expect(setMuteSpy).toHaveBeenCalledWith(true);
        })
    })

    describe('setHold', () => {
        it('should call the proper function in the headset library', () => {
            const setHoldSpy = jest.spyOn(headsetLibrary, 'setHold');
            sdkHeadset.setHold('123', false);
            expect(setHoldSpy).toHaveBeenCalledWith('123', false);
        })
    })
})