# Architecture — genesys-cloud-webrtc-sdk

A TypeScript **browser SDK** that wraps `genesys-cloud-streaming-client` to give
consuming apps a high-level API for WebRTC softphone, video, screen-share, and
screen-recording sessions on the Genesys Cloud platform. This doc is the mental
model an agent needs before changing code — it describes what the real modules
do and how a call flows end to end.

## Top-level object

The public entrypoint is `GenesysCloudWebrtcSdk` (`src/client.ts`), exported as
the default from `src/index.ts`. A consumer does:

```ts
const sdk = new GenesysCloudWebrtcSdk(config);
await sdk.initialize();      // fetch org/user, connect streaming client, wire events
// ...drive via public methods + listen to events...
```

`src/index.ts` also re-exports the session handlers, media, types/enums,
`ConversationUpdate`, `SdkError`, and the `utils`/`mediaUtils` namespaces.
`src/client-private.ts` holds the non-public wiring functions (`setupStreamingClient`,
`proxyStreamingClientEvents`, conversation/disconnect handlers) that run with the
SDK as `this`.

## Module map

| Path | Responsibility |
|------|----------------|
| `src/client.ts` | Public `GenesysCloudWebrtcSdk` — config, `initialize()`, public API (start/accept/end/mute/hold, device + volume control), org/user/station fetch. |
| `src/client-private.ts` | Streaming-client setup, event proxying, conversation-update + disconnect/reconnect handling, orphaned-session cleanup. |
| `src/sessions/session-manager.ts` | Routes pending sessions, session-inits, and public requests to the right **handler** by session type or JID. Owns `pendingSessions`. |
| `src/sessions/base-session-handler.ts` | Shared handler plumbing: accept/addMedia/terminate, the base propose/proceed/reject. Handlers extend it. |
| `src/sessions/softphone-session-handler.ts` | Softphone call flow — the largest handler. Propose/accept, conversation-update state machine, persistent connection / line-appearance, mute/hold/end via the platform API. |
| `src/sessions/video-session-handler.ts` | Video conference/meeting — start, join, mute, screen-share, pin participant, data-channel messages. |
| `src/sessions/screen-share-session-handler.ts` | ACD (guest) screen share. |
| `src/sessions/screen-recording-session-handler.ts` | Screen recording sessions + metadata. |
| `src/sessions/live-monitoring-session-handler.ts` | Live screen monitoring (observer/target). |
| `src/media/media.ts` | `SdkMedia` — device enumeration, getUserMedia/getDisplayMedia, device-change handling. The browser hardware boundary. |
| `src/media/media-utils.ts` | Pure media helpers (attach audio, track checks). |
| `src/headsets/*` | Headset orchestration, wraps `softphone-vendor-headsets` (WASM hardware SDKs). |
| `src/audio-processor/*` | Optional outbound audio processing (noise reduction). |
| `src/conversations/conversation-update.ts` | `ConversationUpdate` — normalizes a raw Hawk conversation event into participants/calls/videos. |
| `src/stats-aggregator.ts` | Per-session WebRTC stats aggregation. |
| `src/types/*` | `interfaces.ts`, `enums.ts` (`SdkErrorTypes`, `SessionTypes`, `CommunicationStates`, `MediaHandling`), `libs.ts`. |
| `src/utils.ts` | `SdkError`, `createAndEmitSdkError`, `requestApi`/`requestApiWithRetry`, JID predicates. |

## Initialization lifecycle (`initialize()`)

1. **Fetch identity** (unless guest/JWT): `fetchOrganization()` + `fetchAuthenticatedUser()`
   → `requestApiWithRetry` GETs `/organizations/me` and `/users/me`.
2. **`setupStreamingClient`** (`client-private.ts`): builds `IClientOptions`
   (host `wss://streaming.${environment}` unless `wsHost`), constructs
   `StreamingClient`, connects (`maxConnectionAttempts: Infinity`), resolves when
   the `connected` event fires.
3. **`proxyStreamingClientEvents`**: constructs the `SessionManager`, subscribes
   to `v2.users.{id}.conversations`, and wires webrtc events →
   session-manager methods (see below).
4. **Activate allowed session types** (`addAllowedSessionType` per type; softphone
   fetches the user's station), init headset, then `emit('ready')`.
5. **Error classification** (the one branch to respect): a `StreamingClientError`
   invalid_token or an AxiosError 401/403 → `SdkErrorTypes.invalid_token`;
   anything else → `SdkErrorTypes.initialization`. All thrown AND emitted on
   `sdkError`.

## Inbound event flow (how a call arrives)

Streaming-client events are proxied in `proxyStreamingClientEvents` to the
`SessionManager`:

- `requestIncomingRtcSession` → `onPropose` → routes to a handler by JID →
  handler decides whether to emit `pendingSession` or auto-proceed.
- `incomingRtcSession` → `onSessionInit` → handler `handleSessionInit`.
- `cancelIncomingRtcSession` / `handledIncomingRtcSession` →
  `onCancelPendingSession` / `onHandledPendingSession`.
- Notification `v2.users.{id}.conversations` → `handleConversationUpdate` →
  wraps the raw event in `ConversationUpdate` → `sessionManager.handleConversationUpdate`
  → each enabled handler processes it (softphone's is the big state machine).

## Session routing

`SessionManager.getSessionHandler` resolves a handler two ways:
- by explicit `sessionType`, or
- by **JID** via each handler's `shouldHandleSessionByJid` (softphone = `*gjoll*`,
  video = `*@conference*` peer/agent, acd screen share = `acd-*`, screen
  recording = `screenrecording-*`, live monitor = `livemonitor-*`).

This JID routing is real behavior a black-box test must respect — a session's
`peerID`/jid determines which handler (and therefore which platform-API calls)
run. See `ai/test-standards.md`.

## Outward boundaries (what gets mocked in tests)

- **Platform API over HTTP** — `requestApi`/`requestApiWithRetry` → streaming-client
  `HttpClient` → `axios`. Base host = `sdk._config.environment`.
- **Streaming transport** — the `StreamingClient` websocket + webrtc events.
- **Browser hardware** — `SdkMedia` (getUserMedia/getDisplayMedia) + headsets.

Everything between the public API and those boundaries is the SDK's own logic and
runs for real in integration tests.

## Reconnect handling

On streaming `disconnected`, the SDK snapshots active session IDs
(`_preDisconnectSessionIds`). On the next `connected`, `cleanupOrphanedSessions`
terminates any snapshotted session whose peer connection is now dead
(prevents leaked listeners/tracks). Live peer connections are kept.
