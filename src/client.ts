import { EventEmitter } from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';
import StreamingClient, { HttpClient, StreamingClientError, StreamingClientErrorTypes } from 'genesys-cloud-streaming-client';
import Logger from 'genesys-cloud-client-logger';
import { jwtDecode } from "jwt-decode";

import {
  ISdkConfig,
  ICustomerData,
  IEndSessionRequest,
  IAcceptSessionRequest,
  ISessionMuteRequest,
  IPersonDetails,
  IMediaDeviceIds,
  IUpdateOutgoingMedia,
  SdkEvents,
  IMediaSettings,
  isSecurityCode,
  isCustomerData,
  IStartSoftphoneSessionParams,
  IOrgDetails,
  IStation,
  ISessionIdAndConversationId,
  IConversationHeldRequest,
  IPendingSessionActionParams,
  IExtendedMediaSession,
  ScreenRecordingMediaSession,
  VideoMediaSession,
  IVideoResolution,
  JWTDetails,
  ISdkFullConfig,
  LiveScreenMonitoringSession
} from './types/interfaces';
import {
  setupStreamingClient,
  proxyStreamingClientEvents
} from './client-private';
import { requestApi, createAndEmitSdkError, defaultConfigOption, requestApiWithRetry } from './utils';
import { setupLogging } from './logging';
import { SdkErrorTypes, SessionTypes } from './types/enums';
import { SessionManager } from './sessions/session-manager';
import { SdkMedia } from './media/media';
import { HeadsetProxyService } from './headsets/headset';
import { Constants } from 'stanza';
import { setupWebrtcForWindows11 } from './windows11-first-session-hack';
import { ISdkHeadsetService } from './headsets/headset-types';

const ENVIRONMENTS = [
  'mypurecloud.com',
  'mypurecloud.com.au',
  'mypurecloud.jp',
  'mypurecloud.de',
  'mypurecloud.ie',
  'usw2.pure.cloud',
  'cac1.pure.cloud',
  'euw2.pure.cloud',
  'apne2.pure.cloud',
  'use2.us-gov-pure.cloud',
  'sae1.pure.cloud',
  'aps1.pure.cloud'
];

const DISASSOCIATED_EVENT = 'Disassociated';
const ASSOCIATED_EVENT = 'Associated';

/**
 * Validate SDK construct options.
 *  Returns `null` if no errors,
 *    returns `string` with error message if there are errors
 * @param options
 */
function validateOptions (options: ISdkConfig): string | null {
  if (!options) {
    return 'Options required to create an instance of the SDK';
  }

  if (!options.accessToken && !options.organizationId && !options.jwt) {
    return 'An accessToken, jwt, or organizationId (for guest access) is required to instantiate the sdk.';
  }

  if (!options.environment) {
    (options.logger || console).warn('No environment provided, using mypurecloud.com');
    options.environment = 'mypurecloud.com';
  }

  if (ENVIRONMENTS.indexOf(options.environment) === -1) {
    (options.logger || console).warn('Environment is not in the standard list. You may not be able to connect.');
  }

  return null;
}

/**
 * SDK to interact with GenesysCloud WebRTC functionality
 */
export class GenesysCloudWebrtcSdk extends (EventEmitter as { new(): StrictEventEmitter<EventEmitter, SdkEvents> }) {
  static readonly VERSION = '__GENESYS_CLOUD_WEBRTC_SDK_VERSION__';
  logger: Logger;
  sessionManager: SessionManager;
  media: SdkMedia;
  station: IStation | null;
  headset: ISdkHeadsetService;
  _pauseDisconnectedMessages: boolean;

  _connected: boolean;
  _streamingConnection: StreamingClient;
  _http: HttpClient;
  _orgDetails: IOrgDetails;
  _personDetails: IPersonDetails;
  _clientId: string;
  _customerData: ICustomerData;
  _hasConnected: boolean;
  _config: ISdkFullConfig;

  get isInitialized (): boolean {
    return !!this._streamingConnection;
  }

  get connected (): boolean {
    return !!this._streamingConnection.connected;
  }

  get isJwtAuth (): boolean {
    return !!this._config.jwt;
  }

  get isGuest (): boolean {
    return !this.isJwtAuth && !this._config.accessToken;
  }

  get VERSION (): string {
    return GenesysCloudWebrtcSdk.VERSION;
  }

