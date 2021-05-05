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
- WebRTC Video (Authenticated Business User)

Demo: https://sdk-cdn.mypurecloud.com/webrtc-sdk/demo/webpack/ 
- Demo requires Genesys Cloud Credentials for video. Organization id and security key are required for unauthenticated screen share.

Not yet supported:

- WebRTC Video (Unauthenticated User/Guest)
- WebRTC Screen Share (Authenticated Business User/Agent Telephony)
- WebRTC Screen Recording
- WebRTC Click-to-Call (Unauthenticated user SoftPhone, Telephony)

### Installation

``` sh
# npm 
npm install --save genesys-cloud-webrtc-sdk
# yarn
yarn genesys-cloud-webrtc-sdk
```

See [documentation][4] for usage and implementation details.

### Documentation

Documentation is available in the [documentation][4] of this repository and on the Genesys Cloud Developer Center
at [DeveloperCenter][1]. 

> Note: due to the constant development on the SDK, it is recommended to always reference the documentation in this repository as that will always be the most up-to-date information regarding the SDK. There can be delays in the updating of documentation on the Developer Center. 

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
[4]: /doc/index.md
