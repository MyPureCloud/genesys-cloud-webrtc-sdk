#Changelog

## v3.0.0
* Change to a typescript implementation
* Add `sdk.acceptSession` to be used in lieu of `session.accept()` in order to do some things before `session.accept()`

#### Breaking Changes
* Calling `session.accept()` manually which was the normal workflow after receiving the `sessionStarted` event is no longer supported and may have unpredictable outcomes. Use `sdk.acceptSession(options)` now.
