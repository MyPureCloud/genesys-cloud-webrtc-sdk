# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# [Unreleased](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v4.0.1...HEAD)
### Added
* added client logger to spigot tests for test debugability

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
