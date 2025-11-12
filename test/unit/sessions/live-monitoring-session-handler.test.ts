import { SimpleMockSdk, MockSession, createPendingSession, MockStream, MockTrack } from '../../test-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import LiveMonitoringSessionHandler from '../../../src/sessions/live-monitoring-session-handler';
import { SessionTypes, SdkErrorTypes } from '../../../src/types/enums';
import * as utils from '../../../src/utils';

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
    jest.spyOn(utils, 'isMonitorJid').mockReturnValue(true);
    expect(handler.shouldHandleSessionByJid('livemonitor-123@conference.example.com')).toBeTruthy();
  });

  it('should return false for non-monitor jids', () => {
    jest.spyOn(utils, 'isMonitorJid').mockReturnValue(false);
    expect(handler.shouldHandleSessionByJid('regular-session@example.com')).toBeFalsy();
  });
});

describe('handleConversationUpdate', () => {
  it('should be a no-op', () => {
    expect(() => handler.handleConversationUpdate()).not.toThrow();
  });
});

describe('handlePropose', () => {
  it('should proceed with session', async () => {
    const pendingSession = createPendingSession(SessionTypes.collaborateVideo);
    const proceedSpy = jest.spyOn(handler, 'proceedWithSession').mockResolvedValue(null);

    await handler.handlePropose(pendingSession);

    expect(proceedSpy).toHaveBeenCalledWith(pendingSession);
  });
});

describe('acceptSession', () => {
  let session: MockSession;
  let mockStream: MockStream;

  beforeEach(() => {
    session = new MockSession();
    session.addTrack = jest.fn();
    mockStream = new MockStream({ video: true });
    handler['primaryScreenMediaStream'] = mockStream as any;
  });

  it('should throw error if no screenRecordingMetadatas provided', async () => {
    const params = { mediaStream: new MockStream() };

    await expect(handler.acceptSession(session as any, params as any))
      .rejects.toThrow('acceptSession must be called with a `screenRecordingMetadatas` property for live monitoring sessions');
  });

  it('should throw error if empty screenRecordingMetadatas provided', async () => {
    const params = {
      mediaStream: new MockStream(),
      screenRecordingMetadatas: []
    };

    await expect(handler.acceptSession(session as any, params as any))
      .rejects.toThrow('acceptSession must be called with a `screenRecordingMetadatas` property for live monitoring sessions');
  });

  it('should set outbound stream and add tracks to session', async () => {
    const params = {
      mediaStream: new MockStream(),
      screenRecordingMetadatas: [{ screenId: 'screen1', primary: true }]
    };
    const superSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), 'acceptSession').mockResolvedValue(null);

    await handler.acceptSession(session as any, params as any);

    expect(session._outboundStream).toBe(mockStream);
    expect(session.pc._senders).toHaveLength(mockStream.getTracks().length);
    expect(handler['primaryScreenMediaStream']).toBeUndefined();
    expect(superSpy).toHaveBeenCalledWith(session, params);
  });
});

