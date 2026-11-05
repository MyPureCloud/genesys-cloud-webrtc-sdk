/* eslint @typescript-eslint/no-explicit-any: "off" */
import browserama from 'browserama';
import { Logger } from 'genesys-cloud-client-logger';
import { EventEmitter } from 'events';

import * as windows11Utils from '../../src/windows11-first-session-hack';
import { GenesysCloudWebrtcSdk, ISdkConfig } from '../../src';
import { installHttpMockServer, seedAuthenticatedInit } from './support/black-box-harness';

/**
 * Integration tests for the SDK in a Safari desktop browser. Boots the REAL SDK,
 * including the real SdkMedia, and asserts the getUserMedia request the SDK
 * sends to the browser.
 *
 * Boundary: unlike the other suites, `src/media/media` is not module-mocked.
 * The browser's `navigator.mediaDevices` (the hardware edge) is stubbed instead,
 * because the asserted behavior is the constraints object the SDK sends across
 * that edge. Streaming-client is mocked as in `sdk-public-api.test.ts`. No SDK
 * method is spied.
 */
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

const SAFARI_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const CHROME_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CHROME_ONLY_AUDIO_KEYS = ['googAudioMirroring', 'googDucking', 'googHighpassFilter'];

describe('SDK in Safari desktop (integration)', () => {
  const api = installHttpMockServer();
  let sdk: GenesysCloudWebrtcSdk;
  let getUserMedia: jest.Mock;
  const originalMediaDevices = Object.getOwnPropertyDescriptor(window.navigator, 'mediaDevices');

  const mockLogger: jest.Mocked<Logger> = {
    debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), log: jest.fn(), setAccessToken: jest.fn()
  } as any;

  const presentBrowser = (userAgent: string, isChromeOrChromium: boolean): void => {
    Object.defineProperty(window.navigator, 'userAgent', { get: () => userAgent, configurable: true });
    Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => isChromeOrChromium, configurable: true });
  };

  const createMicStream = (deviceId: string): MediaStream => {
    const track = {
      id: `track-${deviceId}`, kind: 'audio', label: 'Mic', enabled: true, readyState: 'live',
      getSettings: () => ({ deviceId }), addEventListener: jest.fn(), removeEventListener: jest.fn(), stop: jest.fn()
    };
    return {
      id: `stream-${deviceId}`,
      getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [],
      addEventListener: jest.fn(), removeEventListener: jest.fn()
    } as any;
  };

  const constructSdk = async (overrides?: ISdkConfig): Promise<{ sdk: GenesysCloudWebrtcSdk, sdkErrors: any[] }> => {
    seedAuthenticatedInit(api);
    sdk = new GenesysCloudWebrtcSdk({
      logger: mockLogger as any, accessToken: 'secure', environment: api.baseUrl, optOutOfTelemetry: true,
      ...(overrides || {})
    } as any);
    const sdkErrors: any[] = [];
    sdk.on('sdkError', err => sdkErrors.push(err));
    await sdk.initialize();
    /* `createAndEmitSdkError` emits on a `setTimeout(0)`; let that turn run before callers assert none arrived */
    await new Promise(resolve => setTimeout(resolve, 0));
    return { sdk, sdkErrors };
  };

  beforeEach(() => {
    jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockResolvedValue();
    getUserMedia = jest.fn().mockImplementation((constraints: MediaStreamConstraints) => {
      const audio = constraints.audio as MediaTrackConstraints;
      return Promise.resolve(createMicStream((audio?.deviceId as ConstrainDOMStringParameters)?.exact as string));
    });
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: jest.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'mic-1', groupId: 'g1', label: 'Built-in Microphone' },
          { kind: 'audioinput', deviceId: 'mic-2', groupId: 'g2', label: 'USB Microphone' }
        ]),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      }
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (sdk) { await sdk.destroy(); sdk = undefined as any; }
    delete (window.navigator as any).userAgent;
    if (originalMediaDevices) {
      Object.defineProperty(window.navigator, 'mediaDevices', originalMediaDevices);
    } else {
      delete (window.navigator as any).mediaDevices;
    }
  });

  it('initializesWithoutSdkErrorInSafari', async () => {
    presentBrowser(SAFARI_DESKTOP_UA, false);

    const { sdkErrors } = await constructSdk();

    expect(sdkErrors).toEqual([]);
  });

  it('requestsChromeOnlyKeysInChrome', async () => {
    presentBrowser(CHROME_DESKTOP_UA, true);
    const { sdkErrors } = await constructSdk();

    await sdk.media.startMedia({ audio: 'mic-2' });

    expect(sdkErrors).toEqual([]);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const audio = getUserMedia.mock.calls[0][0].audio;
    CHROME_ONLY_AUDIO_KEYS.forEach(key => expect(audio).toHaveProperty(key));
  });

  it('requestsSelectedMicWithoutChromeOnlyKeysInSafari', async () => {
    presentBrowser(SAFARI_DESKTOP_UA, false);
    await constructSdk();

    await sdk.media.startMedia({ audio: 'mic-2' });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const audio = getUserMedia.mock.calls[0][0].audio;
    expect(audio.deviceId).toEqual({ exact: 'mic-2' });
    CHROME_ONLY_AUDIO_KEYS.forEach(key => expect(audio).not.toHaveProperty(key));
  });
});
