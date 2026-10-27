/* eslint @typescript-eslint/no-explicit-any: "off" */
import { Logger } from 'genesys-cloud-client-logger';
import { EventEmitter } from 'events';

import * as windows11Utils from '../../src/windows11-first-session-hack';
import { GenesysCloudWebrtcSdk, ISdkConfig, SessionTypes } from '../../src';
import { SdkErrorTypes } from '../../src/types/enums';

/**
 * Integration tests for the GenesysCloudWebrtcSdk public API surface. Boots the
 * REAL SDK and asserts the client-level guards and that each public method
 * delegates to the SessionManager. Only externals (streaming-client, media)
 * are mocked.
 *
 * Negative paths dominate: the "not supported" / "invalid options" guards that
 * protect each entrypoint (agent screen share, guest video meeting, unauth
 * video conference, bad volume, empty updateOutgoingMedia).
 */
jest.mock('../../src/media/media');

jest.mock('genesys-cloud-streaming-client', () => {
  const actualDep = jest.requireActual('genesys-cloud-streaming-client');
  return {
    ...actualDep,
    __esModule: true,
    default: function () {
      this.config = { jid: 'me@orgspan.com' };
      this.notifications = Object.assign(new EventEmitter(), { subscribe: jest.fn().mockResolvedValue(null) });
      this._notifications = this.notifications;
      this.webrtcSessions = Object.assign(new EventEmitter(), {
        getAllSessions: jest.fn().mockReturnValue([]),
        proxyNRStat: jest.fn()
      });
      this._webrtcSessions = this.webrtcSessions;
      this.messenger = Object.assign(new EventEmitter(), { broadcastMessage: jest.fn() });
      this.connect = jest.fn().mockImplementation(() => { this.emit('connected'); return Promise.resolve(); });
      this.disconnect = jest.fn().mockResolvedValue(null);
      const ev = new EventEmitter();
      Object.getOwnPropertyNames(EventEmitter.prototype).forEach(name => {
        if (name !== 'constructor') { this[name] = ev[name]; }
      });
    }
  };
});