describe('startSession', () => {
  const mockMetadatas = [
    { screenId: 'screen1', primary: false },
    { screenId: 'screen2', primary: true }
  ];

  beforeEach(() => {
    Object.defineProperty(window, 'navigator', {
      value: {
        mediaDevices: {
          getDisplayMedia: jest.fn()
        }
      },
      writable: true
    });
  });

  it('should throw error if no primary screen found', async () => {
    const params = {
      conferenceJid: 'conf@example.com',
      liveMonitoringMetadata: [{ screenId: 'screen1', primary: false }]
    };

    await expect(handler.startSession(params as any))
      .rejects.toThrow('No primary screen found in metadata');
  });

  it('should get screen media and join conference', async () => {
    const mockScreenStream = new MockStream({ video: true });
    const mockResponse = { data: { conversationId: 'conv123' } };

    (window.navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockScreenStream);
    jest.spyOn(utils, 'requestApi').mockResolvedValue(mockResponse);

    const params = {
      conferenceJid: 'conf@example.com',
      liveMonitoringMetadata: mockMetadatas
    };

    const result = await handler.startSession(params as any);

    expect(window.navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
      video: { deviceId: 'screen2' }
    });
    expect(utils.requestApi).toHaveBeenCalledWith('/conversations/videos', {
      method: 'post',
      data: JSON.stringify({
        roomId: 'conf@example.com',
        participant: { address: 'user@example.com' }
      })
    });
    expect(result).toEqual({ conversationId: 'conv123' });
    expect(handler['primaryScreenMediaStream']).toBe(mockScreenStream);
  });

  it('should handle getDisplayMedia error', async () => {
    const error = new Error('Screen capture failed');
    (window.navigator.mediaDevices.getDisplayMedia as jest.Mock).mockRejectedValue(error);

    const params = {
      conferenceJid: 'conf@example.com',
      liveMonitoringMetadata: mockMetadatas
    };

    await expect(handler.startSession(params as any))
      .rejects.toThrow('Failed to get screen media');
  });

  it('should handle API request error and stop screen tracks', async () => {
    const mockScreenStream = new MockStream({ video: true });
    const mockTrack = mockScreenStream.getTracks()[0];
    const error = new Error('API failed');

    (window.navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockScreenStream);
    jest.spyOn(utils, 'requestApi').mockRejectedValue(error);
    jest.spyOn(mockTrack, 'stop');

    const params = {
      conferenceJid: 'conf@example.com',
      liveMonitoringMetadata: mockMetadatas
    };

    await expect(handler.startSession(params as any))
      .rejects.toThrow('Failed to join conference');

    expect(mockTrack.stop).toHaveBeenCalled();
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

describe('identifyPrimaryScreen', () => {
  it('should return primary screen metadata', () => {
    const metadatas = [
      { screenId: 'screen1', primary: false },
      { screenId: 'screen2', primary: true },
      { screenId: 'screen3', primary: false }
    ];

    const result = handler['identifyPrimaryScreen'](metadatas as any);
    expect(result).toEqual({ screenId: 'screen2', primary: true });
  });

  it('should return null if no primary screen found', () => {
    const metadatas = [
      { screenId: 'screen1', primary: false },
      { screenId: 'screen2', primary: false }
    ];

    const result = handler['identifyPrimaryScreen'](metadatas as any);
    expect(result).toBeNull();
  });

  it('should return first primary screen if multiple exist', () => {
    const metadatas = [
      { screenId: 'screen1', primary: false },
      { screenId: 'screen2', primary: true },
      { screenId: 'screen3', primary: true }
    ];

    const result = handler['identifyPrimaryScreen'](metadatas as any);
    expect(result).toEqual({ screenId: 'screen2', primary: true });
  });
});

describe('getScreenMediaForPrimary', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'navigator', {
      value: {
        mediaDevices: {
          getDisplayMedia: jest.fn()
        }
      },
      writable: true
    });
  });

  it('should get display media with correct constraints', async () => {
    const mockStream = new MockStream({ video: true });
    const primaryScreen = { screenId: 'screen123', primary: true };

    (window.navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockStream);

    const result = await handler['getScreenMediaForPrimary'](primaryScreen as any);

    expect(window.navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({
      video: { deviceId: 'screen123' }
    });
    expect(result).toBe(mockStream);
  });

  it('should throw SDK error on failure', async () => {
    const error = new Error('Permission denied');
    const primaryScreen = { screenId: 'screen123', primary: true };

    (window.navigator.mediaDevices.getDisplayMedia as jest.Mock).mockRejectedValue(error);

    await expect(handler['getScreenMediaForPrimary'](primaryScreen as any))
      .rejects.toThrow('Failed to get screen media');
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
    expect(handler['primaryScreenMediaStream']).toBe(mockScreenStream);
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
