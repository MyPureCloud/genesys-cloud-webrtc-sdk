/* eslint @typescript-eslint/no-explicit-any: "off" */
import { Logger } from 'genesys-cloud-client-logger';
import { EventEmitter } from 'events';

import * as windows11Utils from '../../src/windows11-first-session-hack';
import {
  GenesysCloudWebrtcSdk,
  SessionTypes
} from '../../src';
import { MockSession, MockTrack, flushPromises } from '../test-utils';

/**
 * Integration tests for SessionManager.validateOutgoingMediaTracks().
 *
 * This runs when the device list changes (e.g. a camera/mic is unplugged).
 * The branches are all negative-ish: a session's outgoing track references a
 * device that no longer exists, and the SDK must react. We drive each branch
 * by making `sdk.media.getState()` report EMPTY device lists while an active
 * session still has senders, then assert the SDK's fallback behavior:
 *   - video device gone, no replacement -> setVideoMute(true)
 *   - audio device gone, no replacement -> setAudioMute(true) + track stopped + removed
 *   - output device gone -> updateOutputDeviceForAllSessions(true)
 *   - nothing lost -> no mute/remove calls (no dirty churn)
 *
 * NOTE (gray-box fallback): `media.getState()` and `getAllActiveSessions()` are
 * legitimate outward/inbound-boundary stubs, but the fallback assertions here
 * spy the handler's own `setVideoMute`/`setAudioMute`/`removeMediaFromSession`.
 * The true outward edge is the mute PATCH + `track.stop()`, reachable only
 * through the media/jingle stack this harness does not fake. Per the standards
 * doc these are the labelled fallback tier, not the black-box ideal.
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

describe('validateOutgoingMediaTracks device-loss (integration)', () => {
  let sdk: GenesysCloudWebrtcSdk;

  const mockLogger: jest.Mocked<Logger> = {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    setAccessToken: jest.fn()
  } as any;

  const constructSdk = async (): Promise<GenesysCloudWebrtcSdk> => {
    sdk = new GenesysCloudWebrtcSdk({
      logger: mockLogger as any,
      accessToken: 'secure',
      environment: 'mypurecloud.com',
      optOutOfTelemetry: true
    } as any);
    sdk.fetchOrganization = jest.fn().mockResolvedValue({ id: 'org', name: 'org' });
    sdk.fetchAuthenticatedUser = jest.fn().mockImplementation(async () => {
      sdk._personDetails = { id: 'userId', name: 'u', chat: { jabberId: 'u@jid.com' }, station: {} } as any;
    });
    sdk.fetchUsersStation = jest.fn().mockResolvedValue(undefined);
    await sdk.initialize();
    return sdk;
  };

  /** Build an active session with one sender track of the given kind + label. */
  const activeSessionWith = (kind: 'video' | 'audio', label: string): MockSession => {
    const session = new MockSession(SessionTypes.softphone);
    const track = new MockTrack(kind, label);
    session.peerConnection._addSender(track as any);
    session._outboundStream = { removeTrack: jest.fn() };
    return session;
  };

  /** Point media.getState at the supplied device state. */
  const setDeviceState = (state: Partial<{
    videoDevices: any[]; audioDevices: any[]; outputDevices: any[]; hasOutputDeviceSupport: boolean;
  }>) => {
    jest.spyOn(sdk.media, 'getState').mockReturnValue({
      videoDevices: [],
      audioDevices: [],
      outputDevices: [],
      hasOutputDeviceSupport: false,
      ...state
    } as any);
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

  it('mutesVideoWhenVideoDeviceLostAndNoneAvailable', async () => {
    await constructSdk();
    const session = activeSessionWith('video', 'Unplugged Cam');
    jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([session as any]);
    jest.spyOn(sdk.sessionManager, 'getSessionBySessionId').mockReturnValue(session as any);
    setDeviceState({ videoDevices: [] }); // no video devices to switch to

    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const videoMuteSpy = jest.spyOn(handler, 'setVideoMute').mockResolvedValue(undefined as any);

    await sdk.sessionManager.validateOutgoingMediaTracks();
    await flushPromises();

    expect(videoMuteSpy).toHaveBeenCalledWith(session, expect.objectContaining({ mute: true }));
  });

  it('mutesAndRemovesAudioWhenAudioDeviceLostAndNoneAvailable', async () => {
    await constructSdk();
    const session = activeSessionWith('audio', 'Unplugged Mic');
    jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([session as any]);
    jest.spyOn(sdk.sessionManager, 'getSessionBySessionId').mockReturnValue(session as any);
    setDeviceState({ audioDevices: [] });

    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const audioMuteSpy = jest.spyOn(handler, 'setAudioMute').mockResolvedValue(undefined as any);
    const removeSpy = jest.spyOn(handler, 'removeMediaFromSession').mockResolvedValue(undefined as any);
    jest.spyOn(handler, 'getSendersByTrackType').mockReturnValue(session.peerConnection.getSenders() as any);

    await sdk.sessionManager.validateOutgoingMediaTracks();
    await flushPromises();

    expect(audioMuteSpy).toHaveBeenCalledWith(session, expect.objectContaining({ mute: true }));
    expect(removeSpy).toHaveBeenCalled();
    /* the lost track should be stopped and removed from the outbound stream */
    expect((session._outboundStream.removeTrack as jest.Mock)).toHaveBeenCalled();
  });

  it('switchesOutputDeviceWhenOutputDeviceLost', async () => {
    await constructSdk();
    const session = activeSessionWith('audio', 'Mic'); // track label present so no audio churn
    session._outputAudioElement = { sinkId: 'gone-output-id' };
    jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([session as any]);
    setDeviceState({
      audioDevices: [{ label: 'Mic', kind: 'audioinput', deviceId: 'mic1' }],
      outputDevices: [{ label: 'Speakers', kind: 'audiooutput', deviceId: 'different-id' }],
      hasOutputDeviceSupport: true
    });

    const switchSpy = jest.spyOn(sdk.sessionManager, 'updateOutputDeviceForAllSessions').mockResolvedValue(undefined);

    await sdk.sessionManager.validateOutgoingMediaTracks();
    await flushPromises();

    expect(switchSpy).toHaveBeenCalledWith(true);
  });

  it('doesNothingWhenNoTracksLost', async () => {
    await constructSdk();
    const session = activeSessionWith('audio', 'Mic');
    jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([session as any]);
    /* the device for the track's label still exists -> nothing to update */
    setDeviceState({
      audioDevices: [{ label: 'Mic', kind: 'audioinput', deviceId: 'mic1' }]
    });

    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const audioMuteSpy = jest.spyOn(handler, 'setAudioMute').mockResolvedValue(undefined as any);
    const videoMuteSpy = jest.spyOn(handler, 'setVideoMute').mockResolvedValue(undefined as any);
    const updateMediaSpy = jest.spyOn(sdk, 'updateOutgoingMedia').mockResolvedValue(undefined as any);

    await sdk.sessionManager.validateOutgoingMediaTracks();
    await flushPromises();

    expect(audioMuteSpy).not.toHaveBeenCalled();
    expect(videoMuteSpy).not.toHaveBeenCalled();
    expect(updateMediaSpy).not.toHaveBeenCalled();
  });

  it('switchesDeviceWhenVideoDeviceLostButReplacementAvailable', async () => {
    await constructSdk();
    const session = activeSessionWith('video', 'Unplugged Cam');
    jest.spyOn(sdk.sessionManager, 'getAllActiveSessions').mockReturnValue([session as any]);
    jest.spyOn(sdk.sessionManager, 'getSessionBySessionId').mockReturnValue(session as any);
    /* the old label is gone, but a different video device exists -> switch, not mute */
    setDeviceState({
      videoDevices: [{ label: 'Other Cam', kind: 'videoinput', deviceId: 'cam2' }]
    });

    const handler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone });
    jest.spyOn(sdk.sessionManager, 'getSessionHandler').mockReturnValue(handler);
    const videoMuteSpy = jest.spyOn(handler, 'setVideoMute').mockResolvedValue(undefined as any);
    const updateMediaSpy = jest.spyOn(sdk, 'updateOutgoingMedia').mockResolvedValue(undefined as any);

    await sdk.sessionManager.validateOutgoingMediaTracks();
    await flushPromises();

    expect(videoMuteSpy).not.toHaveBeenCalled();
    expect(updateMediaSpy).toHaveBeenCalledWith(expect.objectContaining({ videoDeviceId: true }));
  });
});
