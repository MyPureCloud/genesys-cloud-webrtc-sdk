import GenesysCloudWebrtSdk, { IExtendedMediaSession, utils } from "../../src";
import { StatsAggregator } from "../../src/stats-aggregator"
import { MockSession, SimpleMockSdk } from "../test-utils";

describe('StatsAggregator', () => {
  describe('constructor', () => {
    it('should be created', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const aggregator = new StatsAggregator(mockSession, sdk);
      expect(aggregator).toBeTruthy();
    });
  });

  describe('sendStats', () => {
    it('should call requestApi', () => {
      const requestApiSpy = jest.spyOn(utils, 'requestApi').mockResolvedValue(null);
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const aggregator = new StatsAggregator(mockSession, sdk);

      aggregator['sendStats']();

      const urlArgument = requestApiSpy.mock.calls[0][0];
      expect(urlArgument).toBeTruthy();
      expect(urlArgument).toContain(mockSession.conversationId);
    });
  });
});
