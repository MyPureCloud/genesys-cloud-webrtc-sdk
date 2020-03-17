# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


# [Unreleased]

### Added
* support for input and output devices
* Screen pinning for video

### Changed
* sdk.startVideoConference and sdk.startScreenShare now return Promise<{ conversationId: string }>

# [v3.1.0]

### Deprecated
* SDK config option `iceTransportPolicy`

### Added
* Listeners to the video screen sharing stream to update the session when a user clicks the browser "Stop Sharing Screen" button

### Changed
* Do not request ice servers if there is no connection
* Set iceTransportPolicy to `relay` if only turn servers are received
* Update some typings

# [v3.0.1]

### Changed
* Stop video conference screen share stream when the session ends

# [v3.0.0]

### Breaking Changes
* Calling `session.accept()` manually which was the normal workflow after receiving the `sessionStarted` event is no longer supported and may have unpredictable outcomes. Use `sdk.acceptSession(options)` now.

### Added
* `sdk.acceptSession` to be used in lieu of `session.accept()` in order to do some things before `session.accept()`

#### Changed
* Moved code base to a typescript implementation


[Unreleased]: https://github.com/MyPureCloud/purecloud-webrtc-sdk/compare/v3.1.0...HEAD
[v3.1.0]: https://github.com/MyPureCloud/purecloud-webrtc-sdk/compare/v3.0.1...v3.1.0
[v3.0.1]: https://github.com/MyPureCloud/purecloud-webrtc-sdk/compare/v3.0.0...v3.0.1
[v3.0.0]: https://github.com/MyPureCloud/purecloud-webrtc-sdk/compare/v2.1.0...v3.0.0
