## PureCloud WebRTC SDK

### Overview
The PureCloud WebRTC SDK is a client library for connecting to PureCloud WebRTC
services. Supported WebRTC Features:

- WebRTC SoftPhone (Authenticated Business User/Agent Telephony - inbound/outbound, etc)
- WebRTC Screen Share (Unauthenticated User/Guest)

Demo: https://sdk-cdn.mypurecloud.com/webrtc-sdk/demo/webpack/ (requires PureCloud Credentials)

Not yet supported:

- WebRTC Video
- WebRTC Screen Share (Authenticated Business User/Agent Telephony)
- WebRTC Screen Recording
- WebRTC Click-to-Call (Unauthenticated user SoftPhone, Telephony)

### Usage

Module import:

- `npm install --save purecloud-webrtc-sdk`

```js
const PureCloudWebrtcSdk = require('purecloud-webrtc-sdk');
const sdk = new PureCloudWebrtcSdk({
  accessToken: 'your-access-token'
});
sdk.initialize();
```

Or via global module

```html
<script src="https://sdk-cdn.mypurecloud.com/webrtc-sdk/latest/purecloud-webrtc-sdk.js"></script>
<script>
  const sdk = new window.PureCloudWebrtcSdk({
    accessToken: 'your access token'
  });
  sdk.initialize();
</script>
```

### Documentation

Documentation is in doc/documentation.md and available on the PureCloud Developer Center
at [DeveloperCenter][1] and in the [documentation](/doc/documentation.md) in this repo.


### Contributing

This repo uses [typescript semistandard][2] for code style and [Jest][3] for tests and code coverage.

To get started in development:
```sh
npm install
npm run watch-tests
```

Test will rebuild as source or tests change. All linting (semistandard) and tests must
pass 100%, and coverage should remain at 100%.

### Testing
Run the tests using `npm test` in the command line

[1]: https://developer.mypurecloud.com/api/webrtcsdk/
[2]: https://github.com/bukalapak/tslint-config-semistandard
[3]: https://jestjs.io/en/
