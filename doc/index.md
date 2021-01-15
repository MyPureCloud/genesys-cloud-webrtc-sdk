# Genesys Cloud WebRTC SDK Documentation

## Feature Index

- [WebRTC SoftPhone]
- [WebRTC Screen Share]
- [WebRTC Video Conferencing]

## API

#### App Authorization

To use the SDK with OAuth scopes, you will need the following scopes enabled:
 - authorization
 - conversations
 - organizations
 - notifications

These can be set in Genesys Cloud > Admin > Integrations > OAuth > Scope.  Note that the scope options are not available when the "Grant Type" option is set to "Client Credentials"

#### Behavior notes

- By default, the SDK will keep all active sessions active if the WebSocket disconnects.
It is the consuming application's responsibility to end all pending or active sessions after a
disconnect in the event that it doesn't recover. This behavior can be disabled by providing
`sessionSurvivability: false` in the SDK constructor options. If this is set to false, if
the WebSocket connection drops, all active WebRTC connections will be disconnected.

#### Constructor

`new GenesysCloudWebrtcSdk(options)`

- parameters
  - `Object options` with properties:
    - `String environment`: Required; `mypurecloud.com || mypurecloud.ie ||
        mypurecloud.jp || mypurecloud.de || mypurecloud.com.au || usw2.pure.cloud`
    - One of the following is required:
      - `String accessToken`: access token for the authenticated user
      - `String organizationId`: organization ID (used for unauthenticated user)

    Advanced options:
    - `Boolean sessionSurvivability`: **not yet supported**: Optional, default true; see Behavior Notes
        above
    - `Boolean autoAnswerOutboundCalls`: **not yet supported**: Optional, default true; See [softphone behavior notes]
    - `Boolean autoConnectSessions`: Optional, default true; whether or not
        the SDK should auto connect the sessions.
    - `Array[IceServerConfiguration] iceServers`: Custom ICE server configuration.
        See https://developer.mozilla.org/en-US/docs/Web/API/RTCIceServer/urls
    - `HTMLAudioElement defaultAudioElement`: Optional, default element to which inbound audio is attached to
    - `HTMLVideoElement defaultVideoElement`: Optional, default element to which inbound video is attached to
    - `MediaStream defaultAudioStream`: Optional, audio stream to be used for outbound calls
    - `String | Null defaultVideoDeviceId`: Optional, default video device ID or `null` for system default\*
    - `String | Null defaultAudioDeviceId`: Optional, default audio device ID or `null` for system default\*
    - `String | Null defaultOutputDeviceId`: Optional, default output device ID or `null` for system default (this is the only time `null` is allowed for output device)\*
    - `RTCConfiguration iceTransportPolicy`: [DEPRECATED in 3.0.1, to be removed soon] Set the ICE transport policy
        See https://developer.mozilla.org/en-US/docs/Web/API/RTCConfiguration
    - `String logLevel`: Optional, desired log level. Available options: `debug`, `log`, `info`, `warn`, `error`
    - `Object logger`: Optional, desired logger. Default, `console`. Must contain methods: `debug`, `log`, `info`, `warn`, `error`
    - `String wsHost`: Optional, websocket host
    - `SessionTypes[] allowedSessionTypes`: Optional, *defaults to all session types* if not provided. If provided, only the provided types will be handled by the sdk and all others will be ignored.

#### Methods

`sdk.intialize(options) : Promise<void>` - Initialize the WebSocket connection for streaming
connectivity with GenesysCloud. Initialize must be called before any events will trigger.
  - parameters
    - `Object options`: Optional; with properties
      - `String securityCode`: Optional; one-time security code used to authenticate guest users

`sdk.startScreenShare() : Promise<void>` - Start sharing the guest user's screen.

`sdk.startVideoConference(roomJid, inviteeJid?) : Promise<void>` - Start or join a video conference
  - parameters
    - `String roomJid`: Required; the id or jid of the room where the conference will take place.
    - `String inviteeJid`: Optional; the jid of the user you would like to invite to this conference. In order for this to work, the roomJid must be prefixed with `peer-`

`sdk.createMedia(options) : Promise<MediaStream>` - Creates a media stream with audio, video, or both.
  - parameters
    - `Object options`: Required
      - `String | Boolean | Null video`: Optional; the returned stream will have a video track (`string` for desired device ID, `true` will use the sdk default device, `null` will use system default, `false | undefined` will not create this type of media)\*.
      - `String | Boolean | Null audio`: Optional; the returned stream will have an audio track (`string` for desired device ID, `true` will use the sdk default device, `null` will use system default, `false | undefined` will not create this type of media)\*.

