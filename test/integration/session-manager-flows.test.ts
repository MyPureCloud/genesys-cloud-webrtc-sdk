/* eslint @typescript-eslint/no-explicit-any: "off" */
import { Logger } from 'genesys-cloud-client-logger';
import { EventEmitter } from 'events';

import * as windows11Utils from '../../src/windows11-first-session-hack';
import {
  GenesysCloudWebrtcSdk,
  ISdkConfig,
  SessionTypes,
  IStation
} from '../../src';
import { SdkErrorTypes } from '../../src/types/enums';
import { SdkError } from '../../src/utils';
import SoftphoneSessionHandler from '../../src/sessions/softphone-session-handler';
import { flushPromises } from '../test-utils';

jest.mock('../../src/media/media');

/**
 * Integration tests for SessionManager branch coverage.
 *
 * These boot the REAL GenesysCloudWebrtcSdk (real SessionManager, real session
 * handlers) and mock only external systems (streaming-client, media). Each test
 * drives the SDK through its public surface and asserts the SDK's own behavior:
 * which events fire, which SdkError type is thrown, whether a downstream was or
 * was NOT called, and that no dirty pending-session state is left behind.
 *
 * Favors negative branches - most value is in how the SDK behaves when inputs
 * are bad or downstreams misbehave.
 */
