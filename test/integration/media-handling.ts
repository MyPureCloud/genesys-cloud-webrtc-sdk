import {
  SimpleMockSdk,
  createPendingSession,
} from '../test-utils';
import {
  GenesysCloudWebrtcSdk,
  MediaHandling,
  SessionTypes,
} from '../../src';
import { SessionManager } from '../../src/sessions/session-manager';
import SoftphoneSessionHandler from '../../src/sessions/softphone-session-handler';

describe('Media Handling Behavior', () => {
  let softphoneHandler: SoftphoneSessionHandler;
  let mockSdk: GenesysCloudWebrtcSdk;
  let mockSessionManager: SessionManager;

  beforeEach(() => {
    mockSdk = new SimpleMockSdk() as unknown as GenesysCloudWebrtcSdk;
    mockSessionManager = new SessionManager(mockSdk);
    softphoneHandler = new SoftphoneSessionHandler(mockSdk, mockSessionManager);
    softphoneHandler.disabled = false;
  });

  it('should allow `pendingSession` to be emitted if media handling changes during repeat `propose`s', async () => {
    mockSessionManager.sessionHandlers = [softphoneHandler];
    const sessionInfo = createPendingSession(SessionTypes.softphone);
    sessionInfo.autoAnswer = false;
    const pendingSessionSpy = jest.fn();
    mockSdk.on('pendingSession', pendingSessionSpy);

    mockSdk._mediaHandling = MediaHandling.reducedMedia;
    await mockSessionManager.onPropose(sessionInfo);
    expect(pendingSessionSpy).not.toHaveBeenCalled();

    mockSdk._mediaHandling = MediaHandling.alertingLeaderMedia;
    await mockSessionManager.onPropose(sessionInfo);
    expect(pendingSessionSpy).toHaveBeenCalled();
  });
});
