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

    it('should ignore events that don\'t have complete stats', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      statsAggregator['sendStats'] = jest.fn();

      const eventWithNoTracks = {
        name: 'getStats',
        tracks: [],
        remoteTracks: []
      };
      const eventWithNoPacketsSent = {
        name: 'getStats',
        tracks: [{ jitter: 0.002, intervalPacketLoss: 0 }],
        remoteTracks: [{ packetsReceived: 1}]
      };
      const eventWithNoPacketsReceived = {
        name: 'getStats',
        tracks: [{ packetsSent: 1, jitter: 0.002, intervalPacketLoss: 0 }],
        remoteTracks: []
      };
      const eventWithNoJitter = {
        name: 'getStats',
        tracks: [{ packetsSent: 1, intervalPacketLoss: 0 }],
        remoteTracks: [{ packetsReceived: 1}]
      };
      const eventWithNoPacketLoss = {
        name: 'getStats',
        tracks: [{ packetsSent: 1, jitter: 0.002 }],
        remoteTracks: [{ packetsReceived: 1}]
      };

      statsAggregator['handleStatsUpdate'](eventWithNoTracks);
      statsAggregator['handleStatsUpdate'](eventWithNoPacketsSent);
      statsAggregator['handleStatsUpdate'](eventWithNoPacketsReceived);
      statsAggregator['handleStatsUpdate'](eventWithNoJitter);
      statsAggregator['handleStatsUpdate'](eventWithNoPacketLoss);

      expect(statsAggregator['sendStats']).not.toHaveBeenCalled();
    });

    it('should send stats when we have everything we want', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      statsAggregator['sendStats'] = jest.fn();

      const event = {
        name: 'getStats',
        tracks: [{ packetsSent: 1, jitter: 0.002, intervalPacketLoss: 0 }],
        remoteTracks: [{ packetsReceived: 1}]
      };

      statsAggregator['handleStatsUpdate'](event);

      expect(statsAggregator['sendStats']).toHaveBeenCalled();
    });
  });

  describe('sendStats', () => {
    it('should call requestApi', () => {
      const requestApiSpy = jest.spyOn(utils, 'requestApi').mockResolvedValue(null);
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const rtpStats = {
        packetsReceived: 5,
        packetsSent: 5,
        averageJitter: 0.1,
        estimatedAverageMos: 5
      }

      statsAggregator['sendStats'](rtpStats);

      const urlArgument = requestApiSpy.mock.calls[0][0];
      expect(urlArgument).toBeTruthy();
      expect(urlArgument).toContain(mockSession.conversationId);
    });
  });
});
