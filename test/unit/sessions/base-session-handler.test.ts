import { SimpleMockSdk, MockSession, createPendingSession, MockStream, MockTrack, MockSender } from '../../test-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import { SessionTypes, SdkErrorTypes, JingleReasons } from '../../../src/types/enums';
import * as mediaUtils from '../../../src/media/media-utils';
import { SessionManager } from '../../../src/sessions/session-manager';
import browserama from 'browserama';

class TestableBaseSessionHandler extends BaseSessionHandler {
  sessionType: SessionTypes;
  shouldHandleSessionByJid (jid: string): boolean {
    return false;
  }
}

let handler: TestableBaseSessionHandler;
let mockSdk: GenesysCloudWebrtcSdk;
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
    await expect(handler.startSession({ sessionType: SessionTypes.softphone })).rejects.toThrowError(/can only be started using the genesys cloud api/);
  });
});

describe('setVideoMute', () => {
  it('should throw by default', async () => {
    await expect(handler.setVideoMute({} as any, { sessionId: '1', mute: true })).rejects.toThrowError(/not supported/);
  });
});

describe('setAudioMute', () => {
  it('should throw by default', async () => {
    await expect(handler.setAudioMute({} as any, { sessionId: '1', mute: true })).rejects.toThrowError(/not supported/);
  });
});

