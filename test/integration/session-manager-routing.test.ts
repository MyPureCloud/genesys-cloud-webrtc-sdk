/* eslint @typescript-eslint/no-explicit-any: "off" */
import { Logger } from 'genesys-cloud-client-logger';
import { EventEmitter } from 'events';

import * as windows11Utils from '../../src/windows11-first-session-hack';
import {
  GenesysCloudWebrtcSdk,
  SessionTypes
} from '../../src';
import { SdkErrorTypes } from '../../src/types/enums';
import { MockSession, flushPromises } from '../test-utils';

/**
 * GRAY-BOX (documented fallback tier). These tests verify SessionManager fans a
 * request out to the correct per-session handler:
 *   updateOutgoingMedia(ForAllSessions), updateAudioVolume,
 *   updateOutputDeviceForAllSessions (incl. the device-not-found early return),
 *   addOrReplaceTrackOnSession, onSessionInit (enabled/disabled),
 *   setVideoMute / setAudioMute / setConversationHeld, forceTerminateSession.
 *
 * The *ideal* IT is black-box: drive the public SDK method and assert the one
 * outward edge (the platform-API call on the mocked `_http`). For most of these
 * routing methods that outward edge is reached only through the media /
 * peerConnection / jingle stack, which this harness does not fake. Rather than
 * leave the routing branches uncovered, these assert the single internal
 * delegation hop (manager -> correct handler method). That is a white-box
 * reach INTO the unit under test, so per the standards doc it is a labelled
 * FALLBACK, not the pattern to copy. Where a routing method DOES bottom out in
 * HTTP (softphone mute/hold/reject/start), the black-box version lives in
 * softphone-session-handler.test.ts and should be preferred.
 *
 * Boots the real SDK; the only true outward-boundary mocks are streaming-client
 * and media.
 */
jest.mock('../../src/media/media');

jest.mock('genesys-cloud-streaming-client', () => {
  const actualDep = jest.requireActual('genesys-cloud-streaming-client');
  return {
    ...actualDep,
    __esModule: true,
    default: function () {
      this.notifications = Object.assign(new EventEmitter(), {
        subscribe: jest.fn().mockResolvedValue(null)
      });
      this._notifications = this.notifications;
      this.webrtcSessions = Object.assign(new EventEmitter(), {
        getAllSessions: jest.fn().mockReturnValue([]),
        proxyNRStat: jest.fn()
      });
      this._webrtcSessions = this.webrtcSessions;
      this.messenger = Object.assign(new EventEmitter(), { broadcastMessage: jest.fn() });
      this.connect = jest.fn().mockImplementation(() => {
        this.emit('connected');
        return Promise.resolve();
      });
      this.disconnect = jest.fn().mockResolvedValue(null);
      const ev = new EventEmitter();
      Object.getOwnPropertyNames(EventEmitter.prototype).forEach(name => {
        if (name !== 'constructor') {
          this[name] = ev[name];
        }
      });
    }
  };
});