`sdk.getDisplayMedia() | Promise<MediaStream>` - Creates a media stream from the screen (this will prompt for user screen selection)

`sdk.updateOutputDevice(deviceId) : Promise<void>` - Update the output device for _all active sessions_ (dependent on browser capabilities).
  - parameters
    - `String deviceId`: Required; the desired output device ID\*

`sdk.updateOutgoingMedia(updateOptions) : Promise<any>` - Update the outgoing media for a session
  - paramters
    - `Object updateOptions`: Required; with properties
      - `String sessionId`: Optional; ID of the session to be updated (this or _session_ is required)
      - `Session session`: Optional; session to be updated (this or _sessionId_ is required)
      - `MediaStream stream`: Optional; media stream to update the session's outgoing media to (this supercedes deviceId(s))
      - `String | True | Null videoDeviceId`: Optional; `string` for desired device ID, `true` for sdk default, `null` for system default, `undefined` will not touch this media type on the session (superceded by `stream` option)\*
      - `String | True | Null audioDeviceId`: Optional; `string` for desired device ID, `true` for sdk default, `null` for system default, `undefined` will not touch this media type on the session (superceded by `stream` option)\*

`sdk.updateDefaultDevices(options)` - Update the SDK's default device IDs
  - parameters
    - `Object options`: Optional
      - `String | Null videoDeviceId`: Optional; Set the default video device ID. `string` for desired device ID, `null` for system default, `undefined` will not update the video device ID\*
      - `String | Null audioDeviceId`: Optional; Set the default audio device ID. `string` for desired device ID, `null` for system default, `undefined` will not update the audio device ID\*
      - `String | Null outputDeviceId`: Optional; Set the default output device ID. `string` for desired device ID, `null` for system default, `undefined` will not update the output device ID\*
      - `Boolean updateAcitveSessions`: Optional; If set to `true`, all active sessions will have their media updated to match the new defaults (if provided)\*

`sdk.setVideoMute(options) : Promise<void>` - Mute or unmute outgoing video on a session. *Note: this will only work on video sessions and does not affect screen sharing.*
- parameters
  - `Object options`: Required
    - `String id`: Required; The id of the session for which you would like to mute or unmute video.
    - `Boolean mute`: Required; If true, outgoing video track will be cleaned up. If there are no other tracks using the camera, the camera will be turned off. If false, a new video track will be created and sent to the other participants. This will reactivate the camera if it is not already in use.
    - `String | True | null unmuteDeviceId`: Optional; If provided, it will unmute the video and use the camera device passed in (`string` for desired device ID, `true` for sdk default, `null` for system default). If not provided, it will use the sdk `defaultVideoDeviceId` and fallback to system default\*. **Note:** if muting, this option is ignored.

`sdk.setAudioMute(options) : Promise<void>` - Mute or unmute outgoing audio on a session.
- parameters
  - `Object options`: Required
    - `String id`: Required; The id of the session for which you would like to mute or unmute audio.
    - `Boolean mute`: Required; If true, outgoing audio will not be heard by other participants. If false, outgoing audio will be re-enabled.
    - `String | True | null unmuteDeviceId`: Optional; If provided, it will unmute the audio and use the microphone device passed in (`string` for desired device ID, `true` for sdk default, `null` for system default). If not provided, it will unmute the current audio track. If there is not an active audio track, it will use the sdk `defaultAudioDeviceId` and fallback to system default\*. **Note:** if muting, this option is ignored.

`sdk.acceptPendingSession(id) : void` - Accept an incoming RTC session proposal. Should be called automatically for outbound calls.
- parameters
  - `String id`: Required; The id of the pending session you would like to accept.

`sdk.acceptSession(options) : void` - Accept an incoming session. This happens automatically for softphone and screen share sessions when `autoConnectSessions` is not `false`. For video sessions you must call this manually.
- parameters
  - `Object options`
    - `String id`: Required, id representing the sessionId

    Advanced options:
    - `MediaStream mediaStream`: Optional, outgoing MediaStream. If not provided a MediaStream will be created automatically.
    - `Object videoResolution`: Optional.
      - `ConstrainULong width`: Required.
      - `ConstrainULong height`: Required.
    - `HTMLAudioElement audioElement`: Optional, element to which incoming audio will be attached. Except for video sessions, a unique element will be created automatically if one is not provided, then cleaned up afterwards.
    - `HTMLVideoElement videoElement`: Optional/Required, element to which incoming video will be attached. This is optional if you provide a default video element in the config, otherwise this is required.