describe('updateOutgoingMedia()', () => {
  const getTrackType = (session: MockSession | MockStream, kind: 'video' | 'audio'): MockTrack => {
    return session.getTracks().filter(t => t && t.kind === kind)[0];
  };

  it('should correctly log param information', async () => {
    const videoDeviceId = 'imbatman';
    const audioDeviceId = 'wonderwoman';
    const session = new MockSession();
    session._outboundStream = new MockStream();
    const stream = new MockStream({ video: true, audio: true });

    const spy = jest.spyOn(mediaUtils, 'logDeviceChange');

    /* with a session and stream */
    await handler.updateOutgoingMedia(session as any, { stream: stream as any, videoDeviceId, audioDeviceId });
    expect(spy).toBeCalledWith(mockSdk, session, 'calledToChangeDevices', {
      requestedNewMediaStream: stream,
      requestedVideoDeviceId: videoDeviceId,
      requestedAudioDeviceId: audioDeviceId
    });

    spy.mockReset();
    jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(new MockStream({}) as any);

    /* with no stream */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId, audioDeviceId });
    expect(spy).toBeCalledWith(mockSdk, session, 'calledToChangeDevices', {
      requestedNewMediaStream: undefined,
      requestedVideoDeviceId: videoDeviceId,
      requestedAudioDeviceId: audioDeviceId
    });
  });

  it('should stop tracks in ff before starting new media', async () => {
    Object.defineProperty(browserama, 'isFirefox', { get: () => true });
    const videoDeviceId = 'imbatman';
    const audioDeviceId = 'wonderwoman';
    const session = new MockSession();
    const sender1 = new MockSender(null);
    jest.spyOn(sender1, 'replaceTrack');
    const sender2 = new MockSender(new MockTrack());
    jest.spyOn(sender2, 'replaceTrack').mockResolvedValue();
    session.pc._senders = [sender1, sender2];
    session._outboundStream = new MockStream();
    const spy = mockSdk.logger.info as jest.Mock;

    const createSpy = jest.spyOn(mockSdk.media, 'startMedia').mockImplementation(() => {
      expect(sender1.replaceTrack).not.toHaveBeenCalled();
      expect(sender2.replaceTrack).toHaveBeenCalled();
      return Promise.resolve(new MockStream() as any);
    });

    /* with a session and stream */
    await handler.updateOutgoingMedia(session as any, { stream: null, videoDeviceId, audioDeviceId });

    expect(createSpy).toHaveBeenCalled();
  });

  it('should log and throw error if we do not have a video or audio deviceId', async () => {
    try {
      await handler.updateOutgoingMedia(new MockSession() as any, {});
      fail('should have thrown');
    } catch (e) {
      expect(e.type).toBe(SdkErrorTypes.invalid_options);
      expect(e.message).toBe('Options are not valid to update outgoing media');
      expect(e.details).toEqual({
        videoDeviceId: undefined,
        audioDeviceId: undefined,
        conversationId: expect.anything(),
        sessionId: expect.anything()
      });
    }
  });

  it('should update outgoing media if a media stream was passed in', async () => {
    const session = new MockSession();
    session._outboundStream = new MockStream();
    const stream = new MockStream({ video: true, audio: true });

    await handler.updateOutgoingMedia(session as any, { stream: stream as any });

    expect(session.getTracks()).toEqual(stream.getTracks());
  });

  it('should not not update output video media from passed in stream if session has video muted', async () => {
    const session = new MockSession();
    session._outboundStream = new MockStream();
    session.videoMuted = true;
    const stream = new MockStream({ video: true, audio: true });

    await handler.updateOutgoingMedia(session as any, { stream: stream as any });

    expect(session.getTracks()).toEqual(stream.getTracks().filter(t => t.kind !== 'video'));
  });

  it('should update outgoing media with the passed in deviceId(s)', async () => {
    const session = new MockSession();
    session._outboundStream = new MockStream();
    const stream = new MockStream({ video: true, audio: true });
    const videoDeviceId = 'video-device';
    const audioDeviceId = 'audio-device';

    const startMediaSpy = jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(stream as any);

    /* video and audio with IDs */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId, audioDeviceId });
    expect(session.getTracks()).toEqual(stream.getTracks());
    expect(startMediaSpy).toBeCalledWith({ video: videoDeviceId, audio: audioDeviceId, session });
    startMediaSpy.mockReset();
    startMediaSpy.mockResolvedValue(stream as any);

    /* video and audio defaults */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: null });
    expect(startMediaSpy).toBeCalledWith({ video: null, audio: null, session });
    startMediaSpy.mockReset();
    startMediaSpy.mockResolvedValue(stream as any);

    /* video only */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: undefined });
    expect(startMediaSpy).toBeCalledWith({ video: null, audio: undefined, session });
    startMediaSpy.mockReset();
    startMediaSpy.mockResolvedValue(stream as any);

    /* audio only */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: undefined, audioDeviceId: null });
    expect(startMediaSpy).toBeCalledWith({ video: undefined, audio: null, session });
  });

  it('should skip any screenshare tracks on the session', async () => {
    const session = new MockSession();
    session._outboundStream = new MockStream();
    const stream = new MockStream({ video: true, audio: true });
    session._screenShareStream = new MockStream({ video: true });
    jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(stream as any);

    const trackIdToIgnore = session._screenShareStream.getVideoTracks()[0].id;
    const screenShareTrackSpy = jest.spyOn(session._screenShareStream, 'getTracks');

    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: null });
    expect(session.getTracks()).toEqual(stream.getTracks());
    expect(session._screenShareStream.getVideoTracks()[0].id).toBe(trackIdToIgnore);
    expect(screenShareTrackSpy).toHaveBeenCalled();
  });

  it('should skip tracks for "kinds" that were not requested to be updated', async () => {
    const session = new MockSession();
    session._outboundStream = new MockStream();
    const existingSessionStream = new MockStream({ video: true, audio: true });
    existingSessionStream.getTracks().forEach(track => session.addTrack(track));

    const originalAudioTrack = getTrackType(session, 'audio');

    /* only request video media */
    const stream = new MockStream({ video: true, audio: false });
    jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(stream as any);
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: undefined });

    /* expect audio track to remain the same */
    expect(getTrackType(session, 'audio')).toEqual(originalAudioTrack);
    /* video track should have changed */
    expect(getTrackType(session, 'video')).toEqual(getTrackType(stream, 'video'));
  });

  it('should skip video tracks if video is muted on the session', async () => {
    const session = new MockSession();
    session.videoMuted = true;
    session._outboundStream = new MockStream();
    const existingSessionStream = new MockStream({ video: false, audio: true });
    existingSessionStream.getTracks().forEach(track => session.addTrack(track));

    /* only request mock audio media */
    const stream = new MockStream({ video: false, audio: true });
    const newAudioTrack = getTrackType(stream, 'audio');
    jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(stream as any);

    /* even though we are requesting video & audio update, video should skip since it is muted */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: null });

    /* expect audio track to change */
    expect(getTrackType(session, 'audio')).toEqual(newAudioTrack);
    /* video track should still be falsy */
    expect(getTrackType(session, 'video')).toBeFalsy();
  });

  it('should update the mute state for audio tracks if audio is muted on the session', async () => {
    const session = new MockSession();
    session.audioMuted = true;
    session._outboundStream = new MockStream();
    const existingSessionStream = new MockStream({ audio: true });
    existingSessionStream.getTracks().forEach(track => session.addTrack(track));

    /* only request mock audio media */
    const stream = new MockStream({ audio: true });
    const newAudioTrack = getTrackType(stream, 'audio');
    jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(stream as any);

    /* even though we are requesting video & audio update, video should skip since it is muted */
    await handler.updateOutgoingMedia(session as any, { videoDeviceId: undefined, audioDeviceId: null });

    /* expect audio track to change */
    expect(getTrackType(session, 'audio')).toEqual(newAudioTrack);
    expect(mockSdk.setAudioMute).toHaveBeenCalledWith({ sessionId: session.id, mute: true, unmuteDeviceId: null });
  });

  it('should keep the _outboundStream in sync', async () => {
    const session = new MockSession();
    const existingSessionStream = new MockStream({ video: true, audio: true });
    existingSessionStream.getTracks().forEach(track => session.addTrack(track));
    session._outboundStream = existingSessionStream;

    const existingTracks = existingSessionStream.getTracks();

    const stream = new MockStream({ video: true, audio: true });
    const newTracks = stream.getTracks();

    jest.spyOn(mockSdk.media, 'startMedia').mockResolvedValue(stream as any);
    jest.spyOn(session._outboundStream, 'addTrack');
    jest.spyOn(session._outboundStream, 'removeTrack').mockReturnValue(void 0);

    await handler.updateOutgoingMedia(session as any, { videoDeviceId: null, audioDeviceId: null });

    expect(session._outboundStream.removeTrack).toHaveBeenCalledWith(existingTracks[0]);
    expect(session._outboundStream.removeTrack).toHaveBeenCalledWith(existingTracks[1]);
    expect(session._outboundStream.addTrack).toHaveBeenCalledWith(newTracks[0]);
    expect(session._outboundStream.addTrack).toHaveBeenCalledWith(newTracks[1]);
  });

  it('should catch `NotAllowedError`s, update mute states, and throw the error', async () => {
    const session = new MockSession();
    const mockError = { name: 'NotAllowedError' };
    const startMediaSpy = jest.spyOn(mockSdk.media, 'startMedia').mockRejectedValue(mockError);

    /* `NotAllowedError` error if updating audio and video */
    try {
      await handler.updateOutgoingMedia(session as any, { videoDeviceId: true, audioDeviceId: true });
      fail('should have thrown');
    } catch (e) {
      /* was called and threw */
      expect(startMediaSpy).toBeCalledWith({ video: true, audio: true, session });
      expect(e).toEqual(mockError);
      /* sent session mutes */
      expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'audio');
      expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'video');
      /* logs */
      expect(mockSdk.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Sending mute for audio'), expect.any(Object)
      );
      expect(mockSdk.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Sending mute for video'), expect.any(Object)
      );
    }

    session.mute.mockReset();

    /* `NotAllowedError` error if updating only video  */
    try {
      await handler.updateOutgoingMedia(session as any, { videoDeviceId: true, audioDeviceId: undefined });
      fail('should have thrown');
    } catch (e) {
      /* was called and threw */
      expect(startMediaSpy).toBeCalledWith({ video: true, audio: undefined, session });
      expect(e).toEqual(mockError);
      /* sent session mutes */
      expect(session.mute).not.toHaveBeenCalledWith(mockSdk._personDetails.id, 'audio');
      expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'video');
    }

    session.mute.mockReset();

    /* `NotAllowedError` error if updating only audio  */
    try {
      await handler.updateOutgoingMedia(session as any, { videoDeviceId: undefined, audioDeviceId: true });
      fail('should have thrown');
    } catch (e) {
      /* was called and threw */
      expect(startMediaSpy).toBeCalledWith({ video: undefined, audio: true, session });
      expect(e).toEqual(mockError);
      /* sent session mutes */
      expect(session.mute).toHaveBeenCalledWith(mockSdk._personDetails.id, 'audio');
      expect(session.mute).not.toHaveBeenCalledWith(mockSdk._personDetails.id, 'video');
    }

    session.mute.mockReset();
    startMediaSpy.mockRejectedValue({ name: 'SomeOtherError' });
    /* Some other error */
    try {
      await handler.updateOutgoingMedia(session as any, { videoDeviceId: true, audioDeviceId: true });
      fail('should have thrown');
    } catch (e) {
      /* was called and threw */
      expect(startMediaSpy).toBeCalledWith({ video: true, audio: true, session });
      expect(e).not.toEqual(mockError);
      /* did not send session mutes */
      expect(session.mute).not.toHaveBeenCalledWith(mockSdk._personDetails.id, 'audio');
      expect(session.mute).not.toHaveBeenCalledWith(mockSdk._personDetails.id, 'video');
    }
  });
});

