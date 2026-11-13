# Genesys Cloud WebRTC SDK Demo App

### Overview

This application is intended to demonstrate various functionalities of the WebRTC SDK and be a tool for testing, debugging, and development. The application was built using React, TypeScript, and Vite.


**The application is currently a work in progress and does not support all SDK functionality**

Implemented functionality:
- WebRTC Softphone (inbound/outbound)
- Media/device management

In progress or missing:
- Video
- Screenshare

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
`npm run build:demo` (from the SDK root, after `npm run build`) builds this app into `dist/demo/react/`, which the pipeline deploys to `webrtc-sdk/demo/react/` on the SDK CDN (prod: https://sdk-cdn.mypurecloud.com/webrtc-sdk/demo/react/).
