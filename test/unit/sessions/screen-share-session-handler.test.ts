import { SimpleMockSdk, MockSession, createPendingSession, MockStream, MockTrack } from '../../test-utils';
import ScreenShareSessionHandler from '../../../src/sessions/screen-share-session-handler';
import { PureCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import { SessionTypes } from '../../../src/types/enums';
import * as mediaUtils from '../../../src/media-utils';
import * as utils from '../../../src/utils';

let handler: ScreenShareSessionHandler;
let mockSdk: PureCloudWebrtcSdk;
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
  it('should create media and initiate session', async () => {
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
      stream,
      jid,
      conversationId: data.conversation.id,
      sourceCommunicationId: data.sourceCommunicationId,
      mediaPurpose: SessionTypes.acdScreenShare
    };

    expect(mockSdk._streamingConnection.webrtcSessions.initiateRtcSession)
      .toHaveBeenLastCalledWith(expectedParams);
    expect(handler.temporaryOutboundStream).toBe(stream);
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
  it('should set a track listener that ends the session when all tracks have ended; should save stream to session', async () => {
    const acceptSpy = jest.spyOn(handler, 'acceptSession');
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    const mockStream = (new MockStream() as any);
    jest.spyOn((mockStream as MockStream)._tracks[0], 'addEventListener');
    handler.temporaryOutboundStream = mockStream;

    const session = new MockSession();
    await handler.handleSessionInit(session);

    expect(session._outboundStream).toBe(mockStream);
    expect((mockStream as MockStream)._tracks[0].addEventListener).toHaveBeenCalled();
    expect(acceptSpy).toHaveBeenCalled();
  });

  it('should warn if there is no outboundStream', async () => {
    const acceptSpy = jest.spyOn(handler, 'acceptSession');
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    jest.spyOn(mockSdk.logger, 'warn');
    const session = new MockSession();
    await handler.handleSessionInit(session);

    expect(handler.addMediaToSession).not.toHaveBeenCalled();
    expect(mockSdk.logger.warn).toHaveBeenCalledWith('[webrtc-sdk] There is no `temporaryOutboundStream` for guest user', undefined);
    expect(acceptSpy).toHaveBeenCalled();
  });

  it('should blow up if !autoConnectSessions', async () => {
    mockSdk._config.autoConnectSessions = false;
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    jest.spyOn(mockSdk.logger, 'warn');
    const session = new MockSession();

    await expect(handler.handleSessionInit(session)).rejects.toThrow();
  });

  it('should blow up if not isGuest', async () => {
    (mockSdk as any).isGuest = false;
    jest.spyOn(handler, 'addMediaToSession').mockImplementation();

    jest.spyOn(mockSdk.logger, 'warn');
    const session = new MockSession();

    await expect(handler.handleSessionInit(session)).rejects.toThrow();
  });
});

describe('onTrackEnd', () => {
  it('should end session if all tracks have ended', async () => {
    jest.spyOn(handler, 'endSession').mockResolvedValue();
    jest.spyOn(mediaUtils, 'checkAllTracksHaveEnded')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const mockSession = new MockSession();
    await handler.onTrackEnd(mockSession);

    expect(handler.endSession).not.toHaveBeenCalled();

    await handler.onTrackEnd(mockSession);
    expect(handler.endSession).toHaveBeenCalled();
  });
});