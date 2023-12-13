import GenesysCloudWebrtSdk from "../../../src";
import { SdkHeadsetServiceFake } from "../../../src/headsets/sdk-headset-service-fake";
import { SimpleMockSdk } from "../../test-utils";

let service: SdkHeadsetServiceFake;
let sdk: GenesysCloudWebrtSdk;

beforeEach(() => {
  sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
  service = new SdkHeadsetServiceFake(sdk);
});

describe('deviceIsSupported', () => {
  it('should proxy to the headset service', () => {
    expect(service.deviceIsSupported({ micLabel: 'asdf' })).toBeFalsy();
  });
});