`sdk.endSession(opts) : Promise<void>` - Disconnect an active session
- parameters
  - `Object opts`: object with one of the following properties set:
    - `String id`: the id of the session to disconnect
    - `String conversationId`: the conversationId of the session to disconnect

`sdk.disconnect() : void` - Tear down the WebSocket connection to GenesysCloud.
This does not hangup or disconnect active WebRTC Session calls.

`sdk.reconnect() : void` - Tear down the WebSocket connection to GenesysCloud (if active) and reconnect it.
This does not hangup or disconnect active WebRTC Session calls.

> \*_See [Device ID Support] for device lookup behavior_

#### Events

`sdk.on('pendingSession', ({id, address, conversationId, autoAnswer}) => {})` - a
call session is being initiated for an outbound or inbound call

- arguments
    - `Object` with properties:
       - `String id`: the unique Id for the session proposal; used to accept or
     reject the proposal
       - `String address`: the address of the caller
       - `String conversationId`: id for the associated conversation object (used in
            platform API requests)
       - `Boolean autoAnswer`: whether or not the client should auto answer the session
          - `true` for all outbound calls
          - `false` for inbound calls, unless Auto Answer is configured for the user by an admin
     public api request and/or push notifications

`sdk.on('cancelPendingSession', (id) => {})` - the call has been canceled due to remote disconnect
or answer timeout

- arguments
    - `String id`: the id of the session proposed and canceled

`sdk.on('handledPendingSession', (id) => {})` - another client belonging to this user
  has handled the pending session; used to stop ringing

- arguments
    - `String id`: the id of the session proposed and handled

`sdk.on('sessionStarted' (session) => {})` - negotiation has started; before the
  session has connected

- arguments
    - `Session session`: the session object used to access media streams and perform
  actions

`sdk.on('sessionEnded', (session, reason) => {})` - the conversation session ended

- arguments
    - `Session session`: the session that ended

`sdk.on('trace', (level, message, details) => {})` - get trace, debug, log, warn, and error
messages for the session manager

- arguments
    - `String level` - the log level of the message [trace|debug|log|warn|error]
    - `String message` - the log message
    - `Object details` - details about the log message

`sdk.on('error', (error, details) => {})` - errors in the SDK

- arguments
    - `Error error` - the error that occurred
    - `Object details` - the details about the error

`sdk.on('disconnected', () => {})` - the underlying websocket connection has
  disconnected and is no longer attempting to reconnect automatically. Should usually be followed
  by `sdk.reconnect()` or reloading the application, as this indicates a critical error

`sdk.on('connected', (details) => {})` - the underlying websocket has (re)connected
    - `Object details` - has a `reconnect` boolean indicating if it is a reconnect event

#### Session level events

Session level events are events emitted from the `session` objects themselves,
not the SDK instance library. These can be used if you want lower level access
and control.

`session.on('terminated', (reason) => {})` - the session was terminated

- arguments
    - `string reason` - the reason that the session was terminated; valid values
  are found [here](http://xmpp.org/extensions/xep-0166.html#def-reason)

`session.on('connectionState', (connectionState) => {})` - the session's connection
state has changed

- arguments
    - `string connectionState`

`session.on('endOfCandidates' () => {})` - signals the end of candidate gathering; used to check for
potential connection issues

#### Device ID Support

The SDK provides flexibility in choosing device IDs. It will follow these steps when attempting to update a device:

- If a `deviceId` is provided in the form of a `string`
  - Attempt to use that device
  - If the device cannot be found, attempt to use the sdk default device for that type (ie. `defaultAudioDeviceId`, etc)
  - If the default device cannot be found, attempt to use the system default

- If `true` is provided
  - Attempt to use the `sdk`'s default device
  - If the device cannot be found, attempt to use the system default

- If `null` is provided
  - Attempt to use the system default

- If `undefined` is provided
  - Do not touch that media type (`audio`, `video`, or `output`)


#### Video-specific session level events

See [WebRTC Video Conferencing].

[1]: https://developer.mypurecloud.com/api/rest/v2/notifications/index.html
[WebRTC SoftPhone]: softphone.md
[WebRTC Screen Share]: screenshare.md
[WebRTC Video Conferencing]: video.md
[softphone behavior notes]: softphone.md#softphone-behavior-notes
[Device ID Support]: device-id-support