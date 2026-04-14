import StatsGatherer, { GetStatsEvent, StatsEvent } from "webrtc-stats-gatherer";
import { v4 as uuidv4 } from "uuid";

import GenesysCloudWebrtSdk, { IConversationParticipantFromEvent, IExtendedMediaSession } from ".";

interface ISentStats {
  packetsReceived: number;
  averageJitter: number;
  estimatedAverageMos: number;
}

export class StatsAggregator {
  private mediaResourceId: string;
  private statsGatherer?: StatsGatherer;

  private setBaseline = false;
  private baselinePacketsReceived = 0;
  private baselinePacketsLost = 0;
  private baselineRtt = 0;
  private baselineRttMeasurements = 0;
  private totalJitter = 0;
  private jitterMeasurements = 0;

  private boundStatsHandler?: (stats: StatsEvent) => void;

  constructor(private session: IExtendedMediaSession, private sdk: GenesysCloudWebrtSdk) {
    this.mediaResourceId = uuidv4();

    if (this.shouldGatherImmediately(session)) {
      this.startGatheringStats();
    }

    const boundSessionStartedHandler = this.onSessionStarted.bind(this);
    const boundSessionEndedHandler = this.onSessionEnded.bind(this);
    sdk.on('sessionStarted', boundSessionStartedHandler);
    sdk.on('sessionEnded', boundSessionEndedHandler);

    session.once('terminated', () => {
      this.stopGatheringStats();
      sdk.off('sessionStarted', boundSessionStartedHandler);
      sdk.off('sessionEnded', boundSessionEndedHandler);
    });
  }

  private shouldGatherImmediately(session: IExtendedMediaSession): boolean {
    const isEagerPersistentConnection = session.privAnswerMode === 'Auto';

    // The first conversation on an eager persistent connection is fake, so we want to wait
    // for a real conversation before gathering stats.
    return !isEagerPersistentConnection;
  }

  private startGatheringStats() {
    this.statsGatherer = new StatsGatherer(this.session.peerConnection)
    this.boundStatsHandler = this.handleStatsUpdate.bind(this);

    this.statsGatherer.on('stats', this.boundStatsHandler);
  }

  private stopGatheringStats() {
    if (this.statsGatherer) {
      this.statsGatherer.off('stats', this.boundStatsHandler);
      this.statsGatherer = null;
    }
  }

  private onSessionStarted(session: IExtendedMediaSession) {
    if (session == this.session) {
      this.setBaseline = true;
      this.startGatheringStats();
    }
  }

  private onSessionEnded(session: IExtendedMediaSession) {
    if (session === this.session) {
      this.stopGatheringStats();
    }
  }

  private isGetStatsEvent(stats: StatsEvent): stats is GetStatsEvent {
    return stats.name === 'getStats';
  }

  private handleStatsUpdate(stats: StatsEvent) {
    if (!this.isGetStatsEvent(stats)) {
      return;
    }

    if (stats.tracks.length === 0 || stats.remoteTracks.length === 0) {
      return;
    }

    const trackStats = stats.tracks[0];
    const remoteTrackStats = stats.remoteTracks[0];

    const totalPacketsReceived = remoteTrackStats.packetsReceived;
    const totalPacketsLost = remoteTrackStats.packetsLost;
    const totalRtt = trackStats.totalRoundTripTime;
    const totalRttMeasurements = trackStats.roundTripTimeMeasurements;
    if (totalPacketsReceived === undefined || totalPacketsLost === undefined || totalRtt === undefined || totalRttMeasurements === undefined) {
      return;
    }

    if (this.setBaseline) {
      this.setBaseline = false;
      this.baselinePacketsReceived = totalPacketsReceived;
      this.baselinePacketsLost = totalPacketsLost;
      this.baselineRtt = totalRtt;
      this.baselineRttMeasurements = totalRttMeasurements;
      this.totalJitter = 0;
      this.jitterMeasurements = 0;
      return;
    }

    const packetsReceived = totalPacketsReceived - this.baselinePacketsReceived;
    const packetsLost = totalPacketsLost - this.baselinePacketsLost;
    const packetLoss = packetsReceived > 0 ? packetsLost / packetsReceived : 0.0;
    const jitterInSeconds = remoteTrackStats.jitter;
    if (jitterInSeconds === undefined) {
      return;
    }

    const roundTripTimeSum = totalRtt - this.baselineRtt;
    const roundTripTimeMeasurements = totalRttMeasurements - this.baselineRttMeasurements;
    const averageRoundTripTime = roundTripTimeSum / roundTripTimeMeasurements;
    const averageLatency = averageRoundTripTime / 2; // Approximate the one-way latency
    this.totalJitter += jitterInSeconds;
    this.jitterMeasurements += 1;
    const averageJitter = this.totalJitter / this.jitterMeasurements;

    const mos = this.calculateEstimatedMos(averageLatency, averageJitter, packetLoss);
    const rtpStats = {
      packetsReceived,
      averageJitter,
      estimatedAverageMos: mos
    }

    const dateCreated = new Date(remoteTrackStats.timestamp);
    this.sendStats(rtpStats, dateCreated);
  }

