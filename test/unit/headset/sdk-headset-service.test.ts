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