describe('updateOutputDevice()', () => {
  it('should log and return if the session does not have an _outputAudioElement', async () => {
    const session = new MockSession();
    await handler.updateOutputDevice(session as any, 'deviceId');
    expect(mockSdk.logger.warn).toHaveBeenCalledWith(expect.stringContaining('Cannot update audio output'), expect.any(Object));
  });

  it('should throw if the audio element does not have the `setSinkId` property', async () => {
    const session = new MockSession();
    session._outputAudioElement = {};

    await expect(handler.updateOutputDevice(session as any, 'deviceId')).rejects.toThrow(/Cannot set sink id in unsupported browser/);
  });

  it('should set the sinkId with the passed in deviceId', async () => {
    const session = new MockSession();
    const deviceId = 'new-output-device';
    const setSinkIdSpy = jest.fn().mockResolvedValue(undefined);

    jest.spyOn(mediaUtils, 'logDeviceChange').mockImplementation();
    session._outputAudioElement = { setSinkId: setSinkIdSpy };

    await handler.updateOutputDevice(session as any, deviceId);
    expect(mediaUtils.logDeviceChange).toHaveBeenCalledWith(
      mockSdk,
      session,
      'changingDevices',
      { requestedOutputDeviceId: deviceId }
    );
    expect(setSinkIdSpy).toHaveBeenCalledWith(deviceId);
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

describe('rejectPendingSession', () => {
  it('should call rejectRtcSession', async () => {
    const pendingSession = createPendingSession();
    await handler.rejectPendingSession(pendingSession);

    expect(mockSessionManager.webrtcSessions.rejectRtcSession).toHaveBeenCalledWith(pendingSession.id);
  });
});

describe('handleSessionInit', () => {
  it('should log connectionStateChanges', async () => {
    const session: any = new MockSession();
    session.conversationId = null;
    session.fromUserId = null;

    const pendingSession = createPendingSession();
    pendingSession.fromUserId = 'fake';
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    const eventSpy = jest.fn();
    mockSdk.on('sessionStarted', eventSpy);
    const logSpy = jest.spyOn(handler, 'log' as any);

    const sessionId = '123abc';
    const conversationId = 'convoabc';

    session.sid = sessionId;
    session.conversationId = conversationId;

    await handler.handleSessionInit(session);
    session.emit('connectionState', 'connected');

    expect(logSpy).toHaveBeenCalledWith('info', 'connection state change', { state: 'connected', conversationId, sid: sessionId });
  });

  it('should set conversationId and fromUserId on existing pendingSession and emit sessionStarted', async () => {
    const session: any = new MockSession();
    session.conversationId = null;
    session.fromUserId = null;

    const pendingSession = createPendingSession();
    pendingSession.fromUserId = 'fake';
    jest.spyOn(mockSessionManager, 'getPendingSession').mockReturnValue(pendingSession);

    const eventSpy = jest.fn();
    mockSdk.on('sessionStarted', eventSpy);

    await handler.handleSessionInit(session);

    expect(mockSdk._streamingConnection.webrtcSessions.rtcSessionAccepted).toHaveBeenCalled();
    expect(session.conversationId).toEqual(pendingSession.conversationId);
    expect(session.fromUserId).toEqual('fake');
    expect(eventSpy).toHaveBeenCalled();
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
  it('should clean up outboundStream and screenStream and emit sessionEnded', () => {
    const session: any = new MockSession();
    const stream = session._outboundStream = new MockStream(true);
    const screenStream = session._screenShareStream = new MockStream(true);

    const spy = jest.fn();
    mockSdk.on('sessionEnded', spy);

    handler.onSessionTerminated(session, { condition: JingleReasons.success });

    expect(stream._tracks[0].stop).toHaveBeenCalled();
    expect(screenStream._tracks[0].stop).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });
});

describe('acceptSession', () => {
  it('should call session.accept', async () => {
    const session: any = new MockSession();
    await handler.acceptSession(session, { sessionId: session.id });
    expect(session.accept).toHaveBeenCalled();
  });

  it('should log correctly', async () => {
    const session: any = new MockSession();
    const params = { sessionId: session.id };
    const logSpy = jest.spyOn(handler, 'log' as any);

    await handler.acceptSession(session, params);

    expect(logSpy).toHaveBeenCalledWith('info', 'accepting session', {
      sessionType: undefined,
      conversationId: session.conversationId,
      sessionId: session.id,
      params
    });
  });

  it('should set the sinkId in supported browsers to the default output device', async () => {
    const session: any = new MockSession();
    const audio = document.createElement('audio') as HTMLAudioElement & { setSinkId (id: string): Promise<undefined> };

    audio.setSinkId = jest.fn().mockResolvedValue(undefined);
    session._outputAudioElement = audio;

    jest.spyOn(mockSdk.media, 'getState').mockReturnValue({ hasOutputDeviceSupport: true } as any);

    /* with no sdk default output deviceId */
    await handler.acceptSession(session, { sessionId: session.id });
    expect(audio.setSinkId).toHaveBeenCalledWith('');

    /* with sdk default output deviceId */
    mockSdk._config.defaults.outputDeviceId = 'output-device-id';
    await handler.acceptSession(session, { sessionId: session.id });
    expect(audio.setSinkId).toHaveBeenCalledWith(mockSdk._config.defaults.outputDeviceId);
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
});

describe('addMediatoSession', () => {
  it('should add by tracks if has tranceiver functionality', async () => {
    const stream = new MockStream(true);
    jest.spyOn(mediaUtils, 'checkHasTransceiverFunctionality').mockReturnValue(true);

    const mockSession: any = {
      pc: {
        addTrack: jest.fn(),
        addStream: jest.fn()
      }
    };

    await handler.addMediaToSession(mockSession, stream as any);

    expect(mockSession.pc.addTrack).toHaveBeenCalled();
  });

  it('should throw error if not capable of track actions', async () => {
    jest.spyOn(mediaUtils, 'checkHasTransceiverFunctionality').mockReturnValue(false);
    const stream = new MockStream(false);

    const mockSession: any = {
      pc: {
        addTrack: jest.fn(),
        addStream: jest.fn()
      }
    };

    await expect(handler.addMediaToSession(mockSession, stream as any)).rejects.toThrow(/Track based actions are required/);
  });
});

describe('removeMediaFromSession', () => {
  it('should remove the track from the session', async () => {
    const sender = {
      replaceTrack: jest.fn().mockResolvedValue(null)
    };

    await handler.removeMediaFromSession({} as any, sender as any);

    expect(sender.replaceTrack).toHaveBeenCalledWith(null);
  });
});

describe('_warnNegotiationNeeded', () => {
  it('should log a message', () => {
    const session = new MockSession();
    handler._warnNegotiationNeeded(session as any);

    expect(mockSdk.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('negotiation needed and not supported'),
      { conversationId: session.conversationId, sessionId: session.id }
    );
  });
});

describe('addReplaceTrackToSession', () => {
  it('should not apply constraints for audio tracks', async () => {
    const session = new MockSession();
    session.pc._senders = [new MockSender(new MockTrack('audio'))];

    const track = new MockTrack('audio');
    await handler.addReplaceTrackToSession(session as any, track as any);

    expect(track.applyConstraints).not.toHaveBeenCalled();
  });
});