  constructor (options: ISdkConfig) {
    super();

    const errorMsg = validateOptions(options);
    if (errorMsg) {
      throw createAndEmitSdkError.call(this, SdkErrorTypes.invalid_options, errorMsg, options);
    }

    /* grab copies or valid objects */
    const defaultsOptions = options.defaults || {};

    let allowedSessionTypes = options.allowedSessionTypes || [SessionTypes.softphone, SessionTypes.collaborateVideo, SessionTypes.acdScreenShare, SessionTypes.liveScreenMonitoring];

    // If using JWT auth, we only support screen recording, video conferencing and live screen monitoring.
    if (options.jwt) {
      console.debug(`Forcing allowed session types to be ${SessionTypes.screenRecording}, ${SessionTypes.collaborateVideo} and ${SessionTypes.liveScreenMonitoring} due to jwt auth`);
      allowedSessionTypes = [ SessionTypes.screenRecording, SessionTypes.collaborateVideo, SessionTypes.liveScreenMonitoring ];
    }

    this._config = {
      ...options,
      /* set defaults */
      ...{
        autoConnectSessions: options.autoConnectSessions !== false, // default true
        autoAcceptPendingScreenRecordingRequests: !!options.autoAcceptPendingScreenRecordingRequests,
        autoAcceptPendingLiveScreenMonitoringRequests: !!options.autoAcceptPendingLiveScreenMonitoringRequests,
        logLevel: options.logLevel || 'info',
        disableAutoAnswer: options.disableAutoAnswer || false, // default false
        optOutOfTelemetry: options.optOutOfTelemetry || false, // default false
        allowedSessionTypes,
        useHeadsets: options.useHeadsets || false, // default false
        customHeaders: options.customHeaders,
        useServerSidePings: defaultConfigOption(options.useServerSidePings, false),
        eagerPersistentConnectionEstablishment: defaultConfigOption(options.eagerPersistentConnectionEstablishment, 'auto'),
        /* sdk defaults */
        defaults: {
          ...defaultsOptions,
          audioStream: undefined, // we set this below (with tracking)
          micAutoGainControl: defaultConfigOption(defaultsOptions.micAutoGainControl, true),
          micEchoCancellation: defaultConfigOption(defaultsOptions.micEchoCancellation, true),
          micNoiseSuppression: defaultConfigOption(defaultsOptions.micNoiseSuppression, true),
          videoDeviceId: defaultsOptions.videoDeviceId || null,
          audioDeviceId: defaultsOptions.audioDeviceId || null,
          audioVolume: defaultConfigOption(defaultsOptions.audioVolume, 100),
          outputDeviceId: defaultsOptions.outputDeviceId || null,
          monitorMicVolume: !!defaultsOptions.monitorMicVolume // default to false
        }
      }
    };

    this._orgDetails = { id: options.organizationId } as IOrgDetails;

    setupLogging.call(this, options.logger || console);

    this._config.logger = this.logger;

    this.media = new SdkMedia(this);
    this.headset = new HeadsetProxyService(this);
    this.setDefaultAudioStream(defaultsOptions.audioStream);

    // Telemetry for specific events
    // onPendingSession, onSession, onMediaStarted, onSessionTerminated logged in event handlers
    this.on('cancelPendingSession', (ids: ISessionIdAndConversationId) => this.logger.info('cancelPendingSession', ids));
    this.on('handledPendingSession', (ids: ISessionIdAndConversationId) => this.logger.info('handledPendingSession', ids));
    this.on('sdkError', (error) => {
      /* this prints it more readable in the console */
      this.logger.error('sdkError', {
        name: error.name,
        message: error.message,
        type: error.type,
        details: error.details
      });
    });

    this._connected = false;
    this._streamingConnection = null;
    this._http = new HttpClient();
  }

