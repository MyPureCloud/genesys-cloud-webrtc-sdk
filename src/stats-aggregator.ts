import StatsGatherer, { GetStatsEvent, StatsEvent } from "webrtc-stats-gatherer";
import { v4 as uuidv4 } from "uuid";

import GenesysCloudWebrtSdk, { IExtendedMediaSession } from ".";
import { requestApi } from "./utils";

export class StatsAggregator {
  private mediaResourceId: string;
  private statsGatherer: StatsGatherer;

  constructor (private session: IExtendedMediaSession, private sdk: GenesysCloudWebrtSdk) {
    this.mediaResourceId = uuidv4();

    this.statsGatherer = new StatsGatherer(session.peerConnection)
    this.statsGatherer.on('stats', this.handleStatsUpdate.bind(this));
  }

  private handleStatsUpdate (stats: StatsEvent) {
    if (!this.isGetStatsEvent(stats)) {
      return;
    }

    if (stats.tracks.length === 0 || stats.remoteTracks.length === 0) {
      return;
    }

    const trackStats = stats.tracks[0];
    const remoteTrackStats = stats.remoteTracks[0];

    const packetsSent = trackStats.packetsSent;
    const packetsReceived = remoteTrackStats.packetsReceived;
    const jitter = trackStats.jitter;
    const packetLoss = trackStats.intervalPacketLoss;
    if (packetsSent === undefined || packetsReceived === undefined || jitter === undefined || packetLoss === undefined) {
      return;
    }

    const rtpStats = {
      packetsReceived,
      packetsSent,
      averageJitter: jitter,
      estimatedAverageMos: 5
    }

    this.sendStats(rtpStats);
  }

  private isGetStatsEvent (stats: StatsEvent): stats is GetStatsEvent {
    return stats.name === 'getStats';
  }

  private sendStats (rtpStats: {
    packetsReceived: number,
    packetsSent: number,
    averageJitter: number
    estimatedAverageMos: number
  }) {
    const conversationId = this.session.conversationId;
    const communicationId = "hjon-test-data";

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
      reconnectAttemptCount: 0
    }

    requestApi.call(this.sdk, `telephony/providers/edges/mediastatistics/conversations/${conversationId}/communications/${communicationId}/mediaresources/${this.mediaResourceId}`, {
      method: 'post',
      data: statsData
    });
  }
}
