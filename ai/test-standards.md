# Test Standards — genesys-cloud-webrtc-sdk

Repo-specific testing standards. This is a **TypeScript browser SDK** (a library,
not an HTTP service) built with **Jest + ts-jest**, running under **jsdom**. The
SDK wraps `genesys-cloud-streaming-client` and talks to the Genesys Cloud
platform API over HTTP (via `axios`, under the hood of streaming-client's
`HttpClient`).

Two kinds of tests, two different jobs. Get the distinction right before writing
either.

---

## Unit tests — white box

- **Can see inside the code.** A unit test instantiates one class/function in
  isolation and is free to mock that unit's internal collaborators — individual
  methods, injected deps, sibling modules — to drive a specific branch.
- Live in `test/unit/**`.
- This is the right tool for:
  - **Pure logic** (helpers in `src/utils.ts`, participant/call-state selection,
    diff functions).
  - **The hardware / browser layer** that an IT cannot drive: `src/media/media.ts`
    (`getUserMedia`, `AudioContext`), `src/headsets/*` (WASM hardware SDKs),
    `src/stats-aggregator.ts`, `src/audio-processor/*`, `windows11-first-session-hack.ts`.
    These need heavy DOM/hardware mocks and are correctly unit-tested — do NOT
    force them into ITs.
- Coverage gate is **100%** (`jest.config.js`); units carry most of it.

## Integration tests (IT) — black box

- **Cannot see inside the code.** An IT communicates with the SDK only the way a
  real external consumer would: construct the public `GenesysCloudWebrtcSdk`
  object, call its public methods, or feed in the inbound events
  streaming-client delivers (propose, conversation updates, etc.).
- **All outward calls are mocked at the boundary**, never by spying an SDK
  method. Outward calls are:
  - **HTTP to the platform API** → a real mock HTTP server (see recipe below).
  - **The streaming-client transport (websocket/events)** → the module mock
    (`jest.mock('genesys-cloud-streaming-client', ...)`), which is the socket
    boundary's stand-in.
  - **Hardware** (media/headset) → `jest.mock('../../src/media/media')` etc., the
    hardware boundary's stand-in.
- Live in `test/integration/**`. Shared helpers live in
  `test/integration/support/` (excluded from `testMatch` via
  `testPathIgnorePatterns`).
- **The rule that falls out of black-box:** if you are spying a method of the
  thing under test, stop — that is a white-box move and belongs in a unit test.
  The only mocks an IT installs are at the outward boundary.

## Four tells an "IT" is really a white-box unit test

Learned the hard way on this repo's PR review. "Boot the real SDK, mock only
externals" is necessary but NOT sufficient — any of these makes a test white-box
and, usually, a duplicate of an existing `test/unit/**` case:

1. **Spying a method of the unit under test** — `jest.spyOn(handler, 'x')`,
   including stubbing `super` via `Object.getPrototypeOf(Object.getPrototypeOf(h))`.
2. **Stubbing the collaborator that does the asserted thing** — e.g. stubbing
   `getSessionHandler` then asserting the handler was called never tests routing.
   Drive the real lookup (a session whose jid/type selects the handler) instead.