  /**
   * Setup the SDK for use and authenticate the user
   *  - agents must have an accessToken passed into the constructor options
   *  - guests need a securityCode (or the data received from an
   *    already redeemed securityCode). If the customerData is not passed in
   *    this will redeem the code for the data, else it will use the data
   *    passed in.
   *
   * @param opts optional initialize options
   *
   * @returns a promise that is fulled once the web socket is connected
   *  and other necessary async tasks are complete.
   */
  async initialize (opts?: { securityCode: string } | ICustomerData): Promise<void> {
    const httpRequests: Promise<any>[] = [];
    if (this.isGuest) {
      let guestPromise: Promise<void>;

      /* if there is a securityCode, fetch conversation details */
      if (isSecurityCode(opts)) {
        this.logger.debug('Fetching conversation details via secuirty code', opts.securityCode);
        guestPromise = requestApi.call(this, '/conversations/codes', {
          method: 'post',
          data: {
            organizationId: this._orgDetails.id,
            addCommunicationCode: opts.securityCode
          },
          noAuthHeader: true
        }).then(({ data }) => {
          this._customerData = data;
        });

        /* if no securityCode, check for valid customerData */
      } else if (isCustomerData(opts)) {
        this.logger.debug('Using customerData passed into the initialize', opts);
        guestPromise = Promise.resolve().then(() => {
          this._customerData = opts;
        });
      } else {
        throw createAndEmitSdkError.call(this, SdkErrorTypes.invalid_options, '`securityCode` is required to initialize the SDK as a guest');
      }

      httpRequests.push(guestPromise);
    } else if (this.isJwtAuth) {
      this.parseJwt();
    } else {
      const getOrg = this.fetchOrganization();
      const getPerson = this.fetchAuthenticatedUser();

      httpRequests.push(getOrg);
      httpRequests.push(getPerson);
    }

    try {
      await Promise.all(httpRequests);

      await setupStreamingClient.call(this);
      await proxyStreamingClientEvents.call(this);
      await setupWebrtcForWindows11(this._streamingConnection._webrtcSessions['iceServers']);

      /* istanbul ignore next */
      window.addEventListener('beforeunload', () => {
        this.logger.info('window.beforeunload was called', { activeConversationsForClient: this.sessionManager.getAllActiveConversations() });
      });

      const sessionsToActivate = this._config.allowedSessionTypes;
      this._config.allowedSessionTypes = [];
      const activateSessionTypes = sessionsToActivate.map((allowedSessionType) => this.addAllowedSessionType(allowedSessionType));

      if (this._config.jidResource?.startsWith('mediahelper')) {
        this._config.headsetRequestType = 'mediaHelper';
      }

      await Promise.all(activateSessionTypes);
      (this.headset as HeadsetProxyService).initialize();

      this.emit('ready');
    } catch (err) {
      if (err instanceof StreamingClientError && err.type == StreamingClientErrorTypes.invalid_token) {
        throw createAndEmitSdkError.call(this, SdkErrorTypes.invalid_token, err.message, err);
      }

      if (err.name === 'AxiosError' && [401, 403].includes(err.response?.status || 0)) {
        throw createAndEmitSdkError.call(this, SdkErrorTypes.invalid_token, err.message, err);
      }

      throw createAndEmitSdkError.call(this, SdkErrorTypes.initialization, err.message, err);
    }
  }

  async addAllowedSessionType(sessionType: SessionTypes): Promise<void> {
    if (this._config.allowedSessionTypes.includes(sessionType)) {
      this.logger.warn('addAllowedSessionType was called but the sessionType is already allowed', { sessionType });
      return;
    }

    this.logger.info('adding sessionType', { sessionType });

    if (sessionType === SessionTypes.softphone && !this.isGuest) {
      this.logger.info('Softphone sessionType added, requesting station');
      const stationReq = this.fetchUsersStation()
        .catch((err) => {
          // these errors shouldn't halt initialization
          this.logger.warn('error fetching users station', err);
        });
      const stationSub = this.listenForStationEvents();

      await Promise.all([stationReq, stationSub]);
    }

    await this.sessionManager.addAllowedSessionType(sessionType);
    this._config.allowedSessionTypes.push(sessionType);
  }

  async removeAllowedSessionType(sessionType: SessionTypes): Promise<void> {
    if (!this._config.allowedSessionTypes.includes(sessionType)) {
      this.logger.warn('removeAllowedSessionType was called but the sessionType is already disallowed', { sessionType });
      return;
    }

    this.logger.info('removing sessionType', { sessionType });

    await this.sessionManager.removeAllowedSessionType(sessionType);
    this._config.allowedSessionTypes = this._config.allowedSessionTypes.filter(st => st.toString() !== sessionType.toString());
  }

  isScreenRecordingSession (session: IExtendedMediaSession): session is ScreenRecordingMediaSession {
    return session.sessionType === SessionTypes.screenRecording;
  }

  isVideoSession (session: IExtendedMediaSession): session is VideoMediaSession {
    return session.sessionType === SessionTypes.collaborateVideo;
  }

  isLiveScreenMonitoringSession (session: IExtendedMediaSession): session is LiveScreenMonitoringSession {
    return session.sessionType === SessionTypes.liveScreenMonitoring;
  }

