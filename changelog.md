# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# [Unreleased](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v6.1.0...HEAD)
### Fixed
* [PCM-1706](https://inindca.atlassian.net/browse/PCM-1706) - Allow certain actions that affect the default to work before the sdk has been formally initialized.

# [v6.1.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v6.0.1...v6.1.0)

### Maintenance
* Merged dependabot PRs
### Added
* [PCM-1669](https://inindca.atlassian.net/browse/PCM-1669) - Added functionality to start softphone calls from SDK.
* [PCM-1624](https://inindca.atlassian.net/browse/PCM-1624) - Added logging for failed HTTP requests to console, consuming formatRequestError from streaming-client to remove potential PII from errors.
* Exposed the `sdk.media.isPermissionsError(error)` function for consumers to be able to utilize. See [the docs for isPermissionsError()](doc/media.md#ispermissionserror).
* Added a `'both'` option to `sdk.media.requestMediaPermissions()`. See [the docs for requestMediaPermissions()](doc/media.md#requestmediapermissions).
* Added `preserveMediaIfOneTypeFails` & `retryOnFailure` to `IMediaRequestOptions`. See [the docs for IMediaRequestOptions](doc/media.md#imediarequestoptions).
### Fixed
* [PCM-1679](https://inindca.atlassian.net/browse/PCM-1679) and [Issue #576](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/issues/576)– Fixed package.json `browser` and `module` fields, as well as added a `cjs` field. Added `core-util-is` (a dep of `stanza`) to compiled webpack build used under `main`and `browser` fields.
* [PCM-1693](https://inindca.atlassian.net/browse/PCM-1693) - Fixed event listeners for media tracks by adding in a check for the amount of `audioTracks`; if no `audioTracks` are present, the default media stream is cleaned up. Also passed in value that represents the tracks to be removed which were not present previously.
* [PCM-1647](https://inindca.atlassian.net/browse/PCM-1647) – Fixed issue where `requestedMicPermissions` would be
  `true` before we knew if `hasMicPermissions` was also `true` (same for `camera` permissions). This bug was causing
  it to be impossible for consumers to know for certain by looking at the `SdkMediaState` as to whether permissions
  were actually granted (due to the bad timing of setting the state).
### Deprecated
* Deprecting `retryOnFailure` function param for `sdk.media.startMedia(options, retryOnFailure)`. Moved to be an
  option in `IMediaRequestOptions`. See the **Added** section for this release for more info.
# [v6.0.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v6.0.0...v6.0.1)
### Fixed
* [PCM-1628](https://inindca.atlassian.net/browse/PCM-1628) – Fixed issue where debounce time was causing `users.{id}.conversations` subscription to fail.

# [v6.0.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v5.0.9...v6.0.0)
### Added
* Added internal option `reason` to the `IEndSessionRequest` interface
* Added `sdk.media` class to handle and emit media related tasks. See [media documentation](doc/media.md) for more details
  * `sdk.media.on(...)` event emitter.
  * permissions and device management housed in `sdk.media`
* [PCM-1510](https://inindca.atlassian.net/browse/PCM-1510) – Be able to specify jidResource for clients (streaming client)
* [PCM-1538](https://inindca.atlassian.net/browse/PCM-1538) – add `sdk.setAccessToken(token)` function to allow for updating the
  auth token on an already initialized sdk instance.
* [PCM-1576](https://inindca.atlassian.net/browse/PCM-1576) - Be able to control audio volume on video and audio elements. see `sdk.updateAudioVolume`.

### Changed
* Updated documentation.
* extra audio constraints which were google only, now apply to all browsers
* A few audio constraints are configurable as sdk defaults
* [PCM-1514](https://inindca.atlassian.net/browse/PCM-1514) – Guest acd screen share no longer cares about `config.autoConnectSessions`. Sessions were
  already auto accepted. That check was only throwing an error if `autoConnectSessions` was `false`.

### Fixed
* [PCM-1602](https://inindca.atlassian.net/browse/PCM-1602) – fix errors when changing devices and there's no track on the sender
* [PCM-1509](https://inindca.atlassian.net/browse/PCM-1509) – fixed sdk's `defaults.audioStream` to not be destroy when ending a session.
  Has Firefox limitations. See documentation.
* [PCM-1512](https://inindca.atlassian.net/browse/PCM-1512) – fixed softphone and video `acceptSession` to respect media options of `null`
  as being `system default` requests.
* [PCM-1522](https://inindca.atlassian.net/browse/PCM-1522) – fixed `sdk.updateOutgoingMedia()` to respect media options of `null`

### Breaking Change
* Updated configuration options for constructing an SDK instance (see [docs](doc/index.md) for new config)
  * Removed configuration option `iceServers: IceServerConfiguration[]` and `iceTransportPolicy`
  * Moved defaults into a nested `config.default = {}` object
* Changed `IAcceptSessionRequest`, `IEndSessionRequest`, and `ISessionMuteRequest` interfaces to require a `sessionId`
  in place of the non-descriptive `id` field. This contract change will impact calls to:
    * `sdk.acceptSession({sessionId: string;})`
    * `sdk.endSession({sessionId: string;})`
    * `sdk.setVideoMute({sessionId: string;})`
    * `sdk.setAudioMute({sessionId: string;})`
    * See [docs](doc/index.md) for method parameters
* Removed `sdk._refreshIceServers()` function which was not an advertised function. Refreshing ice servers is now handled in streaming-client directly

* Moved & renamed `sdk.createMedia(opts)` to `sdk.media.startMedia(opts)`
* Moved `sdk.getDisplayMedia(opts)` to `sdk.media.startDisplayMedia(opts)`
* `sdk.updateOutputDevice()` will now log a warning and do nothing if called in an unsupported browser.
  Old behavior was to throw an error.
* Updated `sdk.on('handledIncomingRtcSession', evt => {})` typing to be a `sessionId: string` and not an `IExtendedMediaSession`.
  Event already emitted the `sessionId`. This fixes the typing.

# [v5.0.9](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v5.0.8...v5.0.9)
### Fixed
* [PCM-1547](https://inindca.atlassian.net/browse/PCM-1547) - bump streaming client to fix jingle retract and jingle reject message handling

# [v5.0.8](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v5.0.7...v5.0.8)
### Fixed
* [PCM-1588](https://inindca.atlassian.net/browse/PCM-1588) - fix locating the participant on softphone calls with multiple participants for the same user

# [v5.0.7](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v5.0.6...v5.0.7)
### Fixed
* [PCM-1584](https://inindca.atlassian.net/browse/PCM-1584) - dont spin up a camera stream when updating outgoing media for softphone even if videoDeviceId is provided

# [v5.0.6](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v5.0.5...v5.0.6)
### Fixed
* [PCM-1572](https://inindca.atlassian.net/browse/PCM-1572) – bump streaming-client to v13.2.3 not retry subscription requests
* [PCM-1505](https://inindca.atlassian.net/browse/PCM-1505) – fix changing camera while muted breaks device selector.
* [PCM-1552](https://inindca.atlassian.net/browse/PCM-1552) – bump streaming-client to v13.2.2 to fix timer throttling in chrome v88
* [PCM-1559](https://inindca.atlassian.net/browse/PCM-1559) – remove PII from logging (streaming-client v13.2.2 bump removes PII from its logs too)

### Added
* [PCM-1540](https://inindca.atlassian.net/browse/PCM-1540) – bump streaming-client (v13.2.1) and use its http-client to make http requests. This adds better error logging and retry logic

# [v5.0.5](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v5.0.4...v5.0.5)
### Fixed
* [PCM-1525](https://inindca.atlassian.net/browse/PCM-1525) bump streaming client version to fix acd screen share attr.

# [v5.0.4](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v5.0.3...v5.0.4)
### Fixed
* [PCM-1501](https://inindca.atlassian.net/browse/PCM-1501) fix streaming client unsubscribe; fixes a bug where rejoining a video in ff fails.

# [v5.0.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v5.0.2...v5.0.3)
### Fixed
* [PCM-1498](https://inindca.atlassian.net/browse/PCM-1498) bump streaming-client to fix ice transport policy issue

# [v5.0.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v5.0.1...v5.0.2)
### Fixed
* [PCM-1474](https://inindca.atlassian.net/browse/PCM-1474) bump streaming-client

# [v5.0.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v5.0.0...v5.0.1)
### Fixed
* [PCM-1471](https://inindca.atlassian.net/browse/PCM-1471) clean up screenShareStream if session ends while sharing screen

# [v5.0.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v4.1.2...v5.0.0)
### Breaking Changes
* The SDK no longer supports legacy stream-based actions. Minimum required versions can be found here: https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addTransceiver
* `SDK.on('error' ...)` has been changed to `SDK.on('sdkError' ...)`

### Changed
* Remove stats-gatherer so it can be moved up the dependency tree
* Updated to latest streaming-client

### Fixed
* [PCM-1454](https://inindca.atlassian.net/browse/PCM-1454) – fix talker change events in Firefox. Root cause, the trackIds on FF RTCReceivers did not match the conversation tracks[].sinks for participants. Solution is to parse the remote SDP offer to attain the trackId from the msid.
* [PCM-1440](https://inindca.atlassian.net/browse/PCM-1440) – changed `getUserMedia` [constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) with a deviceId to be `ideal` rather than `exact` to avoid `NotFound` errors if called with a bad deviceId. Example:
``` js
constraints = {
  video: {
    deviceId: { ideal: 'device-id-hash' }
  }
};
```
* [PCM-1462](https://inindca.atlassian.net/browse/PCM-1462) – Firefox does not switch camera when deviceId uses `ideal`. Switched to `exact` if the browser is Firefox

### Maintenance
* Merged dependabot PRs

# [v4.1.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v4.1.1...v4.1.2)
### Fixed
* [PCM-1442](https://inindca.atlassian.net/browse/PCM-1442) – added `audioElement.setSinkId` to `base-session-handler.ts#acceptSession()` so the sdk default output deviceId is used when accepting a video or softphone session.

### Maintenance
* Merged dependabot PRs

# [v4.1.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v4.1.0...v4.1.1)
### Fixed
* [PCM-1408](https://inindca.atlassian.net/browse/PCM-1408) – moved `getDisplayMedia` request to `startScreenShare` for acd-screenshare. Firefox needs a `userGesture` in order to request the screen.
The Request is now handled on `session-init`, but requested at the beginning (before the propose).
* [WC-801](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/pull/268) – added `@babel/plugin-transform-property-mutators` to webpack/babel plugins to properly polyfill cdn bundle for IE11.
* [PCM-1428](https://inindca.atlassian.net/browse/PCM-1428) – in chrome, if you were using the system default audio device and then changed the default on the system level, the sdk would not start a audio with the new system default.

### Added
* [PCM-1426](https://inindca.atlassian.net/browse/PCM-1426) – better logging around devices. It will log devices in use we a session starts and when the devices change.

### Maintenance
* Merged dependabot PRs

# [v4.1.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v4.0.1...v4.1.0)
### Added
* added client logger to spigot tests for test debugability
* bumped streaming-client to v12.0.2

# [v4.0.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v4.0.0...v4.0.1)
### Fixed
* README to show the correct cdn url
* [Issue #235](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/issues/235) which threw `Uncaught TypeError: Cannot assign to read only property 'exports' of object '#<Object>'`
* Bumped to streaming-client v12.0.1

### Maintenance
* Merged dependabot PRs

# [v4.0.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.6.7...v4.0.0)
### Breaking Changes
* Renamed app / repo to `GenesysCloudWebrtcSdk` / `genesys-cloud-webrtc-sdk`
* cdn url also changed to: https://sdk-cdn.mypurecloud.com/webrtc-sdk/genesys-cloud-webrtc-sdk.bundle.min.js
* Changed the build output and `package.json#main` to point at compiled src rather than bundling for node. There is still a `.bundle.js` version for the cdn.
* Upgraded to typescript v3.9.x which can potentially break projects using older versions of ts (ie. 3.6.x)

### Added
* Bumped `webrtc-stats-gatherer` to v8
* Bumped `purecloud-platform-client-v2` to v86
* Bumped `typescript` to v3.9.x

### Maintenance
* Merged dependabot PRs
* Removed semistandard and ts-loader

# [v3.6.7](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.6.6...v3.6.7)
### Fixed
* updateOutgoingMedia now cleans up existing media correctly (async issue)
* [#165](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/issues/165) where cdn build does not export as default
* Adjusted `create-manifest.js` to dynamically add all files starting with `genesys-cloud-webrtc-sdk`

# [v3.6.6](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.6.5...v3.6.6)
### Fixed
* orignalRoomJid now showing up on IJingleSession

# [v3.6.5](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.6.4...v3.6.5)
### Added
* fromUserId added to session for 1:1 video calls

### Changed
* Media for screen share is no longer spun up prior to `sessionInit

# [v3.6.4](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.6.3...v3.6.4)
### Changed
* Bumped streaming client version

# [v3.6.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.6.2...v3.6.3)
### Added
* Added enum for Jingle Reasons

### Fixed
* Fix signature for retract handler

# [v3.6.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.6.1...v3.6.2)
### Fixed
* make sure output device(s) is available when devices change

### Changed
* added session ids to logging around devices

# [v3.6.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.6.0...v3.6.1)
### Added
* Added ideal frameRate constraint to screenShare and video
* Apply track constraints based on the media automatically

### Changed
* When possible, replace sender tracks directly instead of removing the track, then adding the new one

### Fixed
* Fixed the context for the logging handlers

# [v3.6.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.5.1...v3.6.0)
### Added
* `startVideoConference` now takes an optional `inviteeJid` param for sending a propose to the `inviteeJid`
* pending sessions can now be rejected with the `rejectPendingSession` function

### Fixed
* When `mediaDevices` fires a `devicechange` event, the sdk will check to make sure all sessions have
media from devices that are still available. It will attempt to update if the media is no longer available
_or_ it will set the session mute if there are no devices available to switch to.

### Security
* Merged [PR#138](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/pull/138) bumping `minimist`

### Maintenance
* Merged dependabot PRs

# [v3.5.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.5.0...v3.5.1)
### Fixed
* Updated the logger to a version that doesn't cause an infinite loop

# [v3.5.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.4.0...v3.5.0)
### Changed
* Replaced sdk logger with genesys-cloud-client-logger
### Fixed
* allow device switching in FireFox by stopping existing media before requesting new media

# [v3.4.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.3.0...v3.4.0)
### Added
* Be able to specific a desired video resolution with `createMedia`
* Default video resolution to highest possible (up to 4k)

# [v3.3.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.2.0...v3.3.0)
### Added
* Be able to only handle specified conversation types (allowedSessionTypes in the config)

# [v3.2.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.1.0...v3.2.0)
### Added
* Support for input and output devices
* Screen pinning for video
* Better handling of the log buffer size to mitigate 413's received from the logging endpoint

### Changed
* sdk.startVideoConference and sdk.startScreenShare now return Promise<{ conversationId: string }>

### Fixed
* sdk.initialize will no longer resolve before ice servers are fetched
* Only log the parts of conversation updates we care about instead of the whole event

# [v3.1.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.0.1...v3.1.0)

### Deprecated
* SDK config option `iceTransportPolicy`

### Added
* Listeners to the video screen sharing stream to update the session when a user clicks the browser "Stop Sharing Screen" button

### Changed
* Do not request ice servers if there is no connection
* Set iceTransportPolicy to `relay` if only turn servers are received
* Update some typings

# [v3.0.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v3.0.0...v3.0.1)

### Changed
* Stop video conference screen share stream when the session ends

# [v3.0.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v2.1.0...v3.0.0)

### Breaking Changes
* Calling `session.accept()` manually which was the normal workflow after receiving the `sessionStarted` event is no longer supported and may have unpredictable outcomes. Use `sdk.acceptSession(options)` now.

### Added
* `sdk.acceptSession` to be used in lieu of `session.accept()` in order to do some things before `session.accept()`

#### Changed
* Moved code base to a typescript implementation
