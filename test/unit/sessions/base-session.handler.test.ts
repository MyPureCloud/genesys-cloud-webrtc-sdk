import { SimpleMockSdk, MockSession, createPendingSession, MockStream, MockTrack } from '../../test-utils';
import { PureCloudWebrtcSdk } from '../../../src/client';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import { SessionTypes, SdkErrorTypes } from '../../../src/types/enums';
import * as mediaUtils from '../../../src/media-utils';
import { SessionManager } from '../../../src/sessions/session-manager';
import { IJingleSession } from '../../../src/types/interfaces';

class TestableBaseSessionHandler extends BaseSessionHandler {
  sessionType: SessionTypes;
  shouldHandleSessionByJid (jid: string): boolean {
    return false;
  }
}

let handler: TestableBaseSessionHandler;
let mockSdk: PureCloudWebrtcSdk;
let mockSessionManager: SessionManager;

beforeEach(() => {
  jest.clearAllMocks();
  mockSdk = (new SimpleMockSdk() as any);
  (mockSdk as any).isGuest = true;
  mockSdk._config.autoConnectSessions = true;

  mockSessionManager = new SessionManager(mockSdk);
  handler = new TestableBaseSessionHandler(mockSdk, mockSessionManager);
});

describe('startSession', () => {
  it('should throw since startSession should be overridden by implementing class', async () => {
    await expect(handler.startSession({ sessionType: SessionTypes.softphone })).rejects.toThrowError(/can only be started using the purecloud api/);
  });
});

describe('setVideoMute', () => {
  it('should throw by default', async () => {
    await expect(handler.setVideoMute({} as any, { id: '1', mute: true })).rejects.toThrowError(/not supported/);
  });
});

describe('setAudioMute', () => {
  it('should throw by default', async () => {
    await expect(handler.setAudioMute({} as any, { id: '1', mute: true })).rejects.toThrowError(/not supported/);
  });
});

