import * as streamingClientUtils from 'genesys-cloud-streaming-client';

import { SimpleMockSdk, MockSession, createPendingSession, MockStream, MockTrack } from '../../test-utils';
import ScreenShareSessionHandler from '../../../src/sessions/screen-share-session-handler';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import { SessionTypes, SdkErrorTypes } from '../../../src/types/enums';
import * as mediaUtils from '../../../src/media/media-utils';
import * as utils from '../../../src/utils';
import { VideoMediaSession } from '../../../src/types/interfaces';

let handler: ScreenShareSessionHandler;
let mockSdk: GenesysCloudWebrtcSdk;
let mockSessionManager: SessionManager;

beforeEach(() => {
  Object.defineProperty(window, 'MediaStream', { value: MockStream, writable: true });

  jest.clearAllMocks();
  mockSdk = (new SimpleMockSdk() as any);
  (mockSdk as any).isGuest = true;
  mockSdk._config.autoConnectSessions = true;

  mockSessionManager = new SessionManager(mockSdk);
  handler = new ScreenShareSessionHandler(mockSdk, mockSessionManager);
});

describe('shouldHandleSessionByJid', () => {
  it('should rely on isAcdJid', () => {
    jest.spyOn(utils, 'isAcdJid').mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(handler.shouldHandleSessionByJid('sdlkf')).toBeFalsy();
    expect(handler.shouldHandleSessionByJid('sdlfk')).toBeTruthy();
  });
});

describe('handleConversationUpdate', () => {
  it('should do nothing', () => {
    handler.handleConversationUpdate({} as any, []);
  });
});

describe('startSession', () => {
  let stream: MockStream;
  let jid: string;
  let data: any;
  beforeEach(() => {
    /* setup necessary state data */
    stream = new MockStream();
    jid = '123acdjid';
    data = {
      jwt: 'jwt',
      conversation: { id: 'conversationId1' },
      sourceCommunicationId: 'srcComId'
    };
    mockSdk._customerData = data;

    /* spy on utility functions */
    jest.spyOn(mockSdk.media, 'startDisplayMedia').mockResolvedValue(stream as any);
    jest.spyOn(streamingClientUtils, 'parseJwt').mockReturnValue({ data: { jid } });
  });

  it('should initiate session', async () => {
    await handler.startSession({ sessionType: SessionTypes.acdScreenShare });

    const expectedParams = {
      jid,
      conversationId: data.conversation.id,
      sourceCommunicationId: data.sourceCommunicationId,
      mediaPurpose: SessionTypes.acdScreenShare,
      sessionType: SessionTypes.acdScreenShare
    };

    expect(mockSdk._streamingConnection.webrtcSessions.initiateRtcSession)
      .toHaveBeenLastCalledWith(expectedParams);
  });

  it('should clear out any old media stream and set the new media', async () => {
    const oldStream = new MockStream();
    const endTracksSpy = jest.spyOn(handler, 'endTracks');

    handler['_screenStreamPromise'] = Promise.resolve(oldStream) as any;
    await handler.startSession({ sessionType: SessionTypes.acdScreenShare });

    expect(endTracksSpy).toHaveBeenCalledWith(oldStream);
  });
});

describe('handlePropose', () => {
  it('should emit pending session and proceed immediately', async () => {
    const superSpyHandlePropose = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose');
    const superSpyProceed = jest.spyOn(BaseSessionHandler.prototype, 'proceedWithSession').mockImplementation();

    const spy = jest.fn();
    mockSdk.on('pendingSession', spy);

    const pendingSession = createPendingSession(SessionTypes.acdScreenShare);
    await handler.handlePropose(pendingSession);

    expect(spy).toHaveBeenCalled();
    expect(superSpyHandlePropose).toHaveBeenCalled();
    expect(superSpyProceed).toHaveBeenCalled();
  });
});

