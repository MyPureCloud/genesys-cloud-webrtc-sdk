# Genesys Cloud WebRTC SDK Media Utility

## SDK Media Index
* [Why Use SdkMedia?]
* [SdkMedia]
  * [Example usage]
  * [Methods]
  * [Events]
  * [Interfaces]
* [Important Notes About Media in the Browser]?

## Why Use SdkMedia?
Why use this instead of the native `navigator.mediaDevices.getUserMedia()`? 
Since the SDK is built to be compatible with multiple browsers, it has to be able to handle media, devices, 
and permissions across all the supported browsers. Currently, the supported browsers are 
**Chrome, Firefox, & Edge** (but most any browser running on Chromium will work including Chromium Embedded Framework
 desktop applications). 

It was decided to expose the underlying media implementation to help consumers leverage all the shimming, error handling,
and heavy lifting involved with media implementations. 


--------

## SdkMedia

### Example Usage

This is a very basic usage of the WebRTC SDK Media utility. Be sure to read through the documentation for more advanced usage. 
For the remainder of this documentation, it will be assumed that there is already an initialized sdk instance. 

``` ts
import { ISdkMediaState, SdkMediaStateWithType } from 'genesys-cloud-webrtc-sdk';

/* async function for demonstration */
async function run () {

  /* fetch the beginning media state sync synchronously, then update it in the `on('state')` listener */
  let mediaState: ISdkMediaState = sdk.media.getState();

  sdk.media.on('state', (state: SdkMediaStateWithType) => {
    // emits every time devices or permissions change
    // this value can always be synchronously attained 
    // using `sdk.media.getState()`
    mediaState = state;
  });

  /* request permissions for the desired media types */
  try {
    await sdkMedia.requestMediaPermissions('audio');
  } catch (e) {
    // error getting permissions. this usually means the user denied permissions
    // to verify, you can check the error type or check the mediaState (preferred)
    const { hasMicPermissions } = sdk.media.getState(); // get the current media state

    if (!hasMicPermissions) {
      // decide what to do. the sdk cannot function
      // without media permissions. generally it is best 
      // to kick the user out of the app and explain how they
      // can grant permissions for their specific browser
    }
  }

  /* if we get here, that means we have `audio` permissions and devices have been enumerated */
  const devices = mediaState.devices;
  const audioDevices = mediaState.audioDevices; // or just grab microphones

  /* you can request media through the sdk. if there are permissions issues, the state will be updated */
  const micId = audioDevices[0].deviceId;
  const audioStream = await sdk.media.startMedia({ audio: micId });

  /* this is a mock session object. the real session would be attained through  the `sdk.on('sessionStarted', evt)` listener */
  const sessionToAccept = { id: 'some-hash-id', ...restOfSessionObject };

  /* you can even accept a pending session with media you already have */
  sdk.acceptSession({
    sessionId: sessionToAccept.id,
    mediaStream: audioStream
  });

  /* OR you can even accept a pending session with a deviceId and the sdk will create the media */
  sdk.acceptSession({
    sessionId: sessionToAccept.id,
    audioDeviceId: micId,
  });
}

run();
```

Be sure to check out the [SdkMediaStateWithType] interface for more information about the `ISdkMediaState` object. 

--------

### Methods

#### `requestMediaPermissions()`
Function to gain permissions for a given media type. This function should
 be called early after constructing the SDK and _before_ calling
 `sdk.media.startMedia()` to ensure permissions are granted.

This function will call through to `startMedia` to get a `MediaStream`
 for the desired media permissions. That is the only surefire way to
 gain permissions across all browsers & platforms.

It will also call through to `sdk.media.enumerateDevices()` to ensure
 all devices have been loaded after permissions have been granted.

The media state will be updated with permissions and an event emitted
 on `sdk.media.on('permissions', evt)` with any outcomes.

An error will be thrown if permissions are not granted by either the browser
 or the OS (specifically for macOS). With the one exception of the microphone
 permission on the OS level. If the microphone permission has not been granted on
 the OS level, macOS will still allow the browser to attain an audio track for
 the microphone. However, the track will act as if it is in a "hardware mute"
 state. There is no API available for the browser to know the microphone is
 in a "hardware mute" state. To see if a microphone _may_ be in a "hardware mute"
 state, you can listen for microphone volume events on
 `sdk.media.on('audioTrackVolume', evt)` and add logic to respond to no volume
 coming through the microhpone.

