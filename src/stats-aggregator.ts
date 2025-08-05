import StatsGatherer, { StatsEvent } from "webrtc-stats-gatherer";
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
    this.sendStats();
  }

  private sendStats () {
    const conversationId = this.session.conversationId;
    const communicationId = "";

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
      rtp: {
        packetsReceived: 0,
        packetsSent: 0,
        rtpEventsReceived: 0,
        rtpEventsSent: 0,
        averageJitter: 0,
        estimatedAverageMos: 5
      },
      reconnectAttemptCount: 0
    }

    requestApi.call(this.sdk, `telephony/providers/edges/mediastatistics/conversations/${conversationId}/communications/${communicationId}/mediaresources/${this.mediaResourceId}`, {
      method: 'post',
      data: statsData
    });
  }
}
