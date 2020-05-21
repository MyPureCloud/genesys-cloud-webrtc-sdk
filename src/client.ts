/// <reference path="types/libs.ts" />

import WildEmitter from 'wildemitter';
import {
  setupStreamingClient,
  proxyStreamingClientEvents
} from './client-private';
import { requestApi, throwSdkError, SdkError } from './utils';
import { setupLogging } from './logging';
import { SdkErrorTypes, LogLevels, SessionTypes } from './types/enums';
import { SessionManager } from './sessions/session-manager';
import { startMedia, startDisplayMedia } from './media-utils';
import {
  ISdkConstructOptions,
  ILogger,
  ICustomerData,
  ISdkConfig,
  IEndSessionRequest,
  IAcceptSessionRequest,
  ISessionMuteRequest,
  IPersonDetails,
  IMediaRequestOptions,
  IMediaDeviceIds,
  IUpdateOutgoingMedia
} from './types/interfaces';
import StreamingClient from 'purecloud-streaming-client';

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

/**
 * Validate SDK construct options.
 *  Returns `null` if no errors,
 *    returns `string` with error message if there are errors
 * @param options
 */
function validateOptions (options: ISdkConstructOptions): string | null {
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
 * SDK to interact with PureCloud WebRTC functionality
 */
export class PureCloudWebrtcSdk extends WildEmitter {

  public logger: ILogger;

  readonly VERSION = '[AIV]{version}[/AIV]';

  _connected: boolean;
  _streamingConnection: StreamingClient;
  _orgDetails: any;
  _personDetails: IPersonDetails;
  _clientId: string;
  _customerData: ICustomerData;
  _hasConnected: boolean;
  _refreshIceServersInterval: NodeJS.Timeout;
  _config: ISdkConfig;
  sessionManager: SessionManager;

  get isInitialized (): boolean {
    return !!this._streamingConnection;
  }

  get connected (): boolean {
    return !!this._streamingConnection.connected;
  }

  get isGuest (): boolean {
    return !this._config.accessToken;
  }

  constructor (options: ISdkConstructOptions) {
    super();

    const errorMsg = validateOptions(options);
    if (errorMsg) {
      throw new SdkError(SdkErrorTypes.invalid_options, errorMsg);
    }

    this._config = {
      accessToken: options.accessToken,
      autoConnectSessions: options.autoConnectSessions !== false, // default true
      customIceServersConfig: options.iceServers,
      defaultAudioElement: options.defaultAudioElement,
      defaultAudioStream: options.defaultAudioStream,
      defaultVideoElement: options.defaultVideoElement,
      defaultVideoDeviceId: options.defaultVideoDeviceId || null,
      defaultAudioDeviceId: options.defaultAudioDeviceId || null,
      defaultOutputDeviceId: options.defaultOutputDeviceId || null,
      disableAutoAnswer: options.disableAutoAnswer || false, // default false
      environment: options.environment,
      iceTransportPolicy: options.iceTransportPolicy || 'all',
      logLevel: options.logLevel || LogLevels.info,
      optOutOfTelemetry: options.optOutOfTelemetry || false, // default false
      allowedSessionTypes: options.allowedSessionTypes || Object.values(SessionTypes),
      wsHost: options.wsHost
    };

    this._orgDetails = { id: options.organizationId };

    setupLogging.call(this, options.logger);

    if (options.iceTransportPolicy) {
      this.logger.warn('Setting iceTransportPolicy manually is deprecated and will be removed soon.');
    }

    // Telemetry for specific events
    // onPendingSession, onSession, onMediaStarted, onSessionTerminated logged in event handlers
    this.on('error', this.logger.error.bind(this.logger));
    this.on('disconnected', this.logger.error.bind(this, 'onDisconnected'));
    this.on('cancelPendingSession', this.logger.warn.bind(this, 'cancelPendingSession'));
    this.on('handledPendingSession', this.logger.warn.bind(this, 'handledPendingSession'));
    this.on('trace', this.logger.debug.bind(this.logger));

    this._connected = false;
    this._streamingConnection = null;
  }

  /**
   * Setup the SDK for use and authenticate the user
   *  - agents must have an accessToken passed into the constructor options
   *  - guest's need a securityCode
   * @param opts optional initialize options
   */
  public async initialize (opts?: { securityCode: string } | ICustomerData): Promise<void> {
    let httpRequests: Promise<any>[] = [];
    if (this.isGuest) {
      let guestPromise: Promise<void>;

      /* if there is a securityCode, fetch conversation details */
      if (this.isSecurityCode(opts)) {
        this.logger.debug('Fetching conversation details via secuirty code', opts.securityCode);
        guestPromise = requestApi.call(this, '/conversations/codes', {
          method: 'post',
          data: {
            organizationId: this._orgDetails.id,
            addCommunicationCode: opts.securityCode
          },
          auth: false
        }).then(({ body }) => {
          this._customerData = body;
        });

        /* if no securityCode, check for valid customerData */
      } else if (this.isCustomerData(opts)) {
        this.logger.debug('Using customerData passed into the initialize', opts);
        guestPromise = Promise.resolve().then(() => {
          this._customerData = opts;
        });
      } else {
        throwSdkError.call(this, SdkErrorTypes.invalid_options, '`securityCode` is required to initialize the SDK as a guest');
      }

      httpRequests.push(guestPromise);
    } else {
      const getOrg = requestApi.call(this, '/organizations/me')
        .then(({ body }) => {
          this._orgDetails = body;
          this.logger.debug(LogLevels.debug, 'Organization details', body);
        });

      const getPerson = requestApi.call(this, '/users/me')
        .then(({ body }) => {
          this._personDetails = body;
          this.logger.debug(LogLevels.debug, 'Person details', body);
        });

      httpRequests.push(getOrg);
      httpRequests.push(getPerson);
    }

    try {
      await Promise.all(httpRequests);
    } catch (err) {
      throwSdkError.call(this, SdkErrorTypes.http, err.message, err);
    }

    try {
      await setupStreamingClient.call(this);
      await proxyStreamingClientEvents.call(this);
      this.emit('ready');
    } catch (err) {
      throwSdkError.call(this, SdkErrorTypes.initialization, err.message, err);
    }
  }

  /**
   * Start a screen share. Currently, guest is the only supported screen share.
   *  `initialize()` must be called first.
   */
  public async startScreenShare (): Promise<{ conversationId: string }> {
    if (this.isGuest) {
      return this.sessionManager.startSession({ sessionType: SessionTypes.acdScreenShare });
    } else {
      throwSdkError.call(this, SdkErrorTypes.not_supported, 'Agent screen share is not yet supported');
    }
  }

  /**
   * Start a video conference. Not supported for guests.
   *  `initialize()` must be called first.
   * @param roomJid jid of the conference to join. Can be made up if starting a new conference but must adhere to the format: <lowercase string>@conference.<lowercase string>
   * @param inviteeJid jid of a user to invite to this conference.
   */
  public async startVideoConference (roomJid: string, inviteeJid?: string): Promise<{ conversationId: string }> {
    if (!this.isGuest) {
      return this.sessionManager.startSession({ jid: roomJid, inviteeJid, sessionType: SessionTypes.collaborateVideo });
    } else {
      throwSdkError.call(this, SdkErrorTypes.not_supported, 'video conferencing not supported for guests');
    }
  }

  /**
   * Create media with video and/or audio
   *  `{ video?: boolean | string, audio: boolean | string }`
   *  `true` will use the sdk default device id (or system default if no sdk default)
   *  `string` (for deviceId) will attempt to use that deviceId and fallback to sdk default
   * @param opts video and/or audio default device or deviceId
   */
  public async createMedia (opts: IMediaRequestOptions): Promise<MediaStream> {
    if (!opts || (
      (opts.video === undefined || opts.video === false) &&
      (opts.audio === undefined || opts.audio === false)
    )) {
      throwSdkError.call(this, SdkErrorTypes.invalid_options, 'createMedia must be called with at least one media type request');
    }

    return startMedia(this, opts);
  }

  /**
   * Creates a media stream from the screen (this will prompt for user screen selection)
   */
  public getDisplayMedia (): Promise<MediaStream> {
    return startDisplayMedia();
  }

  /**
   * Update the output device
   *
   *  NOTES:
   *    - This will attempt to update all active sessions
   *    - This does _not_ update the sdk `defaultOutputDeviceId`
   * @param deviceId `deviceId` for audio output, `true` for sdk default output, or `null` for system default
   */
  public updateOutputDevice (deviceId: string | true | null): Promise<void> {
    return this.sessionManager.updateOutputDeviceForAllSessions(deviceId);
  }

  /**
   * Update outgoing media for a session
   *  - `sessionId` _or_ `session` is required to find the session to update
   *  - `stream`: if a stream is passed in, the session media will be
   *    updated to use the media on the stream. This supercedes deviceId(s)
   *  - `videoDeviceId` & `audioDeviceId` (superceded by `stream`)
   *    - `undefined`: the sdk will not touch the `video|audio` media
   *    - `null`: the sdk will update the `video|audio` media to system default
   *    - `string`: the sdk will attempt to update the `video|audio` media
   *        to the passed in deviceId
   *
   * @param updateOptions device(s) to update
   */
  public updateOutgoingMedia (updateOptions: IUpdateOutgoingMedia): Promise<void> {
    if (!updateOptions ||
      (!updateOptions.stream && !updateOptions.videoDeviceId && !updateOptions.audioDeviceId)) {
      throwSdkError.call(this, SdkErrorTypes.invalid_options, 'updateOutgoingMedia must be called with a MediaStream, a videoDeviceId, or an audioDeviceId');
    }
    return this.sessionManager.updateOutgoingMedia(updateOptions);
  }

  /**
   * Update the default device(s) for the sdk.
   *  Pass in the following:
   *  - `string`: sdk will update to the deviceId
   *  - `null`: sdk will update to system default device (`outputDeviceId` cannot be `null`)
   *  - `undefined`: sdk will not update that media deviceId
   *
   * If `updateActiveSessions` is `true`, any active sessions will
   *  have their media devices updated.
   * Else, only the sdk defaults will be updated and active sessions
   *  will not be touched.
   *
   * NOTE: `outputDeviceId` _must_ be a `string` or `undefined` -
   *  system default is not supported for output devices
   *
   * @param options default device(s) to update
   */
  public async updateDefaultDevices (options: IMediaDeviceIds & { updateActiveSessions?: boolean } = {}): Promise<any> {
    const updateVideo = options.videoDeviceId !== undefined;
    const updateAudio = options.audioDeviceId !== undefined;
    const updateOutput = options.outputDeviceId !== undefined;

    if (updateVideo) {
      this.logger.info('Updating defaultVideoDeviceId', { defaultVideoDeviceId: options.videoDeviceId });
      this._config.defaultVideoDeviceId = options.videoDeviceId;
    }

    if (updateAudio) {
      this.logger.info('Updating defaultAudioDeviceId', { defaultAudioDeviceId: options.audioDeviceId });
      this._config.defaultAudioDeviceId = options.audioDeviceId;
    }

    if (updateOutput) {
      this.logger.info('Updating defaultOutputDeviceId', { defaultOutputDeviceId: options.outputDeviceId });
      this._config.defaultOutputDeviceId = options.outputDeviceId;
    }

    if (typeof options.updateActiveSessions === 'boolean' && options.updateActiveSessions) {
      const promises = [];
      this.logger.info('Updating devices for all active session', { defaultOutputDeviceId: options.outputDeviceId });

      if (updateVideo || updateAudio) {
        const opts = {
          videoDeviceId: updateVideo ? this._config.defaultVideoDeviceId : undefined,
          audioDeviceId: updateAudio ? this._config.defaultAudioDeviceId : undefined
        };

        promises.push(
          this.sessionManager.updateOutgoingMediaForAllSessions(opts)
        );
      }

      if (updateOutput) {
        promises.push(
          this.sessionManager.updateOutputDeviceForAllSessions(this._config.defaultOutputDeviceId)
        );
      }

      return Promise.all(promises);
    }
  }

  /**
   * Mutes/Unmutes video/camera for a session and updates the conversation accordingly.
   * Will fail if the session is not found.
   * Incoming video is unaffected.
   *
   * NOTE: if no `unmuteDeviceId` is provided when unmuting, it will unmute and
   *  attempt to use the sdk `defaultVideoDeviceId` as the device
   */
  public async setVideoMute (muteOptions: ISessionMuteRequest): Promise<void> {
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
   */
  public async setAudioMute (muteOptions: ISessionMuteRequest): Promise<void> {
    await this.sessionManager.setAudioMute(muteOptions);
  }

  /**
   * Accept a pending session based on the passed in ID.
   * @param opts object with mediaStream and/or audioElement to attach to session
   */
  public async acceptPendingSession (sessionId: string): Promise<void> {
    await this.sessionManager.proceedWithSession(sessionId);
  }

  public async rejectPendingSession (sessionId: string): Promise<void> {
    await this.sessionManager.rejectPendingSession(sessionId);
  }

  /**
   * Accept a pending session based on the passed in ID.
   * @param opts object with mediaStream and/or audioElement to attach to session
   */
  public async acceptSession (opts: IAcceptSessionRequest): Promise<void> {
    await this.sessionManager.acceptSession(opts);
  }

  /**
   * End an active session based on the session ID _or_ conversation ID (one is required)
   * @param opts object with session ID _or_ conversation ID
   */
  public async endSession (opts: IEndSessionRequest): Promise<void> {
    return this.sessionManager.endSession(opts);
  }

  /**
   * Disconnect the streaming connection
   */
  public disconnect (): Promise<void> {
    return this._streamingConnection.disconnect();
  }

  /**
   * Reconnect the streaming connection
   */
  public reconnect (): Promise<void> {
    return this._streamingConnection.reconnect();
  }

  async _refreshIceServers () {
    if (!this._streamingConnection.connected) {
      this.logger.warn('Tried to refreshIceServers but streamingConnection is not connected');
      return;
    }

    try {
      const services = (await this._streamingConnection._webrtcSessions.refreshIceServers()) || [];

      if (!services.length) {
        this.logger.error(new Error('refreshIceServers yielded no results'));
        return;
      }

      const stunServers = services.filter((service) => service.type === 'stun');
      if (!stunServers.length) {
        this.logger.info('No stun servers received, setting iceTransportPolicy to "relay"');
        this._streamingConnection.webrtcSessions.config.iceTransportPolicy = 'relay';
      }
    } catch (err) {
      const errorMessage = 'PureCloud SDK failed to update TURN credentials. The application should be restarted to ensure connectivity is maintained.';
      this.logger.warn(errorMessage, err);
      throwSdkError.call(this, SdkErrorTypes.generic, errorMessage, err);
    }
  }

  private isSecurityCode (data: { securityCode: string } | ICustomerData): data is { securityCode: string } {
    data = data as { securityCode: string };
    return !!(data && data.securityCode);
  }

  private isCustomerData (data: { securityCode: string } | ICustomerData): data is ICustomerData {
    data = data as ICustomerData;
    return !!(data
      && data.conversation
      && data.conversation.id
      && data.sourceCommunicationId
      && data.jwt);
  }

}
