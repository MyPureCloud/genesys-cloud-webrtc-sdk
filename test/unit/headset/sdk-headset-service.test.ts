import { SessionTypes } from "genesys-cloud-streaming-client";
import GenesysCloudWebrtSdk from "../../../src";
import { SdkHeadsetService } from "../../../src/headsets/sdk-headset-service";
import { SimpleMockSdk } from "../../test-utils";

let service: SdkHeadsetService;
let sdk: GenesysCloudWebrtSdk;

beforeEach(() => {
  sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
  service = new SdkHeadsetService(sdk);
});

describe('deviceIsSupported', () => {
  it('should proxy to the headset service', () => {
    const spy = service['headsetLibrary'].deviceIsSupported = jest.fn();
    service.deviceIsSupported({ micLabel: 'asdf' });
    expect(spy).toHaveBeenCalled();
  });
});

describe('rejectIncomingCall', () => {
  it('should default expectExistingConversation to true if nothing passed in', () => {
    const spy = service['headsetLibrary'].rejectCall = jest.fn();
    service.rejectIncomingCall('123');
    expect(spy).toHaveBeenCalledWith('123', true);
  })
});

describe('resetHeadsetStateForCall', () => {
  it('should call the SVHs resetHeadsetStateForCall', () => {
    const spy = service['headsetLibrary'].resetHeadsetStateForCall = jest.fn();
    service.resetHeadsetStateForCall('test123');
    expect(spy).toHaveBeenCalledWith('test123');
  })
});

describe('createDecoratedLogger', () => {
  it ('should return a new logger that contains the types of logginger', () => {
    const decoratedLogger = service['createDecoratedLogger']();
    sdk.sessionManager.getAllActiveConversations = jest.fn().mockReturnValue([
      {
        conversationId: 'convoTestId',
        sessionId: 'sessionTestId',
        sessionType: SessionTypes.softphone
      }
    ]);
    expect(typeof decoratedLogger).toBe('object');
    expect(Object.keys(decoratedLogger).length).toBe(5);
    decoratedLogger.info('Test');
  });
})
