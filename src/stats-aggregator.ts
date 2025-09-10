import StatsGatherer, { GetStatsEvent, StatsEvent } from "webrtc-stats-gatherer";
import { v4 as uuidv4 } from "uuid";

import GenesysCloudWebrtSdk, { IConversationParticipantFromEvent, IExtendedMediaSession } from ".";
import { requestApi } from "./utils";

interface ISentStats {
  packetsReceived: number;
  packetsSent: number;
  averageJitter: number;
  estimatedAverageMos: number;
}

export class StatsAggregator {
  private mediaResourceId: string;
  private statsGatherer: StatsGatherer;
  private jitterValues: number[] = [];

  constructor (private session: IExtendedMediaSession, private sdk: GenesysCloudWebrtSdk) {
    this.mediaResourceId = uuidv4();

    this.statsGatherer = new StatsGatherer(session.peerConnection)
    this.statsGatherer.on('stats', this.handleStatsUpdate.bind(this));
  }

  private isGetStatsEvent (stats: StatsEvent): stats is GetStatsEvent {
    return stats.name === 'getStats';
  }

  private handleStatsUpdate (stats: StatsEvent) {


    // We want the time to be as close to the cretion of the stats as possible, even
    // though we may throw this away in some cases.
    const dateCreated = new Date();

    if (!this.isGetStatsEvent(stats)) {
      return;
    }

    if (stats.tracks.length === 0 || stats.remoteTracks.length === 0) {
      return;
    }

    console.log('Hjon: statsEvent:\n', stats);

    const trackStats = stats.tracks[0];
    const remoteTrackStats = stats.remoteTracks[0];

    // Looks like I want the remote-inbound-rtp
    // - jitter - yes, this is coming from the remote
    // - roundTripTime - yes, this is coming from the remote
    // - I could get the total and the total measurements and average that way...or just average like the jitter?
    //
    // - packetsLost?
    // - fractionLost?
    const packetsSent = trackStats.packetsSent;
    const packetsReceived = remoteTrackStats.packetsReceived;
    const roundTripTimeInSeconds = trackStats.roundTripTime;
    const jitterInSeconds = trackStats.jitter;
    if (packetsSent === undefined || packetsReceived === undefined || jitterInSeconds === undefined) {
      return;
    }

    // Calculate values to use for calculating MOS
    // I want this to be for the whole call, though
    // **** WIP ****
    const latencyInSeconds = roundTripTimeInSeconds / 2; // Approximate the one-way latency
    this.jitterValues.push(jitterInSeconds);
    const averageJitter = this.jitterValues.reduce((sum, jitter) => sum + jitter, 0) / this.jitterValues.length;
    const packetsLost = packetsReceived - packetsSent;
    const packetLossPercent = 100 * (packetsLost / packetsSent);

    const mos = this.calculateMos(latencyInSeconds, averageJitter, packetLossPercent);
    const rtpStats = {
      packetsReceived,
      packetsSent,
      averageJitter,
      estimatedAverageMos: mos
    }

    this.sendStats(rtpStats, dateCreated);
  }

  // This follows a code snippet from the backend that I got from Sean Conrad, which follows
  // https://netbeez.net/blog/impact-of-packet-loss-jitter-and-latency-on-voip/
  private calculateMos (latencyInSeconds: number, averageJitterInSeconds: number, packetLossPercent: number) {
    const maxMosRFactor = 93.2;
    let rFactor: number;

    const effectiveLatencyMS = (latencyInSeconds * 1000) + (averageJitterInSeconds * 1000 * 2) + 10;
    if (effectiveLatencyMS < 160) {
      rFactor = maxMosRFactor - (effectiveLatencyMS / 40);
    } else {
      rFactor = maxMosRFactor - (effectiveLatencyMS - 120) / 10;
    }

    rFactor = rFactor - (2.5 * packetLossPercent);
    if (rFactor < 0) {
      return 1;
    } else {
      return 1 + (0.035 * rFactor) + (0.000007 * rFactor * (rFactor - 60) * (100 - rFactor));
    }
  }

  private sendStats (rtpStats: ISentStats, dateCreated: Date) {
    // Not sure if this is where I want to do this yet, but I'm sketching
    const pcParticipant = this.session.pcParticipant;
    console.log('Hjon: This is the pcParticpant: ', pcParticipant);
    if (!pcParticipant) {
      console.warn('Hjon: no pcParticipant');
      return;
    }
    const calls = pcParticipant['calls'] ?? [];
    if (calls.length === 0) {
      console.warn('Hjon: I\'m wrong, no calls exist on this pcParticipant');
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
      reconnectAttemptCount: 0
    }

    requestApi.call(this.sdk, `telephony/providers/edges/mediastatistics/conversations/${conversationId}/communications/${communicationId}/mediaresources/${this.mediaResourceId}`, {
      method: 'post',
      data: statsData
    });
  }
}