describe('SDK public API (integration)', () => {
  let sdk: GenesysCloudWebrtcSdk;

  const mockLogger: jest.Mocked<Logger> = {
    debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), log: jest.fn(), setAccessToken: jest.fn()
  } as any;

  const constructSdk = async (overrides?: ISdkConfig): Promise<GenesysCloudWebrtcSdk> => {
    const config: ISdkConfig = {
      logger: mockLogger as any, accessToken: 'secure', environment: 'mypurecloud.com', optOutOfTelemetry: true,
      ...(overrides || {})
    } as any;
    sdk = new GenesysCloudWebrtcSdk(config);
    sdk.fetchOrganization = jest.fn().mockResolvedValue({ id: 'org', name: 'org' });
    sdk.fetchAuthenticatedUser = jest.fn().mockImplementation(async () => {
      sdk._personDetails = { id: 'userId', name: 'u', chat: { jabberId: 'u@jid.com' }, station: {} } as any;
    });
    sdk.fetchUsersStation = jest.fn().mockResolvedValue(undefined);
    await sdk.initialize();
    return sdk;
  };

  const captureSdkError = (): Promise<any> => new Promise(res => sdk.once('sdkError', res));

  beforeEach(() => {
    jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockResolvedValue();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (sdk) { await sdk.destroy(); sdk = undefined as any; }
  });

  /* ───────────── not-supported / invalid-options guards ───────────── */

  it('throwsNotSupportedWhenAgentStartsScreenShare', async () => {
    await constructSdk();
    jest.spyOn(sdk, 'isGuest', 'get').mockReturnValue(false);
    const errorPromise = captureSdkError();

    await expect(sdk.startScreenShare()).rejects.toHaveProperty('type', SdkErrorTypes.not_supported);
    expect((await errorPromise).type).toBe(SdkErrorTypes.not_supported);
  });

  it('throwsNotSupportedWhenGuestStartsVideoMeeting', async () => {
    await constructSdk();
    jest.spyOn(sdk, 'isGuest', 'get').mockReturnValue(true);

    await expect(sdk.startVideoMeeting('meeting-1')).rejects.toHaveProperty('type', SdkErrorTypes.not_supported);
  });

  it('throwsNotSupportedWhenVideoConferenceHasNoAuth', async () => {
    await constructSdk();
    sdk._config.jwt = undefined;
    sdk._config.accessToken = undefined;

    await expect(
      sdk.startVideoConference('room@conference.example.com')
    ).rejects.toHaveProperty('type', SdkErrorTypes.not_supported);
  });

  it('throwsInvalidOptionsWhenUpdateOutgoingMediaHasNothingToUpdate', async () => {
    await constructSdk();

    expect(() => sdk.updateOutgoingMedia({} as any))
      .toThrow(expect.objectContaining({ type: SdkErrorTypes.invalid_options }));
  });

  it('throwsNotSupportedWhenAudioVolumeOutOfRange', async () => {
    await constructSdk();

    expect(() => sdk.updateAudioVolume(150))
      .toThrow(expect.objectContaining({ type: SdkErrorTypes.not_supported }));
    expect(() => sdk.updateAudioVolume(-1))
      .toThrow(expect.objectContaining({ type: SdkErrorTypes.not_supported }));
  });

  it('warnsAndSkipsOutputDeviceUpdateInUnsupportedBrowser', async () => {
    await constructSdk();
    jest.spyOn(sdk.media, 'getState').mockReturnValue({ hasOutputDeviceSupport: false } as any);
    jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([]);
    const smSpy = jest.spyOn(sdk.sessionManager, 'updateOutputDeviceForAllSessions');

    await sdk.updateOutputDevice('some-device');

    expect(smSpy).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('cannot update output deviceId in unsupported browser'),
      expect.anything()
    );
  });

  /* ───────────── happy-path guards allow through ───────────── */

  it('allowsGuestToStartScreenShareAndDelegates', async () => {
    await constructSdk();
    jest.spyOn(sdk, 'isGuest', 'get').mockReturnValue(true);
    const smSpy = jest.spyOn(sdk.sessionManager, 'startSession').mockResolvedValue({} as any);

    await sdk.startScreenShare();

    expect(smSpy).toHaveBeenCalledWith(expect.objectContaining({ sessionType: SessionTypes.acdScreenShare }));
  });

  it('allowsAuthedVideoConferenceAndDelegates', async () => {
    await constructSdk();
    sdk._config.accessToken = 'secure';
    const smSpy = jest.spyOn(sdk.sessionManager, 'startSession').mockResolvedValue({ conversationId: 'c1' } as any);

    await sdk.startVideoConference('room@conference.example.com');

    expect(smSpy).toHaveBeenCalledWith(expect.objectContaining({ sessionType: SessionTypes.collaborateVideo, jid: 'room@conference.example.com' }));
  });

  /* ───────────── delegation to SessionManager ───────────── */

  /*
   * BLACK-BOX outbound-edge coverage for setAudioMute / setConversationHeld /
   * endSession lives in softphone-session-handler.test.ts, which drives the
   * real handler to the platform-API PATCH on the mocked `_http` (the SDK's
   * one outward edge for these flows). Re-driving them through a full client
   * boot here adds no new outward assertion, so it is intentionally not
   * duplicated - the handler suite is the clean harness for that boundary.
   */

  /*
   * GRAY-BOX FALLBACK (documented): acceptPendingSession / rejectPendingSession /
   * forceTerminateSession reach the jingle stack, not a clean outbound HTTP
   * edge, in this harness. Driving them to a real outward signal needs a full
   * fake peerConnection/jingle session. Until that harness exists we assert the
   * one internal delegation hop. This is the fallback the standards doc calls
   * out, NOT the pattern to copy.
   */
  it('[gray-box] delegatesAcceptPendingSessionToSessionManager', async () => {
    await constructSdk();
    const spy = jest.spyOn(sdk.sessionManager, 'proceedWithSession').mockResolvedValue(undefined);
    await sdk.acceptPendingSession({ conversationId: 'c1' });
    expect(spy).toHaveBeenCalledWith({ conversationId: 'c1' });
  });

  it('[gray-box] delegatesRejectPendingSessionToSessionManager', async () => {
    await constructSdk();
    const spy = jest.spyOn(sdk.sessionManager, 'rejectPendingSession').mockResolvedValue(undefined);
    await sdk.rejectPendingSession({ conversationId: 'c1' });
    expect(spy).toHaveBeenCalledWith({ conversationId: 'c1' });
  });

  it('[gray-box] delegatesForceTerminateSessionToSessionManager', async () => {
    await constructSdk();
    const spy = jest.spyOn(sdk.sessionManager, 'forceTerminateSession').mockResolvedValue(undefined);
    await sdk.forceTerminateSession('sess-1');
    expect(spy).toHaveBeenCalledWith('sess-1', undefined);
  });

  /* ───────────── setAccessToken ───────────── */

  it('setAccessTokenUpdatesConfigAndStreamingConnection', async () => {
    await constructSdk();
    sdk.setAccessToken('new-token');
    expect(sdk._config.accessToken).toBe('new-token');
    expect((sdk._streamingConnection as any).config.authToken).toBe('new-token');
  });
});
