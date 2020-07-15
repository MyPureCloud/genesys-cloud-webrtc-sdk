[![Build Status](https://travis-ci.com/MyPureCloud/genesys-cloud-webrtc-sdk.svg?branch=master)](https://travis-ci.com/MyPureCloud/genesys-cloud-webrtc-sdk)
[![npm version](https://badge.fury.io/js/genesys-cloud-webrtc-sdk.svg)](https://badge.fury.io/js/genesys-cloud-webrtc-sdk)
[![codecov](https://codecov.io/gh/MyPureCloud/genesys-cloud-webrtc-sdk/branch/master/graph/badge.svg)](https://codecov.io/gh/MyPureCloud/genesys-cloud-webrtc-sdk)
[![dependabot-status](https://flat.badgen.net/dependabot/MyPureCloud/genesys-cloud-webrtc-sdk/?icon=dependabot)](https://dependabot.com)

# Genesys Cloud WebRTC SDK

### Overview
The Genesys Cloud WebRTC SDK is a client library for connecting to Genesys Cloud WebRTC
services. Supported WebRTC Features:

- WebRTC SoftPhone (Authenticated Business User/Agent Telephony - inbound/outbound, etc)
- WebRTC Screen Share (Unauthenticated User/Guest)

Demo: https://sdk-cdn.mypurecloud.com/webrtc-sdk/demo/webpack/ 
- Demo requires Genesys Cloud Credentials for video. Organization id and security key are required for unauthenticated screen share.

Not yet supported:

- WebRTC Video
- WebRTC Screen Share (Authenticated Business User/Agent Telephony)
- WebRTC Screen Recording
- WebRTC Click-to-Call (Unauthenticated user SoftPhone, Telephony)

### Usage

Module import:

- `npm install --save genesys-cloud-webrtc-sdk`

```js
const GenesysCloudWebrtcSdk = require('genesys-cloud-webrtc-sdk');
const sdk = new GenesysCloudWebrtcSdk({
  accessToken: 'your-access-token'
});
sdk.initialize();
```

Or via global module

```html
<script src="https://sdk-cdn.mypurecloud.com/webrtc-sdk/latest/genesys-cloud-webrtc-sdk.bundle.min.js"></script>
<script>
  const sdk = new window.GenesysCloudWebrtcSdk({
    accessToken: 'your access token'
  });
  sdk.initialize();
</script>
```

### Documentation

Documentation is in doc/documentation.md and available on the Genesys Cloud Developer Center
at [DeveloperCenter][1] and in the [documentation](/doc/index.md) in this repo.


### Contributing

This repo uses [typescript semistandard][2] for code style and [Jest][3] for tests and code coverage.

To get started in development:
```sh
npm install
npm run test:watch
```

Test will rebuild as source or tests change. All linting and tests must
pass 100%, and coverage should remain at 100%.

### Testing
Run the tests using `npm test` in the command line

[1]: https://developer.mypurecloud.com/api/webrtcsdk/
[2]: https://github.com/bukalapak/tslint-config-semistandard
[3]: https://jestjs.io/en/
