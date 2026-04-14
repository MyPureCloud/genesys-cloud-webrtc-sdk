import GenesysCloudWebrtSdk, { IExtendedMediaSession, utils } from "../../src";
import { StatsAggregator } from "../../src/stats-aggregator"
import { flushPromises, MockSession, SimpleMockSdk } from "../test-utils";

describe('StatsAggregator', () => {
  describe('constructor', () => {
    it('should be created', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      expect(statsAggregator).toBeTruthy();
    });
  });
  describe('shouldGatherImmediately / eager persistent connection', () => {
    it('should not start gathering stats immediately for eager persistent connections (privAnswerMode === Auto)', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      (mockSession as any).privAnswerMode = 'Auto';
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);

      // statsGatherer should NOT be created yet for eager persistent connections
      expect(statsAggregator['statsGatherer']).toBeFalsy();
    });

    it('should start gathering stats immediately for non-eager sessions', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      (mockSession as any).privAnswerMode = 'Manual';
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);

      expect(statsAggregator['statsGatherer']).toBeTruthy();
    });
  });

  describe('onSessionStarted', () => {
    it('should start gathering stats and set baseline when the matching session starts', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      (mockSession as any).privAnswerMode = 'Auto';
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);

      expect(statsAggregator['statsGatherer']).toBeFalsy();

      // Emit sessionStarted with the same session
      (sdk as any).emit('sessionStarted', mockSession);

      expect(statsAggregator['statsGatherer']).toBeTruthy();
      expect(statsAggregator['setBaseline']).toBe(true);
    });

    it('should not start gathering stats for a different session', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      (mockSession as any).privAnswerMode = 'Auto';
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);

      const otherSession = new MockSession() as unknown as IExtendedMediaSession;
      (sdk as any).emit('sessionStarted', otherSession);

      expect(statsAggregator['statsGatherer']).toBeFalsy();
    });
  });

  describe('onSessionEnded', () => {
    it('should stop gathering stats when the matching session ends', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);

      expect(statsAggregator['statsGatherer']).toBeTruthy();

      (sdk as any).emit('sessionEnded', mockSession);

      expect(statsAggregator['statsGatherer']).toBeFalsy();
    });

    it('should not stop gathering stats for a different session', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);

      const otherSession = new MockSession() as unknown as IExtendedMediaSession;
      (sdk as any).emit('sessionEnded', otherSession);

      expect(statsAggregator['statsGatherer']).toBeTruthy();
    });
  });

  describe('session terminated event', () => {
    it('should stop gathering stats and remove SDK listeners on session terminated', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);

      expect(statsAggregator['statsGatherer']).toBeTruthy();

      const listenerCountBefore = (sdk as any).listenerCount('sessionStarted');

      (mockSession as any).emit('terminated');

      expect(statsAggregator['statsGatherer']).toBeFalsy();
      // SDK listeners for sessionStarted/sessionEnded should be removed
      expect((sdk as any).listenerCount('sessionStarted')).toBe(listenerCountBefore - 1);
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
      const eventWithNoPacketsReceived = {
        name: 'getStats',
        tracks: [{ totalRoundTripTime: 0.1, roundTripTimeMeasurements: 1 }],
        remoteTracks: []
      };
      const eventWithMissingRttFields = {
        name: 'getStats',
        tracks: [{}],
        remoteTracks: [{ packetsReceived: 1, packetsLost: 0, jitter: 0.002, timestamp: Date.now() }]
      };
      const eventWithMissingPacketsLost = {
        name: 'getStats',
        tracks: [{ totalRoundTripTime: 0.1, roundTripTimeMeasurements: 1 }],
        remoteTracks: [{ packetsReceived: 1, jitter: 0.002, timestamp: Date.now() }]
      };

      statsAggregator['handleStatsUpdate'](eventWithNoTracks);
      statsAggregator['handleStatsUpdate'](eventWithNoPacketsReceived);
      statsAggregator['handleStatsUpdate'](eventWithMissingRttFields);
      statsAggregator['handleStatsUpdate'](eventWithMissingPacketsLost);

      expect(statsAggregator['sendStats']).not.toHaveBeenCalled();
    });

    it('should average the jitter for the whole call', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      statsAggregator['sendStats'] = jest.fn();

      // Trigger baseline so the first real event sets counters and returns early
      statsAggregator['setBaseline'] = true;
      const baselineEvent = {
        name: 'getStats',
        tracks: [{ totalRoundTripTime: 0, roundTripTimeMeasurements: 0 }],
        remoteTracks: [{ packetsReceived: 0, packetsLost: 0, jitter: 0.001, timestamp: Date.now() }]
      };
      statsAggregator['handleStatsUpdate'](baselineEvent);
      expect(statsAggregator['sendStats']).not.toHaveBeenCalled();

      const event1 = {
        name: 'getStats',
        tracks: [{ totalRoundTripTime: 0.1, roundTripTimeMeasurements: 1 }],
        remoteTracks: [{ packetsReceived: 10, packetsLost: 0, jitter: 0.004, timestamp: Date.now() }]
      };
      const event2 = {
        name: 'getStats',
        tracks: [{ totalRoundTripTime: 0.2, roundTripTimeMeasurements: 2 }],
        remoteTracks: [{ packetsReceived: 20, packetsLost: 0, jitter: 0.002, timestamp: Date.now() }]
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

    it('should not send stats when jitter is undefined', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      statsAggregator['sendStats'] = jest.fn();

      // Trigger baseline
      statsAggregator['setBaseline'] = true;
      const baselineEvent = {
        name: 'getStats',
        tracks: [{ totalRoundTripTime: 0, roundTripTimeMeasurements: 0 }],
        remoteTracks: [{ packetsReceived: 0, packetsLost: 0, jitter: 0.001, timestamp: Date.now() }]
      };
      statsAggregator['handleStatsUpdate'](baselineEvent);

      // Event with all fields present except jitter
      const event = {
        name: 'getStats',
        tracks: [{ totalRoundTripTime: 0.1, roundTripTimeMeasurements: 1 }],
        remoteTracks: [{ packetsReceived: 10, packetsLost: 0, timestamp: Date.now() }]
      };

      statsAggregator['handleStatsUpdate'](event);

      expect(statsAggregator['sendStats']).not.toHaveBeenCalled();
    });

    it('should handle packetLoss calculation when packetsReceived is 0', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      statsAggregator['sendStats'] = jest.fn();

      // Trigger baseline with same values so packetsReceived delta is 0
      statsAggregator['setBaseline'] = true;
      const baselineEvent = {
        name: 'getStats',
        tracks: [{ totalRoundTripTime: 0, roundTripTimeMeasurements: 0 }],
        remoteTracks: [{ packetsReceived: 10, packetsLost: 0, jitter: 0.001, timestamp: Date.now() }]
      };
      statsAggregator['handleStatsUpdate'](baselineEvent);

      // Same packetsReceived as baseline → delta is 0
      const event = {
        name: 'getStats',
        tracks: [{ totalRoundTripTime: 0.1, roundTripTimeMeasurements: 1 }],
        remoteTracks: [{ packetsReceived: 10, packetsLost: 0, jitter: 0.002, timestamp: Date.now() }]
      };

      statsAggregator['handleStatsUpdate'](event);

      expect(statsAggregator['sendStats']).toHaveBeenCalled();
    });

    it('should send stats when we have everything we want', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      statsAggregator['sendStats'] = jest.fn();

      // Trigger baseline
      statsAggregator['setBaseline'] = true;
      const baselineEvent = {
        name: 'getStats',
        tracks: [{ totalRoundTripTime: 0, roundTripTimeMeasurements: 0 }],
        remoteTracks: [{ packetsReceived: 0, packetsLost: 0, jitter: 0.001, timestamp: Date.now() }]
      };
      statsAggregator['handleStatsUpdate'](baselineEvent);

      const event = {
        name: 'getStats',
        tracks: [{ totalRoundTripTime: 0.1, roundTripTimeMeasurements: 1 }],
        remoteTracks: [{ packetsReceived: 10, packetsLost: 0, jitter: 0.002, timestamp: Date.now() }]
      };

      statsAggregator['handleStatsUpdate'](event);

      expect(statsAggregator['sendStats']).toHaveBeenCalled();
    });
  });

  describe('calculateEstimatedMos', () => {
    it('should calculate a correct MOS when effective latency is less than 160ms', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const latency = 0.1;
      const jitter = 0.002;
      const packetLoss = 0;

      const mos = statsAggregator['calculateEstimatedMos'](latency, jitter, packetLoss);

      expect(mos).toBeCloseTo(4.83);
    });

    it('should calculate a correct MOS when effective latency is greater than 160ms', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const latency = 0.2;
      const jitter = 0.002;
      const packetLoss = 0;

      const mos = statsAggregator['calculateEstimatedMos'](latency, jitter, packetLoss);

      expect(mos).toBeCloseTo(4.62);
    });

    it('should calculate a correct MOS when rFactor is less than 0', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const latency = 1;
      const jitter = 0.09;
      const packetLoss = 6;

      const mos = statsAggregator['calculateEstimatedMos'](latency, jitter, packetLoss);

      expect(mos).toBeCloseTo(1);
    });
  });

  describe('sendStats', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should call sendIq with correct IQ stanza', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const sendIqMock = (sdk as any)._streamingConnection._webrtcSessions.sendIq;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const rtpStats = {
        packetsReceived: 5,
        averageJitter: 0.1,
        estimatedAverageMos: 5
      };
      const participant = {
        calls: [{ id: 'testCall' }]
      };
      mockSession.pcParticipant = participant as any;

      statsAggregator['sendStats'](rtpStats, new Date());

      expect(sendIqMock).toHaveBeenCalledTimes(1);
      const iqArg = sendIqMock.mock.calls[0][0];
      expect(iqArg.type).toBe('set');
      expect(iqArg.to).toBe(mockSession.peerID);
      expect(iqArg.genesysWebrtc).toBeDefined();
      expect(iqArg.genesysWebrtc.jsonrpc).toBe('2.0');
      expect(iqArg.genesysWebrtc.method).toBe('report-statistics');
      expect(iqArg.genesysWebrtc.params.conversationId).toBe(mockSession.conversationId);
      expect(iqArg.genesysWebrtc.params.sessionId).toBe(mockSession.id);
      expect(iqArg.genesysWebrtc.params.communicationId).toBe('testCall');
      expect(iqArg.genesysWebrtc.params.mediaResourceId).toBeTruthy();
      expect(iqArg.genesysWebrtc.params.stats).toBeDefined();
    });

    it('should not call sendIq if there is no participant', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const sendIqMock = (sdk as any)._streamingConnection._webrtcSessions.sendIq;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const rtpStats = {
        packetsReceived: 5,
        averageJitter: 0.1,
        estimatedAverageMos: 5
      };

      statsAggregator['sendStats'](rtpStats, new Date());

      expect(sendIqMock).not.toHaveBeenCalled();
    });

    it('should not call sendIq if there are no calls for the participant', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const sendIqMock = (sdk as any)._streamingConnection._webrtcSessions.sendIq;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const rtpStats = {
        packetsReceived: 5,
        averageJitter: 0.1,
        estimatedAverageMos: 5
      };

      const participantA = { calls: [] };
      mockSession.pcParticipant = participantA as any;
      statsAggregator['sendStats'](rtpStats, new Date());
      expect(sendIqMock).not.toHaveBeenCalled();

      const participantB = {};
      mockSession.pcParticipant = participantB as any;
      statsAggregator['sendStats'](rtpStats, new Date());
      expect(sendIqMock).not.toHaveBeenCalled();
    });

    it('should not call sendIq if session.peerID is falsy', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      (mockSession as any).peerID = '';
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      const sendIqMock = (sdk as any)._streamingConnection._webrtcSessions.sendIq;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const rtpStats = {
        packetsReceived: 5,
        averageJitter: 0.1,
        estimatedAverageMos: 5
      };
      mockSession.pcParticipant = { calls: [{ id: 'testCall' }] } as any;

      statsAggregator['sendStats'](rtpStats, new Date());

      expect(sendIqMock).not.toHaveBeenCalled();
    });

    it('should not throw when streaming connection webrtcSessions is unavailable', () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      (sdk as any)._streamingConnection._webrtcSessions = null;
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const rtpStats = {
        packetsReceived: 5,
        averageJitter: 0.1,
        estimatedAverageMos: 5
      };
      mockSession.pcParticipant = { calls: [{ id: 'testCall' }] } as any;

      expect(() => {
        statsAggregator['sendStats'](rtpStats, new Date());
      }).not.toThrow();
    });

    it('should catch sendIq rejection and log a warning', async () => {
      const mockSession = new MockSession() as unknown as IExtendedMediaSession;
      const sdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtSdk;
      (sdk as any)._streamingConnection._webrtcSessions.sendIq = jest.fn().mockRejectedValue(new Error('XMPP error'));
      const statsAggregator = new StatsAggregator(mockSession, sdk);
      const rtpStats = {
        packetsReceived: 5,
        averageJitter: 0.1,
        estimatedAverageMos: 5
      };
      mockSession.pcParticipant = { calls: [{ id: 'testCall' }] } as any;

      statsAggregator['sendStats'](rtpStats, new Date());

      await flushPromises();

      expect(sdk.logger.warn).toHaveBeenCalled();
    });
  });
});