If `preserveMedia` is `true`, the `MediaStream` attained through the
 `startMedia()` will be returned to the caller. If not, the media will
 be destroyed and `undefined` returned.

`options` can be any valid deviceId or other media options defined in
  [IMediaRequestOptions]. These options will be passed to
 the `startMedia()` call (which is used to gain permissions)

> Note #1: media permissions requests will always be retried (see `startMedia()` 
  for more info). If using `preserveMedia = true`, be sure to check the 
  returned media to ensure it is the desired media device (if requested). 

> Note #2: the default option for the media type will be `true` (which is SDK default
  device). If a value of `false` or `undefined` is passed in, it will
  always use `true`. Any options for the other media type will be ignored.
Example:
``` ts
await requestMediaPermissions(
  'audio',
  false,
  {
    audio: false,
    video: 'some-video-device-id',
    videoFrameRate: 30
  }
);
// since type === 'audio', the options will be converted to:
{
  // a valid option must be set (`false|undefined` are invalid)
  audio: true,
  // video will be ignored since permissions are requested one at a time
  video: false
}
```

> Note: in some browsers, permissions are not always guaranteed even after 
using this function to gain permissions. See [Firefox Behavior] for more details. 
It is recommended to use the [permissions event](#permissions) to watch for changes
in permissions since permissions could be denied anytime [startMedia()](#startmedia) is called. 
    
Declaration:
``` ts
requestMediaPermissions(mediaType: 'audio' | 'video', preserveMedia?: boolean, options?: IMediaRequestOptions): Promise<MediaStream | void>;
```

Params:
* `mediaType: 'audio' | 'video'` – mediaType media type to request permissions for (`'audio' | 'video'`)
* `preserveMedia?: boolean` – Optional: Defaults to `false` – flag to return media after permissions pass
* `options?: IMediaRequestOptions` – Optional: Defaults to mediaType `true`. See [IMediaRequestOptions] for additional details. 
  See note above explaining mediaType always being requested.

Returns: a promise either containing a `MediaStream` or `undefined` 
depending on the value of `preserveMedia`

#### `enumerateDevices()`
Call to enumerate available devices. This will update the
  cache of devices and emit events on `'state'` & `'devices'`

If the devices returned from the browser are the same as the cached
  devices, a new event will _NOT_ emit. To force an emit pass in `true`.

It is _highly_ recommended that `sdk.media.requestMediaPermissions('audio' | 'video')`
  be called at least once to ensure permissions are granted before loading devices. 
  See [requestMediaPermissions()](#requestmediapermissions) for more details.

> Note: if media permissions have not been granted by the browser,
  enumerated devices will not return the full list of devices
  and/or the devices will not have ids/labels (varies per browser).
    
Declaration:
``` ts
enumerateDevices(forceEmit?: boolean): Promise<MediaDeviceInfo[]>;
```

Params:
* `forceEmit?: boolean` – Optional: Defaults to `false` – force an event to emit if the devices
  have not changed from the cached devices

Returns: a promise containing the devices enumerated
from `navigator.mediaDevices.enumerateDevices()`


#### `startMedia()`
Create media with video and/or audio. See [IMediaRequestOptions]
  for more information about available options.

It is _highly_ recommended that `sdk.media.requestMediaPermissions('audio' | 'video')` 
be called with each desired media type _before_ using `startMedia`. This will ensure
 all media permissions have been granted before starting media. If `requestMediaPermissions()`
 has not been called, this function will call it with `preserveMedia = true` and use
 the returning media. 

`getUserMedia` is requested one media type at a time. If requesting both `audio`
  and `video`, `getUserMedia` will be called two times -- 1st with `audio` and 2nd
  with `video`. The two calls will be combined into a single `MediaStream` and
  returned to the caller. If one of the media types fail, execution of this
  function will stop and the error thrown (any successful media will be destroyed).
  This is is line with `getUserMedia`'s current behavior in the browser.

 If `retryOnFailure` is `true` (default), the SDK will have the following behavior:
  1. If the fail was due to a Permissions issue, it will _NOT_ retry
  2. For `video` only: some browsers/hardward configurations throw an error
      for invalid resolution requests. If `video` was requested with a
      `videoResolution` value (could be a SDK default), it will retry
      video with the same passed in value but with _no_ resolution.
  3. If a deviceId was requested and there was a failure, this will retry
      media with the SDK default deviceId for that media type.
  4. If the SDK default deviceId fails (or it didn't exist), then this
      will retry with system defaults and no other options (such as `deviceId`s,
      `videoFrameRate`, & `videoResolution`)
  5. If system defaults fails, it will throw the error and stop attempting
      to retry.

> Note: if using `retryOnFailure` it is recommended to check the media returned to ensure you received the desired device.

> Warning: if `sdk.media.requestPermissions(type)` has NOT been called before
  calling `startMedia`, `startMedia` will call `sdk.media.requestPermissions(type)`.
  If calling `startMedia` with both `audio` and `video` _before_ requesting permissions,
  `startMedia` will attempt to gain permissions for `audio` first and then `video` (because
  media permissions must be requested one at a time). If `audio` fails, it will
  not attempt to gain permissions for `video` – the error will stop execution.


    
Declaration:
``` ts
startMedia(mediaReqOptions?: IMediaRequestOptions, retryOnFailure?: boolean): Promise<MediaStream>;
```

Params:
* `mediaReqOptions?: IMediaRequestOptions` – Optional: defaults to `{ video: true, audio: true }` –
  request video and/or audio with a default device or deviceId. See [IMediaRequestOptions] for more details.
* `retryOnFailure?: boolean` – Optional: default `true` – whether the sdk should retry on an error

Returns: a promise containing a `MediaStream` with the requested media


#### `startDisplayMedia()`
Creates a `MediaStream` from the screen (this will prompt for user screen selection).

> Note: see [Screen Share in Firefox] for specific screen share permission information

Declaration:
``` ts
startDisplayMedia(): Promise<MediaStream>;
```

Params: none

Returns: a promise containing a `MediaStream` with the requested screen media


#### `getValidDeviceId()`
Look for a valid deviceId in the cached media devices
based on the passed in `deviceId`. This will follow these steps looking for a device:
 1. If `deviceId` is a `string`, it will look for that device and
     return it if found
 2. If device could not be found _or_ `deviceId` was not a `string`,
     it will look for the sdk default device
 3. If device could not be found it will return `undefined`
    
Declaration:
``` ts
getValidDeviceId(kind: MediaDeviceKind, deviceId: string | boolean | null, ...sessions: IExtendedMediaSession[]): string | undefined;
```

Params: 
* `kind: MediaDeviceKind` – kind desired device kind
* `deviceId: string | boolean | null` – `deviceId` for specific device to look for, 
  `true` for sdk default device, or `null` for system default
* `...sessions: IExtendedMediaSession[]` – Optional: any active sessions (used for logging)

Returns: a `string` if a valid deviceId was found, or `undefined` if
no device could be found.


#### `getState()`
Get a copy of the current media state

Declaration:
``` ts
getState(): ISdkMediaState;
```

Params: none

Returns: the current sdk media state. See [ISdkMediaState]


#### `getDevices()`
Get the current _cached_ media devices

Declaration:
``` ts
getDevices(): MediaDeviceInfo[];
```

Params: none

Returns: an array of all cached devices


#### `getAudioDevices()`
Get the current _cached_ audio devices

Declaration:
``` ts
getAudioDevices(): MediaDeviceInfo[];
```

Params: none

Returns: an array of all cached audio devices


#### `getVideoDevices()`
Get the current _cached_ video devices

Declaration:
``` ts
getVideoDevices(): MediaDeviceInfo[];
```

Params: none

Returns: an array of all cached video devices


#### `getOutputDevices()`
Get the current _cached_ output devices

Declaration:
``` ts
getOutputDevices(): MediaDeviceInfo[];
```

Params: none

Returns: an array of all cached output devices


#### `getAllActiveMediaTracks()`
This will return all active media tracks that
were created by the sdk
    
Declaration:
``` ts
getAllActiveMediaTracks(): MediaStreamTrack[];
```

Params: none

Returns: an array of all active media tracks
created by the sdk

#### `findCachedDeviceByTrackLabel()`
Look through the cached devices and match based on
 the passed in track's `kind` and `label`.

Declaration:
``` ts
findCachedDeviceByTrackLabel(track?: MediaStreamTrack): MediaDeviceInfo | undefined;
```

Params: 
* `track?: MediaStreamTrack` – Optional: `MediaStreamTrack` with the label to search for.

Returns: the found device or `undefined` if the
device could not be found.

#### `findCachedOutputDeviceById()`
Look through the cached output devices and match based on
 the passed in output deviceId.
    
Declaration:
``` ts
findCachedOutputDeviceById(id?: string): MediaDeviceInfo | undefined;
```

Params:
* `id?: string` – Optional: output deviceId

Returns: the found device or `undefined` if the device could not be found.

#### `doesDeviceExistInCache()`
Determine if the passed in device exists in the cached devices

Declaration:
``` ts
doesDeviceExistInCache(device?: MediaDeviceInfo): boolean;
```

Params:
* `device?: MediaDeviceInfo` – Optional: device to look for

Returns: boolean whether the device was found

#### `destroy()`
This will remove all media listeners, stop any existing media,
and stop listening for device changes.

> WARNING: calling this effectively renders the SDK
  instance useless. A new instance will need to be
  created after this has been called.
Declaration:
``` ts
destroy(): void;
```

Params: none

Returns: `void`

--------

### Events
SDK Media Utility implements the same `EventEmitter` interface and strict-typings that the base WebRTC SDK does. 
See [SDK Events] for the full list of inherited functions.

#### `audioTrackVolume`

Event emitted for microphone volume changes. Event includes the
 media track, volume average, if the mic is muted,
 and the sessionId (if available).

The sessionId will only be available if the media was created
with a `session` or `sessionId` passed into with the
media request options (See [IMediaRequestOptions]).

This will emit every `100ms` with the average volume during that time range.

This event can be used to determine if a microphone is not picking
 up audio. Reasons for this can be the microphone is on "hardware mute"
 or the OS does not have microphone permissions for the given browser
 being used. Both of these reasons cannot be detected on the media track
 and can only be "guessed" based on no audio being picked up from the mic. 


Declaration:
``` ts
sdk.media.on('audioTrackVolume', (event: {
    track: MediaStreamTrack;
    volume: number;
    muted: boolean;
    sessionId?: string;
  }) => { });
```
Value of event: 
* `track: MediaStreamTrack` – the audio track the volume is emitting for
* `volume: number` – average volume of audio received during time range
* `muted: boolean` – flag indicating if the track is not `enabled` or
  is `muted`. If this is `true`, the volume will always be `0`
* `sessionId?: string` – Optional: the sessionId using this audio track.


#### `state`

Event emitted whenever the media state changes.
 `event.eventType` will match the other event that
   is emitted on.

Example: if the devices changed, the following will emit:
``` ts
sdk.media.on('state', evt => {/* evt.eventType === 'devices' */});
```

which means that the `'devices'` event will also emit
``` ts
sdk.media.on('devices', evt => {/* evt.eventType === 'devices' */});
```

Declaration:
``` ts
sdk.media.on('state', (state: SdkMediaStateWithType) => { });
```
Value of event: 
* See [SdkMediaStateWithType]
* See the [devices event](#devices) and [permissions event](#permissions) 
  for info on other state events


#### `devices`
Event when devices change.

> Note: this will only fire when devices change.
 For example: if `sdk.media.enumerateDevices()` is
 called multiple times, `sdk.media.on('devices', evt)
 will only fire once _unless_ the devices are different
 on subsequent enumerations. This ensures `enumerateDevices()`
 can be called many times without the event emitting
 with duplicate data.

  devices: SdkMediaStateWithType;
Declaration:
``` ts
sdk.media.on('devices', (state: SdkMediaStateWithType) => { /* evt.eventType === 'devices' */});
```
Value of event: 
* See [SdkMediaStateWithType]


#### `permissions`
Event when media permissions change. Values
that trigger this event are any of the following
in the [ISdkMediaState]: 
``` ts 
  hasMicPermissions: boolean;
  hasCameraPermissions: boolean;
  micPermissionsRequested: boolean;
  cameraPermissionsRequested: boolean;
```
For example, when calling through to 
  `sdk.media.requestMediaPermissions('audio')`, this
  event will emit two times: 
 1. for `micPermissionsRequested` changing to `true`
  (which happens right before requesting `getUserMedia()`)
  event will emit two times: 
 2. for `hasMicPermissions` changing to `true` or `false`
  depending on the outcome of the `getUserMedia()` request


> Note: in some browsers, permissions are not always guaranteed even after 
using [requestMediaPermissions()](#requestmediapermissions) to gain permissions. See [Firefox Behavior] for more details. 
It is recommended to use this event to watch for changes
in permissions since permissions could be denied anytime [startMedia()](#startmedia) is called. 

Declaration:
``` ts
sdk.media.on('permissions', (state: SdkMediaStateWithType) => { /* evt.eventType === 'permissions' */});
```

Value of event: 
* See [SdkMediaStateWithType]

--------


### Interfaces

#### SdkMediaStateWithType
This is used when emitting state changes on `sdk.media.on('state', (evt: SdkMediaStateWithType) => {})`
to determine what event type caused the state change. 

``` ts
type SdkMediaStateWithType = ISdkMediaState & {
  eventType: SdkMediaEventTypes;
};
```
* See [ISdkMediaState] for inherited properties
* `eventType: SdkMediaEventTypes` – event type that triggered the event
  * Available options: `state | devices | permissions`
    * Note: `audioTrackVolume` events do not trigger `'state'` events
  * See [Events](#events) for more details on when these events emit


#### ISdkMediaState
The current state of devices, permissions, and other media related information: 
``` ts
interface ISdkMediaState {
  devices: MediaDeviceInfo[];
  oldDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  outputDevices: MediaDeviceInfo[];
  hasMic: boolean;
  hasCamera: boolean;
  hasMicPermissions: boolean;
  hasCameraPermissions: boolean;
  hasOutputDeviceSupport: boolean;
  micPermissionsRequested: boolean;
  cameraPermissionsRequested: boolean;
}
```
* `devices: MediaDeviceInfo[]` – a list of all current devices
* `oldDevices: MediaDeviceInfo[]` – a list of all devices from the last emission. This will only
   differ from `devices` if `devices` changed. Otherwise, these devices will match `devices`. 
   This is useful for diffing which devices changed.
* `audioDevices: MediaDeviceInfo[]` – a list of all current audio (microphone) devices
* `videoDevices: MediaDeviceInfo[]` – a list of all current video (camera) devices
* `outputDevices: MediaDeviceInfo[]` – a list of all current output (speaker) devices
* `hasMic: boolean` – does at least one audio device exist
* `hasCamera: boolean` – does at least one video device exist
* `hasMicPermissions: boolean` – flag indicating if microphone permissions have been granted
* `hasCameraPermissions: boolean` – flag indicating if camera permissions have been granted
* `hasOutputDeviceSupport: boolean` – flag indicating if the browser supports output devices
* `micPermissionsRequested: boolean` – internal flag indicating if microphone permissions have been requested yet
* `cameraPermissionsRequested: boolean` – internal flag indicating if camera permissions have been requested yet

#### IMediaRequestOptions
Interface for defining the SDK's contract for requesting media.

> Important note: anywhere in the SDK where media can be requested this contract will apply. 
* `string` for a specified deviceId
* `true` for sdk default deviceId 
* `null` for system default device
* `false|undefined` to not request or update media type

``` ts
interface IMediaRequestOptions {
  audio?: string | boolean | null;
  video?: string | boolean | null;
  videoResolution?: {
    width: ConstrainULong,
    height: ConstrainULong
  } | false;
  videoFrameRate?: ConstrainDouble | false;
  monitorMicVolume?: boolean;
  session?: IExtendedMediaSession;
}
```
* `audio?: string | boolean | null` – Optional: value for how to request audio media 
  (See important note above explaining available options)
* `video?: string | boolean | null` – Optional: value for how to request video media 
  (See important note above explaining available options)
* `videoResolution?: { width: ConstrainULong, height: ConstrainULong } | false` – Optional:
  Video resolution to request from getUserMedia. Default is SDK configured 
  resolution. `false` will explicitly not use any resolution including the sdk default
  * ```ts
    type ConstrainULong = number | {
      exact?: number;
      ideal?: number;
      max?: number;
      min?: number;
    }
    ```
* `videoFrameRate?: ConstrainDouble | false` – Optional: default value is `{ ideal: 30 }` – 
  Video frame rate to request from getUserMedia. `false` will explicitly not use any frameRate.
  * Example, if is set `videoFrameRate: { ideal: 45 }` then the translated constraint to   
   `getUserMedia` will be `video: { frameRate: { ideal: 45 } }`
* `monitorMicVolume?: boolean` – Optional: default is SDK configured default – Flag to emit volume 
  change events for audio tracks. If this is a `boolean` value, it will override the SDK
  default configuration of `monitorMicVolume`. If it is not a `boolean` (ie. left `undefined`) then 
  the SDK default will be used
* `session?: IExtendedMediaSession` – Optional: Session to associate logs to. It will also tie 
  `audioTrackVolume` events to a sessionId if requesting audio with `monitorMicVolume = true`

#### IUpdateOutgoingMedia
Interface for available options when requesting to update outgoing media.
``` ts
interface IUpdateOutgoingMedia extends ISdkMediaDeviceIds {
  sessionId?: string;
  session?: IExtendedMediaSession;
  stream?: MediaStream;
}
```
* See [ISdkMediaDeviceIds] for deviceId options
* `sessionId?: string` – Optional: session id to update media for (this _OR_ `session` is required)
* `session?: IExtendedMediaSession` – Optional: session to update media for (this _OR_ `sessionId` is required)
* `stream?: MediaStream` – Optional: `MediaStream` to update the session with

#### ISdkMediaDeviceIds
Interface for defining the SDK's contract for how to request media with specific deviceIds.

> See note for [IMediaRequestOptions] requesting media requesting params

``` ts
interface ISdkMediaDeviceIds {
  videoDeviceId?: string | boolean | null;
  audioDeviceId?: string | boolean | null;
}
```
* `videDeviceId?: string | boolean | null` – Optional: Request video media in the following manner:
   * `string` for a specified deviceId
   * `true` for sdk default deviceId
   * `null` for system default device
   * `false|undefined` to not request video
* `audioDeviceId?: string | boolean | null` – Optional: Request audio media in the following manner:
   * `string` for a specified deviceId
   * `true` for sdk default deviceId
   * `null` for system default device
   * `false|undefined` to not request audio


## Important Notes About Media in the Browser
There are many nuances and differences with how individual browsers and Operating Systems (OS) 
handle media, errors, devices, and permissions. The SDK attempts to account for as many
of these as possible. Here are some limitations and observations when working with 
media in the browser: 

### Mac OS
On macOS, the user has to grant the browser permission to use certain media. These options can
be found at **System Preferences > Security & Privacy > Privacy**. Here are the following permissions
and their corresponding responses:
* **Camera**
  * If not granted, the browser will throw an error when attempting to request video media
* **Microphone**
  * If not granted, the browser _will still return_ an audio media track that looks normal and 
    not throw an error. However, there will be _no actual audio_ 
    being picked up by the microphone. It will act as if in a **hardware mute** state. See
    [Microphone OS Permissions and Hardware Mute] for more information.
* **Screen Recording** (which is the permission needed for sharing a screen)
  * If not granted, the browser will still prompt the use for a scren selection. However, the 
    user will only be able to share the browser-in-use window _or_ any desktop screen 
    _with only the background present_ (ie. they will not see any other applications). 


### Microphone OS Permissions and Hardware Mute
There is no way for the browser to know if a microphone is in a **hardware mute** state. 
When a microphone is in a hardware mute state, the audio media track will still appear
to be normal (meaning `track.enabled === true` & `track.muted === false`). However, 
there will be _no actual audio_ being picked up by the microphone. 

Two reasons a microphone would end up in **hardware mute**:
1. The microphone has a mute button on the physical device, external of the browser
2. The OS has not been granted permissions for microphone usage. See [Mac OS] for more 
    information about OS permissions and behaviors. 
    
To account for hardware mute scenarios, you will need implement logic for checking 
the volume on an audio track. See the [audioTrackVolume event](#audiotrackvolume) for 
more details. Also, see [requestMediaPermissions()](#requestmediapermissions) for important
notes about requesting audio permissions when the OS has not given permissions. 

### Chrome Behavior
Chrome handles media and permissions in a very straight forward manner. 

#### Normal Chrome Instance
If a user grants or denies permissions for a media type then
the decision will be remembered for that domain _until_ the user manually
resets the permission via chrome settings. 

#### Incognito Chrome Instance
If a user grants or denies permissions for a media type then
the decision will only be remembered as long as the chrome
instance is alive. Once the window closes, all previous permissions
reset. The user also still has the option to reset permissions
via chrome settings.

#### Screen Share in Chrome
If a user denies screen share permissions in chrome by clicking
the **Cancel** button on the screen selection prompt, you will 
still be able to request the screen stream to prompt the 
user to select a screen again. 


### Firefox Behavior

Firefox has a **Remember this decision** (Rtd) checkbox when prompting for a media type. 
This checkbox changes the behavior for both Normal and Private Firefox instances in 
different ways. 

* If **Rtd** _is_ checked: 
  * The media type and domain will be added to Firefox's privacy tab with 
    the selected decision. (You can navigate to `about:preferences#privacy` then 
    scroll down to the **Permissions** section to view remembered media decisions
    and domains). 
  * For permissions granted: the media type will not prompt for user approval
    of any future media requests for the granted media type. 
  * For permissions denied: the browser will throw an error for denied permissions
    and never ask the user for approval for any future media requests (until
    the permission setting is reset)
* If **Rtd** _is not_ checked: 
  * The media type and domain will not be added to Firefox's privacy tab
    with the selected decision
  * For permissions granted: the media type will always prompt for user 
    approval of any future media requests. Meaning the user will have to 
    approve any new media requests even if they have already approved some
    in the past. 
  * For permissions denies: the media type will still prompt for user 
    approval of any future media requests. Meaning the user will again have 
    the option to approve or deny any new media requests even if they have denied some
    in the past. 

A few caveats about **Rtd** behavior: 
* **Rtd** is _not_ presented to users if they are using Firefox in Private Mode. This is the main 
  difference between a regular Firefox instance and a Private Mode Firefox instance.
* If **Rtd** is checked in a _non_ Private Mode browser, the domain & media type
  result will still be read by Private Mode browsers.
    * Example: if **Rtd** is checked for approving `audio` on `https://yourwebsit.com`, the 
      user will not be prompted for `audio` media permissions on `https://yourwebsit.com` 
      even if they visit that site in a Private Mode Firefox instance. 
* Since permissions are not always guaranteed in Firefox because of the **Rtd** behavior, even after using 
  [requestMediaPermissions()](#requestmediapermissions) to gain permissions, it is recommended 
  to use the [permissions event](#permissions) to watch for changes in the permissions state 
  since permissions could be denied anytime [startMedia()](#startmedia) is called. 


#### Screen Share in Firefox
If a user denies screen share permissions in Firefox by clicking
the **Cancel** button on the screen selection prompt, you will 
still be able to request the screen stream, however, it will throw
an error instantly and not prompt the user to select a screen. In 
order to reset the permission to allow for the prompt again, 
the user has to do 1 of 2 things:
1. Refresh the browser
2. Reset the screen share permissions (which will be set to 
  _"Share the Screen – Temporarily Blocked"_. This can be found by clicking the button
  just to the left of the URL in the navigation bar).

One way to account for this is to time how long it takes for [startDisplayMedia()](#startdisplaymedia)
to throw a permissions error. If it is almost instant, then you may be able to assume that the 
user has temporarily denied screen share permissions. 

[SDK Events]: index.md#events

[Why Use SdkMedia?]: #why-use-sdkmedia
[SdkMedia]: #sdkmedia
[Example usage]: #example-usage
[Methods]: #methods
[Events]: #events
[Interfaces]: #interfaces
[Important Notes About Media in the Browser]: #important-notes-about-media-in-the-browser

[Mac OS]: #mac-os
[Microphone OS Permissions and Hardware Mute]: #microphone-os-permissions-and-hardware-mute
[Firefox Behavior]: #firefox-behavior
[Screen Share in Firefox]: #screen-share-in-firefox

[SdkMediaStateWithType]: #sdkmediastatewithtype
[ISdkMediaState]: #isdkmediastate
[IMediaRequestOptions]: #imediarequestoptions
[ISdkMediaDeviceIds]: #isdkmediadeviceids