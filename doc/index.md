# Genesys Cloud WebRTC SDK Documentation

## WebRTC SDK Index

- [Feature Index](#feature-index) (for more in-depth documetation about specific WebRTC features)
- [GenesysCloudWebrtcSdk](#genesyscloudwebrtcsdk)
  - [Example usage](#example-usage)
  - [Constructor](#constructor)
  - [Properties](#properties)
  - [Methods](#methods)
  - [Events](#events)
- [GenesysCloudMediaSession]
  - [Session level events](#session-level-events)
- [SdkError Class]

## Feature Index

- [WebRTC SoftPhone]
- [WebRTC Video Conferencing]
- [WebRTC Screen Recording]
- [WebRTC Media] (media, devices, and permissions support)
- [WebRTC Headset Integration]

### App Authorization

To use the SDK with OAuth scopes, you will need the following scopes enabled:

- authorization
- conversations
- organizations
- notifications

These can be set in Genesys Cloud > Admin > Integrations > OAuth > Scope. Note that the scope options are not available when the "Grant Type" option is set to "Client Credentials"

### Special Build Considerations

The SDK uses some 3rd packages that rely on builtin node specific modules. The SDK does not bundle these into
its standard esModule and commonjs builds (entry points `""` and `""` respectfully). It is expected that the consuming
application will bundle and polyfill the necessary node modules. However, there are two SDK builds that will bundle and
polyfill these modules.

1.  The CDN bundle will bundle and polyfill all necessary modules to be ready for in-browser use. Simply pull in the
    SDK via the CDN URL, and it will be available on the `window` object (see below for example usage).

2.  An ES Module build is pre-bundled with all dependencies and polyfills. This is not ideal as the final bundle size
    will be larger. However, some build tools may have issues when trying to bundle and polyfill the SDK. In order to
    opt-in to using this bundled ES Module build, add this to your build file (example provided is for `rollup`):

        ``` js
        // rollup.config.js
        import resolve from '@rollup/plugin-node-resolve';

        export default {
          plugins: [
            resolve({
              mainFields: [
                'es:bundle', // this will load the SDK es bundle – must be first
                'module', // this can be which ever order is desired
                'esnext',
                'main'
              ]
            })
          ]
        };
        ```

---

## GenesysCloudWebrtcSdk

### Example Usage

This is a very basic usage of the WebRTC SDK. Be sure to read through the documentation for more advanced usage.

For an authenticated user, a valid **accessToken** is required on construction. The following example is for an authenticated user.

```js
import { GenesysCloudWebrtcSdk } from 'genesys-cloud-webrtc-sdk';

const sdk = new GenesysCloudWebrtcSdk({
  accessToken: 'your-access-token'
});

// Optionally set up some SDK event listeners (not an exhaustive list)
sdk.on('sdkError' (event) => { /* do stuff with the error */ });
sdk.on('pendingSession' (event) => { /* pending session incoming */ });
sdk.on('sessionStarted' (event) => { /* a session just started */ });

sdk.initialize().then(() => {
  // the web socket has connected and the SDK is ready to use
});
```

You can also access the latest major version (or a specific version) via the CDN. Example:

> NOTE: since v6.1.7, you must specify at least the **desired major version**. The current version (v6.1.6),
> which is deployed at `{rootUrl}/webrtc-sdk/genesys-cloud-webrtc-sdk.js`, will remain at this location.
> However, it will no longer update to newer versions. If using this "latest" URL, please update to at least a major version URL.

```html
<!-- latest release of a major version -->
<script src="https://sdk-cdn.mypurecloud.com/webrtc-sdk/v6/genesys-cloud-webrtc-sdk.bundle.min.js"></script>
<!-- or specified version -->
<script src="https://sdk-cdn.mypurecloud.com/webrtc-sdk/v6.1.7/genesys-cloud-webrtc-sdk.bundle.min.js"></script>

<!-- then access the sdk via the window object -->
<script>
  /* in v7, all files are exported under the `window.GenesysCloudWebrtcSdk` */
  const sdk = new window.GenesysCloudWebrtcSdk.GenesysCloudWebrtcSdk({...}); // same usage as above
  /* OR – these are the same export of the SDK Client class */
  const sdk = new window.GenesysCloudWebrtcSdk.default({...});
</script>
```

---

### `constructor`

```ts
constructor(config: ISdkConfig);
```

The `ISdkConfig`'s interface definition:

```ts
interface ISdkConfig {
  environment?: string;
  accessToken?: string;
  jwt?: string;
  organizationId?: string;
  wsHost?: string;
  autoConnectSessions?: boolean;
  autoAcceptPendingScreenRecordingRequests?: boolean;
  jidResource?: string;
  disableAutoAnswer?: boolean;
  logLevel?: LogLevels;
  logger?: ILogger;
  logFormatters?: LogFormatterFn[];
  optOutOfTelemetry?: boolean;
  useHeadsets?: boolean;
  originAppName?: string;
  originAppVersion?: string;
  originAppId?: string;
  allowedSessionTypes?: SessionTypes[];
  defaults?: {
    audioStream?: MediaStream;
    audioElement?: HTMLAudioElement;
    videoElement?: HTMLVideoElement;
    videoResolution?: {
      width: ConstrainULong;
      height: ConstrainULong;
    };
    videoDeviceId?: string | null;
    audioDeviceId?: string | null;
    audioVolume?: number;
    outputDeviceId?: string | null;
    micAutoGainControl?: ConstrainBoolean;
    micEchoCancellation?: ConstrainBoolean;
    micNoiseSuppression?: ConstrainBoolean;
    monitorMicVolume?: boolean;
  };
}
```

#### `environment`

`environment?: string;`
Domain to use.
Optional: default is `mypurecloud.com`.
Available Options:

```ts
'mypurecloud.com',
  'mypurecloud.com.au',
  'mypurecloud.jp',
  'mypurecloud.de',
  'mypurecloud.ie',
  'usw2.pure.cloud',
  'cac1.pure.cloud',
  'euw2.pure.cloud',
  'apne2.pure.cloud';
```

#### `accessToken`

`accessToken?: string;`
Access token received from authentication. Required for authenticated users (aka agents).

#### `jwt`

`jwt?: string;`
This is tied to some genesys-internal functionality and is not intended for outside use at this point in time.
A genesys-signed jwt can be used to allow limited agent access to the sdk. Currently this only enables
screen-recording and video conferencing functionality. This cannot be used in conjuction with an accessToken or guest access.

#### `organizationId`

`organizationId?: string;`
Organization ID (aka the GUID). Required for unauthenticated users (aka guest).

#### `wsHost`

`wsHost?: string;` Optional: defaults to `wss://streaming.${config.environment}`
WebSocket Host.

#### `autoConnectSessions`

`autoConnectSessions?: boolean;` Optional: default `true`

Auto connect incoming softphone sessions (ie. sessions
coming from `sdk.on('sessionStarted', (evt))`. If set
to `false`, the session will need to be manually accepted
using `sdk.acceptSession({ conversationId })`.

#### `autoAcceptPendingScreenRecordingRequests`

`autoAcceptPendingScreenRecordingRequests?: boolean;` Optional: default `false`

If true, incoming proposes for screen recording sessions will be accepted immediately
and no `pendingSession` event will be emitted. The consumer will still have to react to
`sessionStarted` in order to add screen media and then call `sdk.acceptSession(...)`.

#### `jidResource`

`jidResource?: string;` Optional: default `undefined`

Specify the resource portion of the streaming-client jid. This is likely
only useful for internal purposes. This resource jid should be _somewhat_
unique. Example: setting the jidResource to
`mediahelper_1d43c477-ab34-456b-91f5-c6a993c29f25` would result in full jid
that looks like `<user_bare_jid>/mediahelper_1d43c477-ab34-456b-91f5-c6a993c29f25`.
The purpose of this property is simply a way to identify certain types of clients.

#### `disableAutoAnswer`

`disableAutoAnswer?: boolean;` Optional: default `false`

Disable auto answering softphone calls. By default softphone calls will
respect the `autoAnswer` flag passed in on the `pendingSession` session object.
`autoAnswer` is always `true` for outbound calls and can also be set
in the user's phone settings.

#### `logLevel`

`logLevel?: LogLevels;` Optional: defaults to `'info'`.

Desired log level. Available options:

```ts
type LogLevels = 'log' | 'debug' | 'info' | 'warn' | 'error';
```

#### `logger`

`logger?: ILogger;`
Logger to use. Must implement the `ILogger` interface (see [WebRTC properties](#properties) for `ILogger` definition).

Secondary logger to use. Must implement the `ILogger` interface. Defaults to `console`.

> NOTE: The SDK will always use [GenesysCloudClientLogger]
> which sends logs to the server (unless `optOutOfTelemetry` is `true`) and outputs them to the secondary logger
> (ie. which ever logger was passed in using this config property).

#### `logFormatters`

`logFormatters?: LogFormatterFn[];`
Formatters for intercepting and handling log messages. See
https://github.com/purecloudlabs/genesys-cloud-client-logger#how-formatters-work for more information.

> Note: These formatters also apply to logs that are generated by the embedded streaming client.

#### `optOutOfTelemetry`

`optOutOfTelemetry?: boolean;`
Optional: default `false`.

Opt out of sending logs to the server. Logs are only sent to the server
if the default [GenesysCloudClientLogger] is used. The default logger will
send logs to the server unless this option is `true`

#### `useHeadsets`

`useHeadsets?: boolean;`
Optional: default `true`.

Opt out of initializing the headset functionality included in the SDK.
See the "Headset" documentation of the SDK for more details.

> Note: if `false`, a no-op stub will be used at `sdk.headset` to eliminate
> the need to "null" type check `sdk.headset` before using in code.

#### `originAppName`

`originAppName?: string;`
Optional

This is name of the app that is consuming the SDK. This field is optional and only
used for logging purposes.

#### `originAppVersion`

`originAppVersion?: string;`
Optional

This is the version of the app that is consuming the SDK. This field is optional and only
used for logging purposes.

#### `originAppId`

`originAppId?: string;`
Optional

This is an unique ID from the app that is consuming the SDK. This field is optional and only
used for logging purposes to tie the consuming app client instance with the
SDK's logger instance.

#### `allowedSessionTypes`

`allowedSessionTypes?: SessionTypes[];` Optional: defaults to all session types.

Allowed session types the sdk instance should handle.
Only session types listed here will be handled.
Available options passed in as an array:

```ts
enum SessionTypes {
  softphone = 'softphone',
  collaborateVideo = 'collaborateVideo',
  acdScreenShare = 'screenShare',
}
```

example:

```ts
import { SessionTypes } from 'genesys-cloud-webrtc-sdk';

const sdk = new GenesysCloudWebrtcSdk({
  allowedSessionTypes: [SessionTypes.collaborateVideo, SessionTypes.softphone],
  // other config options
});
```

#### `defaults`

Optional. Defaults for various SDK functionality. See individual options for defaults and usage.

```ts
defaults?: {
    audioStream?: MediaStream;
    audioElement?: HTMLAudioElement;
    videoElement?: HTMLVideoElement;
    videoResolution?: {
      width: ConstrainULong,
      height: ConstrainULong
    };
    videoDeviceId?: string | null;
    audioDeviceId?: string | null;
    audioVolume?: number;
    micAutoGainControl?: ConstrainBoolean;
    micEchoCancellation?: ConstrainBoolean;
    micNoiseSuppression?: ConstrainBoolean;
    outputDeviceId?: string | null;
    monitorMicVolume?: boolean;
  };
```

#### `defaults.audioStream`

`audioStream?: MediaStream;` Optional: no default.

A default audio stream to accept softphone sessions with
if no audio stream was used when accepting the session
(ie: `sdk.acceptSession({ id: 'session-id', mediaStream })`)

> Warning: Firefox does not allow multiple microphone media tracks.
> using a default could cause the SDK to be unable to request any
> other audio device besides the active microphone – which would be the
> audio track on this default stream.

#### `defaults.audioElement`

`audioElement?: HTMLAudioElement;` Optional: no default. (See note about default behavior)

HTML Audio Element to attach incoming audio streams to.

> Default behavior if this is not provided here or at
> `sdk.acceptSession()` is the sdk will create an
> HTMLAudioElement and append it to the DOM

#### `defaults.videoElement`

`videoElement?: HTMLVideoElement;` Optional: no default

HTML Video Element to attach incoming video streams to.
A video element is _required_ for accepting incoming video
calls. If no video element is passed into `sdk.acceptSession()`,
this default element will be used.

#### `defaults.videoResolution`

```ts
videoResolution?: {
  width: ConstrainULong,
  height: ConstrainULong
};
```

Optional: no default.

Video resolution to default to when requesting
video media.

Note: if the resolution causes `getUserMedia()` to fail
(which can happen sometimes in some browsers), the
SDK will retry _without_ the resolution request.
This means this setting may or may not be used if
depending on the browser.
ConstrainULong type definition:

```ts
type ConstrainULong =
  | number
  | {
      exact?: number;
      ideal?: number;
      max?: number;
      min?: number;
    };
```

#### `defaults.videoDeviceId`

`videoDeviceId?: string | null;` Optional: defaults to `null`

Default video device ID to use when starting camera media.

- `string` to request media for specified deviceId
- `null|falsy` to request media system default device

#### `defaults.audioDeviceId`

`audioDeviceId?: string | null;` Optional: defaults to `null`

Default audio device ID to use when starting microphone media.

- `string` to request media for specified deviceId
- `null|falsy` to request media system default device

#### `defaults.audioVolume`

`audioVolume?: number;` Optional: defaults to `100`

Volume level to set on the audio/video elements when attaching media.
This value must be between `0-100` inclusive.

#### `defaults.outputDeviceId`

`outputDeviceId?: string | null;` Optional: defaults to `null`

Default output device ID to use when starting camera media.

- `string` ID for output media device to use
- `null|falsy` to request media system default device
  > Not all browsers support output devices. For supported browsers, system default
  > for output devices is always an empty string (ex: `''`)

#### `defaults.micAutoGainControl`

`micAutoGainControl?: ConstrainBoolean;` Optional: defaults to `true`

Automatic gain control is a feature in which a sound
source automatically manages changes in the volume
of its source media to maintain a steady overall volume level.

```ts
// ConstrainBoolean type
type ConstrainBoolean =
  | boolean
  | {
      exact?: boolean;
      ideal?: boolean;
    };
```

#### `defaults.micEchoCancellation`

`micEchoCancellation?: ConstrainBoolean;` Optional: defaults to `true`

Echo cancellation is a feature which attempts to prevent echo
effects on a two-way audio connection by attempting to reduce
or eliminate crosstalk between the user's output device and
their input device. For example, it might apply a filter that
negates the sound being produced on the speakers from being included
in the input track generated from the microphone.

```ts
// ConstrainBoolean type
type ConstrainBoolean =
  | boolean
  | {
      exact?: boolean;
      ideal?: boolean;
    };
```

#### `defaults.micNoiseSuppression`

`micNoiseSuppression?: ConstrainBoolean;` Optional: defaults to `true`

Noise suppression automatically filters the audio to remove or
at least reduce background noise, hum caused by equipment, and
the like from the sound before delivering it to your code.

```ts
// ConstrainBoolean type
type ConstrainBoolean =
  | boolean
  | {
      exact?: boolean;
      ideal?: boolean;
    };
```

#### `defaults.monitorMicVolume`

`monitorMicVolume?: boolean;` Optional: defaults to `false`

When `true` all audio tracks created via the SDK
will have their volumes monitored and emited on
`sdk.media.on('audioTrackVolume', evt)`.
See the [SDK Media audioTrackVolume event] events for more details.

---

### Properties

#### `VERSION`

Readonly `string` of the SDK version in use.

This is also available as a `static` property: `GenesysCloudWebrtcSdk.VERSION`

#### `logger`

Logger used by the SDK. It will implement the `ILogger` interface. See [constructor](#constructor) for details on how to set the SDK logger and log level.

```ts
interface ILogger {
  /**
   * Log a message to the location specified by the logger.
   *  The logger can decide if it wishes to implement `details`
   *  or `skipServer`.
   *
   * @param message message or error to log
   * @param details any additional details to log
   * @param skipServer should log skip server
   */
  log(message: string | Error, details?: any, skipServer?: boolean): void;
  /** see `log()` comment */
  debug(message: string | Error, details?: any, skipServer?: boolean): void;
  /** see `log()` comment */
  info(message: string | Error, details?: any, skipServer?: boolean): void;
  /** see `log()` comment */
  warn(message: string | Error, details?: any, skipServer?: boolean): void;
  /** see `log()` comment */
  error(message: string | Error, details?: any, skipServer?: boolean): void;
}
```

#### `media`

SDK Media helper instance. See [WebRTC Media] for API and usage.

#### `station`

The current authenticated user's effective Webrtc station. Note, this value will always be `null` unless
`SessionTypes.softphone` is passed into the SDK's `allowedSessionTypes: []` config option. Then, it will
be updated based on the user's effective station in real time. See [Events](#events) for the corresponding
`'station'` event and more information on subscribing to association changes.

Available values: `IStation | null`.

```ts
interface IStation {
  id: string;
  name: string;
  status: 'ASSOCIATED' | 'AVAILABLE';
  userId: string;
  webRtcUserId: string;
  type: 'inin_webrtc_softphone' | 'inin_remote';
  webRtcPersistentEnabled: boolean;
  webRtcForceTurn: boolean;
  webRtcCallAppearances: number;
}
```

---

### Methods

#### `initialize()`

Setup the SDK for use and authenticate the user

- agents must have an accessToken passed into the constructor options
- guests need a securityCode (or the data received from an already redeemed securityCode).
  If the customerData is not passed in this will redeem the code for the data,
  else it will use the data passed in.

Declaration:

```ts
initialize(opts?: {
    securityCode: string;
} | ICustomerData): Promise<void>;
```

Params:

- opts = `{ securityCode: 'shortCode received from agent to share screen' }`
- _or_ if the customer data has already been redeemed using
  the securityCode (this is an advanced usage)
  ```ts
  interface ICustomerData {
    conversation: {
      id: string;
    };
    sourceCommunicationId: string;
    jwt: string;
  }
  ```

Returns: a Promise that is fulled one the web socket is connected
and other necessary async tasks are complete.

#### `startSoftphoneSession()`

Starts a softphone call session with the given peer or peers.

`initialize()` must be called first.

Declaration:

```ts
startSoftphoneSession(softphoneSessionParams: IStartSoftphoneSessionParams): Promise<{id: string, selfUri: string}>;
```

Params:

- `softphoneSessionParams: IStartSoftphoneSessionParams` Required: Contains participant information for placing the call. See [softphone#IStartSoftphoneSessionParams](softphone.md#istartsoftphonesessionparams) for full details on the request parameters.

Returns: a promise with an object containing the `id` and `selfUri` for the conversation.

#### `startScreenShare()`

Start a screen share. Start a screen share. Currently, screen share is only supported
for guest users.

`initialize()` must be called first.

Declaration:

```ts
startScreenShare(): Promise<MediaStream>;
```

Returns: `MediaStream` promise for the selected screen stream

#### `startVideoConference()`

Start a video conference. Not supported for guests. Conferences can
only be joined by authenticated users from the same organization.
If `inviteeJid` is provided, the specified user will receive a propose/pending session
they can accept and join the conference.

`initialize()` must be called first.

Declaration:

```ts
startVideoConference(roomJid: string, inviteeJid?: string): Promise<{
    conversationId: string;
}>;
```

Params:

- `roomJid: string` Required: jid of the conference to join. Can be made up if
  starting a new conference but must adhere to the format:
  `<lowercase string>@conference.<lowercase string>`
- `inviteeJid?: string` Optional: jid of a user to invite to this conference.

Returns: a promise with an object with the newly created `conversationId`

#### `startVideoMeeting()`

Start a video meeting with a meetingId. Not supported for guests. Meetings can
only be joined by authenticated users from the same organization.

`initialize()` must be called first.

Declaration:

```ts
startVideoMeeting(meetingId: string): Promise<{ conversationId: string }>;
```

Params:

- `meetingId: string` Required: meeting id for the meeting to join,
  generated by the Genesys Cloud Public API (functionality currently
  in Preview).

Returns: a promise with an object with the newly created `conversationId`

#### `updateOutputDevice()`

Update the output device for all incoming audio

- This will log a warning and not attempt to update
  the output device if the a broswer
  does not support output devices
- This will attempt to update all active sessions
- This does _not_ update the sdk `defaultOutputDeviceId`

Declaration:

```ts
updateOutputDevice(deviceId: string | true | null): Promise<void>;
```

Params:

- `deviceId: stirng | true | null` Required: `string` deviceId for audio output device,
  `true` for sdk default output, or `null` for system default

Returns: a promise that fullfils once the output deviceId has been updated

#### `updateOutgoingMedia()`

Update outgoing media for a specified session

- `conversationId?`: required if not providing a session. conversationId for which the media should be updated.
- `session?`: required if not providing a conversationId. session for which the media should be updated
- `stream`: if a stream is passed in, the session media will be
  updated to use the media on the stream. This supercedes deviceId(s)
  passed in
- `videoDeviceId` & `audioDeviceId` (superceded by `stream`)
  - `undefined|false`: the sdk will not touch the `video|audio` media
  - `null`: the sdk will update the `video|audio` media to system default
  - `string`: the sdk will attempt to update the `video|audio` media
    to the passed in deviceId

> Note 1: this does not update the SDK default device(s)

> Note 2: if multiple conversations are sharing a session the media for all those conversations will be updated, not just the provided conversationId

> Note 3: if the requested device is _already in use_ by the session, the media will not be re-requested.

Declaration:

```ts
updateOutgoingMedia (updateOptions: IUpdateOutgoingMedia): Promise<void>;
```

Params:

- `updateOptions: IUpdateOutgoingMedia` Required: device(s) to update
- Basic interface:
  ```ts
  interface IUpdateOutgoingMedia {
    session?: IExtendedMediaSession;
    conversationId?: string;
    stream?: MediaStream;
    videoDeviceId?: string | boolean | null;
    audioDeviceId?: string | boolean | null;
  }
  ```
- See [media#IUpdateOutgoingMedia](media.md#iupdateoutgoingmedia) for full details
  on the request parameters

Returns: a promise that fullfils once the outgoing media devices have been updated

#### `updateDefaultDevices()`

Update the default device(s) for the sdk.
Pass in the following:

- `string`: sdk will update that default to the deviceId
- `null`: sdk will update to system default device
- `undefined`: sdk will not update that media deviceId

If `updateActiveSessions` is `true`, any active sessions will
have their outgoing media devices updated and/or the output
deviceId updated.

> Note, if the requested device is _already in use_ by the session, the media will not be re-requested.

If `updateActiveSessions` is `false`, only the sdk defaults will be updated and
active sessions' media devices will not be touched.

Declaration:

```ts
updateDefaultDevices(options?: IMediaDeviceIds & {
    updateActiveSessions?: boolean;
}): Promise<any>;
```

Params:

- `options?: IMediaDeviceIds & {updateActiveSessions?: boolean;}` Optional: defaults to `{}`

  - Basic interface:
    ```ts
    interface IMediaDeviceIds {
      videoDeviceId?: string | null;
      audioDeviceId?: string | null;
      outputDeviceId?: string | null;
      updateActiveSessions?: boolean;
    }
    ```
  - `videoDeviceId?: string | null` Optional: `string` for a desired deviceId.
    `null|falsy` for system default device.
  - `audioDeviceId?: string | null` Optional: `string` for a desired deviceId.
    `null|falsy` for system default device.
  - `outputDeviceId?: string | null` Optional: `string` for a desired deviceId.
    `null|falsy` for system default device.
  - `updateActiveSessions?: boolean` flag to update active sessions' devices

  - If updating the audio device, a call will be made to the headset library to ensure the correct implementation is being used

Returns: a promise that fullfils once the default
device values have been updated

#### `updateDefaultResolution()`

Update the default video resolution

If `updateActiveSessions` is `true`, any active sessions will
have their video's resolutions updated to match the passed in value

If `updateActiveSessions` is `false`, only the sdk defaults will be updated and
active sessions' video resolutions will not be touched

Declaration:

```ts
updateDefaultResolution(resolution: IVideoResolution | undefined, updateActiveSessions: boolean): Promise<any>;
```

Params:

- `resolution: IVideoResolution | undefined`
  - Basic interface:
    ```ts
    interface IVideoResolution {
      width: ConstrainULong;
      height: ConstrainULong;
    }
    ```
  - `width: ConstrainULong` Width of the selected video resolution
  - `height: ConstrainULong` Height of the selected video resolution
- `updateActiveSessions: boolean` Determines if we need to update the
  active sessions or leave them as is

Returns: a promise that fulfills once the default
resolution values have been updated

#### `updateDefaultMediaSettings()`

Update the default media settings that exist in the sdk config.

If `updateActiveSessions` is `true`, any active sessions will
have their outgoing media devices updated and/or the output
deviceId updated.

If `updateActiveSessions` is `false`, only the sdk defaults will be updated and
active sessions' media devices will not be touched.

Declaration:

```ts
updateDefaultMediaSettings(options?: IMediaSettings & {
    updateActiveSessions?: boolean;
}): Promise<any>;
```

Params:

- `options?: IMediaDeviceIds & {updateActiveSessions?: boolean;}` Optional: defaults to `{}`

  - Basic interface:

    ```ts
    interface IMediaSettings {
      micAutoGainControl?: ConstrainBoolean;
      micEchoCancellation?: ConstrainBoolean;
      micNoiseSuppression?: ConstrainBoolean;
      monitorMicVolume?: boolean;
      updateActiveSessions?: boolean;
    }

    type ConstrainBoolean =
      | boolean
      | {
          exact?: boolean;
          ideal?: boolean;
        };
    ```

  - `micAutoGainControl?: ConstrainBoolean` Optional. This will indicate the default audio constraint
    for `autoGainControl` for future media.
    See https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/autoGainControl
  - `micEchoCancellation?: ConstrainBoolean` Optional. This will indicate the default audio constraint
    for `echoCancellation` for future media.
    https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/echoCancellation
  - `micNoiseSuppression?: ConstrainBoolean` Optional. This will indicate the default audio constraint
    for `noiseSuppression` for future media.
    See https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/noiseSuppression
  - `monitorMicVolume?: boolean` Optional. Default setting for emitting `audioTrackVolume` events for future
    media.
  - `updateActiveSessions?: boolean` Optional. Flag to update active sessions' media.

Returns: a promise that fullfils once the default
settings and active sessions have been updated (if specified)

#### `updateAudioVolume()`

Updates the audio volume for all active applicable sessions as well as the default volume for future sessions

Declaration:

```ts
updateAudioVolume (volume: number) {
```

Params:

- `volume: number` Required: Value must be between 0 and 100 inclusive

Returns: void

#### `isPersistentConnectionEnabled()`

Check to see if the user's currently effective station has
persistent connection enabled.

Declaration:

```ts
isPersistentConnectionEnabled(): boolean;
```

Params: none

Returns: a boolean, `true`, if the `station.webRtcPersistentEnabled === true`
and the `station.type === 'inin_webrtc_softphone'`

#### `isConcurrentSoftphoneSessionsEnabled()`

Check to see if the user's currently effective station has
Line Appearance > 1. See the corresponding [concurrentSoftphoneSessionsEnabled](#concurrentsoftphonesessionsenabled) event
under [Events](#events).

For more information about Line Appearance, see [WebRTC SoftPhone].

Declaration:

```ts
isConcurrentSoftphoneSessionsEnabled(): boolean;
```

Params: none

Returns: a boolean, `true`, if `station.webRtcCallAppearances > 1`

#### `setVideoMute()`

Mutes/Unmutes video/camera for a session and updates the conversation accordingly.
Will fail if the session is not found.
Incoming video is unaffected.

When muting, the camera track is destroyed. When unmuting, the camera media
must be requested again.

> NOTE: if no `unmuteDeviceId` is provided when unmuting, it will unmute and
> attempt to use the sdk `defaults.videoDeviceId` as the camera device

Declaration:

```ts
setVideoMute(muteOptions: ISessionMuteRequest): Promise<void>;
```

Params:

- `muteOptions: ISessionMuteRequest` Required:
  - Basic interface
    ```ts
    interface ISessionMuteRequest {
      conversationId: string;
      mute: boolean;
      fromHeadset?: boolean;
      unmuteDeviceId?: string | boolean | null;
    }
    ```
  - `conversationId: string` Required: conversation id to for which perform the action
  - `mute: boolean` Required: `true` to mute, `false` to unmute
  - `fromHeadset?: boolean` Optional: if `true` event came from headset, if `false` event came from consuming app
  - `unmuteDeviceId?: string` Optional: the desired deviceId to use when unmuting,
    `true` for sdk default, `null` for system default,
    `undefined` will attempt to use the sdk default device

Returns: a promise that fullfils once the mute request has completed

#### `setAudioMute()`

Mutes/Unmutes audio/mic for a session and updates the conversation accordingly.
Will fail if the session is not found.
Incoming audio is unaffected.

If fromHeadset is false, a call will be made to the headset library to ensure the connected device's state is properly updated. If fromHeadset is true, no call to the headset library will be made. This is because if the event comes from the headset, its state will already be the most up to date

> NOTE: if no `unmuteDeviceId` is provided when unmuting _AND_ there is no active
> audio stream, it will unmute and attempt to use the sdk `defaults.audioDeviceId`
> at the device

Declaration:

```ts
setAudioMute(muteOptions: ISessionMuteRequest): Promise<void>;
```

Params:

- `muteOptions: ISessionMuteRequest` Required:
  - `conversationId: string` Required: conversation id to for which perform the action
  - `mute: boolean` Required: `true` to mute, `false` to unmute
  - `fromHeadset?: boolean` Optional: if `true` do not call headsets library functions, if `false` call headsets library functions
  - `unmuteDeviceId?: string` Optional: the desired deviceId to use when unmuting,
    `true` for sdk default, `null` for system default,
    `undefined` will attempt to use the sdk default device
  - Basic interface:
    ```ts
    interface ISessionMuteRequest {
      conversationId: string;
      mute: boolean;
      fromHeadset?: boolean;
      unmuteDeviceId?: string | boolean | null;
    }
    ```

Returns: a promise that fullfils once the mute request has completed

#### `setConversationHeld()`

Set a conversation's hold state.

If fromHeadset is false, a call will be made to the headset library to ensure the connected device's state is properly updated. If fromHeadset is true, no call to the headset library will be made. This is because if the event comes from the headset, its state will already be the most up to date

> NOTE: only applicable for softphone conversations

Declaration:

```ts
setConversationHeld(heldOptions: IConversationHeldRequest): Promise<void>;
```

Params:

- `heldOptions: IConversationHeldRequest` Required:
  ```ts
  interface IConversationHeldRequest {
    /** conversation id */
    conversationId: string;
    /** `true` to place on hold, `false` to take off hold */
    held: boolean;
    /** `true` if from headset, `false` if from app */
    fromHeadset?: boolean;
  }
  ```

Returns: a promise that fullfils once the hold request has completed

#### `setAccessToken()`

Set the accessToken the sdk uses to authenticate to the API.

Declaration:

```ts
setAccessToken(token: string): void;
```

Params:

- `token: string` Required: new access token

Returns: void

#### `setJwt()`

Set the JWT the sdk uses to authenticate to the API.

Declaration:

```ts
setJwt(jwt: string): void;
```

Params:

- `jwt: string` Required: new  JWT

Returns: void

#### `setDefaultAudioStream()`

Set the sdk default audioStream. Calling with a falsy value will clear out sdk default.
This will call through to `sdk.media.setDefaultAudioStream(stream);`

Declaration:

```ts
setDefaultAudioStream(stream?: MediaStream): void;
```

Params:

- `stream: MediaStream` – (Optional) media stream to use

Returns: void

#### `acceptPendingSession()`

Accept a pending session based on the passed in ID.

If fromHeadset is false, a call will be made to the headset library to ensure the connected device's state is properly updated. If fromHeadset is true, no call to the headset library will be made. This is because if the event comes from the headset, its state will already be the most up to date

Declaration:

```ts
acceptPendingSession(params: { conversationId: string, fromHeadset: boolean }): Promise<void>;
```

Params:

- `conversationId: string` Required: id of the pending conversation to accept
  - `fromHeadset?: boolean` Optional: if `true` do not call headsets library functions, if `false` call headsets library functions
    Returns: a promise that fullfils once the session accept goes out

#### `rejectPendingSession()`

Reject a pending session based on the passed in ID.

If fromHeadset is false, a call will be made to the headset library to ensure the connected device's state is properly updated. If fromHeadset is true, no call to the headset library will be made. This is because if the event comes from the headset, its state will already be the most up to date

Declaration:

```ts
rejectPendingSession(params: { conversationId: string, fromHeadset: boolean }): Promise<void>;
```

Params:

- `conversationId: string` Required: id of the conversation to reject
- `fromHeadset?: boolean` Optional: if `true` do not call headsets library functions, if `false` call headsets library functions

Returns: a promise that fullfils once the session reject goes out

#### `acceptSession()`

Accept a pending session based on the passed in ID.

Declaration:

```ts
acceptSession(acceptOptions: IAcceptSessionRequest): Promise<void>;
```

Params:

- `acceptOptions: IAcceptSessionRequest` Required: options with which to accept the session
  - Basic interface:
    ```ts
    interface IAcceptSessionRequest {
      conversationId: string;
      mediaStream?: MediaStream;
      audioElement?: HTMLAudioElement;
      videoElement?: HTMLVideoElement;
      videoDeviceId?: string | boolean | null;
      audioDeviceId?: string | boolean | null;
      screenRecordingMetadatas?: ScreenRecordingMetadata[];
    }
    ```
  - `conversationId: string` Required: id of the conversation to accept
  - `mediaStream?: MediaStream` Optional: media stream to use on the session. If this is
    provided, no media will be requested.
  - `audioElement?: HTMLAudioElement` Optional: audio element to attach incoming audio to
    default is sdk `defaults.audioElement`
  - `videoElement?: HTMLAudioElement` Optional: video element to attach incoming video to
    default is sdk `defaults.videoElement`. (only used for video sessions)
  - `videoDeviceId?: string | boolean | null;` Optional: See [ISdkMediaDeviceIds] for full details
  - `audioDeviceId?: string | boolean | null;` Optional: See [ISdkMediaDeviceIds] for full details
  - `screenRecordingMetadatas?: ScreenRecordingMetadata[];` Required for screen recording sessions
    - Basic interface:
      ```ts
      interface ScreenRecordingMetadata {
        trackId: string;
        screenId: string;
        originX: number;
        originY: number;
        resolutionX: number;
        resolutionY: number;
        primary: boolean;
      }
      ```
      - `trackId: string;` The `MediaStreamTrack.id` associated with this screen.
      - `screenId: string;` The id associated with the monitor/screen you are recording. This can often be found at `MediaStreamTrack.getSettings().deviceId`.
      - `originX: number;` The left coordinate for this screen.
      - `originY: number;` The bottom coordinate for this screen. \*NOTE: Windows and Mac sometimes switch where they reference originY. This property is for playback purposes and a Y coordinate of 0 should always represent the bottom of the screen.
      - `resolutionX: number` The width of the screen.
      - `resolutionY: number` The height of the screen.
      - `primary: boolean` This monitor is the system default/primary monitor where the start bar and/or dock lives.

Returns: a promise that fullfils once the session accept goes out

#### `endSession()`

End an active session based on the session ID _or_ conversation ID (one is required)

If fromHeadset is false, a call will be made to the headset library to ensure the connected device's state is properly updated. If fromHeadset is true, no call to the headset library will be made. This is because if the event comes from the headset, its state will already be the most up to date

Declaration:

```ts
endSession(endOptions: IEndSessionRequest): Promise<void>;
```

Params:

- `endOptions: IEndSessionRequest` object with session ID _or_ conversation ID
  - Basic interface:
    ```ts
    interface IEndSessionRequest {
      conversationId: string;
      reason?: JingleReason;
      fromHeadset?: boolean;
    }
    ```
  - `conversationId: string` conversation id of the session to end.
  - `fromHeadset?: boolean` Optional: if `true` do not call headsets library functions, if `false` call headsets library functions
  - `reason?: JingleReason` Optional: defaults to `success`. This is for internal usage and should not be provided in custom applications.

Returns: a promise that fullfils once the session has ended

#### `forceTerminateSession()`

Forcibly end a session by sessionId

Declaration:

```ts
forceTerminateSession(sessionId: string, reason?: JingleReasonCondition): Promise<void>;
```

Params:

- `sessionId: string` id of the session you wish to terminate
- `reason?: JingleReasonCondition` Optional: defaults to `success` The corresponding reason why the session is being terminated.

Returns: a promise that fullfils onces the session is terminated

#### `disconnect()`

Disconnect the streaming connection

Declaration:

```ts
disconnect(): Promise<any>;
```

Params: none

Returns: a promise that fullfils once the web socket has disconnected

#### `destroy()`

Ends all active sessions, disconnects the
streaming-client, removes all event listeners,
and cleans up media.

> WARNING: calling this effectively renders the SDK
> instance useless. A new instance will need to be
> created after this is called.

Declaration:

```ts
destroy(): Promise<any>;
```

Params:

Returns: a promise that fullfils once all the cleanup
tasks have completed

---

### Events

The WebRTC SDK extends the browser version of `EventEmitter`.
Reference the NodeJS documentation for more information. The basic interface that is
inherited by the SDK is:

```ts
interface EventEmitter {
  addListener(event: string | symbol, listener: (...args: any[]) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
  removeListener(
    event: string | symbol,
    listener: (...args: any[]) => void
  ): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;
  removeAllListeners(event?: string | symbol): this;
  setMaxListeners(n: number): this;
  getMaxListeners(): number;
  listeners(event: string | symbol): Function[];
  rawListeners(event: string | symbol): Function[];
  emit(event: string | symbol, ...args: any[]): boolean;
  listenerCount(event: string | symbol): number;
  prependListener(
    event: string | symbol,
    listener: (...args: any[]) => void
  ): this;
  prependOnceListener(
    event: string | symbol,
    listener: (...args: any[]) => void
  ): this;
  eventNames(): Array<string | symbol>;
}
```

The SDK leverages [strict-event-emitter-types](https://www.npmjs.com/package/strict-event-emitter-types) to strongly type available events and their emitted values.

#### `pendingSession`

Emitted when a call session is being initiated for an outbound or inbound call.
`pendingSession` is emitted for all softphone sessions and inbound 1-to-1 video
sessions.

Declaration:

```ts
sdk.on('pendingSession', (pendingSession: IPendingSession) => {});
```

Value of event:

```ts
interface IPendingSession {
  sessionId: string;
  id: string;
  autoAnswer: boolean;
  toJid: string;
  fromJid: string;
  conversationId: string;
  originalRoomJid?: string;
  fromUserId?: string;
  roomJid?: string;
  accepted?: boolean;
  sessionType: SessionTypes | SessionTypesAsStrings;
}
// and where
enum SessionTypes {
  softphone = 'softphone',
  collaborateVideo = 'collaborateVideo',
  acdScreenShare = 'screenShare',
  screenRecording = 'screenRecording',
  unknown = 'unknown',
}
```

- `id: string` & `sessionId: string` – the unique Id for the session proposal; used to accept or reject the proposal
- `autoAnswer: boolean` – whether or not the client should auto answer the session
  - `true` for all outbound calls
  - `false` for inbound calls, unless Auto Answer is configured for the user by an admin
    public api request and/or push notifications
- `fromJid: string` – the jid that the session is coming from
- `toJid: string` – the jid that the session is coming from
- `conversationId: string` – id for the associated conversation object (used in platform API requests)
- `sessionType: SessionTypes` – type of pending session. See [AllowedSessionTypes](#allowedsessiontypes) for a list of available values.
- `originalRoomJid: string` – video specific alternate roomJid (for 1-to-1 video calls)
- `fromUserId?: string` – Optional: the userId the call is coming from (for 1-to-1 video calls)
- `accepted?: boolean` – is used for internal state tracking for sessions that have already attempted to accept
- `roomJid?: string` – is the jid for the webrtc session room

#### `cancelPendingSession`

Emitted when a the call has been canceled due to remote disconnect
or answer timeout

Declaration:

```ts
sdk.on('cancelPendingSession', (event: ISessionIdAndConversationId) => {});
```

Value of event:

- `event: ISessionIdAndConversationId` – Note that `conversationId` is not guaranteed to be present.
  ```ts
  interface ISessionIdAndConversationId {
    sessionId?: string;
    conversationId?: string;
  }
  ```

#### `handledPendingSession`

Emitted when another client belonging to this user
has handled the pending session; used to stop ringing

Declaration:

```ts
sdk.on('handledPendingSession', (event: ISessionIdAndConversationId) => {});
```

Value of event:

- `event: ISessionIdAndConversationId` – Note that `conversationId` is not guaranteed to be present.
  ```ts
  interface ISessionIdAndConversationId {
    sessionId?: string;
    conversationId?: string;
  }
  ```

#### `sessionStarted`

Emitted when negotiation has started; before the
session has connected

Declaration:

```ts
sdk.on('sessionStarted', (session: IExtendedMediaSession) => {});
```

Value of event:

- `session: IExtendedMediaSession` – the session that has started. See [GenesysCloudMediaSession] for details on the session object.

#### `sessionEnded`

Emitted when a session has ended

Declaration:

```ts
sdk.on(
  'sessionEnded',
  (session: IExtendedMediaSession, reason: JingleReason) => {}
);
```

Value of event:

- `session: IExtendedMediaSession` – the session that ended. See [GenesysCloudMediaSession] for details on the session object.
- `reason: JingleReason` – the reason code for why the session ended. Available reasons:
  ```ts
  reason: {
    condition: 'alternative-session' |
      'busy' |
      'cancel' |
      'connectivity-error' |
      'decline' |
      'expired' |
      'failed-application' |
      'failed-transport' |
      'general-error' |
      'gone' |
      'incompatible-parameters' |
      'media-error' |
      'security-error' |
      'success' |
      'timeout' |
      'unsupported-applications' |
      'unsupported-transports';
  }
  ```

#### `conversationUpdate`

Emits when softphone conversations change. Some changes that trigger this event
are, but not limited to:

- new conversation started
- conversation ended
- participants state changed (mute, held, connection state, etc)

> Note: this event will only be available for softphone conversations. Video
> conversations have their own session level events ([see video event docs](video.md#video-session-level-events)).

Declaration:

```ts
sdk.on('conversationUpdate', (event: ISdkConversationUpdateEvent) => {});
```

Value of event:

- `event: ISdkConversationUpdateEvent`

```ts
interface ISdkConversationUpdateEvent {
  /**
   * assumed conversationId of the activce conversation
   */
  activeConversationId: string;
  /**
   * All current softphone conversations
   */
  current: IStoredConversationState[];
  /**
   * Newly added softphone conversations
   */
  added: IStoredConversationState[];
  /**
   * Removed softphone conversations
   */
  removed: IStoredConversationState[];
}

interface IStoredConversationState {
  /**
   * Most recent conversation event received for this conversation
   */
  conversationUpdate: ConversationUpdate;
  /**
   * conversationId of this conversation
   */
  conversationId: string;
  /**
   * Webrtc session this conversation is using
   */
  session?: IExtendedMediaSession;
  /**
   * Most recent participant for the authenticated user
   */
  mostRecentUserParticipant?: IConversationParticipantFromEvent;
  /**
   * Most recent call start for the authenticated user
   */
  mostRecentCallState?: ICallStateFromParticipant;
}
```

A few things to note about this event:

1. `ISdkConversationUpdateEvent.activeConversationId` is not guaranteed to be accurate and sometimes it will be `''`.
   This is rare, but usually this is seen when there are mutliple active calls all on hold.
   As soon as one is taken off hold, this event will then be able to determine the correct active conversation ID.
1. `IStoredConversationState.session` can be `null` because there are times when the conversation will not have a session
   (for instance, when it is in the `removed` property). Also, depending on the
   Line Appearance configured for the station, this session may be in use by
   other conversations.
1. Because of the previous point, the `session.conversationId` is very unreliable since
   the session is reused. This ID can change very quickly and may not actually
   be the conversation ID of the active Webrtc call. It is recommended to use
   the conversation ID from the `IStoredConversationState` in conjunction with
   the provided session.

   ```ts
   // example:
   let conversationState: IStoredConversationState; // assume this is already set

   // use this ID
   conversationState.conversationId;
   // use this session
   conversationState.session;

   // do NOT rely on this ID
   conversationState.session.conversationId;

   // To know which conversationId is active on the session use
   let event: ISdkConversationUpdateEvent; // assume this is already set
   event.activeConversationId;
   ```

#### `sdkError`

Emitted when a session has ended

Declaration:

```ts
sdk.on('sdkError', (sdkError: SdkError) => {});
```

Value of event:

- `sdkError: SdkError` – error emitted by the sdk. See [SdkError Class] for more details.

#### `ready`

Emitted when the SDK has successfull initialized – fired once after
`await sdk.initialize({...})` finishes.

Declaration:

```ts
sdk.on('ready', () => {});
```

Value of event: `void`

#### `connected`

Emitted when the underlying websocket has (re)connected

Declaration:

```ts
sdk.on('connected', (info: { reconnect: boolean }) => {});
```

Value of event:

- `info: { reconnect: boolean }` – indicator if it is a reconnect event

#### `disconnected`

Emitted when the underlying websocket connection has disconnected.
The event body will contain a value that states whether the streaming-client websocket will attempt
to reconnect or is in the process of reconnecting. This value is defaulted to `true` in the streaming-client.
This value should be used to inform your application of whether you should wait for the websocket to reconnect or
proceed with tearing down your SDK instance via `sdk.destroy()` or page refresh.

Declaration:

```ts
sdk.on(
  'disconnected',
  (info: string, eventData: { reconnecting: boolean }) => {}
);
```

Value of event:

- `info: string` – String of `'Streaming API connection disconnected'`. This value should not be relied upon for anything other than logging.
- `eventData: { reconnecting: boolean }` - Boolean value that determines whether the streaming API is attempting to reconnect (this value is defaulted to `true` in the streaming-client).

#### `station`

Emitted when the authenticated user's Webrtc station association changes. Note, this event will only fire if
`SessionTypes.softphone` is passed into the SDK's `allowedSessionTypes: []` config option.

The `sdk.station` property will be updated based on the events emitted from this event. If you need the current
station value, access this property directly on the SDK.

Declaration:

```ts
sdk.on('station', ({ action: 'Associated' | 'Disassociated', station: IStation | null }) => { });
```

Value of event:

- `action: Associated` – if the user's Webrtc station was associated, the `station` will be the newly associated station.
- `action: Disassociated` – if the user's Webrtc station was disassociated, the `station` will be `null`
- `station: IStation` – if `action == 'Associated'`, this will be a webrtc station (see `IStation` interface above under [Properties](#properties)).

#### `concurrentSoftphoneSessionsEnabled`

Emitted when the authenicated user's Webrtc station is loaded. It will indicate if the Line Appearance is greater than 1.

For more information about Line Appearance, see [WebRTC SoftPhone]. Also see the
corresponding [isConcurrentSoftphoneSessionsEnabled()](#isconcurrentsoftphonesessionsenabled) function
which will return the last value emitted on this event.

Declaration:

```ts
sdk.on('concurrentSoftphoneSessionsEnabled', (isEnabled: boolean) => {});
```

Value of event:

- `isEnabled: boolean` – if the user's Webrtc station has a Line Appearance greater than 1.

#### `trace`

Emitted for trace, debug, log, warn, and error
messages from the SDK

Declaration:

```ts
sdk.on('trace', (level: string, message: string, details?: any) => {});
```

Value of event:

- `level: string` - the log level of the message `trace|debug|log|warn|error`
- `message: string` - the log message
- `details?: any` - details about the log message

---

## GenesysCloudMediaSession

This is the session object that manages WebRTC connections.
The actual interface has been extended and should be imported like this
(if using typescript):

```ts
import {
  IExtendedMediaSession,
  GenesysCloudWebrtcSdk,
} from 'genesys-cloud-webrtc-sdk';

const sdk = new GenesysCloudWebrtcSdk({
  /* your config options */
});
let activeSession: IExtendedMediaSession;

sdk.on('sessionStarted', (session) => {
  activeSession = session; // `session` is already strongly typed
});
```

There are many properties, methods, and accessors on the `IExtendedMediaSession`.
Since most of these are extended from 3rd party libraries, we will not go into
detail on each or list all of them. Instead, here is a brief list of the useful
properties and methods on the `IExtendedMediaSession` session object:

```ts
interface IExtendedMediaSession extends GenesysCloudMediaSession {
  id: string;
  sid: string; // same as `id`
  peerID: string;
  conversationId: string;
  active: boolean;
  sessionType: SessionTypes;
  pc: RTCPeerConnection;
  originalRoomJid: string;

  get state(): string;
  get connectionState(): string;

  /**
   * general media properties
   */
  videoMuted?: boolean;
  audioMuted?: boolean;
}
```

Some session types have an expanded set of properties such as CollaborateVideo sessions:

```ts
interface VideoMediaSession extends IExtendedMediaSession {
  fromUserId?: string;
  startScreenShare?: () => Promise<void>;
  stopScreenShare?: () => Promise<void>;
  pinParticipantVideo?: (participantId: string) => Promise<void>;
}
```

### Session level events

Session level events are events emitted from the `session` objects themselves,
not the SDK instance library. These can be used if you want lower level access
and control.

Sessions implement the same `EventEmitter` interface and strict-typings that the base WebRTC SDK does.
See [SDK Events](#events) for the full list of inherited functions.

#### `sessionState`

Emitted when the state of the session changes.

Declaration:

```ts
session.on(
  'sessionState',
  (sessionState: 'starting' | 'pending' | 'active') => {}
);
```

Value of event:

- `sessionState: 'starting' | 'pending' | 'active'` – new state of the session

#### `connectionState`

Emitted when the state of the underlying RTCPeerConnection state changes.

Declaration:

```ts
session.on(
  'connectionState',
  (
    connectionState:
      | 'starting'
      | 'connecting'
      | 'connected'
      | 'interrupted'
      | 'disconnected'
      | 'failed'
  ) => {}
);
```

Value of event:

- `connectionState: 'starting' | 'connecting' | 'connected' | 'interrupted' | 'disconnected' | 'failed'` – new state of the RTCPeerConnection

#### `iceConnectionType`

Emits the ICE connection type

Declaration:

```ts
session.on('iceConnectionType', (iceConnectionType: {
    localCandidateType: string,
    relayed: boolean,
    remoteCandidateType: string
  })) => { });
```

Value of event:

- `iceConnectionType: ({localCandidateType: string, relayed: boolean, remoteCandidateType: string}` – information about the ICE connection

#### `peerTrackAdded`

Emitted when a new peer media track is added to the session

Declaration:

```ts
session.on(
  'peerTrackAdded',
  (track: MediaStreamTrack, stream?: MediaStream) => {}
);
```

Value of event:

- `track: MediaStreamTrack` – the media track that was added
- `stream?: MediaStream` – the media stream that was added

#### `peerTrackRemoved`

Emitted when a peer media track is removed from the session

Declaration:

```ts
session.on(
  'peerTrackRemoved',
  (track: MediaStreamTrack, stream?: MediaStream) => {}
);
```

Value of event:

- `track: MediaStreamTrack` – the media track that was removed
- `stream?: MediaStream` – the media stream that was removed

#### `stats`

Emit stats for the underlying RTCPeerConnection.

See [webrtc-stats-gatherer] for more details and typings
on stats collected.

Declaration:

```ts
session.on('stats', (stats: any) => {});
```

Value of event:

- `stats: any` – stats for the RTCPeerConnection. value emitted varies based on stat event type.

#### `endOfCandidates`

Emits when the end of candidate gathering; used to check for
potential connection issues

Declaration:

```ts
session.on('endOfCandidates', () => {});
```

Value of event: `void`

#### `terminated`

Emits when the session ends

Declaration:

```ts
session.on('terminated', (reason: JingleReason) => {});
```

Value of event:

- `reason: JingleReason` – reason for session ending. See the SDK
  [sessionEnded](#sessionended) event for details on `JingleReason`

#### `mute`

Emits when the session mutes

Declaration:

```ts
session.on('mute', (info: JingleInfo) => {});
```

Value of event:

- `reason: JingleInfo` – info regarding the mute
- Basic interface:
  ```ts
  interface JingleInfo {
    infoType: string;
    creator?: JingleSessionRole;
    name?: string;
  }
  ```

#### `unmute`

Emits when the session unmutes

Declaration:

```ts
session.on('unmute', (info: JingleInfo) => {});
```

Value of event:

- `reason: JingleInfo` – info regarding the mute
- Basic interface: See [mute](#mute)

#### `resolutionUpdated`

Emits when the session's resolution
updates

Declaration:

```ts
sdk.on(
  'resolutionUpdated',
  (
    requestedResolution: IVideoResolution,
    actualResolution: IVideoResolution,
    videoTrack: MediaStreamTrack,
    sessionId: string,
    conversationId: string
  ) => {}
);
```

Value of event:

- `requestedResolution: IVideoResolution` - the height and width for the requested resolution
- `actualResolution: IVideoResolution` - the heigh and width actually set in the case of camera capabilities being lower than requested
- Basic interface:
  ```ts
  interface IVideoResolution {
    width: ConstrainULong;
    height: ConstrainULong;
  }
  ```
- `videoTrack: MediaStreamTrack` - the video track whose resolution was updated
- `sessionId: string` - the session that had the resolution updated
- `conversationId: string` - the conversation that had the resolution updated

#### Video session level events

There are session events that are specific for video sessions.
See [WebRTC Video Conferencing] for more info.

---

## SdkError Class

This is an Error wrapper class to give a little more detail regarding errors
thrown. The errors usually thrown by the SDK. However, there are a few instances
where the browser throws an error and the SDK will emit the "wrapped" error to
`sdk.on('sdkError', (err) => { });`. If it wraps an existing error, it will keep
the `error.name` and `error.message` to avoid masking the original problem.

```ts
class SdkError extends Error {
  type: SdkErrorTypes;
  details: any;

  /* inherited */
  name: string;
  message: string;
}

// Available Error types
enum SdkErrorTypes {
  generic = 'generic',
  initialization = 'initialization',
  invalid_token = 'invalid_token',
  http = 'http',
  invalid_options = 'invalid_options',
  not_supported = 'not_supported',
  session = 'session',
  call = 'call',
  media = 'media',
}
```

The SDK will add the `type` to give more clarity as to why the error was thrown.

[1]: https://developer.mypurecloud.com/api/rest/v2/notifications/index.html
[GenesysCloudClientLogger]: https://github.com/purecloudlabs/genesys-cloud-client-logger
[webrtc-stats-gatherer]: https://github.com/MyPureCloud/webrtc-stats-gatherer
[WebRTC SoftPhone]: softphone.md
[WebRTC Video Conferencing]: video.md
[WebRTC Screen Recording]: screen-recording.md
[WebRTC Media]: media.md
[ISdkMediaDeviceIds]: media.md#isdkmediadeviceids
[SDK Media audioTrackVolume event]: media.md#audiotrackvolume
[GenesysCloudMediaSession]: #genesyscloudmediasession
[SdkError Class]: #sdkerror-class
