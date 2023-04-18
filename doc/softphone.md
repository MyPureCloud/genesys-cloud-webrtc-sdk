# Genesys Cloud WebRTC SDK Softphone

This SDK supports creating or receiving inbound/outbound WebRTC Softphone audio
sessions. The API is used in conjunction with the public API for call controls.

When initiating a conversation that will use a WebRTC session, the call is placed
via the Public API, and an incoming request will be evented via the SDK.

It is up to the consuming application to link the outbound session returned from
the API request and push notification events to the WebRTC session by comparing
`conversationId` properties. The incoming session will include a `conversationId`
attribute with the associated `conversationId`.

## WebRTC SDK Softphone Index
This documentation expands upon the [GenesysCloudWebrtcSdk] documention but is specific to
softphone calls and conferencing. See the full list of the [APIs], [methods], and [events].

* See [sdk.startSoftphoneSession()] for usage
* [Example usage](#example-usage)
* [Softphone Session Methods](#softphone-session-methods)

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

## Example Usage

After creating an instance of the SDK, your client can add event handlers for
incoming sessions (for inbound or outbound calls). `pendingSession` is an example
of an SDK event. You can answer and control sessions via the SDK methods documented
in [GenesysCloudWebrtcSdk](index.md#genesyscloudwebrtcsdk) documentation. Most call control actions, however, should be done via the GenesysCloud Public
API (or the Public API javascript SDK).

Once the client has a session, it can add event handlers for lower level control
over sessions. `terminated` is an example of a session event;
[all session events are detailed here](index.md#session-level-events).

Once you have an initialized instance of the WebrtcSdk and events setup, you can create a softphone session in the following manner:

``` ts
await sdk.startSoftphoneSession({phoneNumber: '15555555555'});
```
 ## Softphone Session Methods

 #### `startSoftphoneSession(params: IStartSoftphoneSessionParams)`
 Creates a new softphone call with the given peer or peers.

 Params:
 * `params: IStartSoftphoneSessionParams` - Required: Contains the peers to start the session with. See interfaces below for more details regarding `IStartSoftphoneSessionParams`

 Returns: a promise with an object containing the `id` and `selfUri` for the conversation.

### Interfaces

#### `IStartSoftphoneSessionParams`
Contains the peer information for the outbound call.

```ts
interface IStartSoftphoneSessionParams {
  phoneNumber?: string;
  callerId?: string;
  callerIdName?: string;
  callFromQueueId?: string;
  callQueueId?: string;
  callUserId?: string;
  priority?: number;
  languageId?: string;
  routingSkillsIds?: string[];
  conversationIds?: string[];
  participants?: ISdkSoftphoneDestination[];
  uuiData?: string;
}
```

* `phoneNumber?: string` - Optional: The phone number to dial.
* `callerId?: string` - Optional: The caller id phone number for outbound call.
* `callerIdName?: string` - Optional: The caller id name for outbound call.
* `callFromQueueId?: string` - Optional: The queue id to place the call on behalf of.
* `callQueueId?: string` - Optional: The queue id to call.
* `callUserId?: string` - Optional: The user id to call.
* `priority?: number` - Optional: The priority of the call.
* `languageId?: string` - Optional: The language skill id to use for routing call if calling a queue.
* `routingSkillsIds?: string[]` - Optional: The routing skills ids to use for routing call if calling a queue.
* `conversationIds?: string[]` - Optional: List of existing conversations to merge into new ad-hoc conference.
* `participants?: ISdkSoftphoneDestination[]` - Optional: List of participants to add to the call if starting a conference call.
* `uuiData?: string` - Optional: User to user information managed by SIP session app.

#### `ISdkSoftphoneDestination`
```ts
interface ISdkSoftphoneDestination {
  address: string;
  name?: string;
  userId?: string;
  queueId?: string;
}
```

* `address: string` - Required: The address or phone number to dial.

## API

See the full list of the [APIs](index.md#genesyscloudwebrtcsdk), [methods](index.md#methods), and [events](index.md#events).

#### Softphone behavior notes

- In the case of an outbound call, the application initiating the call should
automatically accept the pending session, which should have a conversationId
that matches the conversationId in the response to the request to place the call.
Alternatively, a client designed to handle all outbound call connections can
immediately accept pending sessions for outbound calls. If two such applications
are running simultaneously, there will be a race condition for which instance
actually connects the call audio.

- When a client sends a POST to conversations/calls (from its desired client)
for a conversation to the Public API, asynchronously, it will receive a pending
session event from the SDK and a response from the public API with the `conversationId`
for the conversation. If only handling outbound calls placed by your client, these
can be correlated by conversationId together, and should not be expected to
arrive in a guaranteed order.

- If you wish to control the MediaStream settings (i.e., input device) you can
provide it as an option to `acceptSession` or as a default in the sdk's constructor.

## V7 and Line Appearance
v7 of the SDK introduces functionality to handle different Line Appearance values on the station.
As such, this only applies to softphone sessions.

This is a performance enhancement for the server and helps streamline the use of Persistent Connection
within the SDK. Eventually, all stations will be migrated over to Line Appearance == 1
(currently the default is 100). Clients should implement the SDK v7 to ensure the migration
goes smoothly and no interruptions are experienced.

### What Is Line Appearance?
Line Appearance  is how many concurrent active webrtc sessions a user is allowed to have at a given time.
Line Appearance will usually be **1** or **100**.
For example:
* If Line Appearance > 1 (ie. 100)
  * Each webrtc phone call will receive its own Webrtc Session. Meaning if there are
  3 active webrtc phone calls, there will be 3 corresponding Webrtc sessions.
* If Line Appearancee == 1
  * All conversations will be multiplexed on the same session reducing local resource use as well as
    improving call connection times. Only the audio from the active conversation will be heard and sent.
    For example, if you have an active call and you answer or place another call, the original call will be
    put on hold and the new call will become the active conversation.

### Session Flows for Different Line Appearances

**With Line Appearance == 100** (current default):
* Each session will receive standard session events (`pendingSession`, `sessionStarted`, `sessionEnded`, etc).

**With Line Appearance == 1** (eventual new default):
* With no active session
  * The session will receive standard session events
* With an existing active session
  * The new session(s) will not receive standard session events, but instead will watch converversation events
  and emit "mocked" events based on the conversation events (meaning, `pendingSession`, `sessionStarted`, `sessionEnded`, etc
  will still be emitted from the SDK).
* Persistent connection is not really affected when LA == 1. Having it enabled will keep the session alive after the call ends, making
  the second bullet the more used case.

### How Does This Affect Clients Using the SDK?
If your application is using the SDK, you will want to update to v7 to make sure you do
not miss the necessary code for the migration.

1. Make all the necessary adjustments to avoid the breaking changes ([see changelog v7](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/blob/master/changelog.md#v700))
1. If you are _not_ using **persistent connection** on the station, there are no immediate breaking changes. However,
  be sure to look over the [conversationUpdate event](index.md/#conversationupdate). It is _highly_ recommended that
  your application start utilizing this event as the `conversationId` on the session will no longer be reliable
  when Line Appearance == 1 (see conversationUpdate event docs for details). Please note that the normal SDK events
  (`sessionStarted`, `sessionEnded`, etc) will still always be emitted.
1. If you _are_ using **persistent connection** (this is less common) – Since the SDK did not support persistent connection
  until v7, your application would have had to listen to the conversation events and respond appropriately. Now that
  the SDK is configured to support persistent connection, there are two options:
    1. Cut over to completely rely on the `conversationUpdate` and normal SDK events (`sessionStarted`, `sessionEnded`, etc).
    2. If you would like your application to keep its own, already built logic for persistent connection, there are
      a few new utilities to help out. You can use [isConcurrentSoftphoneSessionsEnabled()](index.md#isConcurrentSoftphoneSessionsEnabled)
      and ['concurrentSoftphoneSessionsEnabled'](index.md#concurrentSoftphoneSessionsEnabled). There is also
      [isPersistentConnectionEnabled()](index.md#isPersistentConnectionEnabled) which is available.

> Note: **Persistent connection** _with_ **Line Appearance > 1** is _not_ fully supported due to the imminent migration
> to **Line Appearance == 1** as the default for Webrtc stations. It was taken into consideration and should work. However,
> there may still be edge cases that will not be covered. Feel free to open bug reports of any found issues, but it is
> not guaranteed they will be fixed.


[GenesysCloudWebrtcSdk]: index.md#genesyscloudwebrtcsdk
[sdk.startSoftphoneSession()]: index.md#startsoftphonesession
[APIs]: index.md#genesyscloudwebrtcsdk
[methods]: index.md#methods
[events]: index.md#events
[all session events are detailed here]: index.md#session-level-events.
