import { SimpleMockSdk, random, MockStream, MockTrack, MockSession } from '../../test-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import * as utils from '../../../src/utils';
import ScreenRecordingSessionHandler from '../../../src/sessions/screen-recording-session-handler';
import { SdkErrorTypes } from '../../../src';

let handler: ScreenRecordingSessionHandler;
let mockSdk: GenesysCloudWebrtcSdk;
let mockSessionManager: SessionManager;
let userId: string;

beforeEach(() => {
  jest.clearAllMocks();
  mockSdk = (new SimpleMockSdk() as any);
  (mockSdk as any).isGuest = true;
  mockSdk._config.autoAcceptPendingScreenRecordingRequests = true;

  mockSessionManager = new SessionManager(mockSdk);
  handler = new ScreenRecordingSessionHandler(mockSdk, mockSessionManager);

  userId = random();
  mockSdk._personDetails = { id: userId } as any;
});

describe('shouldHandleSessionByJid', () => {
  it('should rely on isSoftphoneJid', () => {
    jest.spyOn(utils, 'isScreenRecordingJid').mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(handler.shouldHandleSessionByJid('sdlkf')).toBeFalsy();
    expect(handler.shouldHandleSessionByJid('sdlfk')).toBeTruthy();
  });
});

describe('handleConversationUpdate', () => {
  it('should do nothing', () => {
    handler.handleConversationUpdate();
  });
});

