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
        tracks: [{ jitter: 0.002 }],
        remoteTracks: [{ packetsReceived: 1}]
      };
      const eventWithNoPacketsReceived = {
        name: 'getStats',
        tracks: [{ packetsSent: 1, jitter: 0.002 }],
        remoteTracks: []
      };
      const eventWithNoJitter = {
        name: 'getStats',
        tracks: [{ packetsSent: 1 }],
        remoteTracks: [{ packetsReceived: 1}]
      };

      statsAggregator['handleStatsUpdate'](eventWithNoTracks);
      statsAggregator['handleStatsUpdate'](eventWithNoPacketsSent);
      statsAggregator['handleStatsUpdate'](eventWithNoPacketsReceived);
      statsAggregator['handleStatsUpdate'](eventWithNoJitter);

      expect(statsAggregator['sendStats']).not.toHaveBeenCalled();
    });

    it('should average the jitter for the whole call', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      statsAggregator['sendStats'] = jest.fn();

      const event1 = {
        name: 'getStats',
        tracks: [{ packetsSent: 1, jitter: 0.004, intervalPacketLoss: 0 }],
        remoteTracks: [{ packetsReceived: 1}]
      };
      const event2 = {
        name: 'getStats',
        tracks: [{ packetsSent: 1, jitter: 0.002, intervalPacketLoss: 0 }],
        remoteTracks: [{ packetsReceived: 1}]
      };

      statsAggregator['handleStatsUpdate'](event1);
      statsAggregator['handleStatsUpdate'](event2);

      expect(statsAggregator['sendStats']).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          averageJitter: 0.004
        }),
        expect.anything()
      );
      expect(statsAggregator['sendStats']).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          averageJitter: 0.003
        }),
        expect.anything()
      );
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

  describe('calculateMos', () => {
    it('should calculate a correct MOS when effective latency is less than 160ms', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const latency = 0.1;
      const jitter = 0.002;
      const packetLoss = 0;

      const mos = statsAggregator['calculateMos'](latency, jitter, packetLoss);

      expect(mos).toBeCloseTo(4.35);
    });

    it('should calculate a correct MOS when effective latency is greater than 160ms', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const latency = 0.2;
      const jitter = 0.002;
      const packetLoss = 0;

      const mos = statsAggregator['calculateMos'](latency, jitter, packetLoss);

      expect(mos).toBeCloseTo(4.16);
    });

    it('should calculate a correct MOS when rFactor is less than 0', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const latency = 1;
      const jitter = 0.09;
      const packetLoss = 6;

      const mos = statsAggregator['calculateMos'](latency, jitter, packetLoss);

      expect(mos).toBeCloseTo(1);
    });
  });

  describe('sendStats', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

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
      const participant = {
        calls: [{ id: "testCall" }]
      };
      mockSession.pcParticipant = participant as any;

      statsAggregator['sendStats'](rtpStats, new Date());

      const urlArgument = requestApiSpy.mock.calls[0][0];
      // Add check for timestamp format?
      // I like that; don't need to mock out Date for that here
      const optionsArgument = requestApiSpy.mock.calls[0][1];
      const statsArgument = optionsArgument?.data;
      expect(urlArgument).toBeTruthy();
      expect(urlArgument).toContain(mockSession.conversationId);
      expect(statsArgument).toBeTruthy();
      // This should actually check it
      expect(statsArgument['dateCreated']).toBeTruthy();
    });

    it('should not call requestApi if there is no participant', () => {
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

      statsAggregator['sendStats'](rtpStats, new Date());

      expect(requestApiSpy).not.toHaveBeenCalled();
    });

    it('should not call requestApi if there are no calls for the participant', () => {
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

      const participantA = {
        calls: []
      };
      mockSession.pcParticipant = participantA as any;
      statsAggregator['sendStats'](rtpStats, new Date());

      expect(requestApiSpy).not.toHaveBeenCalled();

      const participantB = {};
      mockSession.pcParticipant = participantB as any;
      statsAggregator['sendStats'](rtpStats, new Date());

      expect(requestApiSpy).not.toHaveBeenCalled();
    });
  });
});
