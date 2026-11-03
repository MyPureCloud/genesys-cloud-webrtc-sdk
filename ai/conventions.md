# Coding Conventions — genesys-cloud-webrtc-sdk

Patterns an agent must follow to match existing code. These are observed from the
source, not invented — mirror them rather than introducing new styles.

## Errors: always `SdkError` via `createAndEmitSdkError`

Do NOT throw raw `Error`s from SDK logic. Use the helper in `src/utils.ts`:

```ts
throw createAndEmitSdkError.call(this, SdkErrorTypes.session, 'message', { details });
```

- It constructs an `SdkError` (with a `type` discriminator), **emits it on
  `sdkError`**, and returns it (caller decides to throw or not).
- Emission is async — it fires on `setTimeout(0)`. The throw is synchronous; the
  `sdkError` event arrives a tick later. (Tests must account for this — see
  `ai/test-standards.md`.)
- Pick the right `SdkErrorTypes` (`src/types/enums.ts`): `invalid_token`,
  `invalid_options`, `not_supported`, `session`, `call`, `media`, `http`,
  `initialization`, `generic`. Error **type** is the contract consumers branch
  on — choose deliberately.
- Layered reporting is expected: e.g. a failed platform request emits an `http`
  SdkError from the request layer, and the caller may then emit a more specific
  type (an init 401 emits `http` then `invalid_token`). Don't try to suppress the
  lower-layer emission.

## HTTP: go through the utils helpers

Never call `axios` or `_http` directly from feature code. Use:
- `requestApi.call(this.sdk, path, opts)` — single request, rejects on error
  (and emits an `http` SdkError).
- `requestApiWithRetry.call(this.sdk, path, opts)` — returns a `{ promise }`
  RetryPromise; retries 5xx/429/network with backoff. Use for idempotent reads
  (org/user/station). Be aware the retry makes failure cases slow.

Host/auth are injected from `sdk._config` by `buildRequestApiOptions`; pass
`method`, `data`, `authToken`/`noAuthHeader` as needed. Paths are relative
(`/conversations/calls/...`); the client prefixes `https://api.${host}/api/v2`
(or uses an `http://...` host verbatim — which is how the test mock server works).

## Events: typed emitter

The SDK is a strict event emitter. Emit public events (`ready`, `connected`,
`disconnected`, `pendingSession`, `sessionStarted`, `sessionEnded`,
`conversationUpdate`, `cancelPendingSession`, `handledPendingSession`,
`sdkError`, `trace`, `station`, `resolutionUpdated`, etc.) rather than inventing
ad-hoc callbacks. When adding an event, add it to the typed event map so
consumers get types.

## Enums over string literals

Use `SessionTypes`, `CommunicationStates`, `MediaHandling`, `SdkErrorTypes` from
`src/types/enums.ts`. Note `SessionTypes` is re-exported from
`genesys-cloud-streaming-client`; `SessionTypes.acdScreenShare` serializes to the
string `"screenShare"` — assert against the enum, never a hand-typed literal.

## Logging

Use `this.log(level, message, details)` inside handlers (routes to `sdk.logger`)
or `this.sdk.logger[level](...)`. The logger prepends a `[webrtc-sdk]` prefix, so
never assert on exact log strings. Pass structured `details` objects
(conversationId, sessionId, sessionType) — match the existing shape. Use the
`{ skipServer: true }` option on high-volume/debug logs as existing code does.

## Session handlers

- Extend `BaseSessionHandler`; set `sessionType` and implement
  `shouldHandleSessionByJid`.
- Reuse the base `handlePropose`/`proceedWithSession`/`rejectPendingSession`/
  `acceptSession` and only override what differs.
- For a session type that cannot do something, throw
  `SdkErrorTypes.not_supported` (see screen-share/recording/live-monitor
  `updateOutgoingMedia`).

## Types

Add/extend interfaces in `src/types/interfaces.ts`. Keep the public config
(`ISdkConfig`) and request/param shapes there. Prefer discriminated unions and
`Pick`/`Omit` over `any`. In non-test source, `any` is disallowed by ESLint;
test files opt out with a file-level disable (see test-standards).

## Style

- 2-space indent, single quotes, semicolons (match the files + `.editorconfig`).
- ESLint (`.eslintrc.json`) is the gate on `src`; run `npm run lint` before PR.
- Keep changes minimal and local; this SDK is consumed widely, so avoid
  gratuitous refactors or new dependencies.