3. **The assertion survives deleting the production guard** — if a stub or an
   un-awaited async path makes it pass regardless, it asserts nothing. For
   debounced/`setTimeout` emits (e.g. `createAndEmitSdkError`'s `setTimeout(0)`,
   `debouncedEmitCallError`'s 500ms), use fake timers and advance past both or
   the `not.toHaveBeenCalled` is meaningless.
4. **It duplicates a unit test** — `test/unit/sessions/*` is 100% covered;
   a spy-based IT over the same branch is overhead. Cover the OUTWARD behavior
   (real request/event at the boundary) the unit test can't.

If a flow has no reachable outward edge without a fake `RTCPeerConnection`/media
harness (acd screenshare, live monitoring, screen-recording accept), do NOT fake
a spy-based IT — file a ticket for the harness instead (see known limits).

---

## The mock-server recipe (black-box HTTP ITs)

This is the TS analog of the JVM team's WireMock ITs — stub the downstream,
drive the SDK, verify the outbound request **and** the SDK's reaction. No JVM,
no Docker, no extra runtime deps.

**Why it needs two pieces of setup:** the SDK is a browser library, so tests run
under **jsdom** (`window` must exist). But a real mock server needs a real
socket, and jsdom's XHR won't reliably reach one. The fix: keep jsdom, and force
axios onto its **node `http` adapter** so the SDK's real request hits the socket.

Helpers (already in the repo):
- `test/integration/support/mock-api-server.ts` — `MockApiServer`, a zero-dep
  `node:http` server on an ephemeral port. Records requests, stubs responses,
  resets per test.
- `test/integration/support/black-box-harness.ts` — `installHttpMockServer()`,
  which wires the server lifecycle + `axios.defaults.adapter = 'http'`.

How the URL lands: the SDK builds requests from `sdk._config.environment`.
`HttpClient._buildUri` uses the host verbatim when it starts with `http`, so
setting `environment = api.baseUrl` (`http://127.0.0.1:<port>`) makes the SDK
issue real requests to `http://127.0.0.1:<port>/api/v2/<path>`.

```ts
import { installHttpMockServer } from './support/black-box-harness';

describe('Softphone outbound calls (black-box, mock server)', () => {
  const api = installHttpMockServer();           // starts server, forces http adapter
  let handler: SoftphoneSessionHandler;

  beforeEach(() => {
    const sdk = new SimpleMockSdk() as any;
    sdk._config.environment = api.baseUrl;        // point the SDK at the real server
    sdk._config.accessToken = 'test-token';
    handler = new SoftphoneSessionHandler(sdk, new SessionManager(sdk));
  });

  it('setAudioMuteSendsMutedPatchToParticipant', async () => {
    api.stub('patch', /\/participants\/p-mute$/, { status: 200, body: {} });

    await handler.setAudioMute(session, { conversationId, mute: true });

    const patch = api.received('patch')[0];        // assert the OUTBOUND request
    expect(patch.path).toBe(`/api/v2/conversations/calls/${conversationId}/participants/p-mute`);
    expect(patch.body).toEqual({ muted: true });
    expect(patch.headers.authorization).toBe('Bearer test-token');
  });
});
```

Negative paths are driven by the server returning a real error status
(`api.stub('patch', /.../, { status: 409 })`) and asserting the SDK's reaction
(the thrown `SdkErrorTypes`, no event emitted, no dirty state).

Reference files: `sdk-init-http-failures.test.ts`, `softphone-http.test.ts`,
`video-http.test.ts`.

---

## Rules

1. **Separate suites.** Units in `test/unit/**`, ITs in `test/integration/**`.
   Support/helpers in `test/integration/support/` (not matched as suites).
2. **One IT file per feature/flow**, named for it (`softphone-http`,
   `sdk-init-http-failures`, `session-manager-flows`). Behavior-named tests
   (`setAudioMuteSendsMutedPatchToParticipant`, `throwsInvalidTokenOn401FromOrgFetch`),
   never `test1`/`testPost`.
3. **Boot the real thing.** Construct the real SDK / real handler. Never mock the
   SDK's own session-manager, handlers, or the method under test.
4. **Mock only the outward boundary** — platform HTTP via the mock server,
   streaming-client + media/headset via module mocks.
5. **Assert async with bounded waits, never `sleep`.** Use `flushPromises`
   (`() => new Promise(process.nextTick)`) or a one-shot
   `new Promise(res => sdk.once('event', res))`. Note `createAndEmitSdkError`
   emits `sdkError` on a `setTimeout(0)` — the throw is synchronous, the event is
   a tick later; collect it with `once`, don't read a spy immediately.
6. **Assert error TYPE, and the negative.** Errors carry an `SdkErrorTypes`
   discriminator — assert `.rejects.toHaveProperty('type', SdkErrorTypes.invalid_token)`,
   not a message string (the logger prepends `[webrtc-sdk]`). On failure paths,
   also assert what must NOT happen (`ready` not emitted, downstream not called).
7. **Unique ids per test** (`crypto.randomUUID()`). Jest shares module-level
   mocks across a file; hardcoded ids collide.
8. **`--runInBand`.** The SDK uses shared module-level mocks; parallel workers
   cross-contaminate. (This is the library analog of "serial unless isolation is
   proven".)
9. **Lint test files too.** Mock-heavy files use the repo convention
   `/* eslint @typescript-eslint/no-explicit-any: "off" */` at the top.

---

## What is black-box vs. a documented fallback

| Tier | Meaning | Examples here |
|------|---------|---------------|
| **Black-box (ideal)** | Drive public surface; mock only the outward edge; assert the outbound request + the SDK's reaction. | `sdk-init-http-failures`, `softphone-http`, `video-http`, and event-in/event-out tests (`softphone-conversation-update`, `session-manager-flows`). |
| **Gray-box (fallback, labelled)** | Asserts an internal delegation hop because the true outward edge is only reachable through the media / peerConnection / jingle stack this harness does not fake. | `session-manager-routing`, `media-device-loss`, the `[gray-box] delegatesX` tests. |

Gray-box tests are **explicitly banner-labelled** in their files as the fallback,
not the pattern to copy. They exist so the routing/device-loss branches aren't
left uncovered. The real fix (a fake `RTCPeerConnection`/media harness) is the
documented next investment; once it exists, those should move to black-box.

### Known limits
- **5xx / 429 init failures are not IT-tested.** `requestApiWithRetry` retries
  them with backoff, so a persistently-failing mock server makes the SDK retry
  for many seconds — that tests retry *timing*, not classification. Covered
  cases are the deterministic, non-retried **401/403** (→ `invalid_token`).
  Retry/backoff behavior, if needed, belongs in a client-layer **unit** test.
- **The media/jingle-gated flows** (full `acceptSession`/`handleSessionInit`
  media path, video `handleConversationUpdateForSession`, screen-share
  `startSession`, `base-session-handler`) need a fake peerConnection/media
  harness to reach black-box. Until then they stay gray-box or unit.

---

## Running

```bash
npm install --registry=https://registry.npmjs.org   # GitHub repo — public npm, not Nexus
npm test                                             # lint + full unit+IT suite (100% gate)
npx jest test/integration --runInBand --collectCoverage=false          # ITs only
npx jest test/integration/softphone-http --runInBand --collectCoverage=false   # one file
npm run lint                                         # ESLint over src (run on test files explicitly if needed)
```

Docker/JVM are **not** required — the mock server is `node:http`.