  /**
   * Start a screen share. Currently, screen share is only supported
   *  for guest users.
   *
   *  `initialize()` must be called first.
   *
   * @returns MediaStream promise of the selected screen stream
   */
  async startScreenShare (): Promise<MediaStream> {
    if (this.isGuest) {
      return this.sessionManager.startSession({ sessionType: SessionTypes.acdScreenShare });
    } else {
      throw createAndEmitSdkError.call(this, SdkErrorTypes.not_supported, 'Agent screen share is not yet supported');
    }
  }

  /**
   * Start a video conference. Not supported for guests.
   *  Conferences can only be joined by authenticated users
   *  from the same organization. If `inviteeJid` is provided,
   *  the specified user will receive a propose/pending session
   *  they can accept and join the conference.
   *
   *  `initialize()` must be called first.
   *
   * @param roomJid jid of the conference to join. Can be made up if
   *  starting a new conference but must adhere to the format:
   *  <lowercase string>@conference.<lowercase string>
   * @param inviteeJid jid of a user to invite to this conference.
   *
   * @returns a promise with an object with the newly created `conversationId`
   */
  async startVideoConference (roomJid: string, inviteeJid?: string): Promise<{ conversationId: string }> {
    if (!this._config.jwt && !this._config.accessToken) {
      throw createAndEmitSdkError.call(this, SdkErrorTypes.not_supported, 'Video conferencing requires authentication via JWT or access token.');
    }

    return this.sessionManager.startSession({ jid: roomJid, inviteeJid, sessionType: SessionTypes.collaborateVideo });
  }

  /**
   * Start a video conference using a meeting id. Not supported for guests.
   *  Conferences can only be joined by authenticated users
   *  from the same organization.
   *
   *  `initialize()` must be called first.
   *
   * @param meetingId meetingId of the conference to join.
   *
   * @returns a promise with an object with the newly created 'conversationId'
   */
  async startVideoMeeting (meetingId: string): Promise<{ conversationId: string }> {
    if (this.isGuest) {
      throw createAndEmitSdkError.call(this, SdkErrorTypes.not_supported, 'video conferencing meetings not supported for guests');
    }

    return this.sessionManager.startSession({ meetingId, sessionType: SessionTypes.collaborateVideo });
  }

  /**
   * Start a softphone session with the given peer or peers.
   *  `initialize()` must be called first.
   *
   * @param softphoneParams participant information for initiating a softphone session. See IStartSoftphoneSessionParams for more details.
   */
  async startSoftphoneSession (softphoneParams: Omit<IStartSoftphoneSessionParams, 'sessionType'>): Promise<{ id: string, selfUri: string }> {
    (softphoneParams as IStartSoftphoneSessionParams).sessionType = SessionTypes.softphone;
    const callInfo = await this.sessionManager.startSession((softphoneParams as IStartSoftphoneSessionParams));
    return callInfo;
  }

  /**
   * Update the output device for all incoming audio
   *
   *  NOTES:
   *    - This will log a warning and not attempt to update
   *        the output device if the a broswer
   *        does not support output devices
   *    - This will attempt to update all active sessions
   *    - This does _not_ update the sdk `defaultOutputDeviceId`
   * @param deviceId `deviceId` for audio output, `true` for sdk default output, or `null` for system default
   * @returns a promise that fullfils once the output deviceId has been updated
   */
  updateOutputDevice (deviceId: string | true | null): Promise<void> {
    if (!this.media.getState().hasOutputDeviceSupport) {
      const sessions = this.sessionManager.getAllActiveSessions()
        .map(s => ({ sessionId: s.id, conversationId: s.conversationId }));

      this.logger.warn('cannot update output deviceId in unsupported browser', sessions);
      return;
    }
    return this.sessionManager.updateOutputDeviceForAllSessions(deviceId);
  }

