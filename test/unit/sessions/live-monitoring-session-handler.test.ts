import { SimpleMockSdk, MockSession, createPendingSession, MockStream, MockTrack } from '../../test-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import LiveMonitoringSessionHandler from '../../../src/sessions/live-monitoring-session-handler';
import { SessionTypes } from '../../../src/types/enums';
import * as utils from '../../../src/utils';
import {IStartLiveMonitoringSessionParams, LiveScreenMonitoringSession} from "../../../src";
import BaseSessionHandler from "../../../src/sessions/base-session-handler";

declare var window: {
  navigator: {
    mediaDevices: {
      getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    } & MediaDevices;
  } & Navigator;
  webkitAudioContext: typeof AudioContext;
} & Window & typeof globalThis;

let handler: LiveMonitoringSessionHandler;
let mockSdk: GenesysCloudWebrtcSdk;
let mockSessionManager: SessionManager;

beforeEach(() => {
  jest.clearAllMocks();
  mockSdk = (new SimpleMockSdk() as any);
  mockSdk._personDetails = {
    id: 'user123',
    name: 'name',
    chat: { jabberId: 'user@example.com' }
  };

  mockSessionManager = new SessionManager(mockSdk);
  handler = new LiveMonitoringSessionHandler(mockSdk, mockSessionManager);
});

describe('shouldHandleSessionByJid', () => {
  it('should return true for monitor jids', () => {
    jest.spyOn(utils, 'isLiveScreenMonitorJid').mockReturnValue(true);
    expect(handler.shouldHandleSessionByJid('livemonitor-123@conference.example.com')).toBeTruthy();
  });

  it('should return false for non-monitor jids', () => {
    jest.spyOn(utils, 'isLiveScreenMonitorJid').mockReturnValue(false);
    expect(handler.shouldHandleSessionByJid('regular-session@example.com')).toBeFalsy();
  });
});

describe('handleConversationUpdate', () => {
  it('should be a no-op', () => {
    expect(() => handler.handleConversationUpdate()).not.toThrow();
  });
});

describe('handlePropose', () => {
  it('should immediately accept session if autoAcceptPendingLiveScreenMonitoringRequests', async () => {
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(null);
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose').mockResolvedValue(null);

    mockSdk._config.autoAcceptPendingLiveScreenMonitoringRequests = true;
    await handler.handlePropose({} as any);

    expect(proceedSpy).toHaveBeenCalled();
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('should not accept session if not autoAcceptPendingLiveScreenMonitoringRequests', async () => {
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(null);
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose').mockResolvedValue(null);

    mockSdk._config.autoAcceptPendingLiveScreenMonitoringRequests = false;
    await handler.handlePropose({} as any);

    expect(proceedSpy).not.toHaveBeenCalled();
    expect(superSpy).toHaveBeenCalled();
  });
});

describe('acceptSession', () => {
  let session: MockSession;
  let mockStream: MockStream;

  beforeEach(() => {
    session = new MockSession();
    session.addTrack = jest.fn();
    mockStream = new MockStream({ video: true });
  });

  it('should throw error if no screenRecordingMetadatas provided', async () => {
    const params = { mediaStream: new MockStream() };

    await expect(handler.acceptSession(session as any, params as any))
      .rejects.toThrow('acceptSession must be called with a `screenRecordingMetadatas` property for live screen monitoring sessions');
  });

  it('should throw error if empty screenRecordingMetadatas provided', async () => {
    const params = {
      mediaStream: new MockStream(),
      screenRecordingMetadatas: []
    };

    await expect(handler.acceptSession(session as any, params as any))
      .rejects.toThrow('acceptSession must be called with a `screenRecordingMetadatas` property for live screen monitoring sessions');
  });

  it('should throw error if no mediaStream is provided', async () => {
    const session = {
      addTrack: jest.fn()
    };

    await expect(handler.acceptSession(session as any, {} as any)).rejects.toThrow('Cannot accept screen recording');
  });

  it('should set _outboundStream and add tracks to session and join the conference', async () => {
    const superSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'acceptSession').mockResolvedValue(null);
    const addSpy = jest.fn();

    const session = new MockSession();
    (session as any).peerConnection = session.pc;
    session.peerConnection._transceivers = [];
    (session.peerConnection as any).addTrack = addSpy.mockResolvedValue(null);

    const params = {
      mediaStream: mockStream,
      screenRecordingMetadatas: [{ screenId: 'screen1', primary: true }]
    };

    // mock response from joinConferenceWithScreen
    jest.spyOn(utils, 'requestApi').mockResolvedValue({ data: { conversationId: 'XXXXXXX' } });

    await handler.acceptSession(session as any, params as any);

    expect(session._outboundStream).toBe(mockStream);
    expect(addSpy).toHaveBeenCalledTimes(mockStream.getTracks().length);
    expect(superSpy).toHaveBeenCalledWith(session, params);
  });
});

describe('endSession', () => {
  it('should throw and error', async () => {
    await expect(handler.endSession('123', {} as any)).rejects.toThrow('must be ended remotely');
  });
});

describe('updateOutgoingMedia', () => {
  it('should throw not supported error', () => {
    const session = new MockSession();
    const options = { videoDeviceId: 'device1' };
    const logSpy = jest.spyOn(handler, 'log' as any);

    expect(() => handler.updateOutgoingMedia(session as any, options as any))
      .toThrow('Cannot update outgoing media for live monitoring sessions');

    expect(logSpy).toHaveBeenCalledWith('warn',
      'Cannot update outgoing media for live monitoring sessions',
      { sessionId: session.id, sessionType: session.sessionType }
    );
  });
});

describe('joinConferenceWithScreen', () => {
  it('should make API request and store screen stream', async () => {
    const mockScreenStream = new MockStream({ video: true });
    const mockResponse = { data: { conversationId: 'conv456' } };

    jest.spyOn(utils, 'requestApi').mockResolvedValue(mockResponse);

    const result = await handler['joinConferenceWithScreen']('conf@example.com', mockScreenStream as any);

    expect(utils.requestApi).toHaveBeenCalledWith('/conversations/videos', {
      method: 'post',
      data: JSON.stringify({
        roomId: 'conf@example.com',
        participant: { address: 'user@example.com' }
      })
    });
    expect(result).toEqual({ conversationId: 'conv456' });
  });

  it('should stop screen tracks and throw error on API failure', async () => {
    const mockScreenStream = new MockStream({ video: true });
    const mockTrack = mockScreenStream.getTracks()[0];
    const error = new Error('Network error');

    jest.spyOn(utils, 'requestApi').mockRejectedValue(error);
    jest.spyOn(mockTrack, 'stop');

    await expect(handler['joinConferenceWithScreen']('conf@example.com', mockScreenStream as any))
      .rejects.toThrow('Failed to join conference');

    expect(mockTrack.stop).toHaveBeenCalled();
  });
});
