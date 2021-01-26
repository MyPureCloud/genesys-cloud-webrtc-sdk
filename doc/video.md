# Genesys Cloud WebRTC SDK Video Conferencing

This SDK supports creating or joining video conferences. Much of the initialization and call controls
are done using the public API, but are abstracted being api's in this sdk.

> *Note: video conferencing does not support guest users.*

## WebRTC SDK Video Index
This documentation expands upon the [GenesysCloudWebrtcSdk] documention but is specific to 
video conferencing. See the full list of the [APIs], [methods], and [events]. 

* See [sdk.startVideoConference()] for usage
* [Example usage](#example-usage)
* [Video Session Level Events](#video-session-level-events)
* [Video Session Methods](#video-session-methods)

## Example Usage
Once you have an initialized instance of the WebrtcSdk, you can join or create a conference in the following manner:

``` ts
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
    sdk.acceptSession({ sessionId: session.id, audioElement, videoElement });
  }
});

await sdk.startVideoConference(roomJid);
```

At this point, you should be in the conference and able to see and hear others. Here are the various events
and functions that are relevant to video conferences.

## Video Session Level Events

These are `session` level events and are in addition to the already documented [session level events].

#### `participantsUpdate`
This event will happen whenever a participant changes on the conversation.

The most common cases are, but not limited to:
  - Participants joining or leaving the conference
  - Participants muting or unmuting video or audio
  - Participants sharing or unsharing a screen

Declaration:
``` ts
sdk.on('participantsUpdate', (update: IParticipantsUpdate) => {});

/* interface declarations */
interface IParticipantsUpdate {
  conversationId: string;
  addedParticipants: IParticipantUpdate[];
  removedParticipants: IParticipantUpdate[];
  activeParticipants: IParticipantUpdate[];
}

interface IParticipantUpdate {
  participantId: string; // id corresponding to the participant on the conversation,
  userId: string,
  sharingScreen: boolean; // whether or not the onScreenParticipant is sharing their screen,
  videoMuted: boolean,
  audioMuted: boolean
}
```
Value of event: 
* `update: IParticipantsUpdate` – list of updated participants

#### `activeVideoParticipantsUpdate`

This event will happen when the server switches who is visible on the screen. 

> *Note: this user may not be providing video or that video could be muted. It is up to the
> implementing party to show something else such as an avatar or profile picture in such instances.*

Declaration:
``` ts
session.on('activeVideoParticipantsUpdate', (update: IOnScreenParticipantsUpdate) => {});

/* interface declaration */
interface IOnScreenParticipantsUpdate {
  participantsOnScreen: [
    {
      userId: string,
    }
  ]
}
```
Value of event:
* `update: IOnScreenParticipantsUpdate` – the new participant on the screen


#### `speakersUpdate`

This event tells who is making noise in the conference.

> Caveat: currently, we can only emit on this event when the on-screen user changes, 
this will often appear to be out of sync. This will be fixed in the future.

Declaration:
``` ts
session.on('speakersUpdate', (update: ISpeakersUpdate) => {})):

/* interface declaration */
interface ISpeakersUpdate {
  speakers: [
    {
      userId: string;
    }
  ]
}
```
Value of event:
* `update: ISpeakersUpdate` – userIds of the participants speaking

## Video Session Methods

#### `startScreenShare()`
Prompts for a screen to share then shares that with the other
participants upon confirmation. This will
throw an error if the user cancels the screen selection prompt.

> Note: at this time, screen sharing while also sending video with the camera is not supported.
If you are sending video with the camera when you `startScreenShare`, the camera track will
be cleaned up and replaced with a track presenting your screen. When ending screen share, if
a camera track was cleaned up during `startScreenShare` a new one will be created to replace the screen share track.


Declaration: 
``` ts
session.startScreenShare(): Promise<void>;
```

Params: none

Returns: a promise that completes after the screen share started.


#### `stopScreenShare()`
Ends the active outgoing screen share. If video media was on before the screen share 
started, the media we be required and added to the session. 

If there was no active screen share for this session, an error is logged 
and returns (no error is thrown). 

Declaration: 
``` ts
session.stopScreenShare(): Promise<void>;
```

Params: none

Returns: a promise that completes after the screen share end and the new video
  media has been acquired (if there was video media before the screen share started).


#### `pinParticipantVideo()`
Locks video to the provided video conference participant. If `participantId` is `null`
or `undefined`, any currently pinned participants will be removed and will switch automatically 
when speaking. 

When a participant's video is pinned it will disable the video switching when other participants talk.

> Note: participantIds can be found in the [participantsUpdate](#participantsupdate) event.

Declaration: 
``` ts
session.pinParticipantVideo(participantId?: string): Promise<void>;
```

Params: 
* `participantId: string` – Optional: if provided, it will pin that participant's video. If
  the id is not provided, it will clear any old pin and reset back to the active user on screen.

Returns: a promise that completes after the Public API call finishes pinning the participant


[sdk.startVideoConference()]: index.md#startvideoconference
[APIs]: index.md#genesyscloudwebrtcsdk
[methods]: index.md#methods
[events]: index.md#events

[session level events]: index.md#session-level-events