  /**
   * Update outgoing media for a specified session
   *  - `conversationId` _or_ `session` is required to find the session to update
   *  - `stream`: if a stream is passed in, the session media will be
   *    updated to use the media on the stream. This supercedes deviceId(s)
   *    passed in.
   *  - `videoDeviceId` & `audioDeviceId` (superceded by `stream`)
   *    - `undefined|false`: the sdk will not touch the `video|audio` media
   *    - `null`: the sdk will update the `video|audio` media to system default
   *    - `string`: the sdk will attempt to update the `video|audio` media
   *        to the passed in deviceId
   *
   * Note: this does not update the SDK default device(s). Also, if the requested
   *  device is _already in use_ by the session, the media will not be re-requested.
   *
   * @param updateOptions device(s) to update
   *
   * @returns a promise that fullfils once the outgoing
   *  media devices have been updated
   */
  updateOutgoingMedia (updateOptions: IUpdateOutgoingMedia): Promise<void> {
    const updatingVideo = updateOptions.videoDeviceId || updateOptions.videoDeviceId === null;
    const updatingAudio = updateOptions.audioDeviceId || updateOptions.audioDeviceId === null;

    if (!updateOptions || (!updateOptions.stream && !updatingVideo && !updatingAudio)) {
      throw createAndEmitSdkError.call(this, SdkErrorTypes.invalid_options, 'updateOutgoingMedia must be called with a MediaStream, a videoDeviceId, or an audioDeviceId');
    }

    return this.sessionManager.updateOutgoingMedia(updateOptions);
  }

  /**
   * Update the default device(s) for the sdk.
   *  Pass in the following:
   *  - `string`: sdk will update that default to the deviceId
   *  - `null`: sdk will update to system default device
   *  - `undefined`: sdk will not update that media deviceId
   *
   * If `updateActiveSessions` is `true`, any active sessions will
   *  have their outgoing media devices updated and/or the output
   *  deviceId updated. Note, if the requested device is
   *  _already in use_ by the session, the media will not be re-requested.
   *
   * Else, only the sdk defaults will be updated and active sessions'
   * media devices will not be touched.
   *
   * @param options default device(s) to update
   *
   * @returns a promise that fullfils once the default
   *  device values have been updated
   */
  async updateDefaultDevices (options: IMediaDeviceIds & { updateActiveSessions?: boolean } = {}): Promise<any> {
    const updateVideo = options.videoDeviceId !== undefined;
    const updateAudio = options.audioDeviceId !== undefined;
    const updateOutput = options.outputDeviceId !== undefined;

    if (updateVideo) {
      this.logger.info('Updating defaultVideoDeviceId', { defaultVideoDeviceId: options.videoDeviceId });
      this._config.defaults.videoDeviceId = options.videoDeviceId;
    }

    if (updateAudio) {
      this.logger.info('Updating defaultAudioDeviceId', { defaultAudioDeviceId: options.audioDeviceId });
      this.headset.updateAudioInputDevice(options.audioDeviceId);
      this._config.defaults.audioDeviceId = options.audioDeviceId;
    }

    if (updateOutput) {
      this.logger.info('Updating defaultOutputDeviceId', { defaultOutputDeviceId: options.outputDeviceId });
      this._config.defaults.outputDeviceId = options.outputDeviceId;
    }

    if (typeof options.updateActiveSessions === 'boolean' && options.updateActiveSessions) {
      const promises = [];
      this.logger.info('Updating devices for all active session', {
        defaultVideoDeviceId: options.videoDeviceId,
        defaultAudioDeviceId: options.audioDeviceId,
        defaultOutputDeviceId: options.outputDeviceId
      });

      if ((updateVideo || updateAudio) && this.sessionManager) {
        promises.push(
          this.sessionManager.updateOutgoingMediaForAllSessions()
        );
      }

      if (updateOutput && this.sessionManager) {
        promises.push(
          this.sessionManager.updateOutputDeviceForAllSessions(this._config.defaults.outputDeviceId)
        );
      }

      return Promise.all(promises);
    }
  }

