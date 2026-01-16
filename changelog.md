# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# [Unreleased](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.5.0...HEAD)

### Changed
* [STREAM-1122](https://inindca.atlassian.net/browse/STREAM-1122) - Bump streaming-client to v19.5.0.

# [v11.5.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.4.0...v11.5.0)
### Fixed
* [STREAM-1028](https://inindca.atlassian.net/browse/STREAM-1025) - Fix issue preventing monitoring observers from ending `liveScreenMonitoring` sessions and add accept session logic for observers.
* [STREAM-1027](https://inindca.atlassian.net/browse/STREAM-992) - Fix jid to session type evaluation for live monitor jids

### Added
* [STREAM-878](https://inindca.atlassian.net/browse/STREAM-992) - Added in check to properly pass in a boolean to the headset library to determine if we have other active calls

# [v11.4.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.3.4...v11.4.0)
### Added
* [STREAM-992](https://inindca.atlassian.net/browse/STREAM-992) - Added pull request template checklist.
* [STREAM-825](https://inindca.atlassian.net/browse/STREAM-825) - Add ability to send multiple tracks when screensharing
* [STREAM-777](https://inindca.atlassian.net/browse/STREAM-777) - Support live screen-monitoring

### Fixed
* [STREAM-990](https://inindca.atlassian.net/browse/STREAM-990) - Demo app: Store a copy of pendingSessions so freezing them doesn't affect the SDK's usage of those objects
* [STREAM-1025](https://inindca.atlassian.net/browse/STREAM-1025) - Fix issue causing wrong session handler to be used for `liveScreenMonitoring` sessions.

#### Changed
* [STREAM-981](https://inindca.atlassian.net/browse/STREAM-981) - Remove appid from IncomingStreamStatus interface

# [v11.3.4](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.3.3...v11.3.4)
### Fixed
* [STREAM-978](https://inindca.atlassian.net/browse/STREAM-978) - When the RTCPeerConnection is in a 'failed' state, clean up the session. Filter out voicemail participants from conversation update events. Fix potential TypeError when fetching conversations.
* [STREAM-987](https://inindca.atlassian.net/browse/STREAM-987) - Demo app: Memoize conversations so they don't change every render when nothing has changed

# [v11.3.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.3.2...v11.3.3)
#### Changed
* [#937] - Exposes raw webmessage data from conversation topic

# [v11.3.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.3.1...v11.3.2)
### Changed
* [STREAM-926](https://inindca.atlassian.net/browse/STREAM-926) - Updated screen recording metadata request to use `requestApiWithRetry` to retry failed requests with exponential backoff.
* [STREAM-912](https://inindca.atlassian.net/browse/STREAM-912) - Bump streaming-client to `19.4.0` to remove SDP answer payload from logging.
* [NO-JIRA] - Bump axios to `1.12.2` to address Snyk vulnerability.
* [STREAM-599](https://inindca.atlassian.net/browse/STREAM-599) - Addressed Snyk vulnerabilities and type insecurities in demo app.

### Added
* [STREAM-866](https://inindca.atlassian.net/browse/STREAM-850) - Generate a test report in JUnit.xml format

# [v11.3.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.3.0...v11.3.1)
# Changed
* [STREAM-850](https://inindca.atlassian.net/browse/STREAM-850) - Suppress `error.ininedgecontrol.session.inactive` errors to prevent consuming UIs from presenting benign errors

# [v11.3.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.2.3...v11.3.0)
# Added
* [STREAM-785](https://inindca.atlassian.net/browse/STREAM-785) - Added GitHub Actions for linting, testing, and building in an effort to make the build process more transparent and reliable.
* [STREAM-350](https://inindca.atlassian.net/browse/STREAM-350) - Accept JWT authentication for video conferencing.

# Changed
* [STREAM-798](https://inindca.atlassian.net/browse/STREAM-798) - Bump streaming-client to version 19.3.0 to pick up the following fixes/changes:
  - [STREAM-154](https://inindca.atlassian.net/browse/STREAM-154) - Track StanzaMediaSessions so events can still be processed if streaming-client is disconnected and reconnected.
  - [STREAM-155](https://inindca.atlassian.net/browse/STREAM-155) - Calling `disconnect` will now stop any in-progress connection attempts.
  - [STREAM-85](https://inindca.atlassian.net/browse/STREAM-85) - Handle connection transfer (`v2.system.socket_closing`) message from Hawk signaling a reconnect is necessary
  - [STREAM-653](https://inindca.atlassian.net/browse/STREAM-653) - Added fields to upgradeMediaPresence stanza definition.
* [STREAM-626](https://inindca.atlassian.net/browse/STREAM-626) - Removed pipeline infra from open-source. Updated CODEOWNERS.
* [STREAM-654](https://inindca.atlassian.net/browse/STREAM-654) - Changed logging for disableAutoAnswer to clarify that if the SDK has disableAutoAnswer, the consuming client should handle auto-answering calls.

### Fixed
* [#923](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/issues/923) - Update docs for `useServerSidePings` to reflect the correct default value of `false`.
* [STREAM-804](https://inindca.atlassian.net/browse/STREAM-804) - Bump client-logger to `4.2.17` and axios to `1.10.0` to address Snyk vulnerabilities. Added Github action for auditing dependencies.

# [v11.2.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.2.2...v11.2.3)
### Fixed
* [STREAM-582](https://inindca.atlassian.net/browse/STREAM-582) - Bump streaming-client to fix an issue where `session-initiate` was not ignored when SDP-over-XMPP was turned on for a session.

# [v11.2.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.2.1...v11.2.2)
### Added
* [STREAM-63](https://inindca.atlassian.net/browse/STREAM-63) - Adds in logic to use `customHeaders` in during the API requests

### Fixed
* [STREAM-534](https://inindca.atlassian.net/browse/STREAM-534) - Bump streaming-client to fix an issue where the sdpOverXmpp flag could be overwritten by simultaneous proposes.

# [v11.2.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.2.0...v11.2.1)
### Changed
* [STREAM-517](https://inindca.atlassian.net/browse/STREAM-517) - Remove address field from conversation update log because it could potentially contain PII.
* [STREAM-523](https://inindca.atlassian.net/browse/STREAM-523) - Updated `genesys-cloud-streaming-client` dependency to properly proxy `connectionState` event emit
* [STREAM-536](https://inindca.atlassian.net/browse/STREAM-536) - Removed references to WebRTC screenshare from docs and README as it is end of life and no longer supported.

# [v11.2.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.1.1...v11.2.0)
### Changed
* [STREAM-357](https://inindca.atlassian.net/browse/STREAM-357) - Updated streaming-client to maintain a JID resource across websockets/stanza instances. If a JID resource is not provided, a random UUID will be generated and saved for that streaming-client instance.

# [v11.1.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.1.0...v11.1.1)
### Fixed
* [STREAM-380](https://inindca.atlassian.net/browse/STREAM-380) - Bump streaming-client to include line break for ice candidate SDP to follow the spec

# [v11.1.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v11.0.0...v11.1.0)
### Changed
* [STREAM-315](https://inindca.atlassian.net/browse/STREAM-315) - Changed the details emitted by an error to be more aligned with other SDK errors and provide more information to the consuming app
### Fixed
* [STREAM-331](https://inindca.atlassian.net/browse/STREAM-331) - Updated headset library to fix a Plantronics issue and issue with Teams and Yealink

# [v11.0.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v10.0.0...v11.0.0)
### Breaking Changes
* Lru-cache was upgraded from v6 to v11 in a dependency (genesys-cloud-streaming-client), which uses newer language features. Depending on your language target version, you may need to configure a transpiler accordingly. For example, we added `plugin-transform-private-methods` to our Babel config for the SDK.

### Changed
* [STREAM-314](https://inindca.atlassian.net/browse/STREAM-314) - On streaming-client disconnected events, emit the value of autoReconnect so that consumers can determine if they should tear down their SDK or wait for streaming-client to reconnect. Updated docs to reflect this.

### Added
* [PCM-2081](https://inindca.atlassian.net/browse/PCM-2081) - Add ability to join a video conference using a meeting id

# [v10.0.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.3.2...v10.0.0)
### Breaking Changes
* The `initialize` method will now throw SdkErrors related to authentication with an `invalid_token` type (previously all errors from `initialize` would have an `initialization` type).

### Changed
* [STREAM-162](https://inindca.atlassian.net/browse/STREAM-162) - Authentication errors during `initialize` will now throw an SdkError of type `.invalid_token`.

### Fixed
* [STREAM-287](https://inindca.atlassian.net/browse/STREAM-287) - Fixed late arriving reinvites from terminating themselves.
* [STREAM-241](https://inindca.atlassian.net/browse/STREAM-241) - propagate mediaHelperRequired errors for eager persistent connections

# [v9.3.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.3.1...v9.3.2)
### Fixed
* [STREAM-259](https://inindca.atlassian.net/browse/STREAM-259) - updated softphone-vendor-headsets which added in guard for EPOS reject call to only bubble up events in the case of a "Notification" type message to avoid issues with "Acknowledgements"

### Added
* [no-jira] updated softphone-vendor-headsets which included a refactor for the VBeT implementation to better accommodate more devices; moved code out in favor of VBeT SDK

# [v9.3.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.3.0...v9.3.1)
### Fixed
* [no-jira] - deployment schedule change

# [v9.3.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.2.4...v9.3.0)
### Fixed
* [STREAM-253](https://inindca.atlassian.net/browse/STREAM-253) - Allow emission of non-solicited agent-video proposes
* [STREAM-245](https://inindca.atlassian.net/browse/STREAM-245) - Don't hold other active sessions if we're establishing an eager persistent connection (privAnswerMode === 'Auto').

# [v9.2.4](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.2.3...v9.2.4)
### Fixed
* [STREAM-218](https://inindca.atlassian.net/browse/STREAM-218) - bump streaming for priv-auto-answer on session object; dont create a conversation object for priv-auto-answer sessions.

# Added
* [STREAM-222](https://inindca.atlassian.net/browse/STREAM-222) - Created new SDK demo app using React/Vite.

# [v9.2.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.2.2...v9.2.3)
### Changed
* [NO_JIRA] - Bump client-logger to pick up fixes
### Fixed
* [STREAM-178](https://inindca.atlassian.net/browse/STREAM-178) - Dont try and hold session with dead peerConnections; bump streaming-client

# [v9.2.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.2.1...v9.2.2)
### Fixed
* [STREAM-174](https://inindca.atlassian.net/browse/STREAM-174) - Add a null check for conversation state lookup for held.
* [STREAM-172](https://inindca.atlassian.net/browse/STREAM-172) - Update axios to address Snyk vulnerability
* [STREAM-191](https://inindca.atlassian.net/browse/STREAM-191) - Fix for slow performance of `pruneConversationUpdateForLogging`

### Changed
* [STREAM-146](https://inindca.atlassian.net/browse/STREAM-146) - Updated logging for new JSON-RPC commands.

# [v9.2.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.2.0...v9.2.1)
### Fixed
* [STREAM-168](https://inindca.atlassian.net/browse/STREAM-168) - resetHeadsetState should not attempt if headset is not connected - softphone vendor headsets version bump.

# [v9.2.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.1.2...v9.2.0)
### Changed
* [STREAM-71](https://inindca.atlassian.net/browse/STREAM-71) - Support priv-answer-mode auto and add eagerPersistentConnectionEstablishment to config
* [STREAM-15](https://inindca.atlassian.net/browse/STREAM-15) - Move to modern modern Jest timers by telling Jest to not fake `nextTick`

# [v9.1.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.1.1...v9.1.2)
### Fixed
* [STREAM-22](https://inindca.atlassian.net/browse/STREAM-22) - fix for unhandled exception thrown from RXJS `first` operator when there are no elements from the Observable
* [STREAM-108](https://inindca.atlassian.net/browse/STREAM-108) - Update ws to address Snyk vulnerability

# [v9.1.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.1.0...v9.1.1)
### Fixed
* [STREAM-97](https://inindca.atlassian.net/browse/STREAM-97) - fix for pruning conversation events for logging when a session doesn't exist

# [v9.1.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.0.8...v9.1.0)
### Fixed
* [STREAM-73](https://inindca.atlassian.net/browse/STREAM-73) - fix for issue where Sennheiser/EPOS devices maintained a mute state when starting a new call
* [STREAM-74](https://inindca.atlassian.net/browse/STREAM-73) - fix for issue where the WebHID permission modal popped up constantly for Jabra
### Changed
* [no-jira] Use default of `false` for `useServerSidePings`
* [WEBRTCS-1106](https://inindca.atlassian.net/browse/WEBRTCS-1106) - bump streaming client for reinvite functionality
* [STREAM-82](https://inindca.atlassian.net/browse/STREAM-82) - Updated lots of dependencies. For full list, see attached ticket.

# [v9.0.8](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.0.7...v9.0.8)
### Changed
* [PCM-2360](https://inindca.atlassian.net/browse/PCM-2360) - removed session object from certain logs to reduce size
* [PCM-2352](https://inindca.atlassian.net/browse/PCM-2352) - Add option to control whether to use server-side pinging
* [no-jira] Use default of `true` for `useServerSidePings`

# [v9.0.7](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.0.6...v9.0.7)
### Changed
* [no-jira] Update uuid to v9.0.1

# [v9.0.6](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.0.5...v9.0.6)
### Added
* [PCM-2345](https://inindca.atlassian.net/browse/PCM-2345) - Added ability to pass in custom headers for telemetry purposes (internal use only). Bumped streaming-client and client-logger.

# [v9.0.5](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.0.4...v9.0.5)
### Added
* [no-jira] Bump to `Softphone Vendor Headsets` to support two new vendors: VBeT and CyberAcoustics
### Fixed
* [no-jira] Removed check for persistent connection to allow orchestration rejection for active calls and idle persistent connection
* [PCM-2319](https://inindca.atlassian.net/browse/PCM-2319) - move typescript to a dev dependency
* [PCM-1826](https://inindca.atlassian.net/browse/PCM-1826) - Fixed screen sharing in safari

# [v9.0.4](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.0.3...v9.0.4)
### Changed
* [PCM-2312](https://inindca.atlassian.net/browse/PCM-2312) bump logger version

# [v9.0.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.0.1...v9.0.3)
### Added
* [PCM-2302](https://inindca.atlassian.net/browse/PCM-2302) Added queue for headset events to prevent issues brought on by race conditions between events
### Changed
* [PCM-2297](https://inindca.atlassian.net/browse/PCM-2297) Update genesys-cloud-client-logger and genesys-cloud-streaming-client to fix Snyk vulnerabilities.
### Fixed
* [PCM-2293](https://inindca.atlassian.net/browse/PCM-2293) - Fixed issue where multiple instances of the sdk caused conflict with poly/plantronics headsets
* fix snyk vulnerabilities: axios and follow-redirects

# [v9.0.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v9.0.0...v9.0.1)
* [PCM-2276](https://inindca.atlassian.net/browse/PCM-2276) - update streaming client for nrproxy changes

# [v9.0.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.2.4...v9.0.0)
### BREAKING CHANGES
* Only one sdk instance will be allowed to have headset controls at any given time. Headset functionality is now orchestrated and negotiated between other instances of the sdk based on various factors. As such, we have changed the DeviceConnectionStatus type in order to union those states with orchestration states.

### Added
* [PCM-2224](https://inindca.atlassian.net/browse/PCM-2224) - Added headset orchestration flow. Opt out with `config.disableHeadsetControlsOrchestration`, but this will be temporary and will be removed without notice.
* [PCM-2250](https://inindca.atlassian.net/browse/PCM-2250) - Emit `sessionInterrupted` event when a session's `connectionState` becomes `interrupted`.
* [PCM-2276](https://inindca.atlassian.net/browse/PCM-2276) - Added nr events for media actions and first alerting conversation update

# [v8.2.4](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.2.3...v8.2.4)
* [PCM-2238](https://inindca.atlassian.net/browse/PCM-2238) - Bumped client logger to help with a fix for media helper

# [v8.2.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.2.2...v8.2.3)
### Fixed
* [PCM-2232](https://inindca.atlassian.net/browse/PCM-2232) - Fixed unholding a call and the sdk tries to hold ended session on persistent connection

# [v8.2.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.2.1...v8.2.2)
### Fixed
* [PCM-2229](https://inindca.atlassian.net/browse/PCM-2229) - Fixed an error that happened occasionally during a session-accept which would cause the session to not be accepted. Issue if there was a softphone session which had not yet received a conversation update.

# [v8.2.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.2.0...v8.2.1)
* [PCM-2220](https://inindca.atlassian.net/browse/PCM-2220) - Automatically accept a pendingSession that comes in after the "fake" pendingSession was answered

# [v8.2.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.1.6...v8.2.0)
* [PCM-2213](https://inindca.atlassian.net/browse/PCM-2213) - Allow dynamic adding and removing of supported session types

# [v8.1.6](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.1.5...v8.1.6)
* [PCM-2209](https://inindca.atlassian.net/browse/PCM-2209) - fixed issue where we incorrectly answer pending sessions which had their sessionIds updated due to a late propose (only affects persistent connection)
* [PCM-2192](https://inindca.atlassian.net/browse/PCM-2192) - removed session object from certain logs to reduce size

# [v8.1.5](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.1.4...v8.1.5)
### Fixed
* [PCM-2206](https://inindca.atlassian.net/browse/PCM-2206) - fixed bug preventing users from unholding a session on a multi-call, after ending a call while LA=100 with persistent connection.

# [v8.1.4](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.1.3...v8.1.4)
### Fixed
* [PCM-2203](https://inindca.atlassian.net/browse/PCM-2203) - fixed issue when trying to place or receive calls after cpu wake when persistent connection was active before sleep
* [PCM-2192](https://inindca.atlassian.net/browse/PCM-2192) - removed session object from certain logs to reduce size

# [v8.1.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.1.2...v8.1.3)
### Added
* [PCM-2190](https://inindca.atlassian.net/browse/PCM-2190) - add a hack to workaround the windows 11 "first call after reboot" issue
* [PCM-2187](https://inindca.atlassian.net/browse/PCM-2187) - hold other active sessions if line appearance is > 1.

### Changed
* [PCM-2196](https://inindca.atlassian.net/browse/PCM-2196) - Send screen recording metadatas when session connects instead at session-accept

# [v8.1.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.1.1...v8.1.2)
### Fixed
* [PCM-2145](https://inindca.atlassian.net/browse/PCM-2145) - Able to leave screenshare if unable to spin up previously selected media

# [v8.1.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.1.0...v8.1.1)
### Fixed
* [PCM-2184](https://inindca.atlassian.net/browse/PCM-2184) - bump softphone-vendor-headsets to fix snyk vuln
* [PCM-2108](https://inindca.atlassian.net/browse/PCM-2108) - fix `sdk.acceptSession` so it doesn't send the request to the backend more than once.
* [PCM-2162](https://inindca.atlassian.net/browse/PCM-2162) - fix `sessionStarted` events so they only get emitted once. (only affected softphone)

# [v8.1.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.11...v8.1.0)
### Added
* [PCM-2114](https://inindca.atlassian.net/browse/PCM-2114) - Allow sessions to be reestablished through a reinvite process.

# [v8.0.11](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.10...v8.0.11)
### Fixed
* [PCM-2159](https://inindca.atlassian.net/browse/PCM-2159) - bump headsets dep; fix demo app.

# [v8.0.10](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.9...v8.0.10)
### Fixed
* [PCM-2156](https://inindca.atlassian.net/browse/PCM-2156) - Export headset library types

# [v8.0.9](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.8...v8.0.9)
### Fixed
* [PCM-2140](https://inindca.atlassian.net/browse/PCM-2140) - Fixed issue where the SDK was not finding a pendingSession to update with LA100 and persistent connection on.
# [v8.0.8](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.7...v8.0.8)
### Fixed
* [PCM-2116](https://inindca.atlassian.net/browse/PCM-2116) - Fixed issue where users were not able to answer incoming calls on LA=100 and persistent connection on - caused by not updating sessionId on pendingSession. If we already have a pendingSession for a given conversationId, we will update the session to match the incoming propose's sessionId. Updated to ES2020 from ES6.
# [v8.0.7](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.6...v8.0.7)
### Fixed
* [PCM-2118](https://inindca.atlassian.net/browse/PCM-2118) - Fix format of data channel message types

# [v8.0.6](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.5...v8.0.6)
### Fixed
* [PCM-2093](https://inindca.atlassian.net/browse/PCM-2093) - Bump streaming client

# [v8.0.5](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.4...v8.0.5)
### Fixed
* [PCM-2089](https://inindca.atlassian.net/browse/PCM-2089) - Bump streaming client

# [v8.0.4](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.3...v8.0.4)
### Changed
* [PCM-2042](https://inindca.atlassian.net/browse/PCM-2042) - Updated streaming client to pull in the sdp over xmpp handling. This change should be backward compatible even though a lot of the tests changed to use the `id` property on the session instead of the `sid` property.

### Fixed
* [PCM-2060](https://inindca.atlassian.net/browse/PCM-2060) - Fixed issue allowing a user to have multiple video tracks. Fixed some minor issues in demo app.

# [v8.0.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.2...v8.0.3)
### Fixed
* [PCM-2058](https://inindca.atlassian.net/browse/PCM-2058) - bump streaming client in order to get fixed stats-gatherer

# [v8.0.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.1...v8.0.2)
### Added
* [PCM-2053](https://inindca.atlassian.net/browse/PCM-2053) - added a function to the sdk that allows changing `useHeadset` on demand.


# [v8.0.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v8.0.0...v8.0.1)
### Fixed
* [SERVOPS-33064](https://inindca.atlassian.net/browse/SERVOPS-33064) - Fixed issue where Jabra Native overwrites CEF registration, preventing the use of external links to place call

# [v8.0.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.4.2...v8.0.0)
### BREAKING CHANGES
* We have set the `useHeadsets` flag to default to false rather than true.  This way if a consumer of the SDK omits the headsets flag, it will default to using the original implementation rather than the new.  This has the user to opt in rather than opt out

* We have removed the `sdk.reconnect()` function. We updated the streaming client which includes a better approach to connection management. The `sdk.reconnect()` function
  made very little sense as it was and was little used. If you are using `sdk.reconnect()`, you'll instead need to do `await sdk.disconnect()` then `await sdk.connect()`.

### Fixed
* [PCM-2024](https://inindca.atlassian.net/browse/PCM-2024) - bump streaming client (major) to pull in all the connect/reconnect changes

# [v7.4.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.4.1...v7.4.2)
* [PCM-2020](https://inindca.atlassian.net/browse/PCM-2020) - Bump streaming-client and removed data-channel logs.
* [PCM-2004](https://inindca.atlassian.net/browse/PCM-2004) - handle webrtc line appearance migration
* [PCM-1998](https://inindca.atlassian.net/browse/PCM-1998) - added in line to properly remove inactive calls from the list of current calls for consuming apps
* [PCM-2007](https://inindca.atlassian.net/browse/PCM-2007) - fixed issue with switching device during active call putting Jabra devices in bad state

# [v7.4.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.4.0...v7.4.1)
* [PCM-1968](https://inindca.atlassian.net/browse/PCM-1968) - Bump streaming client for more verbose logging around interrupted connection states

# [v7.4.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.3.4...v7.4.0)
### Added
* [PCM-1972](https://inindca.atlassian.net/browse/PCM-1972) - Connect WebRTC data channel for video.
* [PCM-1789](https://inindca.atlassian.net/browse/PCM-1789) - Listen and emit `memberStatusMessage` when receiving a data channel message indicating someone is actively speaking.

### Fixed
* [PCM-1983](https://inindca.atlassian.net/browse/PCM-1983) - Fixed an issue where the SDK throws an error when a new station is associated

### Added
* [PCM-1977](https://inindca.atlassian.net/browse/PCM-1977) - Add a trace on beforeclose stating the window was closed and list the active conversations
* [PCM-1992](https://inindca.atlassian.net/browse/PCM-1992) - Update client logger so unsent logs get saved and sent in the future

# [v7.3.4](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.3.3...v7.3.4)
### Fixed
* [PCM-1974](https://inindca.atlassian.net/browse/PCM-1974) - Added in logic to properly handle auto answer scenarios
* [PCM-1975](https://inindca.atlassian.net/browse/PCM-1975) - Added in logic to properly handle auto answer scenarios

# [v7.3.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.3.2...v7.3.3)
### Changed
* [PCM-1965](https://inindca.atlassian.net/browse/PCM-1965) bump softphone vendor headsets

### Fixed
* [PCM-1944](https://inindca.atlassian.net/browse/PCM-1944) pulled in the new streaming-client so requestApiWithRetry will actually retry
* [PCM-1966](https://inindca.atlassian.net/browse/PCM-1966) fix a race condition when joining video and unmuting audio at the same time. We will now wait for the session to be stable before swapping the track on the sender.

# [v7.3.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.3.1...v7.3.2)
* [PCM-1856](https://inindca.atlassian.net/browse/PCM-1856) touched up and improved function for handling resolution changes
* [PCM-1948](https://inindca.atlassian.net/browse/PCM-1948) moved rxjs to be a full dependency rather than a dev dep.

# [v7.3.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.3.0...v7.3.1)
### Added
* [PCM-1856](https://inindca.atlassian.net/browse/PCM-1856) added function to the SDK that allows users to update the default video resolution

### Fixed
* [PCM-1912](https://inindca.atlassian.net/browse/PCM-1912) fixed rejecting non-acd softphone calls. They now go to voicemail.
* [PCM-1945](https://inindca.atlassian.net/browse/PCM-1945) fixed the logging url to use the backgroundassistant suffix for jwt auth
* [PCM-1938](https://inindca.atlassian.net/browse/PCM-1938) made small change so softphone session handling checks start with the most recent participant rather than the first

# [v7.3.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.2.3...v7.3.0)
### Added
* [PCM-1819](https://inindca.atlassian.net/browse/PCM-1819) added jwt support for background assistant which will use separate endpoints for logging and screen recording metadata

### Fixed
* [PCM-1911](https://inindca.atlassian.net/browse/PCM-1911) Added in logic to help with the ACD flow that checks for terminated/disconnected users if the user shows up twice in the participant update
* [PCM-1909](https://inindca.atlassian.net/browse/PCM-1909) – force terminate sessions so sdk.destroy doesn't hang in the case of persistent connection or LA==1
* [PCM-1913](https://inindca.atlassian.net/browse/PCM-1913) – Fixed the screen recording metadata request to use mids in place of trackIds.
* [PCM-1885](https://inindca.atlassian.net/browse/PCM-1885) – on `deviceschange` event from the window, SdkMedia should only validate all sessions if the `sessionManager` has already been initialized.
* [PCM-1922](https://inindca.atlassian.net/browse/PCM-1922) - update streaming client to 14

### Added
* [PCM-1993](https://inindca.atlassian.net/browse/PCM-1933) – added build, deploy, and publish notifications to the Jenkinsfile

# [v7.2.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.2.2...v7.2.3)
### Fixed
* [PCM-1893](https://inindca.atlassian.net/browse/PCM-1893) – added `useHeadsets: boolean` config option to allow "opting out" of the headset functionality.
  See [docs on constructing the SDK](doc/index.md#constructor) for more details.

# [v7.2.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.2.1...v7.2.2)
### Fixed
* [PCM-1887](https://inindca.atlassian.net/browse/PCM-1887) – Fixed how we create fake pending sessions for when line appearance == 1. Missed reference during refactor.

# [v7.2.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.2.0...v7.2.1)

### Fixed
* Worked on issue found in Volt when there wasn't a proper device found after changing default devices
* [PCM-1878](https://inindca.atlassian.net/browse/PCM-1878) – cleaned up logging for `sdk.acceptSession()` which was logging the HTML elements and media stream
  causing an infinite loop with the client-logger.
* Ran `npm audit fix` to update deps and resolve security vulnerabilities

# [v7.2.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.1.1...v7.2.0)
### Fixed
* [PCM-1668](https://inindca.atlassian.net/browse/PCM-1668) - Installed newer version of headset library that will help with some issues that were found as well as offer a better approach to rejecting calls.

### Added
* [PCM-1668](https://inindca.atlassian.net/browse/PCM-1668) - Integrate the new headset library into the SDK to allow device call controls for three headset vendors at the moment: Plantronics/Poly, Sennheiser/EPOS, Jabra

# [v7.1.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.1.0...v7.1.1)
### Fixed
* [PCM-1836](https://inindca.atlassian.net/browse/PCM-1836) - Remove circular ref issue when logging the session when updating default devices.

### Changed
* [PCM-1387](https://inindca.atlassian.net/browse/PCM-1387) - Made screenRecordingMetadata a required param for acceptSession for screen recording sessions; Those metadatas get sent to the server automatically.
* [PCM-1279](https://inindca.atlassian.net/browse/PCM-1279) – calling `sdk.setAccessToken()` will now also pass
    that token down to the streaming-client and the client-logger.

# [v7.1.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v7.0.0...v7.1.0)
### Fixed
* [PCM-1802](https://inindca.atlassian.net/browse/PCM-1802) - Fix screen recording sessions being characterized as collaborate video sessions.
* [PCM-1795](https://inindca.atlassian.net/browse/PCM-1795) – Do not request media when `sdk.updateDefaultDevices({ updateActiveSessions: true, ... })`
  is called and the session is already using the requested deviceId.
* [PCM-1798](https://inindca.atlassian.net/browse/PCM-1798) – Added logic to video session to check to make sure we received an initial conversation
  event from hawk. This fixes the issue where sometimes joining a video session happens before we subscribe and receive the initial conversation
    event from hawk – which leaves an empty list of participants in the session.
* [PCM-1812](https://inindca.atlassian.net/browse/PCM-1812) – Switched station lookup to use the `effectiveStation` and not the `associatedStation`.
  `effectiveStation` is the station in use for the user. It is computed based on some of the other fields.
      * Tuned up some logging around accepting softphone sessions with LA == 1.
* [PCM-1821](https://inindca.atlassian.net/browse/PCM-1821) – Fixed the way we add screen recording tracks so the tranceivers are not `recvonly`

### Added
* [PCM-1794](https://inindca.atlassian.net/browse/PCM-1794) – added `sdk.media.on('gumRequest' evt)` to notify consumers when the SDK makes a request to the
  `widow.navigator.mediaDevices.getUserMedia()` API. This helps consumers to react appropriately to handle browsers that will only fulfil `gUM()` requests
  if the window is in focus.
* [PCM-1797](https://inindca.atlassian.net/browse/PCM-1797) – added `sdk.setDefaultAudioStream(stream)` and `sdk.media.setDefaultAudioStream(stream)` (same function)
  to allow changing the sdk default audio stream.

### Maintenance
* [PCM-1790](https://inindca.atlassian.net/browse/PCM-1790) – switched over to use new pipeline.

# [v7.0.0](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v6.1.7...v7.0.0)
### BREAKING CHANGE
* If you are providing a *logger*:
    * the `ILogger` interface has changed. The last param for `log`, `debug`, `info`, `warn`, and `error` functions is no longer a simple boolean,
    it is an object. Please refer to the ILogger type for https://github.com/purecloudlabs/genesys-cloud-client-logger.
* [PCM-1742](https://inindca.atlassian.net/browse/PCM-1742) - Throws error and prevents session from starting if Streaming Client is not connected
* [PCM-1708](https://inindca.atlassian.net/browse/PCM-1708) – CDN now exports all SDK exports and not just the client.
* Must use `conversationId`s when interacting with a conversation and/or webrtc-session. Most notable functions include (but are not limited to):
    * `sdk.acceptPendingSession({ conversationId: string })`
    * `sdk.rejectPendingSession({ conversationId: string })`
    * `sdk.acceptSession({ conversationId: string, ...otherOptions })`
    * `sdk.endSession({ conversationId: string, ...otherOptions })`
    * `sdk.setVideoMute({ conversationId: string, ...otherOptions })`
    * `sdk.setAudioMute({ conversationId: string, ...otherOptions })`
* `sdk.on('cancelPendingSession')` & `sdk.on('handledPendingSession')` will be called with:
  `({ sessionId: string, conversationId: string }) => void`. `conversationId` is not guaranteed to be present.
* [PCM-1769](https://inindca.atlassian.net/browse/PCM-1769) – Removed `address` from the `pendingSession` object emitted on `sdk.on('pendingSession', ...)`.
  Use `roomJid` now.

### Added
* [PCM-1387](https://inindca.atlassian.net/browse/PCM-1387) - Add the ability to do screen recordings
* [PCM-1784](https://inindca.atlassian.net/browse/PCM-1784) – Add a function to be able to forcibly terminate sessions by sessionId
* [PCM-1753](https://inindca.atlassian.net/browse/PCM-1753) – Add an option for log formatters
* [PCM-1755](https://inindca.atlassian.net/browse/PCM-1755) – Added call error handling for softphone which will be emitted as a sdkError event with a type of `call`
* Added a static `VERSION` property
* Added top level SDK events of `'station'`, `'concurrentSoftphoneSessionsEnabled'`, `'conversationUpdate'` (see docs for more details on these events).
* Loads station on initialization _if_ `SesstionTypes.softphone` is in allowed list. Sets response to `sdk.station` and emits on `station` event.
* Added `sdk.setConversationHeld(options)` that makes an API request to place a softphone conversation on hold.
* Added functions `sdk.isPersistentConnectionEnabled()` and `sdk.isConcurrentSoftphoneSessionsEnabled()`

### Updated
* [PCM-1653](https://inindca.atlassian.net/browse/PCM-1653) – ensure that all HTTP request errors emit on `sdk.on('sdkError', ...)`
* Updated Demo App to use new events

### Fixed
* [PCM-1764](https://inindca.atlassian.net/browse/PCM-1764) – updated webpack config to skip `amd` build which was polluting the global namespace with
dependencies, namely lodash (`window._`).
* [PCM-1773](https://inindca.atlassian.net/browse/PCM-1773) – add an `esModules` bundle for consumers to choose to use in builds. ([Initial bug report](https://developer.genesys.cloud/forum/t/issue-with-the-a-dependency-npm-package-for-the-sdk/11910))

# [v6.1.7](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v6.1.6...v6.1.7)

### Changed
* [PCM-1787](https://inindca.atlassian.net/browse/PCM-1787) – CDN exports to **MAJOR** and **EXACT** versions. There will be _no_ more "latest" version to use. Examples:
  * `{rootUrl}/webrtc-sdk/v6/genesys-cloud-webrtc-sdk.js` <- this URL will always load the _latest for that **major** version_.
  * `{rootUrl}/webrtc-sdk/v6.1.7/genesys-cloud-webrtc-sdk.js` <- this will only ever load the specified version.
> Note: the current version (v6.1.6) deployed at `{rootUrl}/webrtc-sdk/genesys-cloud-webrtc-sdk.js` will remain at this location. But this will no longer update to newer versions.

# [v6.1.6](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v6.1.5...v6.1.6)
### Changed
* Errors are now logged remotely
* Bumped streaming client to 13.3.7

### Removed
* Removed build examples for gulp and browserify and their dependencies


# [v6.1.5](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v6.1.4...v6.1.5)
### Added
* A static `VERSION` accessed at `GenesysCloudWebrtcSdk.VERSION`
* [PCM-1738](https://inindca.atlassian.net/browse/PCM-1738) – Pulled in [GenesysCloudClientLogger](https://github.com/purecloudlabs/genesys-cloud-client-logger) v3.0.0 which changes how the SDK logs:
    * The logger will now send logs to the server if a logger is passed into the SDK on construction. The way to turn this off is to use the `optOutOfWebTelemtry` config option.
* [PCM-1754](https://inindca.atlassian.net/browse/PCM-1754) – Removed several webrtc related logs as they will be logged by streaming-client ^13.3.4. Bumped to streaming-client v13.3.4
* [PCM-1738](https://inindca.atlassian.net/browse/PCM-1738) – Pulled in streaming-client v13.3.3 (which also using gc-client-logger v3) and is now passing app name/version/id to the streaming-client's logger.

# [v6.1.4](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v6.1.3...v6.1.4)

### Fixed
* [PCM-1745](https://inindca.atlassian.net/browse/PCM-1745) – Adding `process-fast` to webpack build to ensure the bundled CDN build does not get throttled in Chrome.
# [v6.1.3](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v6.1.2...v6.1.3)
### Added
* [PCM-1729](https://inindca.atlassian.net/browse/PCM-1729) – Added `sessionType` to log messages (mainly `propose` and `session-init` events).
* [PCM-1715](https://inindca.atlassian.net/browse/PCM-1715)/[PCM-1726](https://inindca.atlassian.net/browse/PCM-1726) -
Bumped streaming-client to v13.3.1 which includes `stanza` override for ending sessions via the client. Now the client will manually close the peer connection if it is not closed automatically after sending `session-terminate`.
### Fixed
* [PCM-1726](https://inindca.atlassian.net/browse/PCM-1726)/[PCM-1722](https://inindca.atlassian.net/browse/PCM-1722) – Changed:
    * Renamed package.json `"browser" -> "web"` to prevent build tools from bundling the already web-bundled/built version of the SDK.
    * Pointed `"main": "dist/cjs/index.js"` (it was `dist/genesys-cloud-webrtc-sdk.js` which was a hodge-podge webpack build with minimal deps bundled but target was still web). Most build tools should
      still be able to pick the commonJS built files when building. Note: the commonJS build does not bundle deps. The sdk is not intended to run in a node environment. If using the sdk cjs build
      in a node env, you must provide your own polyfills for certain browser specific APIs (suchas the `fetch` API).
    * `dist/genesys-cloud-webrtc-sdk.js` is now the same file as `dist/genesys-cloud-webrtc-sdk.bundle.js` which is built for the CDN (meaning all deps are bundled into the file). This is also true for the `.min` files as well.
    * Streaming-client bump also fixes a dependency file path issue.

# [v6.1.2](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v6.1.1...v6.1.2)
### Fixed
* [PCM-1711](https://inindca.atlassian.net/browse/PCM-1711) - Changed default behavior for softphone `sdk.acceptSession` to create and use unique `HTMLAudioElement`s for each session.
It will then remove the audio element from the DOM once the session ends. Note: it will only create the unique audio element (and remove it from the DOM on `sessionEnded`) if `sdk.acceptSession` is _not_
passed an audioElement _and_ there is _not_ a SDK `defaults.audioElement`.
* [PCM-1587](https://inindca.atlassian.net/browse/PCM-1587) - Ensure video-sessions pass up the `reason` to stanza for ending a session.

# [v6.1.1](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/compare/v6.1.0...v6.1.1)
### Fixed
* [PCM-1706](https://inindca.atlassian.net/browse/PCM-1706) - Allow certain actions that affect the default to work before the sdk has been formally initialized.
* [PCM-1696](https://inindca.atlassian.net/browse/PCM-1696) & [Issue #618](https://github.com/MyPureCloud/genesys-cloud-webrtc-sdk/issues/618) - Ensure all modules are exported from barrel file.
* Correctly clean up mediaDevices `devicechange` event listeners inside SdkMedia class.
* Update `sdk.startSoftphoneSession` to not require a `SessionType`.

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
