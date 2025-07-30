import { StatsAggregator } from "../../src/stats-aggregator"

describe('StatsAggregator', () => {
  describe('constructor', () => {
    it('should be created', () => {
      const aggregator = new StatsAggregator();
      expect(aggregator).toBeTruthy();
    });
  });
});