    /**
   * Update the default resolution of the selected video track for the sdk.
   *  Pass in the following:
   *  - resolution: Either undefined or an object containing ConstrainULongs
   *      representing both width and height
   *  - updateActiveSessions: boolean
   *
   * If `updateActiveSessions` is `true`, any active sessions will
   *  have their video resolutions updated to either the selected resolution
   *  or the next best resolution the device is capable of
   *
   * Else, only the sdk defaults will be updated and active sessions'
   * resolutions will not be touched
   *
   * Success or failure of `applyConstraints` will emit an event for
   * the consuming app to listen for so that it can determine if the
   * resolution they requested is actually in place or the next best
   * option. This will allow the consuming app to notify the user as
   * they see fit.
   *
   * @param resolution the width and height that was requested
   * to update the video; could be undefined to represent the default value
   *
   * @returns a promise that fullfils once the event has been emitted
   * signaling that the resolution has updated
   */
  async updateDefaultResolution(resolution: IVideoResolution | undefined, updateActiveSessions: boolean): Promise<any> {
    this._config.defaults.videoResolution = resolution;
    if (!updateActiveSessions) {
      return;
    }

    this.sessionManager.getAllActiveSessions()
      .filter(session => session.sessionType === 'collaborateVideo' && session._outboundStream)
      .forEach(videoSession => {
        videoSession._outboundStream.getVideoTracks().forEach(async track => {
          try {
            if (resolution) {
              await track.applyConstraints({ ...track.getConstraints(),
                height: resolution.height,
                width: resolution.width
              });
            } else {
              /* If the consumer passes in undefined, it means they selected the default resolution
                option.  Since we do not know what the system default is, we will need to stop the current
                track and re-request the media again so that it fetches the system default automatically.
              */
              track.stop();
              videoSession._outboundStream.removeTrack(track);

              const newTrack = (
                await this.media.startMedia({ video: true, session: videoSession })
              ).getVideoTracks()[0];

              await this.sessionManager.addOrReplaceTrackOnSession(newTrack, videoSession);
              videoSession._outboundStream.addTrack(newTrack);
            }
          } catch (e) {
            createAndEmitSdkError.call(this, SdkErrorTypes.generic, e.message, e);
          }
          const actualResolution = { width: track.getSettings().width, height: track.getSettings().height };
          if (resolution?.width !== actualResolution.width || resolution?.height !== actualResolution.height) {
            this._config.defaults.videoResolution = resolution ? actualResolution : undefined;
          }
          this.emit('resolutionUpdated', {
            requestedResolution: resolution,
            actualResolution: actualResolution,
            videoTrack: track,
            sessionId: videoSession.id,
            conversationId: videoSession.conversationId
          })
        })
      })
  }

  /**
   * Update the default media settings from the config.
   *
   * If `updateActiveSessions` is `true`, any active sessions will
   *  have their outgoing media devices updated.
   *
   * Else, only the defaults will be updated and active sessions'
   * media devices will not be touched.
   *
   * @returns a promise that fullfils once the default
   *  settings and sessions are updated (if specified)
   */
  async updateDefaultMediaSettings (settings: IMediaSettings & { updateActiveSessions?: boolean }): Promise<any> {
    const allowedSettings: Array<keyof IMediaSettings> = [
      'micAutoGainControl',
      'micEchoCancellation',
      'micNoiseSuppression',
      'monitorMicVolume'
    ];

    const entries = (Object.entries(settings) as Array<[keyof IMediaSettings, any]>)
      .filter(([setting]) => allowedSettings.includes(setting));

    this.logger.info('updating media settings', entries);

    entries.forEach(([key, value]) => {
      this._config.defaults[key] = value;
    });

    if (settings.updateActiveSessions) {
      return this.sessionManager?.updateOutgoingMediaForAllSessions();
    }
  }

  /**
   * Updates the audio volume for all active applicable sessions
   * as well as the default volume for future sessions
   *
   * @param volume desired volume between 0 and 100
   *
   * @returns void
   */
  updateAudioVolume (volume: number): void {
    if (volume < 0 || volume > 100) {
      throw createAndEmitSdkError.call(this, SdkErrorTypes.not_supported, 'Invalid volume level. Must be between 0 and 100 inclusive.', { providedVolume: volume });
    }
    this._config.defaults.audioVolume = volume;
    this.sessionManager?.updateAudioVolume(volume);
  }

  async fetchOrganization (): Promise<IOrgDetails> {
    return requestApiWithRetry.call(this, '/organizations/me').promise
      .then(({ data }) => {
        this._orgDetails = data;
        this.logger.debug('Fetched organization details', data, { skipServer: true }); // don't log PII
        return data;
      });
  }

  async fetchAuthenticatedUser (): Promise<IPersonDetails> {
    return requestApiWithRetry.call(this, '/users/me?expand=station').promise
      .then(({ data }) => {
        this._personDetails = data;
        this.logger.debug('Fetched person details', data, { skipServer: true }); // don't log PII
        return data;
      });
  }

  parseJwt (): void {
    try {
      const decoded: JWTDetails = jwtDecode(this._config.jwt);

      this._personDetails = {
        id: decoded.data.uid,
        name: decoded.name,
        chat: {
          jabberId: decoded.data.jid
        }
      };

      this._customerData = {
        conversation: {
          id: decoded.data.conversationId,
        },
        sourceCommunicationId: decoded.data.sourceCommunicationId,
        jwt: this._config.jwt
      }

      this._orgDetails = {
        id: decoded.org,
        name: null
      };
    } catch (e) {
      throw createAndEmitSdkError.call(this, SdkErrorTypes.invalid_options, 'Failed to parse provided jwt, please ensure it is valid', e);
    }
  }

