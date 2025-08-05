import GenesysCloudWebrtSdk from ".";
import { requestApi } from "./utils";

export class StatsAggregator {
  constructor (private sdk: GenesysCloudWebrtSdk) { }

  private sendStats () {
    const conversationId = "";
    const communicationId = "";
    const mediaResourceId = "";

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

    requestApi.call(this.sdk, `telephony/providers/edges/mediastatistics/conversations/${conversationId}/communications/${communicationId}/mediaresources/${mediaResourceId}`, {
      method: 'post',
      data: statsData
    });
  }
}
