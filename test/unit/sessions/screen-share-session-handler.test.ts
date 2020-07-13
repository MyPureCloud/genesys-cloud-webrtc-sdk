import { SimpleMockSdk, MockSession, createPendingSession, MockStream } from '../../test-utils';
import ScreenShareSessionHandler from '../../../src/sessions/screen-share-session-handler';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import { SessionTypes, SdkErrorTypes } from '../../../src/types/enums';
import * as mediaUtils from '../../../src/media-utils';
import * as utils from '../../../src/utils';
import { IJingleSession } from '../../../src/types/interfaces';

let handler: ScreenShareSessionHandler;
let mockSdk: GenesysCloudWebrtcSdk;
let mockSessionManager: SessionManager;

beforeEach(() => {
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

describe('startSession', () => {
  it('should initiate session', async () => {
    const stream = new MockStream();
    const jid = '123acdjid';
    jest.spyOn(mediaUtils, 'startDisplayMedia').mockResolvedValue(stream as any);
    jest.spyOn(utils, 'parseJwt').mockReturnValue({ data: { jid } });
    const data = {
      jwt: 'jwt',
      conversation: { id: 'conversationId1' },
      sourceCommunicationId: 'srcComId'
    };

    mockSdk._customerData = data;

    await handler.startSession({ sessionType: SessionTypes.acdScreenShare });

    const expectedParams = {
      jid,
      conversationId: data.conversation.id,
      sourceCommunicationId: data.sourceCommunicationId,
      mediaPurpose: SessionTypes.acdScreenShare
    };

    expect(mockSdk._streamingConnection.webrtcSessions.initiateRtcSession)
      .toHaveBeenLastCalledWith(expectedParams);
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
  it('should end session if session init fails', async () => {
    const endSession = jest.spyOn(BaseSessionHandler.prototype, 'endSession').mockImplementation();
    jest.spyOn(BaseSessionHandler.prototype, 'handleSessionInit').mockRejectedValue(new Error('error'));

    const session: IJingleSession = new MockSession() as any;
    await handler.handleSessionInit(session);

    expect(endSession).toHaveBeenCalled();
  });

  it('should set a track listener that ends the session when all tracks have ended; should save stream to session', async () => {
    const acceptSpy = jest.spyOn(handler, 'acceptSession');
    const mockStream = (new MockStream() as any);
    jest.spyOn(mediaUtils, 'startDisplayMedia').mockReturnValue(mockStream);
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    jest.spyOn((mockStream as MockStream)._tracks[0], 'addEventListener');

    const session: IJingleSession = new MockSession() as any;
    await handler.handleSessionInit(session);

    expect(session._screenShareStream).toBe(mockStream);
    expect((mockStream as MockStream)._tracks[0].addEventListener).toHaveBeenCalled();
    expect(acceptSpy).toHaveBeenCalled();
  });

  it('should setup a terminated listener to stop _screenShareStream', async () => {
    const session: any = new MockSession();
    const stream = (new MockStream() as any);
    jest.spyOn(mediaUtils, 'startDisplayMedia').mockReturnValue(stream)
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    session.emit.bind(session);
    await handler.handleSessionInit(session);


    session.emit('terminated', session, true);
    const sessionTerminated = new Promise(res => session.once('terminated', res()));

    await sessionTerminated;
    expect(session._screenShareStream).toBe(stream);
    expect((stream as any)._tracks[0].stop).toHaveBeenCalled();
  });

  it('should blow up if !autoConnectSessions', async () => {
    mockSdk._config.autoConnectSessions = false;
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    jest.spyOn(mockSdk.logger, 'warn');
    const session: any = new MockSession();

    await expect(handler.handleSessionInit(session)).rejects.toThrow();
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
        expect.any(Object)
      );
    }
  });
});
