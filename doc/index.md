# PureCloud WebRTC SDK Documentation

## Feature Index

- [WebRTC SoftPhone](softphone.md)
- [WebRTC Screen Share](screenshare.md)

## API

#### App Authorization

To use the SDK with OAuth scopes, you will need the following scopes enabled:
 - authorization
 - conversations
 - organizations
 - notifications

These can be set in PureCloud > Admin > Integrations > OAuth > Scope.  Note that the scope options are not available when the "Grant Type" option is set to "Client Credentials"

#### Behavior notes

- By default, the SDK will keep all active sessions active if the WebSocket disconnects.
It is the consuming application's responsibility to end all pending or active sessions after a
disconnect in the event that it doesn't recover. This behavior can be disabled by providing
`sessionSurvivability: false` in the SDK constructor options. If this is set to false, if
the WebSocket connection drops, all active WebRTC connections will be disconnected.

#### Constructor

`new PureCloudWebrtcSdk(options)`

- parameters
  - `Object options` with properties:
    - `String environment`: Required; `mypurecloud.com || mypurecloud.ie ||
        mypurecloud.jp || mypurecloud.de || mypurecloud.com.au`
    - One of the following is required:
      - `String accessToken`: access token for the authenticated user
      - `String organizationId`: organization ID (used for unauthenticated user)

    Advanced options:
    - `Boolean sessionSurvivability`: **not yet supported**: Optional, default true; see Behavior Notes
        above
    - `Boolean autoAnswerOutboundCalls`: **not yet supported**: Optional, default true; See [softphone behavior notes](softphone.md#softphone-behavior-notes)
    - `Boolean autoConnectSessions`: Optional, default true; whether or not
        the SDK should auto connect the sessions.
    - `Array[IceServerConfiguration] iceServers`: Custom ICE server configuration.
        See https://developer.mozilla.org/en-US/docs/Web/API/RTCIceServer/urls
    - `RTCConfiguration iceTransportPolicy`: Set the ICE transport policy
        See https://developer.mozilla.org/en-US/docs/Web/API/RTCConfiguration
    - `String logLevel`: Optional, desired log level. Available options: `debug`, `log`, `info`, `warn`, `error`
    - `Object logger`: Optional, desired logger. Default, `console`. Must contain methods: `debug`, `log`, `info`, `warn`, `error`
    - `String wsHost`: Optional, websocket host


#### Methods

`sdk.intialize(options) : Promise<void>` - Initialize the WebSocket connection for streaming
connectivity with PureCloud. Initialize must be called before any events will trigger.
  - paramaters
    - `Object options`: Optional; with properties
      - `String securityCode`: Optional; one-time security code used to authenticate guest users

`sdk.startScreenShare() : Promise<void>` - Start sharing the guest user's screen.

`sdk.acceptPendingSession(id, opts) : void` - Accept an incoming RTC session proposal.
Should be called automatically for outbound calls.

- parameters
  - `String id`: the id from the `pendingSession` event
  - `Object opts`: **not yet supported**; with properties:
    - `MediaStream mediaStream`: Optional; stream to use for input audio. If not
        provided, the SDK will start media capture for a default stream.
    - `HTMLAudioElement audioElement`: Optional; the audio tag to use for attaching
        audio. If not provided, an `<audio>` element will be created and appended
        to the `<body>`. This element will be hidden.


- Examples:
  - `sdk.acceptPendingSession(id)`
    - SDK will start media, attach it to the session, and connect

  Not yet supported:
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

`sdk.reconnect() : void` - Tear down the WebSocket connection to PureCloud (if active) and reconnect it.
This does not hangup or disconnect active WebRTC Session calls.

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
