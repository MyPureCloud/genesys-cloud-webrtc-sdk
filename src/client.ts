import { EventEmitter } from 'events';
import StrictEventEmitter from 'strict-event-emitter-types';
import StreamingClient, { HttpClient } from 'genesys-cloud-streaming-client';
import Logger from 'genesys-cloud-client-logger';

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
  IConversationHeldRequest
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
import { SdkHeadset } from './media/headset';
import { Constants } from 'stanza';

const ENVIRONMENTS = [
  'mypurecloud.com',
  'mypurecloud.com.au',
  'mypurecloud.jp',
  'mypurecloud.de',
  'mypurecloud.ie',
  'usw2.pure.cloud',
  'cac1.pure.cloud',
  'euw2.pure.cloud',
  'apne2.pure.cloud'
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

  if (!options.accessToken && !options.organizationId) {
    return 'Access token is required to create an authenticated instance of the SDK. Otherwise, provide organizationId for a guest/anonymous user.';
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
  headset: SdkHeadset;

  _connected: boolean;
  _streamingConnection: StreamingClient;
  _http: HttpClient;
  _orgDetails: IOrgDetails;
  _personDetails: IPersonDetails;
  _clientId: string;
  _customerData: ICustomerData;
  _hasConnected: boolean;
  _config: ISdkConfig;

  get isInitialized (): boolean {
    return !!this._streamingConnection;
  }

  get connected (): boolean {
    return !!this._streamingConnection.connected;
  }

  get isGuest (): boolean {
    return !this._config.accessToken;
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

    this._config = {
      ...options,
      /* set defaults */
      ...{
        autoConnectSessions: options.autoConnectSessions !== false, // default true
        logLevel: options.logLevel || 'info',
        disableAutoAnswer: options.disableAutoAnswer || false, // default false
        optOutOfTelemetry: options.optOutOfTelemetry || false, // default false
        allowedSessionTypes: options.allowedSessionTypes || [SessionTypes.softphone, SessionTypes.collaborateVideo, SessionTypes.acdScreenShare],

        /* sdk defaults */
        defaults: {
          ...defaultsOptions,
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
    this.trackDefaultAudioStream(this._config.defaults.audioStream);

    this.media = new SdkMedia(this);
    this.headset = new SdkHeadset(this.media);

    // Telemetry for specific events
    // onPendingSession, onSession, onMediaStarted, onSessionTerminated logged in event handlers
    this.on('disconnected', this.logger.error.bind(this.logger, 'onDisconnected'));
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
        }).then(({ body }) => {
          this._customerData = body;
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

      /* if we are allowing softphone calls, we need station information */
      if (this._config.allowedSessionTypes.includes(SessionTypes.softphone) && !this.isGuest) {
        this.logger.info('SDK initialized to handle Softphone session. Requesting station');
        const stationReq = this.fetchUsersStation()
          .catch((err) => {
            // these errors shouldn't halt initialization
            this.logger.warn('error fetching users station', err);
          });
        const stationSub = this.listenForStationEvents();

        await Promise.all([stationReq, stationSub]);
      }

      this.emit('ready');
    } catch (err) {
      throw createAndEmitSdkError.call(this, SdkErrorTypes.initialization, err.message, err);
    }
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
    if (!this.isGuest) {
      return this.sessionManager.startSession({ jid: roomJid, inviteeJid, sessionType: SessionTypes.collaborateVideo });
    } else {
      throw createAndEmitSdkError.call(this, SdkErrorTypes.not_supported, 'video conferencing not supported for guests');
    }
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
   * Note: this does not update the SDK default device(s)
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
   *  deviceId updated.
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
      this.headset.getAudioDevice(options.audioDeviceId);
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
      .then(({ body }) => {
        this._orgDetails = body;
        this.logger.debug('Fetched organization details', body, { skipServer: true }); // don't log PII
        return body;
      });
  }

  async fetchAuthenticatedUser (): Promise<IPersonDetails> {
    return requestApiWithRetry.call(this, '/users/me?expand=station').promise
      .then(({ body }) => {
        this._personDetails = body;
        this.logger.debug('Fetched person details', body, { skipServer: true }); // don't log PII
        return body;
      });
  }

  async fetchUsersStation (): Promise<IStation> {
    if (!this._personDetails) {
      await this.fetchAuthenticatedUser();
    }

    const stationId = this._personDetails?.station?.associatedStation?.id;
    if (!stationId) {
      const error = new Error('User does not have an associated station');
      throw createAndEmitSdkError.call(this, SdkErrorTypes.generic, error.message, error);
    }

    const { body } = await requestApiWithRetry.call(this, `/stations/${stationId}`).promise;
    this.station = body;
    this.logger.info('Fetched user station', {
      userId: body.userId,
      type: body.type,
      webRtcPersistentEnabled: body.webRtcPersistentEnabled,
      webRtcForceTurn: body.webRtcForceTurn,
      webRtcCallAppearances: body.webRtcCallAppearances,
    });
    this.emit('concurrentSoftphoneSessionsEnabled', this.isConcurrentSoftphoneSessionsEnabled());
    this.emit('station', { action: 'Associated', station: body });
    return body;
  }

  /**
   * Check to see if the user's currently associated station has
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
   * Check to see if the user's currently associated station has
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
  }

  /**
   * Accept a pending session based on the passed in conversation ID.
   *
   * @param params conversationId of the pending session to accept
   * @returns a promise that fullfils once the session accept goes out
   */
  async acceptPendingSession (params: { conversationId: string }): Promise<void> {
    await this.sessionManager.proceedWithSession(params);
  }

  /**
   * Reject a pending session based on the passed in conversation ID.
   *
   * @param params conversationId of the pending session to reject
   * @returns a promise that fullfils once the session reject goes out
   */
  async rejectPendingSession (params: { conversationId: string }): Promise<void> {
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
    return this._streamingConnection.disconnect();
  }

  /**
   * Reconnect the streaming connection
   * @returns a promise that fullfils once the web socket has reconnected
   */
  reconnect (): Promise<any> {
    this._http.stopAllRetries();
    return this._streamingConnection.reconnect();
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
    const activeSessions = this.sessionManager.getAllJingleSessions();
    this.logger.info('destroying webrtc sdk', {
      activeSessions: activeSessions.map(s => ({ sessionId: s.id, conversationId: s.conversationId }))
    });

    await Promise.all(activeSessions.map(s => this.sessionManager.endSession(s)));

    this.removeAllListeners();
    this.media.destroy();
    await this.disconnect();
  }

  /**
   * Monitor the config.defaults.audioStream audio tracks
   *  to listen for when they end. Once they end, remove the stream
   *  from the defaults config.
   *
   * Does nothing if no stream was passed in.
   *
   * @param stream default audio stream
   */
  private trackDefaultAudioStream (stream?: MediaStream): void {
    if (!stream) return;

    stream.getAudioTracks().forEach(track => {
      const stopTrack = track.stop.bind(track);

      const remove = (track: MediaStreamTrack) => {
        stream.removeTrack(track);

        if (!stream.getAudioTracks().length) {
          this._config.defaults.audioStream = null;
        }
      };

      track.stop = () => {
        this.logger.warn('stopping defaults.audioStream track from track.stop(). removing from sdk.defauls', track);
        remove(track);
        stopTrack();
      };

      track.addEventListener('ended', _evt => {
        this.logger.warn('stopping defaults.audioStream track from track.onended. removing from sdk.defauls', track);
        remove(track);
      });
    });
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

          this._personDetails.station = event.eventBody;
          // we emit the associated station after it is loaded
          return this.fetchUsersStation();
        }
      }
    );
  }

  /**
   * Start a softphone session with the given peer or peers.
   *  `initialize()` must be called first.
   *
   * @param softphoneParams participant information for initiating a softphone session. See IStartSoftphoneSessionParams for more details.
   */
  async startSoftphoneSession (softphoneParams: Omit<IStartSoftphoneSessionParams, 'sessionType'>): Promise<{ id: string, selfUri: string }> {
    (softphoneParams as IStartSoftphoneSessionParams).sessionType = SessionTypes.softphone;
    return this.sessionManager.startSession((softphoneParams as IStartSoftphoneSessionParams));
  }
}

export default GenesysCloudWebrtcSdk;