jest.mock('genesys-cloud-streaming-client', () => {
  const actualDep = jest.requireActual('genesys-cloud-streaming-client');
  return {
    ...actualDep,
    __esModule: true,
    default: function () {
      this.notifications = Object.assign(
        new EventEmitter(),
        {
          subscribe: jest.fn().mockResolvedValue(null)
        }
      );
      this._notifications = this.notifications;

      this.webrtcSessions = Object.assign(
        new EventEmitter(),
        {
          getAllSessions: jest.fn().mockReturnValue([]),
          proxyNRStat: jest.fn()
        }
      );
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

describe('SessionManager Flows (integration)', () => {
  let sdk: GenesysCloudWebrtcSdk;
  let constructSdk: (config?: ISdkConfig) => Promise<GenesysCloudWebrtcSdk>;

  const mockLogger: jest.Mocked<Logger> = {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    setAccessToken: jest.fn()
  } as any;

  /** Build a fresh pending-session propose payload with unique ids per test. */
  const buildPropose = (overrides: Partial<any> = {}) => {
    const sessionId = globalThis.crypto.randomUUID();
    const conversationId = globalThis.crypto.randomUUID();
    return {
      sessionId,
      id: sessionId,
      conversationId,
      autoAnswer: false,
      fromJid: `call-${globalThis.crypto.randomUUID()}@gjoll.com`,
      toJid: 'someone@genesys.com',
      sessionType: SessionTypes.softphone,
      ...overrides
    };
  };

  /** Capture the next `sdkError` emission (emitted async via setTimeout(0)). */
  const captureSdkError = (): Promise<SdkError> =>
    new Promise(resolve => sdk.once('sdkError', resolve));

  beforeEach(() => {
    jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockResolvedValue();

    constructSdk = async (overrides?: ISdkConfig) => {
      const config: ISdkConfig = overrides === undefined
        ? { logger: mockLogger as any, accessToken: 'secure', environment: 'mypurecloud.com', optOutOfTelemetry: true }
        : { logger: mockLogger as any, optOutOfTelemetry: true, ...overrides };

      sdk = new GenesysCloudWebrtcSdk(config);

      sdk.fetchOrganization = jest.fn().mockResolvedValue({ id: 'myorgid', name: 'my org name' });
      sdk.fetchAuthenticatedUser = jest.fn().mockImplementation(async () => {
        sdk._personDetails = {
          id: 'userId',
          name: 'user name',
          chat: { jabberId: 'user@jid.com' },
          station: {}
        } as any;
      });
      sdk.fetchUsersStation = jest.fn().mockImplementation(async () => {
        sdk.station = {
          id: 'stationId',
          name: 'my webrtc phone',
          status: 'ASSOCIATED',
          userId: 'userId',
          webRtcUserId: 'webrtcUserId',
          type: 'inin_webrtc_softphone',
          webRtcPersistentEnabled: false,
          webRtcForceTurn: false,
          webRtcCallAppearances: 100
        } as IStation;
      });

      await sdk.initialize();
      return sdk;
    };
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (sdk) {
      await sdk.destroy();
      sdk = undefined as any;
    }
  });

  /* ───────────────── onPropose ───────────────── */

  it('emitsPendingSessionOnNewPropose', async () => {
    await constructSdk();
    const pendingSessionSpy = jest.fn();
    sdk.on('pendingSession', pendingSessionSpy);

    const propose = buildPropose();
    await sdk.sessionManager.onPropose(propose);
    await flushPromises();

    expect(pendingSessionSpy).toHaveBeenCalled();
    expect(sdk.sessionManager.pendingSessions.some(s => s.conversationId === propose.conversationId)).toBe(true);
  });

  it('ignoresProposeWhenHandlerDisabled', async () => {
    await constructSdk();
    const softphoneHandler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    softphoneHandler.disabled = true;

    const pendingSessionSpy = jest.fn();
    sdk.on('pendingSession', pendingSessionSpy);

    const propose = buildPropose();
    await sdk.sessionManager.onPropose(propose);
    await flushPromises();

    expect(pendingSessionSpy).not.toHaveBeenCalled();
    expect(sdk.sessionManager.pendingSessions.some(s => s.conversationId === propose.conversationId)).toBe(false);
  });

  it('ignoresDuplicateProposeForSameSession', async () => {
    await constructSdk();
    const pendingSessionSpy = jest.fn();
    sdk.on('pendingSession', pendingSessionSpy);

    const propose = buildPropose();
    await sdk.sessionManager.onPropose(propose);
    await flushPromises();
    await sdk.sessionManager.onPropose(propose);
    await flushPromises();

    const matching = sdk.sessionManager.pendingSessions.filter(s => s.conversationId === propose.conversationId);
    expect(matching.length).toBe(1);
  });

  it('reproceedsWhenAcceptedSessionGetsNewSessionId', async () => {
    await constructSdk();
    const softphoneHandler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone }) as SoftphoneSessionHandler;
    const proceedSpy = (softphoneHandler as any).proceedWithSession = jest.fn();

    const propose = buildPropose();
    await sdk.sessionManager.onPropose(propose);
    await flushPromises();

    /* mark the pending session as already accepted */
    const pending = sdk.sessionManager.getPendingSession({ conversationId: propose.conversationId });
    (pending as any).accepted = true;

    /* a new propose for the same conversation but a new sessionId */
    const newSessionId = globalThis.crypto.randomUUID();
    await sdk.sessionManager.onPropose({ ...propose, sessionId: newSessionId, id: newSessionId });
    await flushPromises();

    expect(proceedSpy).toHaveBeenCalled();
    expect(pending!.sessionId).toBe(newSessionId);
  });

  /* ───────────────── proceed / reject pending ───────────────── */

  it('throwsWhenProceedingWithUnknownSession', async () => {
    await constructSdk();
    const errorPromise = captureSdkError();

    await expect(
      sdk.sessionManager.proceedWithSession({ conversationId: 'does-not-exist' })
    ).rejects.toHaveProperty('type', SdkErrorTypes.session);

    const emitted = await errorPromise;
    expect(emitted.type).toBe(SdkErrorTypes.session);
  });

  it('throwsWhenRejectingUnknownSession', async () => {
    await constructSdk();

    await expect(
      sdk.sessionManager.rejectPendingSession({ conversationId: 'does-not-exist' })
    ).rejects.toHaveProperty('type', SdkErrorTypes.session);
  });

  /* ───────────────── startSession ───────────────── */

  it('throwsStartSessionWhenNotConnected', async () => {
    await constructSdk();
    Object.defineProperty(sdk, 'connected', { get: () => false, configurable: true });
    const errorPromise = captureSdkError();

    await expect(
      sdk.sessionManager.startSession({ sessionType: SessionTypes.softphone } as any)
    ).rejects.toHaveProperty('type', SdkErrorTypes.session);

    const emitted = await errorPromise;
    expect(emitted.type).toBe(SdkErrorTypes.session);
  });

  it('throwsStartSessionWhenHandlerDisabled', async () => {
    await constructSdk();
    Object.defineProperty(sdk, 'connected', { get: () => true, configurable: true });
    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    handler.disabled = true;

    await expect(
      sdk.sessionManager.startSession({ sessionType: SessionTypes.softphone } as any)
    ).rejects.toHaveProperty('type', SdkErrorTypes.generic);
  });

  /* ───────────────── getSession ───────────────── */

  it('throwsWhenGettingMissingSession', async () => {
    await constructSdk();

    expect(() =>
      sdk.sessionManager.getSession({ conversationId: 'nope' })
    ).toThrow(SdkError);
  });

  /* ───────────────── acceptSession ───────────────── */

  it('throwsAcceptSessionWithoutConversationId', async () => {
    await constructSdk();

    await expect(
      sdk.sessionManager.acceptSession({} as any)
    ).rejects.toHaveProperty('type', SdkErrorTypes.invalid_options);
  });


  /* ───────────────── endSession ───────────────── */

  it('throwsEndSessionWithoutConversationId', async () => {
    await constructSdk();

    await expect(
      sdk.sessionManager.endSession({} as any)
    ).rejects.toHaveProperty('type', SdkErrorTypes.session);
  });

  /* ───────────────── onCancelPendingSession ───────────────── */

  it('noopOnCancelForUnknownSession', async () => {
    await constructSdk();
    const cancelSpy = jest.fn();
    sdk.on('cancelPendingSession', cancelSpy);

    sdk.sessionManager.onCancelPendingSession('unknown-session-id');
    await flushPromises();

    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('emitsCancelAndRemovesPendingSession', async () => {
    await constructSdk();
    const propose = buildPropose();
    await sdk.sessionManager.onPropose(propose);
    await flushPromises();

    const cancelSpy = jest.fn();
    sdk.on('cancelPendingSession', cancelSpy);

    sdk.sessionManager.onCancelPendingSession(propose.sessionId, propose.conversationId);
    await flushPromises();

    expect(cancelSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: propose.sessionId, conversationId: propose.conversationId })
    );
    expect(sdk.sessionManager.pendingSessions.some(s => s.conversationId === propose.conversationId)).toBe(false);
  });
});