describe('handleSessionInit', () => {
  it('should end session and clean up any media if session init fails', async () => {
    const endSession = jest.spyOn(BaseSessionHandler.prototype, 'endSession').mockImplementation();
    const endTracks = jest.spyOn(handler, 'endTracks');
    const session: VideoMediaSession = new MockSession() as any;
    const stream = new MockStream();

    jest.spyOn(BaseSessionHandler.prototype, 'handleSessionInit').mockRejectedValue(new Error('error'));
    handler['_screenStreamPromise'] = Promise.resolve(stream as any);

    try {
      await handler.handleSessionInit(session);
      fail('should have thrown');
    } catch (error) {
      expect(endSession).toHaveBeenCalled();
      expect(endTracks).toHaveBeenCalledWith(stream);
      expect(handler['_screenStreamPromise']).toBe(null);
    }
  });

  it('should throw if there is not a pending media screen promise', async () => {
    jest.spyOn(BaseSessionHandler.prototype, 'endSession').mockImplementation();
    jest.spyOn(BaseSessionHandler.prototype, 'handleSessionInit').mockImplementation();
    const session: VideoMediaSession = new MockSession() as any;

    try {
      await handler.handleSessionInit(session);
      fail('should have thrown');
    } catch (error) {
      expect(error.details.message).toBe('No pending or active screen share media promise');
    }
  });

  it('should set a track listener that ends the session when all tracks have ended; should save stream to session', async () => {
    jest.spyOn(BaseSessionHandler.prototype, 'handleSessionInit').mockImplementation();
    const acceptSpy = jest.spyOn(handler, 'acceptSession');

    const mockStream = (new MockStream(true) as any);
    handler['_screenStreamPromise'] = Promise.resolve(mockStream);
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    jest.spyOn((mockStream as MockStream)._tracks[0], 'addEventListener');

    const session: VideoMediaSession = new MockSession() as any;

    try {
      await handler.handleSessionInit(session);
    } catch (error) {
      console.log(error.details);
      expect(session._screenShareStream).toBe(mockStream);
      expect((mockStream as MockStream)._tracks[0].addEventListener).toHaveBeenCalled();
      expect(acceptSpy).toHaveBeenCalled();
    }
  });

  it('should setup a terminated listener to stop _screenShareStream', async () => {
    const session: any = new MockSession();
    const stream = (new MockStream(true) as any);
    handler['_screenStreamPromise'] = Promise.resolve(stream);
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    session.emit.bind(session);
    await handler.handleSessionInit(session);


    session.emit('terminated', session, true);
    const sessionTerminated = new Promise<void>(res => session.once('terminated', res()));

    await sessionTerminated;
    expect(session._screenShareStream).toBe(stream);
    expect((stream as any)._tracks[0].stop).toHaveBeenCalled();
  });

  it('should blow up if not isGuest', async () => {
    (mockSdk as any).isGuest = false;
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    jest.spyOn(mockSdk.logger, 'warn');
    const session: any = new MockSession();

    await expect(handler.handleSessionInit(session)).rejects.toThrow();
  });
});

describe('onTrackEnd', () => {
  it('should end session if all tracks have ended', async () => {
    jest.spyOn(handler, 'endSession').mockResolvedValue();
    jest.spyOn(mediaUtils, 'checkAllTracksHaveEnded')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const mockSession: any = new MockSession();
    await handler.onTrackEnd(mockSession);

    expect(handler.endSession).not.toHaveBeenCalled();

    await handler.onTrackEnd(mockSession);
    expect(handler.endSession).toHaveBeenCalled();
  });
});

describe('updateOutgoingMedia()', () => {
  it('should throw because updating outgoing media is not supported for screen share', async () => {
    try {
      handler.updateOutgoingMedia({} as any, {} as any);
      fail('should have thrown');
    } catch (e) {
      expect(e.type).toBe(SdkErrorTypes.not_supported);
      expect(mockSdk.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot update outgoing media for acd screen share sessions'),
        expect.any(Object),
        undefined
      );
    }
  });
});
