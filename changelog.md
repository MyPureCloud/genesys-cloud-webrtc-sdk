#Changelog

## v3.1.0
* Screen pinning for video
* Input and Output device management

## v3.0.0
* Change to a typescript implementation
* Add `sdk.acceptSession` to be used in lieu of `session.accept()` in order to do some things before `session.accept()`
* Add support for upcoming video conferencing feature
* Use the latest streaming client which supports reallocating a new channel on no_longer_subscribed

#### Breaking Changes
* Calling `session.accept()` manually which was the normal workflow after receiving the `sessionStarted` event is no longer supported and may have unpredictable outcomes. Use `sdk.acceptSession(options)` now.