describe('sendMetadataWhenSessionConnects', () => {
  function createFakePc (): EventTarget & { connectionState: string } {
    const fakePc: EventTarget & { connectionState: string } = new EventTarget() as any;
    fakePc.connectionState = 'starting';
    return fakePc;
  }

  it('should send metadata when peer connection connects', async () => {
    const pc = createFakePc();

    const session = {
      peerConnection: pc
    };

    const spy = handler['updateScreenRecordingMetadatas'] = jest.fn();

    handler['sendMetadataWhenSessionConnects'](session as any, []);

    expect(spy).not.toHaveBeenCalled();

    pc.connectionState = 'connecting';
    pc.dispatchEvent(new Event('connectionstatechange'));
    expect(spy).not.toHaveBeenCalled();

    pc.connectionState = 'connected';
    pc.dispatchEvent(new Event('connectionstatechange'));
    expect(spy).toHaveBeenCalled();
  });

  it('should send metadata only the first time peer connection connects', async () => {
    const pc = createFakePc();

    const session = {
      peerConnection: pc
    };

    const spy = handler['updateScreenRecordingMetadatas'] = jest.fn();

    handler['sendMetadataWhenSessionConnects'](session as any, []);

    pc.connectionState = 'connected';
    pc.dispatchEvent(new Event('connectionstatechange'));
    pc.dispatchEvent(new Event('connectionstatechange'));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should not if peer connection never connects', async () => {
    const pc = createFakePc();

    const session = {
      peerConnection: pc
    };

    const spy = handler['updateScreenRecordingMetadatas'] = jest.fn();

    handler['sendMetadataWhenSessionConnects'](session as any, []);

    expect(spy).not.toHaveBeenCalled();

    pc.connectionState = 'connecting';
    pc.dispatchEvent(new Event('connectionstatechange'));
    expect(spy).not.toHaveBeenCalled();

    pc.connectionState = 'disconnected';
    pc.dispatchEvent(new Event('connectionstatechange'));
    expect(spy).not.toHaveBeenCalled();
    
    // since the above state was disconnected, the observable should have ended and should no longer process changes
    pc.connectionState = 'connected';
    pc.dispatchEvent(new Event('connectionstatechange'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('should not throw an exception if peer connection state never connects', async () => {
    const pc = createFakePc();

    const session = {
      peerConnection: pc
    };

    const errorSpy = handler['_logSubscribeError'] = jest.fn();

    handler['sendMetadataWhenSessionConnects'](session as any, []);

    pc.connectionState = 'disconnected';
    pc.dispatchEvent(new Event('connectionstatechange'));
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('handlePropose', () => {
  it('should immediately accept session if autoAcceptPendingScreenRecordingRequests', async () => {
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(null);
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose').mockResolvedValue(null);

    mockSdk._config.autoAcceptPendingScreenRecordingRequests = true;
    await handler.handlePropose({} as any);

    expect(proceedSpy).toHaveBeenCalled();
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('should not accept session if not autoAcceptPendingScreenRecordingRequests', async () => {
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(null);
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose').mockResolvedValue(null);

    mockSdk._config.autoAcceptPendingScreenRecordingRequests = false;
    await handler.handlePropose({} as any);

    expect(proceedSpy).not.toHaveBeenCalled();
    expect(superSpy).toHaveBeenCalled();
  });
});

describe('acceptSession', () => {
  it('should throw if no metadatas are provided', async () => {
    const metadatasSpy = jest.spyOn(utils, 'requestApi').mockResolvedValue(null);
    const session = {
      pc: {
        addTrack: jest.fn().mockResolvedValue(null)
      }
    };

    const media = new MockStream();
    media.addTrack(new MockTrack());

    await expect(() => handler.acceptSession(session as any, { mediaStream: media } as any)).rejects.toThrow('acceptSession must be called with a `screenRecordingMetadatas`');

    expect(metadatasSpy).not.toHaveBeenCalled();
  });
  
  it('should throw if no metadatas are empty', async () => {
    const metadatasSpy = jest.spyOn(utils, 'requestApi').mockResolvedValue(null);
    const session = {
      pc: {
        addTrack: jest.fn().mockResolvedValue(null)
      }
    };

    const media = new MockStream();
    media.addTrack(new MockTrack());

    await expect(() => handler.acceptSession(session as any, { mediaStream: media, screenRecordingMetadatas: [] } as any)).rejects.toThrow('acceptSession must be called with a `screenRecordingMetadatas`');

    expect(metadatasSpy).not.toHaveBeenCalled();
  });

  it('should add _outboundStream to session and add each track and send metadatas', async () => {
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession').mockResolvedValue(null);
    const metadatasSpy = jest.spyOn(handler as any, 'sendMetadataWhenSessionConnects');
    const addSpy = jest.fn();

    const session = new MockSession();
    session.peerConnection._transceivers = [];
    (session.peerConnection as any).addTrack = addSpy.mockResolvedValue(null);

    (session as any).peerConnection = session.pc;

    const media = new MockStream();
    media.addTrack(new MockTrack());
    media.addTrack(new MockTrack());
    media.addTrack(new MockTrack());

    await handler.acceptSession(session as any, { mediaStream: media, screenRecordingMetadatas: [{}] } as any);

    expect(addSpy).toHaveBeenCalledTimes(3);
    expect((session as any)._outboundStream).toBe(media);
    expect(superSpy).toHaveBeenCalled();
    expect(metadatasSpy).toHaveBeenCalled();
  });

  it('should throw error if no media stream is required', async () => {
    const session = {
      addTrack: jest.fn()
    };

    await expect(handler.acceptSession(session as any, {} as any)).rejects.toThrow('Cannot accept screen recording');
  });
});

describe('endSession', () => {
  it('should throw and error', async () => {
    await expect(handler.endSession('123', {} as any)).rejects.toThrow('must be ended remotely');
  });
});

describe('updateOutgoingMedia', () => {
  it('should throw because updating outgoing media is not supported for screen recording', async () => {
    try {
      handler.updateOutgoingMedia({} as any, {} as any);
      fail('should have thrown');
    } catch (e) {
      expect(e.type).toBe(SdkErrorTypes.not_supported);
      expect(mockSdk.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot update outgoing media for screen recording sessions'),
        expect.any(Object),
        undefined
      );
    }
  });
});

describe('updateScreenRecordingMetadatas', () => {
  it('should replace trackIds with mid', async () => {
    const metas = [
      {
        trackId: 'trackId123'
      },
      {
        trackId: 'trackId456'
      }
    ];

    const transceivers = [
      {
        mid: '3',
        sender: {
          track: { id: metas[0].trackId }
        }
      },
      {
        mid: '5',
        sender: {
          track: null
        }
      },
      {
        mid: '7',
        sender: {
          track: { id: metas[1].trackId }
        }
      },
    ];

    const session = {
      pc: {
        getTransceivers: jest.fn().mockReturnValue(transceivers)
      }
    };

    jest.spyOn(utils, 'requestApi').mockResolvedValue(null);

    await handler['updateScreenRecordingMetadatas'](session as any, metas as any);

    expect(metas[0].trackId).toBe('3');
    expect((metas[0] as any)._trackId).toBe('trackId123');

    expect(metas[1].trackId).toBe('7');
    expect((metas[1] as any)._trackId).toBe('trackId456');
  });

  it('should use the backgroundassistant url', async () => {
    const metas = [
      { trackId: 'trackId123' }
    ];

    const transceivers = [
      {
        mid: '3',
        sender: {
          track: { id: metas[0].trackId }
        }
      }
    ];

    const session = {
      pc: {
        getTransceivers: jest.fn().mockReturnValue(transceivers)
      }
    };

    jest.spyOn(utils, 'requestApi').mockResolvedValue(null);

    Object.defineProperty(mockSdk, 'isJwtAuth', { get: () => true });
    mockSdk._config.jwt = 'myjwt';
    mockSdk._config.accessToken = null;

    await handler['updateScreenRecordingMetadatas'](session as any, metas as any);

    expect(utils.requestApi).toHaveBeenCalledWith(
      expect.stringContaining('backgroundassistant'),
      expect.objectContaining({
        authToken: 'myjwt'
      }
    ));
    expect(metas[0].trackId).toBe('3');
    expect((metas[0] as any)._trackId).toBe('trackId123');
  });

  it('should warn if no transceiver', async () => {
    const metas = [
      {
        trackId: 'trackId123'
      },
      {
        trackId: 'trackId456'
      }
    ];
    const session = {
      pc: {
        getTransceivers: jest.fn().mockReturnValue([])
      }
    };

    jest.spyOn(utils, 'requestApi').mockResolvedValue(null);
    const logSpy = jest.spyOn(handler as any, 'log');

    await handler['updateScreenRecordingMetadatas'](session as any, metas as any);

    expect(logSpy).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to find transceiver'), expect.anything());
  });
});
