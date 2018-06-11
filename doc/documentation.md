# WebRTC Softphone SDK

This SDK supports receiving inbound and outbound WebRTC Softphone audio
sessions. The API is used in conjunction with the public API for call controls.

When initiating a conversation that will use a WebRTC session, the call is placed
via the Public API, and an incoming request will be evented via the SDK.

It is up to the consuming application to link the outbound session returned from
the API request and push notification events to the WebRTC session by comparing
`conversationId` properties. The incoming session will include a `conversationId`
attribute with the associated `conversationId`.

## Session Flow


WebRTC Softphone sessions use an initiation/discovery flow before media is
established in order that a user might decide which client (i.e., device or
browser tab) will be used to establish the session media.

The two primary differences for incoming calls and outbound calls are:

1. Outbound placed calls should be automatically accepted on the client that
requested the outbound call, or by a client designed to handle all outbound calls.
2. Outbound calls require an initial REST request to the public API to initiate.

```text
Outbound

Alice                       Public API           WebRTC SDK
   |                            |                     |
   |    make new call (1)       |                     |    1. POST to api/v2/conversation/calls
   +--------------------------->|                     |
   |                            |                     |
   |   return conversationId*   |                     |
   |<---------------------------+                     |
   |                            |    propose* (2)     |    2. Event on SDK (see events below)
   |<-------------------------------------------------+
   |                            |                     |
   |    proceed (3)             |                     |    3. Sent by accepting the proposed session
   +------------------------------------------------->|
   |                            |                     |
   |                            |    initiate (4)     |    4. Full session details in an event on SDK
   |<-------------------------------------------------|
   |     accept (5)             |                     |    5. Sent by accepting the session
   +------------------------------------------------->|       (programmatically, or automatically based on config)
   |                            |                     |
```

```text
Inbound

Alice                     Push Notifications    WebRTC SDK
   |                            |                  |
   |      notification* (1)     |                  |    1. A pub sub notification pushed to client via Notifications
   |<---------------------------+                  |       API websocket with incoming call details^
   |                            |   propose* (2)   |    2. Event on SDK (see events below)
   |<----------------------------------------------+
   |                            |                  |
   |       proceed (3)          |                  |    3. Sent by accepting the proposed session
   +---------------------------------------------->|
   |                            |                  |
   |                            |  initiate (4)    |    4. Full session details in an event on SDK
   |<----------------------------------------------|
   |     accept (5)             |                  |    5. Sent by accepting the session
   +---------------------------------------------->|       (programmatically, or automatically based on config)
   |                            |                  |
```
\* denotes asynchronous events/responses and order is not guaranteed.
\^ denotes optional API usage outside of the SDK to get complete conversation details

## Usage

After creating an instance of the SDK, your client can add event handlers for
incoming sessions (for inbound or outbound calls). `pendingSession` is an example
of an SDK event. You can answer and control sessions via the SDK methods documented
below. Most call control actions, however, should be done via the PureCloud Public
API (or the Public API javascript SDK).

Once the client has a session, it can add event handlers for lower level control
over sessions. `terminated` is an example of a session event; all session events
are detailed below.

## API

###### Behavior notes

- By default, the SDK will keep all active sessions active if the WebSocket disconnects.
It is the consuming application's responsibility to end all pending or active sessions after a
disconnect in the event that it doesn't recover. This behavior can be disabled by providing
`sessionSurvivability: false` in the SDK constructor options. If this is set to false, if
the WebSocket connection drops, all active WebRTC connections will be disconnected.

- In the case of an outbound call, the application initiating the call should
automatically accept the pending session, which should have a conversationId
that matches the conversationId in the response to the request to place the call.
Alternatively, a client designed to handle all outbound call connections can
immediately accept pending sessions for outbound calls. If two such applications
are running simultaneously, there will be a race condition for which instance
actually connects the call audio.

- When a client sends a POST to conversations/calls (from her desired client)
for a conversation to the Public API, asynchronously, she will receive a pending
session event from the SDK and a response from the public API with the `conversationId`
for the conversation. If only handling outbound calls placed by your client, these
can be correlated by conversationId together, and should not be expected to
arrive in a guaranteed order.

- If you wish to control the MediaStream settings (i.e., input device) you can
provide it as an option to `acceptPendingSession`. Note that to do this for outbound
calls, you'll have to disable `autoAnswerOutboundCalls` and answer them yourself
when the event is triggered

