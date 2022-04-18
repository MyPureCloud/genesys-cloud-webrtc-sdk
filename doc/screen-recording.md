# Genesys Cloud WebRTC SDK Screen Recording

This SDK supports abstracting the screen recording process that occurs inside the Genesys Cloud Desktop App. Screen 
recordings are initiated by the server which notifies the webrtc sdk who then abstracts nearly all of the setup and
signaling to make the screen recording work.

When the server determines a conversation should be recorded, it will send a pendingSession similar to how other session
types work (ie. softphone and video conversations). It will be the responsibility of the consuming client to accept the 
pending session (unless `config.autoAcceptPendingScreenRecordingRequests` is `false`), gather media, accept the 
session, and add the media to that session.

> *Note: screen recording does not support guest users.*

## Prerequisites

You must have screen recording policies in place and the Webrtc Sdk must be configured to allow screen recording sessions.

## Example Usage
Once you have an initialized instance of the WebrtcSdk, you can join or create a conference in the following manner:

### Automatic Accept (default)
Signaling is automatically accepted by the sdk. When the screen recording session comes in, all you need to do is add
your screen tracks and then call `sdk.acceptSession(session)`.

``` ts
// set up needed events
sdk.on('sessionStarted', async (session) => {
  if (sdk.isScreenRecordingSession(session)) {
    // gather media in whatever way you want. The SDK does *not* gather screen media for you
    const screenStream = await navigator.getDisplayMedia();

    // create metadatas
    const track = screenStream.getTracks()[0];
    const { height, width, deviceId } = track.getSettings();
    const screenRecordingMetadatas = [
      {
        trackId: track.id,
        screenId: deviceId, // some applications give you a deviceId on the track which is uniquely tied to a specific monitor
        originX: 0,
        originY: 0,
        resolutionX: width,
        resolutionY: height,
        primary: true,
      }
    ];

    sdk.acceptSession({ conversationId: session.conversationId, sessionType: session.sessionType, mediaStream: screenStream, screenRecordingMetadatas });
  }
});
```

### Manual Accept
Signaling is automatically accepted by the sdk. When the screen recording session comes in, all you need to do is add
your screen tracks and then call `sdk.acceptSession(session)`.

``` ts
const sdk = new GenesysCloudWebrtcSdk({
  // other config stuff ...
  autoAcceptPendingScreenRecordingRequests: true
});

...

sdk.on('pendingSession', (session) => {
  if (pendingSession.sessionType === SessionTypes.screenRecording) {
    sdk.acceptPendingSession({ conversationId: session.conversationId, sessionType: session.sessionType });
  }
});

// set up needed events
sdk.on('sessionStarted', async (session) => {
  if (sdk.isScreenRecordingSession(session)) {
    // gather media in whatever way you want. The SDK does *not* gather screen media for you
    const screenStream = await navigator.getDisplayMedia();

    // create metadatas
    const track = screenStream.getTracks()[0];
    const { height, width, deviceId } = track.getSettings();
    const screenRecordingMetadatas = [
      {
        trackId: track.id,
        screenId: deviceId, // some applications give you a deviceId on the track which is uniquely tied to a specific monitor
        originX: 0,
        originY: 0,
        resolutionX: width,
        resolutionY: height,
        primary: true,
      }
    ];

    sdk.acceptSession({ conversationId: session.conversationId, sessionType: session.sessionType, mediaStream: screenStream, screenRecordingMetadatas });
  }
});
```

### Multiple Screens
Screen recording supports recording up to *4* screens simulataneously. In order to make that work, all the screen tracks will need to be
on the same media stream that is provided in `sdk.acceptSession(...)`. In most cases, screens can only be gathered one at a time
which means you will need to combine the streams. Here's an example of that.

``` ts
// set up needed events
sdk.on('sessionStarted', async (session) => {
  if (sdk.isScreenRecordingSession(session)) {
    // gather media in whatever way you want. The SDK does *not* gather screen media for you
    const screenStream = await navigator.getDisplayMedia();
    const screenStream2 = await navigator.getDisplayMedia();

    screenStream2.getVideoTracks().map(track => screenStream.addTrack(track));

    // create metadatas so the playback service knows how to display the screens during playback.
    const screenRecordingMetadatas = myCustomScreenMetadataGatherer();

    // add the media track(s) to the session
    sdk.acceptSession({ conversationId: session.conversationId, sessionType: session.sessionType, mediaStream: screenStream, screenRecordingMetadatas });
  }
});
```

When the session ends, the webrtc sdk will clean up the media automatically.
