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
})
