import { Observable } from 'rxjs';
import { SdkHeadset } from "../../../src/media/headset";
import { SdkMedia } from "../../../src";
import GenesysCloudWebrtSdk from "../../../src";
import HeadsetService, { ConsumedHeadsetEvents, VendorImplementation} from 'softphone-vendor-headsets';
import { SimpleMockSdk } from '../../test-utils';

let sdk: GenesysCloudWebrtSdk;
let sdkMedia: SdkMedia;
let sdkHeadset: SdkHeadset;
let headsetLibrary: HeadsetService;
let headsetEvents: Observable<ConsumedHeadsetEvents>;

describe('SdkHeadset', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        headsetLibrary = HeadsetService.getInstance({ logger: console });
        headsetEvents = headsetLibrary.headsetEvents$;
        sdk = new SimpleMockSdk() as any;
        sdkMedia = sdk.media as any;
        sdkHeadset = new SdkHeadset(sdkMedia);
    })

    afterEach(() => {
        jest.restoreAllMocks();
    })

    describe('constructor()', () => {
        it('should start initialization', () => {
            // const headset = new SdkHeadset(sdkMedia);
            expect(sdkHeadset['media']).toBe(sdkMedia);
            expect(sdkHeadset['headsetLibrary']).toBe(headsetLibrary);
            expect(sdkHeadset['headsetEvents']).toStrictEqual(headsetEvents);
        })
    })

    describe('getAudioDevice', () => {
        it('should fetch the proper device and send it to the headset library', () => {
            const testId = "testId";
            const findCachedDeviceByIdAndKindSpy = jest.spyOn(sdkMedia, 'findCachedDeviceByIdAndKind' as any).mockReturnValue({
                kind: 'audioinput',
                deviceId: 'testId',
                label: 'Test Device Mark V',
            } as MediaDeviceInfo);
            const activeMicChangeSpy = jest.spyOn(headsetLibrary, 'activeMicChange' as any);
            sdkHeadset.getAudioDevice(testId);
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
    })

    describe('retryConnection', () => {
        it('should properly call the connect function for the corresponding implementation', () => {
            headsetLibrary.activeMicChange('plantronics test device');
            const headsetConnectSpy = jest.spyOn(headsetLibrary['plantronics'], 'connect');
            sdkHeadset.retryConnection('plantronics test device');
            expect(headsetConnectSpy).toHaveBeenCalledWith('plantronics test device')
        })
    })

    describe('incomingCallRing', () => {
        it('should call the proper function in the headset library', () => {
            const incomingCallSpy = jest.spyOn(headsetLibrary, 'incomingCall');
            sdkHeadset.incomingCallRing({conversationId: '123', contactName: 'Maxwell'}, false);
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

    describe('toggleMute', () => {
        it('should call the proper function in the headset library', () => {
            const setMuteSpy = jest.spyOn(headsetLibrary, 'setMute');
            sdkHeadset.toggleMute(true);
            expect(setMuteSpy).toHaveBeenCalledWith(true);
        })
    })

    describe('toggleHold', () => {
        it('should call the proper function in the headset library', () => {
            const setHoldSpy = jest.spyOn(headsetLibrary, 'setHold');
            sdkHeadset.toggleHold('123', false);
            expect(setHoldSpy).toHaveBeenCalledWith('123', false);
        })
    })
})