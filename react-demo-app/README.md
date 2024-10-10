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

