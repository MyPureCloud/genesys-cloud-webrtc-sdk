# Genesys Cloud WebRTC SDK Softphone

This SDK supports creating or receiving inbound/outbound WebRTC Softphone audio
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

## Example Usage

After creating an instance of the SDK, your client can add event handlers for
incoming sessions (for inbound or outbound calls). `pendingSession` is an example
of an SDK event. You can answer and control sessions via the SDK methods documented
in [GenesysCloudWebrtcSdk] documentation. Most call control actions, however, should be done via the GenesysCloud Public
API (or the Public API javascript SDK).

Once the client has a session, it can add event handlers for lower level control
over sessions. `terminated` is an example of a session event;
[all session events are detailed here].

Once you have an initialized instance of the WebrtcSdk and events setup, you can create a softphone session in the following manner:

``` ts
await sdk.startSoftphoneSession({phoneNumber: '15555555555'});
```
 ## Softphone Session Methods

 #### `startSoftphoneSession(params: IStartSoftphoneSessionParams)`
 Creates a new softphone call with the given peer or peers.

 Params:
 * `params: IStartSoftphoneSessionParams` - Required: Contains the peers to start the session with. See interfaces below for more details regarding `IStartSoftphoneSessionParams`

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

* phoneNumber?: string - Optional: The phone number to dial.
* callerId?: string - Optional: The caller id phone number for outbound call.
* callerIdName?: string - Optional: The caller id name for outbound call.
* callFromQueueId?: string - Optional: The queue id to place the call on behalf of.
* callQueueId?: string - Optional: The queue id to call.
* callUserId?: string - Optional: The user id to call.
* priority?: number - Optional: The priority of the call.
* languageId?: string - Optional: The language skill id to use for routing call if calling a queue.
* routingSkillsIds?: string[] - Optional: The routing skills ids to use for routing call if calling a queue.
* conversationIds?: string[] - Optional: List of existing conversations to merge into new ad-hoc conference.
* participants?: ISdkSoftphoneDestination[] - Optional: List of participants to add to the call if starting a conference call.
* uuiData?: string - Optional: User to user information managed by SIP session app.



#### `ISdkSoftphoneDestination`
```ts
interface ISdkSoftphoneDestination {
  address: string;
  name?: string;
  userId?: string;
  queueId?: string;
}
```

* address: string - Required: The address or phone number to dial.


## API

See the full list of the [APIs], [methods], and [events].

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
[APIs]: index.md#genesyscloudwebrtcsdk
[methods]: index.md#methods
[events]: index.md#events
[all session events are detailed here]: index.md#session-level-events.