describe('updateOutgoingMedia()', () => {
  const getTrackType = (session: MockSession | MockStream, kind: 'video' | 'audio'): MockTrack => {
    return session.getTracks().filter(t => t && t.kind === kind)[0];
  };

  test('should log and throw error if we do not have a video or audio deviceId', async () => {
    try {
      await handler.updateOutgoingMedia({} as IJingleSession, {});
      fail('should have thrown');
    } catch (e) {
      expect(mockSdk.logger.warn).toHaveBeenCalled();
      expect(e.type).toBe(SdkErrorTypes.invalid_options);
    }
  });

  test('should update outgoing media if a media stream was passed in', async () => {
    const session = new MockSession();
    const stream = new MockStream({ video: true, audio: true });

    await handler.updateOutgoingMedia(session as any, { stream: stream as any });

    expect(session.getTracks()).toEqual(stream.getTracks());
  });

  test('should not not update output video media from passed in stream if session has video muted', async () => {
    const session = new MockSession();
    session.videoMuted = true;
    const stream = new MockStream({ video: true, audio: true });

    await handler.updateOutgoingMedia(session as any, { stream: stream as any });

    expect(session.getTracks()).toEqual(stream.getTracks().filter(t => t.kind !== 'video'));
  });

  test('should update outgoing media with the passed in deviceId(s)', async () => {
    const session = new MockSession();
    const stream = new MockStream({ video: true, audio: true });
    const videoDeviceId = 'video-device';
    const audioDeviceId = 'audio-device';

    const startMediaSpy = jest.spyOn(mediaUtils, 'startMedia').mockResolvedValue(stream as any);

    /* video and audio with IDs */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId, audioDeviceId });
    expect(session.getTracks()).toEqual(stream.getTracks());
    expect(startMediaSpy).toBeCalledWith(mockSdk, { video: videoDeviceId, audio: audioDeviceId });
    startMediaSpy.mockReset();
    startMediaSpy.mockResolvedValue(stream as any);

    /* video and audio defaults */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: null });
    expect(startMediaSpy).toBeCalledWith(mockSdk, { video: null, audio: null });
    startMediaSpy.mockReset();
    startMediaSpy.mockResolvedValue(stream as any);

    /* video only */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: undefined });
    expect(startMediaSpy).toBeCalledWith(mockSdk, { video: null, audio: undefined });
    startMediaSpy.mockReset();
    startMediaSpy.mockResolvedValue(stream as any);

    /* audio only */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: undefined, audioDeviceId: null });
    expect(startMediaSpy).toBeCalledWith(mockSdk, { video: undefined, audio: null });

  });

  test('should skip any screenshare tracks on the session', async () => {
    const session = new MockSession();
    const stream = new MockStream({ video: true, audio: true });
    session._screenShareStream = new MockStream({ video: true });
    jest.spyOn(mediaUtils, 'startMedia').mockResolvedValue(stream as any);

    const trackIdToIgnore = session._screenShareStream.getVideoTracks()[0].id;
    const screenShareTrackSpy = jest.spyOn(session._screenShareStream, 'getTracks');

    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: null });
    expect(session.getTracks()).toEqual(stream.getTracks());
    expect(session._screenShareStream.getVideoTracks()[0].id).toBe(trackIdToIgnore);
    expect(screenShareTrackSpy).toHaveBeenCalled();
  });

  test('should skip tracks for "kinds" that were not requested to be updated', async () => {
    const session = new MockSession();
    const existingSessionStream = new MockStream({ video: true, audio: true });
    existingSessionStream.getTracks().forEach(track => session.addTrack(track));

    const originalAudioTrack = getTrackType(session, 'audio');

    /* only request video media */
    const stream = new MockStream({ video: true, audio: false });
    jest.spyOn(mediaUtils, 'startMedia').mockResolvedValue(stream as any);
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: undefined });

    /* expect audio track to remain the same */
    expect(getTrackType(session, 'audio')).toEqual(originalAudioTrack);
    /* video track should have changed */
    expect(getTrackType(session, 'video')).toEqual(getTrackType(stream, 'video'));
  });

  test('should skip video tracks if video is muted on the session', async () => {
    const session = new MockSession();
    session.videoMuted = true;
    const existingSessionStream = new MockStream({ video: false, audio: true });
    existingSessionStream.getTracks().forEach(track => session.addTrack(track));

    /* only request mock audio media */
    const stream = new MockStream({ video: false, audio: true });
    const newAudioTrack = getTrackType(stream, 'audio');
    jest.spyOn(mediaUtils, 'startMedia').mockResolvedValue(stream as any);

    /* even though we are requesting video & audio update, video should skip since it is muted */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: null });

    /* expect audio track to change */
    expect(getTrackType(session, 'audio')).toEqual(newAudioTrack);
    /* video track should still be falsy */
    expect(getTrackType(session, 'video')).toBeFalsy();
  });

  test('should update the mute state for audio tracks if audio is muted on the session', async () => {
    const session = new MockSession();
    session.audioMuted = true;
    const existingSessionStream = new MockStream({ audio: true });
    existingSessionStream.getTracks().forEach(track => session.addTrack(track));

    /* only request mock audio media */
    const stream = new MockStream({ audio: true });
    const newAudioTrack = getTrackType(stream, 'audio');
    jest.spyOn(mediaUtils, 'startMedia').mockResolvedValue(stream as any);

    /* even though we are requesting video & audio update, video should skip since it is muted */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: undefined, audioDeviceId: null });

    /* expect audio track to change */
    expect(getTrackType(session, 'audio')).toEqual(newAudioTrack);
    expect(mockSdk.setAudioMute).toHaveBeenCalledWith({ id: session.id, mute: true, unmuteDeviceId: null });
  });

  test('should keep the _outboundStream in sync', async () => {
    const session = new MockSession();
    const existingSessionStream = new MockStream({ video: true, audio: true });
    existingSessionStream.getTracks().forEach(track => session.addTrack(track));
    session._outboundStream = existingSessionStream;

    const existingTracks = existingSessionStream.getTracks();

    const stream = new MockStream({ video: true, audio: true });
    const newTracks = stream.getTracks();

    jest.spyOn(mediaUtils, 'startMedia').mockResolvedValue(stream as any);
    jest.spyOn(session._outboundStream, 'addTrack');
    jest.spyOn(session._outboundStream, 'removeTrack').mockReturnValue(void 0);

    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: null });

    expect(session._outboundStream.removeTrack).toHaveBeenCalledWith(existingTracks[0]);
    expect(session._outboundStream.removeTrack).toHaveBeenCalledWith(existingTracks[1]);
    expect(session._outboundStream.addTrack).toHaveBeenCalledWith(newTracks[0]);
    expect(session._outboundStream.addTrack).toHaveBeenCalledWith(newTracks[1]);
  });
});

