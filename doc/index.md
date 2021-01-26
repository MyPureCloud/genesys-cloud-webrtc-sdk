# Genesys Cloud WebRTC SDK Documentation

## WebRTC SDK Index
* [Feature Index](#feature-index) (for more in-depth documetation about specific WebRTC features)
* [GenesysCloudWebrtcSdk](#genesyscloudwebrtcsdk)
  * [Example usage](#example-usage)
  * [Constructor](#constructor)
  * [Properties](#properties)
  * [Methods](#methods)
  * [Events](#events)
* [GenesysCloudMediaSession]
  * [Session level events](#session-level-events)
* [SdkError Class]

## Feature Index

- [WebRTC SoftPhone]
- [WebRTC Screen Share]
- [WebRTC Video Conferencing]
- [WebRTC Media] (media, devices, and permissions support)

### App Authorization

To use the SDK with OAuth scopes, you will need the following scopes enabled:
 - authorization
 - conversations
 - organizations
 - notifications

These can be set in Genesys Cloud > Admin > Integrations > OAuth > Scope.  Note that the scope options are not available when the "Grant Type" option is set to "Client Credentials"

--------

## GenesysCloudWebrtcSdk

### Example Usage

This is a very basic usage of the WebRTC SDK. Be sure to read through the documentation for more advanced usage. 

For an authenticated user, a valid **accessToken** is required on construction. The following example is for an authenticated user (for an unauthenticated user example, see [WebRTC Screen Share]).


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

You can also access the latest version (or a specific version) via the CDN. Example

```html
<!-- latest version -->
<script src="https://sdk-cdn.mypurecloud.com/webrtc-sdk/genesys-cloud-webrtc-sdk.bundle.min.js"></script>
<!-- or specified version -->
<script src="https://sdk-cdn.mypurecloud.com/webrtc-sdk/4.0.1/genesys-cloud-webrtc-sdk.bundle.min.js"></script>

<!-- then access the sdk via the window object -->
<script>
  const sdk = new window.GenesysCloudWebrtcSdk(...); // same usage as above
</script>
```

--------

### `constructor`
``` ts
constructor(config: ISdkConfig);
```
The `ISdkConfig`'s interface definition:
``` ts 
interface ISdkConfig {
    environment?: string;
    accessToken?: string;
    organizationId?: string;
    wsHost?: string;
    autoConnectSessions?: boolean;
    disableAutoAnswer?: boolean;
    logLevel?: LogLevels;
    logger?: ILogger;
    optOutOfTelemetry?: boolean;
    allowedSessionTypes?: SessionTypes[];
    media?: {
        monitorMicVolume?: boolean;
    };
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
        outputDeviceId?: string | null;
    };
}
```

#### `environment`
`environment?: string;`
Domain to use.
Optional: default is `mypurecloud.com`.
Available Options:
``` ts
 'mypurecloud.com',
 'mypurecloud.com.au',
 'mypurecloud.jp',
 'mypurecloud.de',
 'mypurecloud.ie',
 'usw2.pure.cloud',
 'cac1.pure.cloud',
 'euw2.pure.cloud',
 'apne2.pure.cloud'
```

#### `accessToken`
`accessToken?: string;`
Access token received from authentication. Required for authenticated users (aka agents).

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
using `sdk.acceptSession({ sessionId })`.

> Note: This is required to be true for guest screen share
     
#### `disableAutoAnswer`
`disableAutoAnswer?: boolean;` Optional: default `false`

Disable auto answering softphone calls. By default softphone calls will 
respect the `autoAnswer` flag passed in on the `pendingSession` session object. 
`autoAnswer` is always `true` for outbound calls and can also be set 
in the user's  phone settings.
     
#### `logLevel`
`logLevel?: LogLevels;` Optional: defaults to `'info'`. 

Desired log level. Available options:
``` ts
type LogLevels = 'log' | 'debug' | 'info' | 'warn' | 'error'
```
   
#### `logger`
`logger?: ILogger;` 
Logger to use. Must implement the `ILogger` interface (see [WebRTC properties](#properties) for `ILogger` definition).

Defaults to [GenesysCloudClientLogger]
which sends logs to the server (unless `optOutOfTelemetry` is `true`)
and outputs them in the console.   

#### `optOutOfTelemetry`
`optOutOfTelemetry?: boolean;`
Optional: default `false`.

Opt out of sending logs to the server. Logs are only sent to the server
if the default [GenesysCloudClientLogger] is used. The default logger will
send logs to the server unless this option is `true`
   
#### `allowedSessionTypes`
`allowedSessionTypes?: SessionTypes[];` Optional: defaults to all session types.

Allowed session types the sdk instance should handle.
Only session types listed here will be handled.
Available options passed in as an array:
``` ts
enum SessionTypes {
  softphone = 'softphone',
  collaborateVideo = 'collaborateVideo',
  acdScreenShare = 'screenShare'
}
```
  example:
``` ts
import { SessionTypes } from 'genesys-cloud-webrtc-sdk';

const sdk = new GenesysCloudWebrtcSdk({
  allowedSessionTypes: [SessionTypes.collaborateVideo, SessionTypes.softphone],
  // other config options
});
```      

#### `defaults`
Optional. Defaults for various SDK functionality. See individual options for defaults and usage. 

``` ts
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
    outputDeviceId?: string | null;
    monitorMicVolume?: boolean;
  };
``` 

#### `defaults.audioStream`
`audioStream?: MediaStream;` Optional: no default.

A default audio stream to accept softphone sessions with
  if no audio stream was used when accepting the session
  (ie: `sdk.acceptSession({ id: 'session-id', mediaStream })`)
          
#### `defaults.audioElement`
`audioElement?: HTMLAudioElement;` Optional: no default. (See note about default behavior)

HTML Audio Element to attach incoming audio streams to.

> Default behavior if this is not provided here or at 
 `sdk.acceptSession()` is the sdk will create an 
 HTMLAudioElement and append it to the DOM
          

#### `defaults.videoElement`
`videoElement?: HTMLVideoElement;` Optional: no default

HTML Video Element to attach incoming video streams to.
 A video element is _required_ for accepting incoming video
 calls. If no video element is passed into `sdk.acceptSession()`,
 this default element will be used.


#### `defaults.videoResolution`
``` ts
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

``` ts
type ConstrainULong = number | {
 exact?: number;
 ideal?: number;
 max?: number;
 min?: number;
}
```

#### `defaults.videoDeviceId`
`videoDeviceId?: string | null;` Optional: defaults to `null`

Default video device ID to use when starting camera media.
 - `string` to request media for specified deviceId
 - `null|falsey` to request media system default device


#### `defaults.audioDeviceId`
`audioDeviceId?: string | null;` Optional: defaults to `null`

Default audio device ID to use when starting microphone media.
 - `string` to request media for specified deviceId
 - `null|falsey` to request media system default device

#### `defaults.outputDeviceId`
`outputDeviceId?: string | null;` Optional: defaults to `null`

Default output device ID to use when starting camera media.
 - `string` ID for output media device to use
 - `null|falsey` to request media system default device
> Not all browsers support output devices. For supported browsers, system default
 for output devices is always an empty string (ex: `''`)


#### `defaults.monitorMicVolume`
`monitorMicVolume?: boolean;` Optional: defaults to `false`

When `true` all audio tracks created via the SDK
 will have their volumes monitored and emited on
 `sdk.media.on('audioTrackVolume', evt)`.
 See `sdk.media` events for more details.

--------

### Properties

#### `VERSION`
Readonly `string` of the SDK version in use. 

#### `logger`
Logger used by the SDK. It will implement the `ILogger` interface. See [constructor](#constructor) for details on how to set the SDK logger and log level. 

``` ts 
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

--------

### Methods

#### `initialize()`

Setup the SDK for use and authenticate the user
   - agents must have an accessToken passed into the constructor options
   - guests need a securityCode (or the data received from an already redeemed securityCode).
      If the customerData is not passed in this will redeem the code for the data, 
      else it will use the data passed in.

Declaration: 
``` ts
initialize(opts?: {
    securityCode: string;
} | ICustomerData): Promise<void>;
```
Params: 

* opts = `{ securityCode: 'shortCode received from agent to share screen' }`
*  _or_ if the customer data has already been redeemed using 
    the securityCode (this is an advanced usage)
    ``` ts
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


#### `startScreenShare()`
Start a screen share. Start a screen share. Currently, screen share is only supported 
for guest users. 

`initialize()` must be called first.

Declaration: 
``` ts
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
``` ts
startVideoConference(roomJid: string, inviteeJid?: string): Promise<{
    conversationId: string;
}>;
```
Params:
* `roomJid: string` Required: jid of the conference to join. Can be made up if 
  starting a new conference but must adhere to the format: 
  `<lowercase string>@conference.<lowercase string>`
* `inviteeJid?: string` Optional: jid of a user to invite to this conference.

Returns: a promise with an object with the newly created `conversationId`

#### `updateOutputDevice()`
Update the output device for all incoming audio
  - This will log a warning and not attempt to update
    the output device if the a broswer
    does not support output devices
  - This will attempt to update all active sessions
  - This does _not_ update the sdk `defaultOutputDeviceId`

Declaration: 
``` ts
updateOutputDevice(deviceId: string | true | null): Promise<void>;
```
Params: 
  * `deviceId: stirng | true | null` Required: `string` deviceId for audio output device, 
    `true` for sdk default output, or `null` for system default

Returns: a promise that fullfils once the output deviceId has been updated

#### `updateOutgoingMedia()`
Update outgoing media for a specified session
 - `sessionId` _or_ `session` is required to find the session to update
 - `stream`: if a stream is passed in, the session media will be
   updated to use the media on the stream. This supercedes deviceId(s) 
    passed in
 - `videoDeviceId` & `audioDeviceId` (superceded by `stream`)
   - `undefined|false`: the sdk will not touch the `video|audio` media
   - `null`: the sdk will update the `video|audio` media to system default
   - `string`: the sdk will attempt to update the `video|audio` media
       to the passed in deviceId

> Note: this does not update the SDK default device(s)
  
Declaration: 
``` ts
updateOutgoingMedia (updateOptions: IUpdateOutgoingMedia): Promise<void>;
```
Params: 
  * `updateOptions: IUpdateOutgoingMedia` Required: device(s) to update
  * Basic interface: 
    ``` ts 
    interface IUpdateOutgoingMedia {
      session?: IExtendedMediaSession;
      sessionId?: string;
      stream?: MediaStream;
      videoDeviceId?: string | boolean | null;
      audioDeviceId?: string | boolean | null;
    }
    ```
  * See [media#IUpdateOutgoingMedia](media.md#iupdateoutgoingmedia) for full details
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

If `updateActiveSessions` is `false`, only the sdk defaults will be updated and 
active sessions' media devices will not be touched.

Declaration: 
``` ts
updateDefaultDevices(options?: IMediaDeviceIds & {
    updateActiveSessions?: boolean;
}): Promise<any>;
```
Params: 
* `options?: IMediaDeviceIds & {updateActiveSessions?: boolean;}` Optional: defaults to `{}`
  * Basic interface:
    ``` ts
    interface IMediaDeviceIds {
      videoDeviceId?: string | null;
      audioDeviceId?: string | null;
      outputDeviceId?: string | null;
      updateActiveSessions?: boolean;
    }
    ```
  * `videoDeviceId?: string | null` Optional: `string` for a desired deviceId. 
    `null|falsy` for system default device.
  * `audioDeviceId?: string | null` Optional: `string` for a desired deviceId. 
    `null|falsy` for system default device.
  * `outputDeviceId?: string | null` Optional: `string` for a desired deviceId. 
    `null|falsy` for system default device.
  * `updateActiveSessions?: boolean` flag to update active sessions' devices

Returns: a promise that fullfils once the default 
device values have been updated

#### `setVideoMute()`
Mutes/Unmutes video/camera for a session and updates the conversation accordingly.
Will fail if the session is not found.
Incoming video is unaffected.

 When muting, the camera track is destroyed. When unmuting, the camera media
  must be requested again. 

> NOTE: if no `unmuteDeviceId` is provided when unmuting, it will unmute and
 attempt to use the sdk `defaults.videoDeviceId` as the camera device

Declaration: 
``` ts
setVideoMute(muteOptions: ISessionMuteRequest): Promise<void>;
```
Params: 
* `muteOptions: ISessionMuteRequest` Required: 
  * Basic interface
    ``` ts
    interface ISessionMuteRequest {
        sessionId: string;
        mute: boolean;
        unmuteDeviceId?: string | boolean | null;
    }
    ```
  * `sessionId: string` Required: session id to for which perform the action
  * `mute: boolean` Required: `true` to mute, `false` to unmute
  * `unmuteDeviceId?: string` Optional: the desired deviceId to use when unmuting, 
    `true` for sdk default, `null` for system default, 
    `undefined` will attempt to use the sdk default device

Returns: a promise that fullfils once the mute request has completed

#### `setAudioMute()`

Mutes/Unmutes audio/mic for a session and updates the conversation accordingly.
Will fail if the session is not found.
Incoming audio is unaffected.

> NOTE: if no `unmuteDeviceId` is provided when unmuting _AND_ there is no active
 audio stream, it will unmute and attempt to use the sdk `defaults.audioDeviceId`
 at the device

Declaration: 
``` ts
setAudioMute(muteOptions: ISessionMuteRequest): Promise<void>;
```

Params: 
* `muteOptions: ISessionMuteRequest` Required: 
  * `sessionId: string` Required: session id to for which perform the action
  * `mute: boolean` Required: `true` to mute, `false` to unmute
  * `unmuteDeviceId?: string` Optional: the desired deviceId to use when unmuting, 
    `true` for sdk default, `null` for system default, 
    `undefined` will attempt to use the sdk default device
  * Basic interface:
    ``` ts
      interface ISessionMuteRequest {
          sessionId: string;
          mute: boolean;
          unmuteDeviceId?: string | boolean | null;
      }
    ```

Returns: a promise that fullfils once the mute request has completed 

#### `acceptPendingSession()`
Accept a pending session based on the passed in ID.

Declaration: 
``` ts
acceptPendingSession(sessionId: string): Promise<void>;
```
Params: 
* `sessionId: string` Required: id of the pending session to accept

Returns: a promise that fullfils once the session accept goes out

#### `rejectPendingSession()`
Reject a pending session based on the passed in ID.

Declaration: 
``` ts
rejectPendingSession(sessionId: string): Promise<void>;
```
Params: 
* `sessionId: string` Required: id of the session to reject

Returns: a promise that fullfils once the session reject goes out

#### `acceptSession()`
Accept a pending session based on the passed in ID.

Declaration: 
``` ts
acceptSession(acceptOptions: IAcceptSessionRequest): Promise<void>;
```
Params: 
* `acceptOptions: IAcceptSessionRequest` Required: options with which to accept the session
  * Basic interface:
    ``` ts
    interface IAcceptSessionRequest {
      sessionId: string;
      mediaStream?: MediaStream;
      audioElement?: HTMLAudioElement;
      videoElement?: HTMLVideoElement;
      videoDeviceId?: string | boolean | null;
      audioDeviceId?: string | boolean | null;
    }
    ```
  * `sessionId: string` Required: id of the session to accept
  * `mediaStream?: MediaStream` Optional: media stream to use on the session. If this is
    provided, no media will be requested.
  * `audioElement?: HTMLAudioElement` Optional: audio element to attach incoming audio to
      default is sdk `defaults.audioElement`
  * `videoElement?: HTMLAudioElement` Optional: video element to attach incoming video to
      default is sdk `defaults.videoElement`. (only used for video sessions)
  * `videoDeviceId?: string | boolean | null;` Optional: See [ISdkMediaDeviceIds] for full details
  * `audioDeviceId?: string | boolean | null;` Optional: See [ISdkMediaDeviceIds] for full details


Returns: a promise that fullfils once the session accept goes out

#### `endSession()`
End an active session based on the session ID _or_ conversation ID (one is required)
    
Declaration: 
``` ts
endSession(endOptions: IEndSessionRequest): Promise<void>;
```
Params: 
* `endOptions: IEndSessionRequest` object with session ID _or_ conversation ID
  * Basic interface: 
    ``` ts
    interface IEndSessionRequest {
      sessionId?: string;
      conversationId?: string;
    }
    ```
  * `sessionId?: string` Optional: id of the session to end. At least `sessionId` _or_ `conversationId` must be provided.
  * `conversation?: string` Optional: conversation id of the session to end. At least `sessionId` _or_ `conversationId` must be provided.

Returns: a promise that fullfils once the session has ended

#### `disconnect()`
Disconnect the streaming connection
    
Declaration: 
``` ts
disconnect(): Promise<any>;
```
Params: none

Returns: a promise that fullfils once the web socket has disconnected

#### `reconnect()`
Reconnect the streaming connection

Declaration: 
``` ts
reconnect(): Promise<any>;
```
Params: none

Returns: a promise that fullfils once the web socket has reconnected

#### `destroy()`

Ends all active sessions, disconnects the
 streaming-client, removes all event listeners,
 and cleans up media.
> WARNING: calling this effectively renders the SDK
 instance useless. A new instance will need to be
 created after this is called.
    
Declaration: 
``` ts
destroy(): Promise<any>;
```
Params: 

Returns: a promise that fullfils once all the cleanup
 tasks have completed

--------

### Events
The WebRTC SDK extends the browser version of `EventEmitter`. 
Reference the NodeJS documentation for more information. The basic interface that is
inherited by the SDK is: 

``` ts
interface EventEmitter {
  addListener(event: string | symbol, listener: (...args: any[]) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;
  removeAllListeners(event?: string | symbol): this;
  setMaxListeners(n: number): this;
  getMaxListeners(): number;
  listeners(event: string | symbol): Function[];
  rawListeners(event: string | symbol): Function[];
  emit(event: string | symbol, ...args: any[]): boolean;
  listenerCount(event: string | symbol): number;
  prependListener(event: string | symbol, listener: (...args: any[]) => void): this;
  prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this;
  eventNames(): Array<string | symbol>;
}
```

The SDK leverages [strict-event-emitter-types](https://www.npmjs.com/package/strict-event-emitter-types) to strongly type available events and their emitted values.

#### `pendingSession`
Emitted when a call session is being initiated for an outbound or inbound call. 
`pendingSession` is emitted for all softphone sessions and inbound 1-to-1 video 
sessions. 

Declaration:
``` ts
sdk.on('pendingSession', (pendingSession: IPendingSession) => { });
```
Value of event: 
``` ts
interface IPendingSession {
  id: string;
  address: string;
  conversationId: string;
  autoAnswer: boolean;
  sessionType: SessionTypes;
  originalRoomJid: string;
  fromUserId?: string;
}
```
* `id: string` – the unique Id for the session proposal; used to accept or
     reject the proposal
* `address: string` – the address of the caller
* `conversationId: string` – id for the associated conversation object (used in
            platform API requests)
* `autoAnswer: boolean` – whether or not the client should auto answer the session
  * `true` for all outbound calls
  * `false` for inbound calls, unless Auto Answer is configured for the user by an admin
     public api request and/or push notifications
* `sessionType: SessionTypes` – type of pending session. See [AllowedSessionTypes](#allowedsessiontypes) for a list of available values. 
* `originalRoomJid: string` – video specific alternate roomJid (for 1-to-1 video calls)
* `fromUserId?: string` – Optional: the userId the call is coming from (for 1-to-1 video calls)


#### `cancelPendingSession`
Emitted when a the call has been canceled due to remote disconnect
or answer timeout

Declaration:
``` ts
sdk.on('cancelPendingSession', (sessionId: string) => { });
```
Value of event: 
* `sessionId: string` – the id of the session proposed and canceled


#### `handledPendingSession`
Emitted when another client belonging to this user
  has handled the pending session; used to stop ringing

Declaration:
``` ts
sdk.on('handledPendingSession', (sessionId: string) => { });
```
Value of event: 
* `sessionId: string` – the id of the session proposed and handled

#### `sessionStarted`
Emitted when negotiation has started; before the
  session has connected

Declaration:
``` ts
sdk.on('sessionStarted', (session: IExtendedMediaSession) => { });
```
Value of event: 
* `session: IExtendedMediaSession` – the session that has started. See [GenesysCloudMediaSession] for details on the session object.

#### `sessionEnded`
Emitted when a session has ended

Declaration:
``` ts
sdk.on('sessionEnded', (session: IExtendedMediaSession, reason: JingleReason) => { });
```
Value of event: 
* `session: IExtendedMediaSession` – the session that ended. See [GenesysCloudMediaSession] for details on the session object.
* `reason: JingleReason` – the reason code for why the session ended. Available reasons: 
    ``` ts
    reason: { 
      condition: 
        "alternative-session" |
        "busy" |
        "cancel" |
        "connectivity-error" |
        "decline" |
        "expired" |
        "failed-application" |
        "failed-transport" |
        "general-error" |
        "gone" |
        "incompatible-parameters" |
        "media-error" |
        "security-error" |
        "success" |
        "timeout" |
        "unsupported-applications" |
        "unsupported-transports" 
    }
    ```


#### `sdkError`
Emitted when a session has ended

Declaration:
``` ts
sdk.on('sdkError', (sdkError: SdkError) => { });
```
Value of event: 
* `sdkError: SdkError` – error emitted by the sdk. See [SdkError Class] for more details.

#### `ready`
Emitted when the SDK has successfull initialized – fired once after
  `await sdk.initialize({...})` finishes.

Declaration:
``` ts
sdk.on('ready', () => { });
```
Value of event: `void`

#### `connected`
Emitted when the underlying websocket has (re)connected

Declaration:
``` ts
sdk.on('connected', (info: { reconnect: boolean }) => { });
```
Value of event: 
* `info: { reconnect: boolean }` – indicator if it is a reconnect event

#### `disconnected`
Emitted when the underlying websocket connection has
  disconnected and is no longer attempting to reconnect automatically. 
  Should usually be followed by `sdk.reconnect()` or reloading the application, 
  as this indicates a critical error

Declaration:
``` ts
sdk.on('disconnected', (info?: any) => { });
```
Value of event: 
* `info?: any` – usually a string of `'Streaming API connection disconnected'`. This value should not be relied upon for anything other than logging. 

#### `trace`
Emitted for trace, debug, log, warn, and error
messages from the SDK

Declaration:
``` ts
sdk.on('trace', (level: string, message: string, details?: any) => { });
```
Value of event: 
* `level: string` - the log level of the message `trace|debug|log|warn|error`
* `message: string` - the log message
* `details?: any` - details about the log message

--------

## GenesysCloudMediaSession

This is the session object that manages WebRTC connections. 
The actual interface has been extended and should be imported like this 
(if using typescript): 

``` ts
import { 
  IExtendedMediaSession, 
  GenesysCloudWebrtcSdk 
} from 'genesys-cloud-webrtc-sdk';

const sdk = new GenesysCloudWebrtcSdk({/* your config options */});
let activeSession: IExtendedMediaSession;

sdk.on('sessionStarted', (session) => {
  activeSession = session; // `session` is already strongly typed
});
```

There are many properties, methods, and accessors on the `IExtendedMediaSession`. 
Since most of these are extended from 3rd party libraries, we will not go into
detail on each or list all of them. Instead, here is a brief list of the useful
properties and methods on the `IExtendedMediaSession` session object: 

``` ts
interface IExtendedMediaSession extends GenesysCloudMediaSession {
  id: string;
  sid: string; // same as `id`
  peerID: string;
  conversationId: string;
  active: boolean;
  sessionType: SessionTypes;
  pc: RTCPeerConnection;

  get state(): string;
  get connectionState(): string;

  /**
   * video session related props/functions 
   * Note: these are not guaranteed to exist on all sessions. 
   * See `WebRTC Video Conferencing` for more details
   */
  originalRoomJid: string;
  videoMuted?: boolean;
  audioMuted?: boolean;
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
``` ts
session.on('sessionState', (sessionState: 'starting' | 'pending' | 'active') => { });
```

Value of event:
* `sessionState: 'starting' | 'pending' | 'active'` – new state of the session


#### `connectionState`
Emitted when the state of the underlying RTCPeerConnection state changes. 

Declaration:
``` ts
session.on('connectionState', 
  (connectionState: 'starting' | 'connecting' | 'connected' | 'interrupted' | 'disconnected' | 'failed') => { });
```

Value of event:
* `connectionState: 'starting' | 'connecting' | 'connected' | 'interrupted' | 'disconnected' | 'failed'` – new state of the RTCPeerConnection



#### `iceConnectionType`
Emits the ICE connection type

Declaration:
``` ts
session.on('iceConnectionType', (iceConnectionType: {
    localCandidateType: string, 
    relayed: boolean, 
    remoteCandidateType: string
  })) => { });
```

Value of event:
* `iceConnectionType: ({localCandidateType: string, relayed: boolean, remoteCandidateType: string}` – information about the ICE connection


#### `peerTrackAdded`
Emitted when a new peer media track is added to the session

Declaration:
``` ts
session.on('peerTrackAdded', (track: MediaStreamTrack, stream?: MediaStream) => { });
```

Value of event:
* `track: MediaStreamTrack` – the media track that was added
* `stream?: MediaStream` – the media stream that was added

#### `peerTrackRemoved`
Emitted when a peer media track is removed from the session

Declaration:
``` ts
session.on('peerTrackRemoved', (track: MediaStreamTrack, stream?: MediaStream) => { });
```

Value of event:
* `track: MediaStreamTrack` – the media track that was removed
* `stream?: MediaStream` – the media stream that was removed


#### `stats`
Emit stats for the underlying RTCPeerConnection. 

See [webrtc-stats-gatherer] for more details and typings
  on stats collected. 

Declaration:
``` ts
session.on('stats', (stats: any) => { });
```

Value of event:
* `stats: any` – stats for the RTCPeerConnection. value emitted varies based on stat event type.


#### `endOfCandidates`
Emits when the end of candidate gathering; used to check for
potential connection issues

Declaration:
``` ts
session.on('endOfCandidates', () => { });
```

Value of event: `void`


#### `terminated`
Emits when the session ends

Declaration:
``` ts
session.on('terminated', (reason: JingleReason) => { });
```

Value of event: 
* `reason: JingleReason` – reason for session ending. See the SDK 
[sessionEnded](#sessionended) event for details on `JingleReason`



#### `mute`
Emits when the session mutes

Declaration:
``` ts
session.on('mute', (info: JingleInfo) => { });
```

Value of event: 
* `reason: JingleInfo` – info regarding the mute
* Basic interface: 
  ``` ts
  interface JingleInfo {
    infoType: string;
    creator?: JingleSessionRole;
    name?: string;
  }
  ```

#### `unmute`
Emits when the session unmutes

Declaration:
``` ts
session.on('unmute', (info: JingleInfo) => { });
```

Value of event: 
* `reason: JingleInfo` – info regarding the mute
* Basic interface: See [mute](#mute)


#### Video session level events
There are session events that are specific for video sessions. 
See [WebRTC Video Conferencing] for more info. 

--------

## SdkError Class
This is an Error wrapper class to give a little more detail regarding errors
thrown. The errors usually thrown by the SDK. However, there are a few instances
where the browser throws an error and the SDK will emit the "wrapped" error to
`sdk.on('sdkError', (err) => { });`. If it wraps an existing error, it will keep
the `error.name` and `error.message` to avoid masking the original problem. 

``` ts
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
  http = 'http',
  invalid_options = 'invalid_options',
  not_supported = 'not_supported',
  session = 'session',
  media = 'media'
}
```

The SDK will add the `type` to give more clarity as to why the error was thrown. 


[1]: https://developer.mypurecloud.com/api/rest/v2/notifications/index.html

[GenesysCloudClientLogger]: https://github.com/purecloudlabs/genesys-cloud-client-logger
[webrtc-stats-gatherer]: https://github.com/MyPureCloud/webrtc-stats-gatherer

[WebRTC SoftPhone]: softphone.md
[WebRTC Screen Share]: screenshare.md
[WebRTC Video Conferencing]: video.md
[WebRTC Media]: media.md

[ISdkMediaDeviceIds]: media.md#isdkmediadeviceids

[GenesysCloudMediaSession]: #genesyscloudmediasession
[SdkError Class]: #sdkerror-class
