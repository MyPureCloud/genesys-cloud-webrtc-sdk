import GenesysCloudWebrtSdk, { IExtendedMediaSession, utils } from "../../src";
import { StatsAggregator } from "../../src/stats-aggregator"
import { MockSession, SimpleMockSdk } from "../test-utils";

describe('StatsAggregator', () => {
  describe('constructor', () => {
    it('should be created', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      expect(statsAggregator).toBeTruthy();
    });
  });

  describe('handleStatsUpdate', () => {
    it('should only handle a GetStatsEvent', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      statsAggregator['sendStats'] = jest.fn();

      const event = {
        name: 'notGetStats'
      }

      statsAggregator['handleStatsUpdate'](event);

      expect(statsAggregator['sendStats']).not.toHaveBeenCalled();
    });

    it('should ignore events that don\'t have stats needed to calculate MOS', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      statsAggregator['sendStats'] = jest.fn();

      const eventWithNoTracks = {
        name: 'getStats',
        tracks: []
      };
      const eventWithNoJitter = {
        name: 'getStats',
        tracks: [{ roundTripTime: 0.1, intervalPacketLoss: 0 }]
      };
      const eventWithNoPacketLoss = {
        name: 'getStats',
        tracks: [{ roundTripTime: 0.1, jitter: 0.002 }]
      };

      statsAggregator['handleStatsUpdate'](eventWithNoTracks);
      statsAggregator['handleStatsUpdate'](eventWithNoJitter);
      statsAggregator['handleStatsUpdate'](eventWithNoPacketLoss);

      expect(statsAggregator['sendStats']).not.toHaveBeenCalled();
    });
  });

  describe('sendStats', () => {
    it('should call requestApi', () => {
      const requestApiSpy = jest.spyOn(utils, 'requestApi').mockResolvedValue(null);
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);

      statsAggregator['sendStats']();

      const urlArgument = requestApiSpy.mock.calls[0][0];
      expect(urlArgument).toBeTruthy();
      expect(urlArgument).toContain(mockSession.conversationId);
    });
  });
});