  async fetchUsersStation (): Promise<IStation> {
    if (!this._personDetails) {
      await this.fetchAuthenticatedUser();
    }

    const stationId = this._personDetails?.station?.effectiveStation?.id;
    if (!stationId) {
      const error = new Error('User does not have an effective station');
      throw createAndEmitSdkError.call(this, SdkErrorTypes.generic, error.message, error);
    }

    const { data } = await requestApiWithRetry.call(this, `/stations/${stationId}`).promise;
    this.station = data;
    this.logger.info('Fetched user station', {
      userId: data.userId,
      type: data.type,
      webRtcPersistentEnabled: data.webRtcPersistentEnabled,
      webRtcForceTurn: data.webRtcForceTurn,
      webRtcCallAppearances: data.webRtcCallAppearances,
    });
    this.emit('concurrentSoftphoneSessionsEnabled', this.isConcurrentSoftphoneSessionsEnabled());
    this.emit('station', { action: 'Associated', station: data });
    return data;
  }

  /**
   * Check to see if the user's currently effective station has
   *  persistent connection enabled.
   *
   * @returns if the station has persistent connection enabled
   */
  isPersistentConnectionEnabled (): boolean {
    const station = this.station;
    return !!(
      station &&
      station.webRtcPersistentEnabled &&
      station.type === 'inin_webrtc_softphone'
    );
  }

  /**
   * Check to see if the user's currently effective station has
   *  Line Appearance > 1.
   *
   * @returns if the station has Line Appearance > 1
   */
  isConcurrentSoftphoneSessionsEnabled (): boolean {
    return this.station?.webRtcCallAppearances > 1;
  }

  /**
   * Mutes/Unmutes video/camera for a session and updates the conversation accordingly.
   * Will fail if the session is not found.
   * Incoming video is unaffected.
   *
   * When muting, the camera track is destroyed. When unmuting, the camera media
   *  must be requested again.
   *
   * NOTE: if no `unmuteDeviceId` is provided when unmuting, it will unmute and
   *  attempt to use the sdk `defaultVideoDeviceId` as the camera device
   *
   * @returns a promise that fullfils once the mute request has completed
   */
  async setVideoMute (muteOptions: ISessionMuteRequest): Promise<void> {
    await this.sessionManager.setVideoMute(muteOptions);
  }

  /**
   * Mutes/Unmutes audio/mic for a session and updates the conversation accordingly.
   * Will fail if the session is not found.
   * Incoming audio is unaffected.
   *
   * NOTE: if no `unmuteDeviceId` is provided when unmuting _AND_ there is no active
   *  audio stream, it will unmute and attempt to use the sdk `defaultAudioDeviceId`
   *  at the device
   *
   * @returns a promise that fullfils once the mute request has completed
   */
  async setAudioMute (muteOptions: ISessionMuteRequest): Promise<void> {
    await this.sessionManager.setAudioMute(muteOptions);
  }

  /**
   * Set a conversation's hold state.
   *
   * > NOTE: only applicable for softphone conversations
   *
   * @param heldOptions conversationId and desired held state
   */
  async setConversationHeld (heldOptions: IConversationHeldRequest): Promise<void> {
    await this.sessionManager.setConversationHeld(heldOptions);
  }

  /**
   * Set the accessToken the sdk uses to authenticate
   *  to the API.
   * @param token new access token
   *
   * @returns void
   */
  setAccessToken (token: string): void {
    this._config.accessToken = token;
    this.logger.setAccessToken(token);

    if (this._streamingConnection) {
      this._streamingConnection.config.authToken = token;
    }
  }

    /**
   * Set the JWT the sdk uses to authenticate
   *  to the API.
   * @param jwt new jwt
   *
   * @returns void
   */
    setJwt (jwt: string): void {
      this._config.jwt = jwt;
      // this.logger.setJwt(jwt);

      if (this._streamingConnection) {
        this._streamingConnection.config.jwt = jwt;
      }
    }

  /**
   * Changes the headset functionality for the sdk
   * @param useHeadsets if true, this enables events from active headsets
   *
   * @returns void
   */
  setUseHeadsets (useHeadsets: boolean): void {
    this._config.useHeadsets = !!useHeadsets;
    (this.headset as HeadsetProxyService).setUseHeadsets(!!useHeadsets);
  }

