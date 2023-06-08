import { Observable } from 'rxjs';
import { HeadsetProxyService, SdkHeadsetService, ISdkHeadsetService, SdkHeadsetServiceStub } from '../../../src/media/headset';
import GenesysCloudWebrtSdk, { JingleReason, JingleReasonCondition } from "../../../src";
import HeadsetService, { ConsumedHeadsetEvents } from 'softphone-vendor-headsets';
import { SimpleMockSdk } from '../../test-utils';

let sdk: GenesysCloudWebrtSdk;
let sdkHeadset: SdkHeadsetService;
let headsetLibrary: HeadsetService;
let headsetEvents$: Observable<ConsumedHeadsetEvents>;

describe('SdkHeadsetService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    headsetLibrary = HeadsetService.getInstance({ logger: console });
    headsetEvents$ = headsetLibrary.headsetEvents$;
    sdk = new SimpleMockSdk() as any;
    sdkHeadset = new SdkHeadsetService(sdk);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor()', () => {
    it('should start initialization', () => {
      // const headset = new SdkHeadsetService(sdkMedia);
      expect(sdkHeadset['sdk']).toBe(sdk);
      expect(sdkHeadset['headsetLibrary']).toBe(headsetLibrary);
      expect(sdkHeadset['headsetEvents$']).toStrictEqual(headsetEvents$);
    });
  });

  describe('updateAudioInputDevice', () => {
    it('should fetch the proper device and send it to the headset library', () => {
      const testId = "testId";
      const findCachedDeviceByIdAndKindSpy = jest.spyOn(sdk.media, 'findCachedDeviceByIdAndKind').mockReturnValue({
        kind: 'audioinput',
        deviceId: 'testId',
        label: 'Test Device Mark V',
      } as MediaDeviceInfo);
      const activeMicChangeSpy = jest.spyOn(headsetLibrary, 'activeMicChange');
      sdkHeadset.updateAudioInputDevice(testId);
      expect(findCachedDeviceByIdAndKindSpy).toHaveBeenCalledWith(testId, 'audioinput');
      expect(activeMicChangeSpy).toHaveBeenCalledWith('test device mark v');
    });
    it('should properly handle if NO device is returned from findCachedDeviceByIdAndKind', () => {
      const testId = "testId";
      const findCachedDeviceByIdAndKindSpy = jest.spyOn(sdk.media, 'findCachedDeviceByIdAndKind').mockReturnValueOnce(undefined as any)
        .mockReturnValueOnce({} as MediaDeviceInfo);
      const activeMicChangeSpy = jest.spyOn(headsetLibrary, 'activeMicChange');
      sdkHeadset.updateAudioInputDevice(testId);
      expect(findCachedDeviceByIdAndKindSpy).toHaveBeenCalledWith(testId, 'audioinput');
      expect(activeMicChangeSpy).toHaveBeenCalledWith(undefined);

      sdkHeadset.updateAudioInputDevice(testId);
      expect(activeMicChangeSpy).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getCurrentSelectedImplementation()', () => {
    it('should fetch the currently selected vendor implementation from the headset library', () => {
      headsetLibrary.activeMicChange('plantronics test device');
      expect(headsetLibrary.selectedImplementation).toStrictEqual(headsetLibrary['plantronics']);
    });
  });

  describe('showRetry', () => {
    it('should return false if the selected implementation has disableRetry as true', () => {
      headsetLibrary.activeMicChange('plantronics test device');
      headsetLibrary.selectedImplementation.disableRetry = true;
      const showRetryResult = sdkHeadset.showRetry();
      expect(showRetryResult).toBe(false);
    });

    it('should return true if disableRetry is false, isConnected is false and isConnecting is false', () => {
      headsetLibrary.activeMicChange('plantronics test device');
      headsetLibrary.selectedImplementation.disableRetry = false;
      headsetLibrary.selectedImplementation.isConnecting = false;
      const showRetryResult = sdkHeadset.showRetry();
      expect(showRetryResult).toBe(true);
    });

    it('should return false if disableRetry is false, isConnected is false but isConnecting is true', () => {
      headsetLibrary.activeMicChange('plantronics test device');
      headsetLibrary.selectedImplementation.isConnecting = true;
      const showRetryResult = sdkHeadset.showRetry();
      expect(showRetryResult).toBe(false);
    });

    it('should return false if disableRetry is false, isConnecting is false but isConnected is true', () => {
      headsetLibrary.activeMicChange('plantronics test device');
      headsetLibrary.selectedImplementation.isConnected = true;
      const showRetryResult = sdkHeadset.showRetry();
      expect(showRetryResult).toBe(false);
    });

    it('should return false if the selectedImplementation is falsy', () => {
      headsetLibrary.selectedImplementation = undefined as any;
      const showRetryResult = sdkHeadset.showRetry();
      expect(showRetryResult).toBe(false);
    });
  });

  describe('retryConnection', () => {
    it('should properly call the connect function for the corresponding implementation', () => {
      headsetLibrary.activeMicChange('plantronics test device');
      const headsetConnectSpy = jest.spyOn(headsetLibrary['plantronics'], 'connect');
      const headsetRetryConnectionSpy = jest.spyOn(headsetLibrary, 'retryConnection');
      sdkHeadset.retryConnection('plantronics test device');
      expect(headsetRetryConnectionSpy).toHaveBeenCalledWith('plantronics test device');
      expect(headsetConnectSpy).toHaveBeenCalledWith('plantronics test device');
    });
  });

  describe('setRinging', () => {
    it('should call the proper function in the headset library', () => {
      const incomingCallSpy = jest.spyOn(headsetLibrary, 'incomingCall');
      sdkHeadset.setRinging({ conversationId: '123', contactName: 'Maxwell' }, false);
      expect(incomingCallSpy).toHaveBeenCalledWith({ conversationId: '123', contactName: 'Maxwell' }, false);
    });
  });

  describe('outgoingCall', () => {
    it('should call the proper function in the headset library', () => {
      const outgoingCallSpy = jest.spyOn(headsetLibrary, 'outgoingCall');
      sdkHeadset.outgoingCall({ conversationId: '123', contactName: 'Maxwell' });
      expect(outgoingCallSpy).toHaveBeenCalledWith({ conversationId: '123', contactName: 'Maxwell' });
    });
  });

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
    });
  });

  describe('answerIncomingCall', () => {
    it('should call the proper function in the headset library', () => {
      const answerCallSpy = jest.spyOn(headsetLibrary, 'answerCall');
      sdkHeadset.answerIncomingCall('123', false);
      expect(answerCallSpy).toHaveBeenCalledWith('123', false);
    });
  });

  describe('rejectIncomingCall', () => {
    it('should call the proper function in the headset library', () => {
      const rejectCallSpy = jest.spyOn(headsetLibrary, 'rejectCall');
      sdkHeadset.rejectIncomingCall('123');
      expect(rejectCallSpy).toHaveBeenCalledWith('123');
    });
  });

  describe('setMute', () => {
    it('should call the proper function in the headset library', () => {
      const setMuteSpy = jest.spyOn(headsetLibrary, 'setMute');
      sdkHeadset.setMute(true);
      expect(setMuteSpy).toHaveBeenCalledWith(true);
    });
  });

  describe('setHold', () => {
    it('should call the proper function in the headset library', () => {
      const setHoldSpy = jest.spyOn(headsetLibrary, 'setHold');
      sdkHeadset.setHold('123', false);
      expect(setHoldSpy).toHaveBeenCalledWith('123', false);
    });
  });
});

