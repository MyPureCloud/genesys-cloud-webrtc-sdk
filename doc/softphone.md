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

## Persistent Connection Notes


TODO:
* looking for `"purpose": "user"` most recent
* use softphone handler `getParticipantForSession` – actually just save the most recent softphone event
* answering `data: JSON.stringify({ state: 'connected' })`
* hanging up `data: JSON.stringify({ state: 'disconnected' })`


Convo with Garrett:
* We can turn on an org setting to only use one single persistent connection (meaning new calls will come through on this one)
* if we have an active (persistent) session we always use converation events
  * we have to watch for connection states
  * `alerting` – assume non-auto answer
  * `connecting` – assume we answered (or is auto answer if we haven't emitted pending)
  * NOTE: we will receive `disconnected` and then another event for `terminated` (usually).
  * `connected` – emit `sessionStarted` and drop `sdk.acceptSession()` on the floor (maybe create a session info as an immutable)
   `disconnected | terminated` (unsure) (disconnect reason "timeout" – retract)

# Persistent Connection Working Progress
* Only applicable for softphone
* If there is no active persistant connection, it will behavior as normal (propose, session-accept, session-terminate, etc)
* If there _is_ an active persistant connection and a new call comes in:
    * Will emit `pendingSession` – should be `alerting` for autoanswer = false
    * `acceptPendingSession(pendingSessionId)` will send a `PATCH` to update the conversation. state = `connected`
    * `rejectPendingSession(pendingSessionId)` will send a `PATCH` to update the conversation. state = `terminated` **CHECK**
    * Once a conversation event is received saying the call was answered, `sdk.on('sessionStarted')` will emit the _original_ webrtc session with the new conversationId.
    * `sessionEnd(sessionId)` will send a `PATCH` to update the conversation (state `disconnected`) _and_ emit `sdk.on('sessionEnded')` with the existing persistent connection webrtc session with `isPersistentConnection: true` and `active: boolean` can be checked.
    * when the webrtc session finally expires, `sdk.on('sessionEnded')` will still emit the session but `active: boolean` will be false.
    * any subsequent calls answered while there is already a call using the persistent connection will receive a new webrtc session and will _not_ use the persistent connection webrtc session. **CHECK**
* make sure when a new converstion is active make sure to update the `session.conversationId`
  * whatever conversation is `connected` will be the conversationId on the session
* Josh Rucker for conversation update questions
  * double check with Josh to see if our `user` participant `calls[]` will only ever have 1 call in there
    * could have more than one if doing outbound and customer has multiple phone numbers
    * only one should be in a `alerting | contacting | connected` state
  * the last participant in is the most recent
    * yes
  * difference between `disconnected` and `terminated`

* if we have an active per/conn, and receive a new call and accept we now have two sessions.

## To Do
* [x] fetch station
  * [ ] what happens when the user does not have a station?
* [ ] acceptPendingSession (conversationId or sessionId) – breaking change
* [ ] rejectPendingSession (conversationId or sessionId) – breaking change
* [ ] acceptSession
* [ ] endSession
* [x] What happens if we have an active per/conn and we receive another inbound?
  * should use the same persistent connection
* [x] What convo event do we get with an inbound autoanswer call while we have an active persistent connection
  * ~~all calls are autoanswer with persistent connection~~
  * inbound collaborate calls are not autoanswer
  * ACD calls are configured on the user level for autoanswer
  * outbound calls should be autoanswer (dialing/contacting)
  * ACD calls with autoanswer ON, we can't really tell if auto-answer is ON from convo events. We get `alerting` and then `connected`. May not be an issue because we could emit `pendingSession` with autoanswer=false and then turn around and emit `sessionStarted` when it goes to `connected`... but the consumer _could_ reject the pending session...
* document caveats for persistent connection:
  * `config.autoConnectSessions` will do nothing if you already have a persistent connection
  * `acceptSession` will do nothing if you already have a persistent connection
    * NOTE: you must `acceptSession` the initial session
  * if using peristent connection, you should use `conversationId` to accept/reject/end sessions (since the session ID will be the same – could cause unpredictable results)
    * (maybe) remove the use of accepting session with `sessionId`.
  *   autoanswer may not be correct for inbound calls. It will just answer it regardless of consumer action.
* callState `held` or something... what to do with this
* sending two `sessionEnded` events when ending (because we are sending `disconnected` and `terminated`)
* [ ] add `hold` function to the client
* [ ] keep conversation history, call states, and session info in one place...
  * [ ] add `conversationEvent` and `conversationActive` events to the sdk (for softphone)
* [ ] keep the conversationId on the session in sync with the active conversation
  * if only one – use it
  * if two – use the `connected` one
  * if both are `connected`, use the one that is not `"hold"` or `held: true`
  * if both are are `held`, pick one? Or level whatever one is most recent
* [ ] check web-dir to see if persistent connection with the new single-P/C

* do not throw an error in `initialize` if station returns 404. drop log message
* listen to station topic
  * associated
  * disassociated
* what about softphone conference calls

top level event
* persistentConnectionEnable: boolean
* added
* removed
* current
  * conversationId
  * sessionId
* active conversation (maybe – )

## Demo app
* on queue
* hold call
* list of calls (active & pending)
* call state
* sessionStarted emitted 3 times
* mute call button (does not mute the correct call – have two calls and try to mute the non-active one)
* remove pending session from ui

* ending does not emit sessionEnded
  * scenario: two calls – end both. The last one does not end.

* contacting or alerting is `pendingSession`

## Have not tested
* reject pending sessions
* non-persistent connection ending multiple calls (and other functionality)

## Option
What if we didn't try to shoe horn all the conversation updates for a persistent connection into the standard events? Reasons:
* the conversationId on the pc session will not be gauranteed to be accurate – so the consumer will have to manage that state or cross reference to the `sdkConversationEvents` that we will emit.
* Since we are already emitting `sdkConversationEvents`, why don't we just solely use that event for any conversation events on the pc session...
  * potential issue is what to do with `pendingSessions` on a PC...


## Call appearance
SDK needs to emit an event if using the "new" way
If CA > 1, use the old method (no conversation events – ever)
If CA == 1, use conversation events ALWAYS (if we have)

Emit station events too... "associated", "disassociated"... maybe similar to the other thing
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

[GenesysCloudWebrtcSdk]: index.md#genesyscloudwebrtcsdk
[sdk.startSoftphoneSession()]: index.md#startsoftphonesession
[APIs]: index.md#genesyscloudwebrtcsdk
[methods]: index.md#methods
[events]: index.md#events
[all session events are detailed here]: index.md#session-level-events.