describe('SessionManager routing + media control (integration)', () => {
  let sdk: GenesysCloudWebrtcSdk;

  const mockLogger: jest.Mocked<Logger> = {
    debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), log: jest.fn(), setAccessToken: jest.fn()
  } as any;

  const constructSdk = async (): Promise<GenesysCloudWebrtcSdk> => {
    sdk = new GenesysCloudWebrtcSdk({
      logger: mockLogger as any, accessToken: 'secure', environment: 'mypurecloud.com', optOutOfTelemetry: true
    } as any);
    sdk.fetchOrganization = jest.fn().mockResolvedValue({ id: 'org', name: 'org' });
    sdk.fetchAuthenticatedUser = jest.fn().mockImplementation(async () => {
      sdk._personDetails = { id: 'userId', name: 'u', chat: { jabberId: 'u@jid.com' }, station: {} } as any;
    });
    sdk.fetchUsersStation = jest.fn().mockResolvedValue(undefined);
    await sdk.initialize();
    return sdk;
  };

  const activeSession = (type: SessionTypes = SessionTypes.softphone): MockSession => {
    const s = new MockSession(type);
    s.conversationId = globalThis.crypto.randomUUID();
    return s;
  };

  beforeEach(() => {
    jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockResolvedValue();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (sdk) {
      await sdk.destroy();
      sdk = undefined as any;
    }
  });

  /* ───────────── updateOutgoingMedia ───────────── */

  it('routesUpdateOutgoingMediaToHandler', async () => {
    await constructSdk();
    const session = activeSession();
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const spy = jest.spyOn(handler, 'updateOutgoingMedia').mockResolvedValue(undefined as any);

    await sdk.sessionManager.updateOutgoingMedia({ session: session as any, videoDeviceId: 'cam1' });

    expect(spy).toHaveBeenCalledWith(session, expect.objectContaining({ videoDeviceId: 'cam1' }));
  });

  it('updatesOutgoingMediaForAllActiveSessions', async () => {
    await constructSdk();
    const s1 = activeSession();
    const s2 = activeSession();
    jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([s1, s2] as any);
    const spy = jest.spyOn(sdk.sessionManager, 'updateOutgoingMedia').mockResolvedValue(undefined);

    await sdk.sessionManager.updateOutgoingMediaForAllSessions({ audioDeviceId: 'mic1' });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  /* ───────────── updateAudioVolume ───────────── */

  it('updatesAudioVolumeForAllActiveSessions', async () => {
    await constructSdk();
    const session = activeSession();
    jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([session] as any);
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const spy = jest.spyOn(handler, 'updateAudioVolume').mockReturnValue(undefined as any);

    sdk.sessionManager.updateAudioVolume(42);

    expect(spy).toHaveBeenCalledWith(session, 42);
  });

  /* ───────────── updateOutputDeviceForAllSessions ───────────── */

  it('updatesOutputDeviceForAllSessions', async () => {
    await constructSdk();
    const session = activeSession();
    jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([session] as any);
    jest.spyOn(sdk.media, 'getValidDeviceId').mockReturnValue('output-1');
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const spy = jest.spyOn(handler, 'updateOutputDevice').mockResolvedValue(undefined as any);

    await sdk.sessionManager.updateOutputDeviceForAllSessions('output-1');

    expect(spy).toHaveBeenCalledWith(session, 'output-1');
  });

  it('skipsOutputUpdateWhenRequestedDeviceNotFound', async () => {
    await constructSdk();
    const session = activeSession();
    jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([session] as any);
    /* requested a specific string id, but getValidDeviceId resolves to something else */
    jest.spyOn(sdk.media, 'getValidDeviceId').mockReturnValue('a-different-id');
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const spy = jest.spyOn(handler, 'updateOutputDevice').mockResolvedValue(undefined as any);

    await sdk.sessionManager.updateOutputDeviceForAllSessions('requested-but-missing');

    expect(spy).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Output deviceId not found'),
      expect.anything()
    );
  });

  it('excludesAcdScreenShareFromOutputDeviceUpdate', async () => {
    await constructSdk();
    const acd = activeSession(SessionTypes.acdScreenShare);
    jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([acd] as any);
    const getValidSpy = jest.spyOn(sdk.media, 'getValidDeviceId').mockReturnValue('output-1');

    await sdk.sessionManager.updateOutputDeviceForAllSessions(true);

    /* acd screen share is filtered out, so getValidDeviceId gets no sessions */
    expect(getValidSpy).toHaveBeenCalledWith('audiooutput', true);
  });

  /* ───────────── addOrReplaceTrackOnSession ───────────── */

  it('routesAddOrReplaceTrackToHandler', async () => {
    await constructSdk();
    const session = activeSession();
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const spy = jest.spyOn(handler, 'addReplaceTrackToSession').mockResolvedValue(undefined as any);
    const track = { id: 'track1', kind: 'audio' } as any;

    await sdk.sessionManager.addOrReplaceTrackOnSession(track, session as any);

    expect(spy).toHaveBeenCalledWith(session, track);
  });

  /* ───────────── onSessionInit ───────────── */

  it('initializesSessionThroughHandler', async () => {
    await constructSdk();
    const session = activeSession();
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const spy = jest.spyOn(handler, 'handleSessionInit').mockResolvedValue(undefined as any);

    await sdk.sessionManager.onSessionInit(session as any);

    expect(spy).toHaveBeenCalledWith(session);
    expect(session.sessionType).toBe(handler.sessionType);
  });

  it('skipsSessionInitWhenHandlerDisabled', async () => {
    await constructSdk();
    const session = activeSession();
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    handler.disabled = true;
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const spy = jest.spyOn(handler, 'handleSessionInit').mockResolvedValue(undefined as any);

    await sdk.sessionManager.onSessionInit(session as any);

    expect(spy).not.toHaveBeenCalled();
  });

  /* ───────────── setVideoMute / setAudioMute / setConversationHeld ───────────── */

  it('routesSetVideoMuteToHandler', async () => {
    await constructSdk();
    const session = activeSession();
    jest.spyOn(sdk.sessionManager, 'getSession').mockReturnValue(session as any);
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const spy = jest.spyOn(handler, 'setVideoMute').mockResolvedValue(undefined as any);

    await sdk.sessionManager.setVideoMute({ conversationId: session.conversationId, mute: true });

    expect(spy).toHaveBeenCalledWith(session, expect.objectContaining({ mute: true }));
  });

  it('routesSetAudioMuteToHandler', async () => {
    await constructSdk();
    const session = activeSession();
    jest.spyOn(sdk.sessionManager, 'getSession').mockReturnValue(session as any);
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const spy = jest.spyOn(handler, 'setAudioMute').mockResolvedValue(undefined as any);

    await sdk.sessionManager.setAudioMute({ conversationId: session.conversationId, mute: true });

    expect(spy).toHaveBeenCalledWith(session, expect.objectContaining({ mute: true }));
  });

  it('routesSetConversationHeldToHandler', async () => {
    await constructSdk();
    const session = activeSession();
    jest.spyOn(sdk.sessionManager, 'getSession').mockReturnValue(session as any);
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const spy = jest.spyOn(handler, 'setConversationHeld').mockResolvedValue(undefined as any);

    await sdk.sessionManager.setConversationHeld({ conversationId: session.conversationId, held: true });

    expect(spy).toHaveBeenCalledWith(session, expect.objectContaining({ held: true }));
  });

  /* ───────────── forceTerminateSession ───────────── */

  it('forceTerminatesSessionWhenFound', async () => {
    await constructSdk();
    const session = activeSession();
    jest.spyOn(sdk.sessionManager, 'getAllSessions').mockReturnValue([session] as any);
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const spy = jest.spyOn(handler, 'forceEndSession').mockResolvedValue(undefined as any);

    await sdk.sessionManager.forceTerminateSession(session.id);

    expect(spy).toHaveBeenCalledWith(session, undefined);
  });

  it('throwsForceTerminateWhenSessionNotFound', async () => {
    await constructSdk();
    jest.spyOn(sdk.sessionManager, 'getAllSessions').mockReturnValue([] as any);

    await expect(
      sdk.sessionManager.forceTerminateSession('missing-id')
    ).rejects.toHaveProperty('type', SdkErrorTypes.generic);
    await flushPromises();
  });
});
