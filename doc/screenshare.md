# Genesys Cloud WebRTC SDK Screen Share

This SDK supports guests/unauthenticated users the ability to share their screen. The API uses a temporary security code to allow a guest to establish a session.

> Screen share does not support authenticated users

## Session Flow

WebRTC Screen Share sessions should be automatically accepted by the consuming guest application. A valid `organizationId`, 
`conversationId`, and `securityCode` are required to start a screen share session.

## API

* See [sdk.startScreenShare()] for usage
* See the full list of the [APIs], [methods], and [events].

## Example Usage
An instance of the SDK must be created with an `organizationId` passed in as an option. 
Once a `securityCode` is received (required for guest users), the SDK can be initialized.

If the user cancels/denies the screen share, the error will need to be handled by the consuming appication. 
`autoConnectSessions` must be set to `true` (which is default) in order to automatically connect the guest session.

``` ts
import { GenesysCloudWebrtcSdk } from 'genesys-cloud-webrtc-sdk';

const sdk = new GenesysCloudWebrtcSdk({
  organizationId: 'your-org-guid', // required for guests
  environment: 'mypurecloud.com',
  autoConnectSessions: true // default is true
});

// this will authenticate using the securityCode
//  and setup the needed WebSocket for the session
sdk.initialize({ securityCode: 'one-time-security-code' })
  .then(() => {
    // this will initiate the needed webrtc session
    //  and prompt the user to select a screen to share
    return sdk.startScreenShare();
  })
  .catch(err => {
    // handle errors which could be but not limited to:
    //  connection errors, user canceled screen prompt,
    //  bad securityCode/orgId, or some other non-related error
  });
```

Note about the `securityCode`s – they can only be used one time. If `sdk.startScreenShare()` throws
an error for any reason, a new security code will need to be requested. 

[APIs]: index.md#genesyscloudwebrtcsdk
[sdk.startScreenShare()]: index.md#startscreenshare
[methods]: index.md#methods
[events]: index.md#events