describe('SdkHeadsetServiceStub', () => {
  let headsetStub: SdkHeadsetServiceStub;

  beforeEach(() => {
    headsetStub = new SdkHeadsetServiceStub(sdk);
  });

  describe('get currentSelectedImplementation()', () => {
    it('should return null', () => {
      expect(headsetStub.currentSelectedImplementation).toBe(null);
    });
  });

  describe('updateAudioInputDevice()', () => {
    it('should return undefined', () => {
      expect(headsetStub.updateAudioInputDevice('')).toBe(undefined);
    });
  });

  describe('showRetry()', () => {
    it('should return false', () => {
      expect(headsetStub.showRetry()).toBe(false);
    });
  });

  describe('retryConnection()', () => {
    it('should return an empty promise', async () => {
      expect(await headsetStub.retryConnection('')).toBe(undefined);
    });
  });

  describe('setRinging()', () => {
    it('should return an empty promise', async () => {
      expect(await headsetStub.setRinging({ conversationId: '' }, false)).toBe(undefined);
    });
  });

  describe('outgoingCall()', () => {
    it('should return an empty promise', async () => {
      expect(await headsetStub.outgoingCall({ conversationId: '', contactName: '' })).toBe(undefined);
    });
  });

  describe('endCurrentCall()', () => {
    it('should return an empty promise', async () => {
      expect(await headsetStub.endCurrentCall('')).toBe(undefined);
    });
  });

  describe('endAllCalls()', () => {
    it('should return an empty promise', async () => {
      expect(await headsetStub.endAllCalls()).toBe(undefined);
    });
  });

  describe('answerIncomingCall()', () => {
    it('should return an empty promise', async () => {
      expect(await headsetStub.answerIncomingCall('', false)).toBe(undefined);
    });
  });

  describe('rejectIncomingCall()', () => {
    it('should return an empty promise', async () => {
      expect(await headsetStub.rejectIncomingCall('')).toBe(undefined);
    });
  });

  describe('setMute()', () => {
    it('should return an empty promise', async () => {
      expect(await headsetStub.setMute(false)).toBe(undefined);
    });
  });

  describe('setHold()', () => {
    it('should return an empty promise', async () => {
      expect(await headsetStub.setHold('', false)).toBe(undefined);
    });
  });
});

