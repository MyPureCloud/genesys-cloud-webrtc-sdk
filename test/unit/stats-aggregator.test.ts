import GenesysCloudWebrtSdk, { utils } from "../../src";
import { StatsAggregator } from "../../src/stats-aggregator"
import { SimpleMockSdk } from "../test-utils";

describe('StatsAggregator', () => {
  describe('constructor', () => {
    it('should be created', () => {
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const aggregator = new StatsAggregator(sdk);
      expect(aggregator).toBeTruthy();
    });
  });

  describe('sendStats', () => {
    it('should call requestApi', () => {
      jest.spyOn(utils, 'requestApi').mockResolvedValue(null);

      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const aggregator = new StatsAggregator(sdk);
      aggregator['sendStats']();

      expect(utils.requestApi).toHaveBeenCalled();
    });
  });
});