describe('updateOutputDevice()', () => {
  test('should log and return if the session does not have an _outputAudioElement', async () => {
    const session = new MockSession();
    await handler.updateOutputDevice(session as any, 'deviceId');
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Cannot update audio output'), expect.any(Object));
  });

  test('should throw if the audio element does not have the `setSinkId` property', async () => {
    const session = new MockSession();
    session._outputAudioElement = {};

    try {
      await handler.updateOutputDevice(session as any, 'deviceId');
      fail('should have thrown');
    } catch (e) {
      expect(e.type).toBe(SdkErrorTypes.not_supported);
      expect(e.message).toEqual(expect.stringContaining('Cannot set sink id in unsupported browser'));
    }
  });

  test('should set the sinkId with the passed in deviceId', async () => {
    const session = new MockSession();
    const deviceId = 'new-output-device';
    const spy = jest.fn();
    session._outputAudioElement = { setSinkId: spy };

    await handler.updateOutputDevice(session as any, deviceId);
    expect(mockSdk.logger.info).toHaveBeenCalledWith(expect.stringContaining('Setting output deviceId'), { deviceId, conversationId: session.conversationId });
    expect(spy).toHaveBeenCalledWith(deviceId);
  });
});

describe('handleConversationUpdate', () => {
  it('nothing to test', () => {
    handler.handleConversationUpdate({} as any, {} as any);
  });
});

describe('handlePropose', () => {
  it('should emit pending session', async () => {
    const spy = jest.fn();
    mockSdk.on('pendingSession', spy);

    const pendingSession = createPendingSession(SessionTypes.acdScreenShare);
    await handler.handlePropose(pendingSession);

    expect(spy).toHaveBeenCalled();
  });
});

describe('proceedWithSession', () => {
  it('should call acceptRtcSession', async () => {
    const pendingSession = createPendingSession();
    await handler.proceedWithSession(pendingSession);

    expect(mockSessionManager.webrtcSessions.acceptRtcSession).toHaveBeenCalledWith(pendingSession.id);
  });
});

describe('handleSessionInit', () => {
  it('should set conversationId on existing pendingSession and emit sessionStarted', async () => {
    const session: any = new MockSession();
    session.conversationId = null;

    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    const eventSpy = jest.fn();
    mockSdk.on('sessionStarted', eventSpy);

    await handler.handleSessionInit(session);

    expect(mockSdk._streamingConnection.webrtcSessions.rtcSessionAccepted).toHaveBeenCalled();
    expect(session.conversationId).toEqual(pendingSession.conversationId);
    expect(eventSpy).toHaveBeenCalled();
    expect(session._statsGatherer).toBeTruthy();
  });

  it('should set up stats listener', async () => {
    const session: any = new MockSession();
    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    await handler.handleSessionInit(session);

    const spy: jest.Mock = mockSdk.logger.info as any;
    spy.mockReset();

    const fakeData = {};
    session._statsGatherer.emit('stats', fakeData);

    const logCall = spy.mock.calls[0];
    expect(logCall[0]).toContain('session:stats');
    expect(logCall[1].conversationId).toBe(session.conversationId);
  });

  it('should set up traces listener', async () => {
    const session: any = new MockSession();
    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    await handler.handleSessionInit(session);

    const spy: jest.Mock = mockSdk.logger.warn as any;
    spy.mockReset();

    const fakeData = {};
    session._statsGatherer.emit('traces', fakeData);

    const logCall = spy.mock.calls[0];
    expect(logCall[0]).toContain('session:trace');
    expect(logCall[1].conversationId).toBe(session.conversationId);
  });

  it('should set up change:active listener', async () => {
    const session: any = new MockSession();
    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    await handler.handleSessionInit(session);

    jest.spyOn(session._statsGatherer, 'collectInitialConnectionStats');

    const spy: jest.Mock = mockSdk.logger.info as any;
    spy.mockReset();

    session.emit('change:active', session, true);

    const logCall = spy.mock.calls[0];
    expect(logCall[0]).toContain('change:active');

    const { conversationId, sid, active } = logCall[1];
    expect(conversationId).toBe(session.conversationId);
    expect(sid).toBe(session.id);
    expect(active).toBeTruthy();
    expect(session._statsGatherer.collectInitialConnectionStats).toHaveBeenCalled();
  });

  it('should not collectInitialStats if not active', async () => {
    const session: any = new MockSession();
    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    await handler.handleSessionInit(session);

    jest.spyOn(session._statsGatherer, 'collectInitialConnectionStats');

    const spy: jest.Mock = mockSdk.logger.info as any;
    spy.mockReset();

    session.emit('change:active', session, false);

    const logCall = spy.mock.calls[0];
    expect(logCall[0]).toContain('change:active');

    const { conversationId, sid, active } = logCall[1];
    expect(conversationId).toBe(session.conversationId);
    expect(sid).toBe(session.id);
    expect(active).toBeFalsy();
    expect(session._statsGatherer.collectInitialConnectionStats).not.toHaveBeenCalled();
  });

  it('should set up terminated listener', async () => {
    const session: any = new MockSession();
    const pendingSession = createPendingSession();
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    const spy = jest.spyOn(handler, 'onSessionTerminated');
    await handler.handleSessionInit(session);

    session.emit('terminated', session, true);
    expect(spy).toHaveBeenCalled();
  });
});