describe('HeadsetProxyService', () => {
  let proxyService: HeadsetProxyService;
  let currentHeadsetService: ISdkHeadsetService;

  beforeEach(() => {
    proxyService = new HeadsetProxyService(new SimpleMockSdk() as any);
    currentHeadsetService = proxyService['currentHeadsetService'];
  });

  describe('setUseHeadsets', () => {
    it('should update input device to null on old service', () => {
      const originalHeadsetService = proxyService['currentHeadsetService'];
      const spy = jest.spyOn(originalHeadsetService, 'updateAudioInputDevice');

      proxyService.setUseHeadsets(false);
      expect(spy).toHaveBeenCalled();
      expect(originalHeadsetService).not.toBe(proxyService['currentHeadsetService']);
    });

    it('should use real headset service', () => {
      const originalHeadsetService = proxyService['currentHeadsetService'];

      expect(originalHeadsetService).toBeInstanceOf(SdkHeadsetServiceStub);
      proxyService.setUseHeadsets(true);

      expect(proxyService['currentHeadsetService']).toBeInstanceOf(SdkHeadsetService);
    });

    it('should proxy events from currentHeadsetService before and after switching', () => {
      const originalHeadsetService = proxyService['currentHeadsetService'];

      expect(originalHeadsetService).toBeInstanceOf(SdkHeadsetServiceStub);
      const spy = jest.fn();
      proxyService.headsetEvents$.subscribe(spy);

      originalHeadsetService['_fakeObservable'].next('oldService');
      expect(spy).toHaveBeenCalledWith('oldService');

      proxyService.setUseHeadsets(false);
      proxyService['currentHeadsetService']['_fakeObservable'].next('oldService2');
      expect(spy).toHaveBeenCalledWith('oldService2');

      originalHeadsetService['_fakeObservable'].next('oldService original');
      
      expect(spy).not.toHaveBeenCalledWith('oldService original');
    });
  });

  describe('currentSelectedImplementation', () => {
    it('should proxy to headsetService', () => {
      const vendor = {} as any;
      Object.defineProperty(currentHeadsetService, 'currentSelectedImplementation', { get: () => vendor });
      expect(proxyService.currentSelectedImplementation).toBe(vendor);
    });
  });

  describe('updateAudioInputDevice', () => {
    it('should proxy to headsetService', () => {
      const spy = currentHeadsetService.updateAudioInputDevice = jest.fn();
      proxyService.updateAudioInputDevice('device1');
      expect(spy).toHaveBeenCalledWith('device1');
    });
  });

  describe('showRetry', () => {
    it('should proxy to headsetService', () => {
      const spy = currentHeadsetService.showRetry = jest.fn();
      proxyService.showRetry();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('retryConnection', () => {
    it('should proxy to headsetService', () => {
      const spy = currentHeadsetService.retryConnection = jest.fn();
      proxyService.retryConnection('device1');
      expect(spy).toHaveBeenCalledWith('device1');
    });
  });

  describe('setRinging', () => {
    it('should proxy to headsetService', () => {
      const spy = currentHeadsetService.setRinging = jest.fn();
      proxyService.setRinging({conversationId: '123'}, false);
      expect(spy).toHaveBeenCalledWith({conversationId: '123'}, false);
    });
  });

  describe('outgoingCall', () => {
    it('should proxy to headsetService', () => {
      const spy = currentHeadsetService.outgoingCall = jest.fn();
      proxyService.outgoingCall({conversationId: '123', contactName: 'abc'});
      expect(spy).toHaveBeenCalledWith({conversationId: '123', contactName: 'abc'});
    });
  });

  describe('endCurrentCall', () => {
    it('should proxy to headsetService', () => {
      const spy = currentHeadsetService.endCurrentCall = jest.fn();
      proxyService.endCurrentCall('123');
      expect(spy).toHaveBeenCalledWith('123');
    });
  });

  describe('endAllCalls', () => {
    it('should proxy to headsetService', () => {
      const spy = currentHeadsetService.endAllCalls = jest.fn();
      proxyService.endAllCalls();
      expect(spy).toHaveBeenCalledWith();
    });
  });

  describe('answerIncomingCall', () => {
    it('should proxy to headsetService', () => {
      const spy = currentHeadsetService.answerIncomingCall = jest.fn();
      proxyService.answerIncomingCall('123', true);
      expect(spy).toHaveBeenCalledWith('123', true);
    });
  });

  describe('rejectIncomingCall', () => {
    it('should proxy to headsetService', () => {
      const spy = currentHeadsetService.rejectIncomingCall = jest.fn();
      proxyService.rejectIncomingCall('123');
      expect(spy).toHaveBeenCalledWith('123');
    });
  });

  describe('setMute', () => {
    it('should proxy to headsetService', () => {
      const spy = currentHeadsetService.setMute = jest.fn();
      proxyService.setMute(true);
      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  describe('setHold', () => {
    it('should proxy to headsetService', () => {
      const spy = currentHeadsetService.setHold = jest.fn();
      proxyService.setHold('123', true);
      expect(spy).toHaveBeenCalledWith('123', true);
    });
  });
});