  // This follows a code snippet from the backend that I got from Sean Conrad, which follows
  // https://netbeez.net/blog/impact-of-packet-loss-jitter-and-latency-on-voip/
  /**
   * Calculates an estimated MOS (Mean Opinion Score) based on statistics from WebRTC's `getStats`.
   *
   * @param averageLatency The average latency for the call, measured in seconds. e.g. `0.071869`
   * @param averageJitter The average jitter for the call, measured in seconds. e.g. `0.0008539`
   * @param packetLoss The decimal representation of the packet loss over the duration of the call. e.g. 1% packet loss should be passed in as `0.01`
   *
   * @returns An estimated MOS ranging from 1.0 to 5.0.
   */
  private calculateEstimatedMos(averageLatency: number, averageJitter: number, packetLoss: number) {
    const maxMosScore = 5.0; // Assume we always negotiate Opus right now
    const maxMosRFactor = 93.2;
    let rFactor: number;

    const effectiveLatency = (averageLatency * 1000) + (averageJitter * 1000 * 2) + 10;
    if (effectiveLatency < 160) {
      rFactor = maxMosRFactor - (effectiveLatency / 40);
    } else {
      rFactor = maxMosRFactor - (effectiveLatency - 120) / 10;
    }

    rFactor = rFactor - (2.5 * 100 * packetLoss);
    if (rFactor < 0) {
      return 1;
    } else {
      return (1 + (0.035 * rFactor) + (0.000007 * rFactor * (rFactor - 60) * (100 - rFactor))) * maxMosScore / 4.5;
    }
  }

  private sendStats(rtpStats: ISentStats, dateCreated: Date) {
    const pcParticipant = this.session.pcParticipant;
    if (!pcParticipant) {
      return;
    }
    const calls = pcParticipant['calls'] ?? [];
    if (calls.length === 0) {
      this.sdk.logger.warn('Failed to send stats via XMPP - calls.length === 0');
      return;
    }
    if (!this.session.peerID) {
      this.sdk.logger.warn('Failed to send stats via XMPP - peerID');
      return;
    }
    if (!this.sdk._streamingConnection?._webrtcSessions?.sendIq) {
      this.sdk.logger.warn('Failed to send stats via XMPP - sendIq');
      return;
    }
    const participant = pcParticipant as unknown as IConversationParticipantFromEvent;
    const communicationId = participant.calls[0].id;
    const conversationId = this.session.conversationId;

    const {
      originAppId,
      originAppName,
      originAppVersion
    } = this.sdk._config;

    const statsData = {
      sourceType: 'Client',
      client: {
        originAppName,
        originAppId,
        originAppVersion
      },
      rtp: rtpStats,
      dateCreated: dateCreated.toISOString(),
      reconnectAttemptCount: this.session.reconnectCount ?? 0
    }

    const iq = {
      type: 'set' as const,
      to: this.session.peerID,
      genesysWebrtc: {
        jsonrpc: '2.0',
        id: uuidv4(),
        method: 'report-statistics',
        params: {
          sessionId: this.session.id,
          conversationId,
          communicationId,
          mediaResourceId: this.mediaResourceId,
          stats: statsData
        }
      }
    };

    this.sdk.logger.debug('Sending stats over XMPP');
    this.sdk._streamingConnection._webrtcSessions.sendIq(iq)
      .catch((err: unknown) => this.sdk.logger.warn('Failed to send stats via XMPP', err));
  }
}
