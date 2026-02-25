# Genesys Cloud WebRTC SDK Live Screen Monitoring

This SDK supports live screen monitoring functionality that allows real-time viewing of user screens. Live screen monitoring sessions are initiated by the server and provide the ability to observe user activity in real-time for support, training, or compliance purposes.

When the server determines that live screen monitoring should be initiated, it will send a pendingSession similar to how other session types work (ie. softphone and video conversations). The consuming client must accept the pending session, gather screen media, and add the media to that session.

> *Note: live screen monitoring does not support guest users.*

## WebRTC SDK Live Screen Monitoring Index
This documentation expands upon the [GenesysCloudWebrtcSdk] documentation but is specific to
live screen monitoring. See the full list of the [APIs], [methods], and [events].

* [Example usage](#example-usage)

## Prerequisites

You must have live screen monitoring policies in place and the WebRTC SDK must be configured to allow live screen monitoring sessions.

## Example Usage

### Automatic Accept (default)
Signaling is automatically accepted by the SDK. When the live screen monitoring session comes in, you need to add your screen tracks and then call `sdk.acceptSession(session)`.

``` ts
// set up needed events
sdk.on('sessionStarted', async (session) => {
  if (sdk.isLiveScreenMonitoringSession(session)) {
    // gather media - the SDK does *not* gather screen media for you
    const screenStream = await navigator.getDisplayMedia();

    // create metadata for the screen being monitored
    const track = screenStream.getTracks()[0];
    const { height, width, deviceId } = track.getSettings();
    const liveScreenMonitoringMetadata = [
      {
        trackId: track.id,
        screenId: deviceId,
        originX: 0,
        originY: 0,
        resolutionX: width,
        resolutionY: height,
        primary: true,
      }
    ];

    sdk.acceptSession({
      conversationId: session.conversationId,
      sessionType: session.sessionType,
      mediaStream: screenStream,
      liveScreenMonitoringMetadata
    });
  }
});
```

### Manual Accept
If you want to manually control the acceptance of live screen monitoring sessions:

``` ts
const sdk = new GenesysCloudWebrtcSdk({
  // other config stuff ...
  autoAcceptPendingLiveScreenMonitoringRequests: false
});

sdk.on('pendingSession', (session) => {
  if (session.sessionType === SessionTypes.liveScreenMonitoring) {
    // manually accept the pending session
    sdk.acceptPendingSession({
      conversationId: session.conversationId,
      sessionType: session.sessionType
    });
  }
});

sdk.on('sessionStarted', async (session) => {
  if (sdk.isLiveScreenMonitoringSession(session)) {
    const screenStream = await navigator.getDisplayMedia();

    const track = screenStream.getTracks()[0];
    const { height, width, deviceId } = track.getSettings();
    const liveScreenMonitoringMetadata = [
      {
        trackId: track.id,
        screenId: deviceId,
        originX: 0,
        originY: 0,
        resolutionX: width,
        resolutionY: height,
        primary: true,
      }
    ];

    sdk.acceptSession({
      conversationId: session.conversationId,
      sessionType: session.sessionType,
      mediaStream: screenStream,
      liveScreenMonitoringMetadata
    });
  }
});
```

### Multiple Screens
Live screen monitoring supports monitoring up to *4* screens simultaneously. All screen tracks need to be on the same media stream provided in `sdk.acceptSession(...)`.

``` ts
sdk.on('sessionStarted', async (session) => {
  if (sdk.isLiveScreenMonitoringSession(session)) {
    // gather multiple screens
    const screenStream1 = await navigator.getDisplayMedia();
    const screenStream2 = await navigator.getDisplayMedia();

    // combine streams
    screenStream2.getVideoTracks().forEach(track => screenStream1.addTrack(track));

    // create metadata for all screens
    const liveScreenMonitoringMetadata = createMultiScreenMetadata();

    sdk.acceptSession({
      conversationId: session.conversationId,
      sessionType: session.sessionType,
      mediaStream: screenStream1,
      liveScreenMonitoringMetadata
    });
  }
});
```

[sdk.startLiveScreenMonitoring()]: index.md#startlivescreenmonitoring
[APIs]: index.md#genesyscloudwebrtcsdk
[methods]: index.md#methods
[events]: index.md#events
[GenesysCloudWebrtcSdk]: index.md#genesyscloudwebrtcsdk
