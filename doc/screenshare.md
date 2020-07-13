# WebRTC Screen Share SDK

This SDK supports guests/unauthenticated users the ability to share their screen. The API uses a temporary security code to allow a guest to establish a session.

## Session Flow

WebRTC Screen Share sessions should be automatically accepted by the consuming guest application. A valid `conversationId` and `securityCode` are required to start a screen share session.

## API

See the full list of the [APIs], [methods], and [events].

## Usage

An instance of the SDK must be created with an `organizationId` passed in as an option. Once a `securityCode` is received (required for guest users), the SDK can be initialized.

If the user cancels/denies the screen share, the error will need to be handled by the consuming appication. It is recommended to set `autoConnectSessions` to `true` in order to automatically connect the guest session.

#### Example Usage

``` javascript
const sdk = new window.GenesysCloudWebrtcSdk({
  organizationId: 'your-org-id', // required for guests
  environment: 'mypurecloud.com',
  autoConnectSessions: true // default true
});

sdk.initialize({ securityCode: 'one-time-security-code' })
  .then(() => {
    return sdk.startScreenShare();
  })
  .catch(err => {
    // handle errors (connection, media denied, etc)
  });
```

[APIs]: index.md#api
[methods]: index.md#methods
[events]: index.md#events
