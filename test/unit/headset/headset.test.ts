import { Observable } from 'rxjs';
import GenesysCloudWebrtSdk, { JingleReason, JingleReasonCondition } from "../../../src";
import HeadsetService, { ConsumedHeadsetEvents } from 'softphone-vendor-headsets';
import { SimpleMockSdk, flushPromises } from '../../test-utils';
import { SdkHeadsetService } from '../../../src/headsets/sdk-headset-service';
import { SdkHeadsetServiceFake } from '../../../src/headsets/sdk-headset-service-fake';
import { HeadsetProxyService } from '../../../src/headsets/headset';
import { ExpandedConsumedHeadsetEvents, ISdkHeadsetService } from '../../../src/headsets/headset-types';
import { HeadsetControlsChanged, HeadsetControlsRejection, HeadsetControlsRequest, MediaMessageEvent, SessionTypes } from 'genesys-cloud-streaming-client';

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
      expect(activeMicChangeSpy).toHaveBeenCalledWith('test device mark v', undefined);
    });
    it('should properly handle if NO device is returned from findCachedDeviceByIdAndKind', () => {
      const testId = "testId";
      const findCachedDeviceByIdAndKindSpy = jest.spyOn(sdk.media, 'findCachedDeviceByIdAndKind').mockReturnValueOnce(undefined as any)
        .mockReturnValueOnce({} as MediaDeviceInfo);
      const activeMicChangeSpy = jest.spyOn(headsetLibrary, 'activeMicChange');
      sdkHeadset.updateAudioInputDevice(testId);
      expect(findCachedDeviceByIdAndKindSpy).toHaveBeenCalledWith(testId, 'audioinput');
      expect(activeMicChangeSpy).toHaveBeenCalledWith(undefined, undefined);

      sdkHeadset.updateAudioInputDevice(testId);
      expect(activeMicChangeSpy).toHaveBeenCalledWith(undefined, undefined);
    });
    it('should pass disconnect reason to headset service', () => {
      const testId = "testId";
      const findCachedDeviceByIdAndKindSpy = jest.spyOn(sdk.media, 'findCachedDeviceByIdAndKind').mockReturnValueOnce(undefined as any)
        .mockReturnValueOnce({} as MediaDeviceInfo);
      const activeMicChangeSpy = jest.spyOn(headsetLibrary, 'activeMicChange');
      sdkHeadset.updateAudioInputDevice(testId, 'alternativeClient');
      expect(findCachedDeviceByIdAndKindSpy).toHaveBeenCalledWith(testId, 'audioinput');
      expect(activeMicChangeSpy).toHaveBeenCalledWith(undefined, 'alternativeClient');
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
      sdkHeadset.rejectIncomingCall('123', false);
      expect(rejectCallSpy).toHaveBeenCalledWith('123', false);
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
  let headsetStub: SdkHeadsetServiceFake;

  beforeEach(() => {
    headsetStub = new SdkHeadsetServiceFake(sdk);
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
      expect(await headsetStub.rejectIncomingCall('', false)).toBe(undefined);
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
    proxyService.initialize();
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

    it('should use fake service if useHeadsets and not handling softphone', () => {
      proxyService['sdk']._config.allowedSessionTypes = [SessionTypes.collaborateVideo];

      const spy = jest.spyOn(proxyService, 'updateAudioInputDevice');

      proxyService.setUseHeadsets(true);

      expect(spy).not.toHaveBeenCalled();
      expect(proxyService['currentHeadsetService']).toBeInstanceOf(SdkHeadsetServiceFake);
    });

    it('should unsubscribe if currentEventSubscription', () => {
      const spy = jest.fn();
      proxyService['currentEventSubscription'] = { unsubscribe: spy } as any;

      proxyService.setUseHeadsets(false);
      expect(spy).toHaveBeenCalled();
    });

    it('should use real headset service', () => {
      const originalHeadsetService = proxyService['currentHeadsetService'];

      expect(originalHeadsetService).toBeInstanceOf(SdkHeadsetServiceFake);
      proxyService.setUseHeadsets(true);

      expect(proxyService['currentHeadsetService']).toBeInstanceOf(SdkHeadsetService);
    });

    it('should use system default device', () => {
      const spy = jest.spyOn(proxyService, 'updateAudioInputDevice');
      proxyService['sdk'].media.getAudioDevices = jest.fn().mockReturnValue([{deviceId: 'sysDef1', label: 'system default'}]);
      proxyService.setUseHeadsets(true);

      expect(proxyService['currentHeadsetService']).toBeInstanceOf(SdkHeadsetService);
      expect(spy).toHaveBeenCalledWith('sysDef1');
    });

    it('should proxy events from currentHeadsetService after switching', () => {
      const originalHeadsetService = proxyService['currentHeadsetService'];

      expect(originalHeadsetService).toBeInstanceOf(SdkHeadsetServiceFake);
      const spy = jest.fn();
      proxyService.headsetEvents$.subscribe(spy);

      originalHeadsetService['_fakeObservable'].next('oldService');
      expect(spy).not.toHaveBeenCalledWith('oldService');

      proxyService.updateAudioInputDevice = jest.fn();

      proxyService.setUseHeadsets(true);

      // send an actual event from the headset library
      (proxyService['currentHeadsetService'] as SdkHeadsetService)['headsetLibrary']['_headsetEvents$'].next('newService')
      expect(spy).toHaveBeenCalledWith('newService');

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

  describe('handleMediaMessage', () => {
    let requestSpy: jest.Mock;
    let rejectionSpy: jest.Mock;
    let controlsSpy: jest.Mock;

    beforeEach(() => {
      requestSpy = proxyService['handleHeadsetControlsRequest'] = jest.fn();
      rejectionSpy = proxyService['handleHeadsetControlsRejection'] = jest.fn();
      controlsSpy = proxyService['handleHeadsetControlsChanged'] = jest.fn();
    });

    it('should do nothing if fromMyClient', () => {
      proxyService['sdk']._config.useHeadsets = true;

      const request: HeadsetControlsRequest = {
        jsonrpc: '2.0',
        method: 'headsetControlsRequest',
        params: {
          requestType: 'mediaHelper',
        }
      };
      proxyService['handleMediaMessage']({ to: 'to', from: 'from', mediaMessage: request, fromMyClient: true, fromMyUser: true });

      expect(requestSpy).not.toHaveBeenCalled();
      expect(rejectionSpy).not.toHaveBeenCalled();
      expect(controlsSpy).not.toHaveBeenCalled();
    });

    it('should do nothing if not useHeadsets', () => {
      proxyService['sdk']._config.useHeadsets = false;

      const request: HeadsetControlsRequest = {
        jsonrpc: '2.0',
        method: 'headsetControlsRequest',
        params: {
          requestType: 'mediaHelper',
        }
      };
      proxyService['handleMediaMessage']({ to: 'to', from: 'from', mediaMessage: request, fromMyClient: false, fromMyUser: true });

      expect(requestSpy).not.toHaveBeenCalled();
      expect(rejectionSpy).not.toHaveBeenCalled();
      expect(controlsSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateAudioInputDevice', () => {
    let proxySpy: jest.Mock;
    let startOrchestrationSpy: jest.Mock;

    beforeEach(() => {
      proxyService['sdk']._config.useHeadsets = true;
      proxySpy = currentHeadsetService.updateAudioInputDevice = jest.fn();
      startOrchestrationSpy = proxyService['startHeadsetOrchestration'] = jest.fn();
    });

    it('should proxy to headsetService if we have controls', () => {
      proxyService['orchestrationState'] = 'hasControls';
      proxyService.updateAudioInputDevice('device1');
      expect(proxySpy).toHaveBeenCalledWith('device1');
      expect(startOrchestrationSpy).not.toHaveBeenCalled();
    });

    it('should proxy to headsetService device is falsey', () => {
      proxyService['orchestrationState'] = 'hasControls';
      proxyService.updateAudioInputDevice(null as any);
      expect(proxySpy).toHaveBeenCalledWith(null);
      expect(startOrchestrationSpy).not.toHaveBeenCalled();
    });

    it('should do nothing if not useHeadsets', () => {
      proxyService['sdk']._config.useHeadsets = false;
      proxyService.updateAudioInputDevice('device1');
      expect(startOrchestrationSpy).not.toHaveBeenCalled();
      expect(proxySpy).not.toHaveBeenCalled();
    });

    it('should not startOrchestration if not supported', () => {
      (currentHeadsetService as SdkHeadsetServiceFake).deviceIsSupported = jest.fn().mockReturnValue(false);
      proxyService['orchestrationState'] = 'notStarted';
      proxyService['sdk'].media.findCachedDeviceByIdAndKind = jest.fn().mockReturnValue({ label: 'device1', id: 'device1id' });
      proxyService.updateAudioInputDevice('device1');
      expect(startOrchestrationSpy).not.toHaveBeenCalled();
      expect(proxySpy).not.toHaveBeenCalled();
    });

    it('should startOrchestration if supported and notStarted', () => {
      (currentHeadsetService as SdkHeadsetServiceFake).deviceIsSupported = jest.fn().mockReturnValue(true);
      proxyService['orchestrationState'] = 'notStarted';
      proxyService['sdk'].media.findCachedDeviceByIdAndKind = jest.fn().mockReturnValue({ label: 'device1', id: 'device1id' });
      proxyService.updateAudioInputDevice('device1');
      expect(startOrchestrationSpy).toHaveBeenCalled();
      expect(proxySpy).not.toHaveBeenCalled();
    });

    it('should startOrchestration if supported and negotiating', () => {
      (currentHeadsetService as SdkHeadsetServiceFake).deviceIsSupported = jest.fn().mockReturnValue(true);
      proxyService['orchestrationState'] = 'negotiating';
      proxyService['sdk'].media.findCachedDeviceByIdAndKind = jest.fn().mockReturnValue({ label: 'device1', id: 'device1id' });
      proxyService.updateAudioInputDevice('device1');
      expect(startOrchestrationSpy).toHaveBeenCalled();
      expect(proxySpy).not.toHaveBeenCalled();
    });

    it('should emit alternativeClient when supported but no other orchestration states are true', () => {
      (currentHeadsetService as SdkHeadsetServiceFake).deviceIsSupported = jest.fn().mockReturnValue(true);
      proxyService['orchestrationState'] = 'alternativeClient';
      proxyService['sdk'].media.findCachedDeviceByIdAndKind = jest.fn().mockReturnValue({ label: 'device1', id: 'device1id' });
      proxyService['setOrchestrationState'] = jest.fn();
      proxyService.updateAudioInputDevice('device1');
      expect(proxyService['setOrchestrationState']).toHaveBeenCalledWith('alternativeClient', true);
    });

    it('should clear timer if device changes to an unsupported device while negotiating', () => {
      (currentHeadsetService as SdkHeadsetServiceFake).deviceIsSupported = jest.fn().mockReturnValue(false);
      proxyService['orchestrationState'] = 'negotiating';
      proxyService['sdk'].media.findCachedDeviceByIdAndKind = jest.fn().mockReturnValue({ label: 'device1', id: 'device1id' });
      const setOrchestrationSpy = proxyService['setOrchestrationState'] = jest.fn();
      const clearSpy = jest.spyOn(window, 'clearTimeout');
      proxyService.updateAudioInputDevice('device1');
      expect(setOrchestrationSpy).not.toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalled();
      expect(proxyService.orchestrationState).toEqual('notStarted');
    });
  });

  // these are more like integration tests because we are testing the whole orchestration process, not just an individual piece
  describe('Headset Orchestration Integration', () => {
    let updateAudioSpy: jest.Mock;
    let broadcastSpy: jest.Mock;
    let device: MediaDeviceInfo;

    function triggerMediaMessageEvent (event: MediaMessageEvent) {
      proxyService['sdk']._streamingConnection.messenger.emit('mediaMessage', event);
    }

    beforeEach(() => {
      jest.useFakeTimers({ legacyFakeTimers: true });
      updateAudioSpy = proxyService.updateAudioInputDevice = jest.fn();
      broadcastSpy = proxyService['sdk']._streamingConnection.messenger.broadcastMessage as jest.Mock;
      proxyService['sdk']._config.useHeadsets = true;
      device = { deviceId: 'device1Id', groupId: 'device1GroupId', label: 'device1Label', kind: 'audioinput' } as any;
    });

    describe('setOrchestrationState', () => {
      it('should do nothing if !useHeadsetOrchestration', () => {
        proxyService['useHeadsetOrchestration'] = false;
        proxyService.orchestrationState = 'notStarted';

        proxyService['setOrchestrationState']('negotiating');

        expect(proxyService.orchestrationState).toEqual('notStarted');
      });
    });

    it('happy path - should take controls if no rejection is received with 2 seconds', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();
      const promise = proxyService['startHeadsetOrchestration'](device);
      expect(proxyService['orchestrationState']).toBe('negotiating');
      await flushPromises();
      expect(proxyService['orchestrationWaitTimer']).toBeTruthy();
      jest.advanceTimersByTime(2100);
      expect(updateAudioSpy).toHaveBeenCalled();
      const expectedMediaMessage: HeadsetControlsChanged = {
        jsonrpc: '2.0',
        method: 'headsetControlsChanged',
        params: {
          hasControls: true
        }
      };
      expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ mediaMessage: expectedMediaMessage }));
      expect(proxyService['orchestrationState']).toBe('hasControls');
    });

    it('should not take controls if a rejection is received during orchestration', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();
      const promise = proxyService['startHeadsetOrchestration'](device);
      await flushPromises();

      broadcastSpy.mockReset();

      expect(proxyService['orchestrationWaitTimer']).toBeTruthy();

      // rejection is received 1 second after starting
      jest.advanceTimersByTime(1000);
      const rejection: HeadsetControlsRejection = {
        jsonrpc: '2.0',
        method: 'headsetControlsRejection',
        params: {
          reason: 'mediaHelper',
          requestId: '4'
        }
      };
      triggerMediaMessageEvent({ to: 'to', from: 'from', mediaMessage: rejection, fromMyClient: false, fromMyUser: true });

      expect(proxyService['orchestrationState']).toBe('alternativeClient');
      jest.advanceTimersByTime(1500);

      expect(updateAudioSpy).not.toHaveBeenCalled();
      expect(broadcastSpy).not.toHaveBeenCalled()
      expect(proxyService['orchestrationState']).toBe('alternativeClient');
    });

    it('should not take controls if another request is received during orchestration', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();
      const promise = proxyService['startHeadsetOrchestration'](device);
      await flushPromises();

      broadcastSpy.mockReset();

      expect(proxyService['orchestrationWaitTimer']).toBeTruthy();

      // request is received 1 second after starting
      jest.advanceTimersByTime(1000);
      const request: HeadsetControlsRequest = {
        jsonrpc: '2.0',
        method: 'headsetControlsRequest',
        params: {
          requestType: 'standard',
        }
      };
      triggerMediaMessageEvent({ to: 'to', from: 'from', mediaMessage: request, fromMyClient: false, fromMyUser: true });

      expect(proxyService['orchestrationState']).toBe('alternativeClient');
      jest.advanceTimersByTime(1500);

      expect(updateAudioSpy).not.toHaveBeenCalled();
      expect(broadcastSpy).not.toHaveBeenCalled()
      expect(proxyService['orchestrationState']).toBe('alternativeClient');
    });

    it('should send a rejection if a request is received during orchestration and is lower priority', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();

      proxyService['sdk']._config.headsetRequestType = 'prioritized';

      const promise = proxyService['startHeadsetOrchestration'](device);
      await flushPromises();

      broadcastSpy.mockReset();

      expect(proxyService['orchestrationWaitTimer']).toBeTruthy();

      // request is received 1 second after starting
      jest.advanceTimersByTime(1000);
      const request: HeadsetControlsRequest = {
        jsonrpc: '2.0',
        method: 'headsetControlsRequest',
        params: {
          requestType: 'standard',
        }
      };
      triggerMediaMessageEvent({ id:'req1', to: 'to', from: 'from', mediaMessage: request, fromMyClient: false, fromMyUser: true });

      jest.advanceTimersByTime(1500);

      const rejection: HeadsetControlsRejection = {
        jsonrpc: '2.0',
        method: 'headsetControlsRejection',
        params: {
          reason: 'priority',
          requestId: 'req1'
        }
      };
      expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ mediaMessage: rejection }));

      expect(updateAudioSpy).toHaveBeenCalled();
      const expectedMediaMessage: HeadsetControlsChanged = {
        jsonrpc: '2.0',
        method: 'headsetControlsChanged',
        params: {
          hasControls: true
        }
      };
      expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ mediaMessage: expectedMediaMessage }));
      expect(proxyService['orchestrationState']).toBe('hasControls');
    });

    it('should send a rejection if a request is received during orchestration and is mediaHelper', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();

      proxyService['sdk']._config.headsetRequestType = 'mediaHelper';

      const promise = proxyService['startHeadsetOrchestration'](device);
      await flushPromises();

      broadcastSpy.mockReset();

      expect(proxyService['orchestrationWaitTimer']).toBeTruthy();

      // request is received 1 second after starting
      jest.advanceTimersByTime(1000);
      const request: HeadsetControlsRequest = {
        jsonrpc: '2.0',
        method: 'headsetControlsRequest',
        params: {
          requestType: 'standard',
        }
      };
      triggerMediaMessageEvent({ id:'req1', to: 'to', from: 'from', mediaMessage: request, fromMyClient: false, fromMyUser: true });

      jest.advanceTimersByTime(1500);

      const rejection: HeadsetControlsRejection = {
        jsonrpc: '2.0',
        method: 'headsetControlsRejection',
        params: {
          reason: 'mediaHelper',
          requestId: 'req1'
        }
      };
      expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ mediaMessage: rejection }));

      expect(updateAudioSpy).toHaveBeenCalled();
      const expectedMediaMessage: HeadsetControlsChanged = {
        jsonrpc: '2.0',
        method: 'headsetControlsChanged',
        params: {
          hasControls: true
        }
      };
      expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ mediaMessage: expectedMediaMessage }));
      expect(proxyService['orchestrationState']).toBe('hasControls');
    });

    it('should send a rejection if a request is received with higher priority but has persistentConnection and active session', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();

      proxyService['sdk']._config.headsetRequestType = 'standard';
      proxyService['sdk'].station = { webRtcPersistentEnabled: true } as any;
      proxyService['sdk'].sessionManager.getAllActiveSessions = jest.fn().mockReturnValue([{ sessionType: SessionTypes.softphone, id: 'session1' }]);

      proxyService['orchestrationState'] = 'hasControls';

      const request: HeadsetControlsRequest = {
        jsonrpc: '2.0',
        method: 'headsetControlsRequest',
        params: {
          requestType: 'mediaHelper',
        }
      };
      triggerMediaMessageEvent({ id:'req1', to: 'to', from: 'from', mediaMessage: request, fromMyClient: false, fromMyUser: true });

      const rejection: HeadsetControlsRejection = {
        jsonrpc: '2.0',
        method: 'headsetControlsRejection',
        params: {
          reason: 'activeCall',
          requestId: 'req1'
        }
      };
      expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ mediaMessage: rejection }));
    });

    it('should do nothing if persistent connection but no active session', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();

      proxyService['sdk']._config.headsetRequestType = 'standard';
      proxyService['sdk'].station = { webRtcPersistentEnabled: true } as any;
      proxyService['sdk'].sessionManager.getAllActiveSessions = jest.fn().mockReturnValue([]);

      proxyService['orchestrationState'] = 'hasControls';

      const request: HeadsetControlsRequest = {
        jsonrpc: '2.0',
        method: 'headsetControlsRequest',
        params: {
          requestType: 'mediaHelper',
        }
      };
      triggerMediaMessageEvent({ id:'req1', to: 'to', from: 'from', mediaMessage: request, fromMyClient: false, fromMyUser: true });

      expect(broadcastSpy).not.toHaveBeenCalledWith();
    });

    it('should do nothing if no station', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();

      proxyService['sdk']._config.headsetRequestType = 'standard';
      proxyService['sdk'].station = undefined as any;

      proxyService['orchestrationState'] = 'hasControls';

      const request: HeadsetControlsRequest = {
        jsonrpc: '2.0',
        method: 'headsetControlsRequest',
        params: {
          requestType: 'mediaHelper',
        }
      };
      triggerMediaMessageEvent({ id:'req1', to: 'to', from: 'from', mediaMessage: request, fromMyClient: false, fromMyUser: true });

      expect(broadcastSpy).not.toHaveBeenCalledWith();
    });

    it('should yield controls if received a headsetControlsChanged message', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();
      proxyService['orchestrationState'] = 'hasControls';

      const receivedControlsChanged: HeadsetControlsChanged = {
        jsonrpc: '2.0',
        method: 'headsetControlsChanged',
        params: {
          hasControls: true
        }
      };
      triggerMediaMessageEvent({ id:'req1', to: 'to', from: 'from', mediaMessage: receivedControlsChanged, fromMyClient: false, fromMyUser: true });

      const controlsChanged: HeadsetControlsChanged = {
        jsonrpc: '2.0',
        method: 'headsetControlsChanged',
        params: {
          hasControls: false
        }
      };
      expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ mediaMessage: controlsChanged }));
      expect(proxyService['orchestrationState']).toBe('alternativeClient');
    });

    it('should yield controls if received a headsetControlsChanged message', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();
      proxyService['orchestrationState'] = 'negotiating';

      const receivedControlsChanged: HeadsetControlsChanged = {
        jsonrpc: '2.0',
        method: 'headsetControlsChanged',
        params: {
          hasControls: true
        }
      };
      triggerMediaMessageEvent({ id:'req1', to: 'to', from: 'from', mediaMessage: receivedControlsChanged, fromMyClient: false, fromMyUser: true });

      // should not broadcast a message if we didn't have controls
      expect(broadcastSpy).not.toHaveBeenCalled();
      expect(proxyService['orchestrationState']).toBe('alternativeClient');
    });

    it('should do nothing if a falsy change request is received', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();
      proxyService['orchestrationState'] = 'hasControls';

      const receivedControlsChanged: HeadsetControlsChanged = {
        jsonrpc: '2.0',
        method: 'headsetControlsChanged',
        params: {
          hasControls: false
        }
      };
      triggerMediaMessageEvent({ id:'req1', to: 'to', from: 'from', mediaMessage: receivedControlsChanged, fromMyClient: false, fromMyUser: true });

      expect(broadcastSpy).not.toHaveBeenCalled();
      expect(proxyService['orchestrationState']).toBe('hasControls');
    });

    it('should do nothing if a rejection is received and we are not in a negotiating state', async () => {
      expect(proxyService['orchestrationWaitTimer']).toBeFalsy();
      proxyService['orchestrationState'] = 'hasControls';

      const rejection: HeadsetControlsRejection = {
        jsonrpc: '2.0',
        method: 'headsetControlsRejection',
        params: {
          requestId: '4',
          reason: 'mediaHelper'
        }
      };
      triggerMediaMessageEvent({ id:'req1', to: 'to', from: 'from', mediaMessage: rejection, fromMyClient: false, fromMyUser: true });

      expect(broadcastSpy).not.toHaveBeenCalled();
      expect(proxyService['orchestrationState']).toBe('hasControls');
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
      proxyService.rejectIncomingCall('123', false);
      expect(spy).toHaveBeenCalledWith('123', false);
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

  describe('handleHeadsetEvent', () => {
    it('should pass the event to the headsetEventsSub if it does not meet proper conditions', () => {
      /*
        Proper conditions
        - passed in event is not 'deviceConnectionStatusChanged'
        - passed in payload is not 'noVendor'
        - orchestrationState is not 'alternativeClient'
      */
      const nextSpy = jest.spyOn(proxyService['headsetEventsSub'], 'next');
      const fakeEvent = {
        event: 'loggableEvent',
        payload: 'Doing great'
      };
      proxyService['handleHeadsetEvent'](fakeEvent as ExpandedConsumedHeadsetEvents);
      expect(nextSpy).toHaveBeenCalledWith(fakeEvent);

      fakeEvent.event = 'deviceConnectionStatusChanged';
      proxyService['handleHeadsetEvent'](fakeEvent as ExpandedConsumedHeadsetEvents);
      expect(nextSpy).toHaveBeenCalledWith(fakeEvent);

      fakeEvent.payload = 'noVendor';
      proxyService['handleHeadsetEvent'](fakeEvent as ExpandedConsumedHeadsetEvents);
      expect(nextSpy).toHaveBeenCalledWith(fakeEvent);

      proxyService['orchestrationState'] = 'alternativeClient';
      proxyService['handleHeadsetEvent'](fakeEvent as ExpandedConsumedHeadsetEvents);
      expect(nextSpy).not.toHaveBeenCalledTimes(4);
    });
  })
});
