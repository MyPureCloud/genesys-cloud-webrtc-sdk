# WebRTC Video Conference SDK

This SDK supports creating or joining video conferences. Much of the initialization and call controls
are done using the public API, but are abstracted being api's in this sdk. There is currently no such
thing as an alerting or incoming video call. All video sessions are treated as a conference to which
a user must join manually.

## API

See the full list of the [APIs](index.md#api), [methods](index.md#methods), and [events](index.md#events).

## Usage

*Note: video conferencing does not support guest users.*

Once you have an initialized instance of the WebrtcSdk, you can join or create a conference in the following manner:

#### Example Usage

``` javascript
// set up needed events
sdk.on('sessionStarted', function (session) => {
  // accept session
  if (session.sessionType === 'collaborateVideo') {
    const audioElement = document.getElementById('vid-audio');
    const videoElement = document.getElementById('vid-video');

    const sessionEventsToLog = [ 'participantsUpdate', 'activeVideoParticipantsUpdate', 'speakersUpdate' ];
    sessionEventsToLog.forEach((eventName) => {
      session.on(eventName, (e) => console.info(eventName, e));
    });
    sdk.acceptSession({ id: session.id, audioElement, videoElement });
  }
});
await sdk.startVideoConference(roomJid);
```

At this point, you should be in the conference and able to see and hear others. Here are the various events
and functions that are relevant to video conferences.

#### Relevant Events

`session.on('participantsUpdate', (IParticipantsUpdate) => {})` - This event will happen whenever a conversation update event is received.
The most common cases are, but not limited to:
  - Participants joining or leaving the conference
  - Participants muting or unmuting video or audio
  - Participants sharing or unsharing a screen
```
IParticipantsUpdate {
  conversationId: string;
  addedParticipants: IParticipantUpdate[];
  removedParticipants: IParticipantUpdate[];
  activeParticipants: IParticipantUpdate[];
}

interface IParticipantUpdate {
  participantId: string; id corresponding to the participant on the conversation,
  userId: string,
  sharingScreen: boolean; whether or not the onScreenParticipant is sharing their screen,
  videoMuted: boolean,
  audioMuted: boolean
}
```


`session.on('activeVideoParticipantsUpdate', (IActiveVideoParticipantsUpdateEvent) => {})` - This event will happen when
the server switches who is visible on the screen. This will likely happen every time someone new speaks.

*Note: this user may not be providing video or that video could be muted. It is up to the
implementing party to show something else such as an avatar or profile picture in such instances.*
```
interface IOnScreenParticipantsUpdate {
  participantsOnScreen: [
    {
      userId: string,
    }
  ]
}
```

`session.on('speakersUpdate', (ISpeakersUpdateEvent) => {}))` - This event tells who is making noise in the conference.
```
interface ISpeakersUpdateEvent {
  speakers: [
    {
      userId: string;
    }
  ]
}
```

#### Adding Screen Share to the Conference

`session.startScreenShare()` - Prompts for a screen to share then shares that with the other
participants upon confirmation.

*Note: at this time, screen sharing while also sending video with the camera is not supported.
If you are sending video with the camera when you `startScreenShare`, the camera track will
be cleaned up and replaced with a track presenting your screen. When ending screen share, if
a camera track was cleaned up during `startScreenShare` a new one will be created to replace the screen share track.*

`session.stopScreenShare()` - Ends the active outgoing screen share.