describe('onSessionTerminated', () => {
  it('should clean up outboundStream and emit sessionEnded', () => {
    const session: any = new MockSession();
    const stream = session._outboundStream = new MockStream();

    const spy = jest.fn();
    mockSdk.on('sessionEnded', spy);

    handler.onSessionTerminated(session, 'success');

    expect(stream._tracks[0].stop).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });
});

describe('acceptSession', () => {
  it('should call session.accept', async () => {
    const session: any = new MockSession();
    await handler.acceptSession(session, { id: session.id });
    expect(session.accept).toHaveBeenCalled();
  });
});

describe('endSession', () => {
  it('should call session.end', async () => {
    const session: any = new MockSession();
    const promise = handler.endSession(session);
    session.emit('terminated');
    await promise;
    expect(session.end).toHaveBeenCalled();
  });

  it('should reject with error', async () => {
    const session: any = new MockSession();
    const promise = handler.endSession(session);
    const fakeErr = new Error('fake');
    session.emit('error', fakeErr);
    await expect(promise).rejects.toThrow();
    expect(session.end).toHaveBeenCalled();
  });
});

describe('addMediatoSession', () => {
  it('should add by tracks if has tranceiver functionality', async () => {
    const stream = new MockStream();
    jest.spyOn(mediaUtils, 'checkHasTransceiverFunctionality').mockReturnValue(true);

    const mockSession: any = {
      addTrack: jest.fn(),
      addStream: jest.fn()
    };

    await handler.addMediaToSession(mockSession, stream as any);

    expect(mockSession.addTrack).toHaveBeenCalled();
    expect(mockSession.addStream).not.toHaveBeenCalled();
  });

  it('should use streams if doesn\'t have transceivers and legacyFallback is enabled', async () => {
    const stream = new MockStream();
    jest.spyOn(mediaUtils, 'checkHasTransceiverFunctionality').mockReturnValue(false);

    const mockSession: any = {
      addTrack: jest.fn(),
      addStream: jest.fn()
    };

    await handler.addMediaToSession(mockSession, stream as any);

    expect(mockSession.addTrack).not.toHaveBeenCalled();
    expect(mockSession.addStream).toHaveBeenCalled();
  });

  it('should throw if no tranceivers and legacy fallback not allowed', async () => {
    const stream = new MockStream();
    jest.spyOn(mediaUtils, 'checkHasTransceiverFunctionality').mockReturnValue(false);

    const mockSession: any = {
      addTrack: jest.fn(),
      addStream: jest.fn()
    };

    await expect(handler.addMediaToSession(mockSession, stream as any, false)).rejects.toThrowError(/Track based actions are required/);
    expect(mockSession.addTrack).not.toHaveBeenCalled();
    expect(mockSession.addStream).not.toHaveBeenCalled();
  });
});

describe('removeMediaFromSession', () => {
  it('should remove the track from the session', async () => {
    const s = {
      removeTrack: jest.fn().mockResolvedValue(null)
    };

    const track = {};

    await handler.removeMediaFromSession(s as any, track as any);

    expect(s.removeTrack).toHaveBeenCalledWith(track);
  });
});

describe('_warnNegotiationNeeded', () => {
  it('should log a message', () => {
    const session = new MockSession();
    handler._warnNegotiationNeeded(session as any);

    expect(mockSdk.logger.error).toHaveBeenCalledWith(expect.stringContaining('negotiation needed and not supported'), { conversationId: session.conversationId });
  });
});