  /**
   * Set the sdk default audioStream. This will call
   *  through to `sdk.media.setDefaultAudioStream(stream);`
   *
   * Calling with a falsy value will clear out sdk default.
   *
   * @param stream media stream to use
   */
  setDefaultAudioStream (stream?: MediaStream): void {
    this.media.setDefaultAudioStream(stream);
  }

  /**
   * Accept a pending session based on the passed in conversation ID.
   *
   * @param params conversationId of the pending session to accept
   * @returns a promise that fullfils once the session accept goes out
   */
  async acceptPendingSession (params: IPendingSessionActionParams): Promise<void> {
    await this.sessionManager.proceedWithSession(params);
  }

  /**
   * Reject a pending session based on the passed in conversation ID.
   *
   * @param params conversationId of the pending session to reject
   * @returns a promise that fullfils once the session reject goes out
   */
  async rejectPendingSession (params: IPendingSessionActionParams): Promise<void> {
    await this.sessionManager.rejectPendingSession(params);
  }

  /**
   * Accept a pending session based on the passed in ID.
   *
   * @param acceptOptions options with which to accept the session
   * @returns a promise that fullfils once the session accept goes out
   */
  async acceptSession (acceptOptions: IAcceptSessionRequest): Promise<void> {
    await this.sessionManager.acceptSession(acceptOptions);
  }

  /**
   * End an active session based on the conversation ID (one is required)
   * @param opts object with conversation ID
   * @returns a promise that fullfils once the session has ended
   */
  async endSession (endOptions: IEndSessionRequest): Promise<void> {
    return this.sessionManager.endSession(endOptions);
  }

  /**
   * End an active session based on the session ID
   * @param sessionId session ID corresponding to the session you want to force terminate
   * @param reason optional reason to terminate the session with. defaults to "success"
   * @returns a promise that fullfils once the session has ended
   */
  async forceTerminateSession (sessionId: string, reason?: Constants.JingleReasonCondition): Promise<void> {
    return this.sessionManager.forceTerminateSession(sessionId, reason);
  }

  /**
   * Disconnect the streaming connection
   * @returns a promise that fullfils once the web socket has disconnected
   */
  disconnect (): Promise<any> {
    this._http.stopAllRetries();
    return this._streamingConnection?.disconnect();
  }

  /**
   * Ends all active sessions, disconnects the
   *  streaming-client, removes all event listeners,
   *  and cleans up media.
   *
   * WARNING: calling this effectively renders the SDK
   *  instance useless. A new instance will need to be
   *  created after this is called.
   *
   * @returns a promise that fullfils once all the cleanup
   *  tasks have completed
   */
  async destroy (): Promise<any> {
    if (!this.sessionManager) {
      return;
    }

    const activeSessions = this.sessionManager.getAllSessions();
    this.logger.info('destroying webrtc sdk', {
      activeSessions: activeSessions.map(s => ({ sessionId: s.id, conversationId: s.conversationId }))
    });

    await Promise.all(activeSessions.map(s => this.sessionManager.forceTerminateSession(s.id)));

    this.removeAllListeners();
    this.media.destroy();
    await this.disconnect();
  }

  private listenForStationEvents () {
    return this._streamingConnection._notifications.subscribe(
      `v2.users.${this._personDetails.id}.station`,
      (event) => {
        if (event.metadata.action === DISASSOCIATED_EVENT) {
          this.logger.info('station disassociated', {
            stationId: this.station?.id
          });
          this.station = null;
          this.emit('station', { action: 'Disassociated', station: null });
        } else if (event.metadata.action === ASSOCIATED_EVENT) {
          this.logger.info('station associated. fetching station', {
            stationId: event.eventBody.associatedStation.id
          });

          const associatedStation = event.eventBody.associatedStation;
          this._personDetails.station = {
            effectiveStation: associatedStation,
            associatedStation: associatedStation
          };
          // we emit the effectiveStation station after it is loaded
          return this.fetchUsersStation();
        } else if (event.metadata.action === 'WebRTCMigration') {
          this.logger.info('Received line appearance migration event, updating station', { activeConversationsForClient: this.sessionManager.getAllActiveConversations() });
          return this.fetchUsersStation();
        }
      }
    );
  }
}

export default GenesysCloudWebrtcSdk;
