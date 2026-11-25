# Genesys Cloud WebRTC SDK Demo App

### Overview

This application is intended to demonstrate various functionalities of the WebRTC SDK and be a tool for testing, debugging, and development. The application was built using React, TypeScript, and Vite.


**The application is currently a work in progress and does not support all SDK functionality**

Implemented functionality:
- WebRTC Softphone (inbound/outbound)
- Media/device management
- Video conferences: join a room by JID and show the customer's video
- SDK status: the last SDK error and the streaming connection state
- Interaction log of completed calls

In progress or missing:
- Screenshare

### Selectors for automated tests
These `data-testid` values are a stable interface for browser tests; they do not depend on CSS or Spark markup. The SDK error and connection signals are shown on every screen, including sign-in, so an error from a failed `initialize()` is visible; the video view and interaction log appear after sign-in.

| Signal | Selector | Meaning |
|---|---|---|
| Last SDK error | `sdk-error` | `data-state="none"` before any `sdkError`, `"error"` after one. |
| | `sdk-error-type`, `sdk-error-message` | The last `sdkError`'s `type` and `message`, replaced by each new error; empty while `none`. |
| Connection | `connection-state` | Text `connected` after the SDK `connected` event, `not connected` initially and after `disconnected`; `data-connected` is `"true"` or `"false"`. |
| Video | `video-session` | `data-state="active"` while a video session (`collaborateVideo`) runs, `"none"` otherwise. |
| | `customer-video` | The `<video>` element the SDK video session handler attaches the customer's video to (`acceptSession({ videoElement })`); hidden while `video-session` is `none`. |
| | `video-room-jid`, `video-join` | Room JID input and the button that calls `startVideoConference`; disabled while a join is pending or a session is active. The view shows one video session; another `collaborateVideo` session started meanwhile is not accepted. |
| Interaction log | `interaction-log` | `data-count` is the number of completed calls logged. |
| | `interaction-log-entry` | One row per completed call; `data-conversation-id` is its conversation ID. |
| | `interaction-log-conversation-id`, `interaction-log-end-reason`, `interaction-log-final-state` | The call's conversation ID, end reason (the `sessionEnded` reason condition, such as `success`) and final state (the call state, such as `disconnected`, for a softphone call; `ended` for a video session); `unknown` when the SDK did not supply it. |

A softphone call is logged when it leaves the SDK's `conversationUpdate` (in `removed`), taking its end reason from the `sessionEnded` of the same session; a video session is logged at its `sessionEnded`. Active calls are not logged, and the log is cleared on reload.

### Authentication
In order to access the demo app, a Genesys Cloud token is required - after initial authentication, users can be implicitly authenticated and can bypass the manual authentication.
### Installation & Local Development
```
cd react-demo-app
npm install
npm run dev
```

If testing locally made changes within the SDK, you must build the SDK first.
```sh
# SDK
npm run build
# Demo app
cd react-demo-app
npm install
npm run dev
```


### Audio processor testing
Audio processors such as Iris are licensed and are not part of the published demo. To test one locally, install it without saving it to `package.json` and create `src/audioProcessor.local.ts` (gitignored), which default-exports a function returning an `IAudioProcessor`:
```ts
// src/audioProcessor.local.ts
import { GenesysIrisClient } from 'genesys-iris-client';
import licenseText from './assets/iris.lic?raw';
import keyText from './assets/iris.key?raw';

export default async () => new GenesysIrisClient({ company: 'GENESYS_TEST', key: keyText, license: licenseText, team: 'Dev Team', user: 'Dev' });
```
```sh
npm install --no-save ../../genesys-iris-sdk/genesys-iris-client-<version>.tgz
```

### CDN
`npm run build:demo` (from the SDK root, after `npm run build`) builds this app into `dist/demo/`, which the pipeline deploys to `developercenter-cdn/webrtc-sdk/demo/` on the apps CDN:

- dev: https://apps.inindca.com/developercenter-cdn/webrtc-sdk/demo/
- test: https://apps.inintca.com/developercenter-cdn/webrtc-sdk/demo/
- prod: https://apps.mypurecloud.com/developercenter-cdn/webrtc-sdk/demo/

These URLs are registered as redirect URIs on the demo's OAuth client; logging in from any other path will be rejected. `sdk-cdn.<env>.com/webrtc-sdk/demo/` is a legacy bucket the pipeline no longer deploys to.
