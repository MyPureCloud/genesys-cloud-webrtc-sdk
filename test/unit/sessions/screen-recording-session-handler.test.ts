import nock = require('nock');
import uuid = require('uuid');

import { SimpleMockSdk, random, MockStream, MockTrack } from '../../test-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import * as utils from '../../../src/utils';
import ScreenRecordingSessionHandler from '../../../src/sessions/screen-recording-session-handler';
import { ScreenRecordingMediaSession } from '../../../src';

let handler: ScreenRecordingSessionHandler;
let mockSdk: GenesysCloudWebrtcSdk;
let mockSessionManager: SessionManager;
let userId: string;

beforeEach(() => {
  jest.clearAllMocks();
  nock.cleanAll();
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
  it('should add _outboundStream to session and add each track', async () => {
    const superSpy = jest.spyOn(BaseSessionHandler.prototype, 'acceptSession').mockResolvedValue(null);
    const addSpy = jest.fn();

    const session = {
      pc: {
        addTrack: addSpy.mockResolvedValue(null)
      }
    };

    const media = new MockStream();
    media.addTrack(new MockTrack());
    media.addTrack(new MockTrack());
    media.addTrack(new MockTrack());

    await handler.acceptSession(session as any, { mediaStream: media } as any);

    expect(addSpy).toHaveBeenCalledTimes(3);
    expect((session as any)._outboundStream).toBe(media);
    expect(superSpy).toHaveBeenCalled();
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