#### Constructor

`new PureCloudWebrtcSdk(options)`

- parameters
  - `Object options` with properties:
    - `String accessToken`: Required; access token for the user
    - `String environment`: Required; `mypurecloud.com || mypurecloud.ie ||
        mypurecloud.jp || mypurecloud.de || mypurecloud.com.au`
    - `String orgId`: Required; guid for your organization - found in Admin >
        Organization Settings

    Advanced options:
    - `Boolean sessionSurvivability`: Optional, default true; see Behavior Notes
        above
    - `Boolean autoAnswerOutboundCalls`: Optional, default true; See Behavior Notes
    - `Boolean autoConnectSessions`: Optional, default true; whether or not
        the SDK should auto connect the sessions after answering or outbound.
    - `Array[IceServerConfiguration] iceServers`: Custom ICE server configuration.
        See https://developer.mozilla.org/en-US/docs/Web/API/RTCIceServer/urls
    - `RTCConfiguration iceTransportPolicy`: Set the ICE transport policy
        See https://developer.mozilla.org/en-US/docs/Web/API/RTCConfiguration

#### Methods

`sdk.intialize() : Promise<void>` - Initialize the WebSocket connection for streaming
connectivity with PureCloud. Initialize must be called before any events will trigger.

`sdk.acceptPendingSession(id, opts) : void` - Accept an incoming RTC session proposal.
Should be called automatically for outbound calls.

- parameters
  - `String id`: the id from the `pendingSession` event
  - `Object opts`: with properties:
    - `MediaStream mediaStream`: Optional; stream to use for input audio. If not
        provided, the SDK will start media capture for a default stream.
    - `HTMLAudioElement audioElement`: Optional; the audio tag to use for attaching
        audio. If not provided, an `<audio>` element will be created and appended
        to the `<body>`. This element will be hidden.


- Examples:
  - `sdk.acceptPendingSession(id)`
    - SDK will start media, attach it to the session, and connect
  - `sdk.acceptPendingSession(id, { autoStartMedia: false, autoConnectSession: false })`
    - handle all media and session events yourself
  - `sdk.acceptPendingSession(id, { mediaStream: stream, autoConnectSession: true })`
    - SDK will attach your MediaStream to the session, and connect
  - `sdk.acceptPendingSession(id, { autoStartMedia: true })`
    - SDK will start media, attach it to the session, but not connect


`sdk.endSession(opts) : Promise<void>` - Disconnect an active session

- parameters
    - `Object opts`: object with one of the following properties set:
      - `String id`: the id of the session to disconnect
      - `String conversationId`: the conversationId of the session to disconnect

`sdk.disconnect() : void` - Tear down the WebSocket connection to PureCloud.
This does not hangup or disconnect active WebRTC Session calls.

#### Events

`sdk.on('pendingSession', ({id, address, conversationId, autoAnswer}) => {})` - a
call session is being initiated for an outbound or inbound call

- arguments
    - `Object` with properties:
       - `String id`: the unique Id for the session proposal; used to accept or
     reject the proposal
       - `String address`: the address of the caller
       - `String conversationId`: id for the associated conversation to link to the
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

##### Session level events.

Session level events are events emitted from the `session` objects themselves,
not the SDK instance library. These can be used if you want lower level access
and control.

`session.on('terminated', (session, reason) => {})` - the session was terminated

- arguments
    - `Session session` - the session that triggered the event
    - `string reason` - the reason that the session was terminated; valid values
  are found [here](http://xmpp.org/extensions/xep-0166.html#def-reason)

`session.on('change:connectionState', (session, connectionState) => {})` - the session's connection
state has changed

- arguments
    - `Session session` - the session that triggered the event
    - `string connectionState`

`session.on('change:interrupted', (session, interrupted) => {})` - the session's interrupted state
has changed

- arguments
     - `Session session` - the session that triggered the event
     - `Boolean interrupted` - the new interrupted state of the session

`session.on('change:active', (session, active) => {})` - the session's active state
has changed

- arguments
     - `session` - the session that triggered the event
     - `Boolean active` - the new active state of the session

`session.on('endOfCandidates' () => {})` - signals the end of candidate gathering; used to check for
potential connection issues

[1]: https://developer.mypurecloud.com/api/rest/v2/notifications/index.html
