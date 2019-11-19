import { mockApis, SimpleMockSdk, random, createPendingSession } from '../../test-utils';
import ScreenShareSessionHandler from '../../../src/sessions/screen-share-session-handler';
import { ISdkConfig, IPendingSession } from '../../../src/types/interfaces';
import { PureCloudWebrtcSdk } from '../../../src/client';
import { SessionManager } from '../../../src/sessions/session-manager';
import BaseSessionHandler from '../../../src/sessions/base-session-handler';
import { SessionTypes } from '../../../src/types/enums';
jest.mock('../../../src/sessions/session-manager');

describe('screen share session handler', () => {
  let handler: ScreenShareSessionHandler;
  let config: ISdkConfig;
  let mockSdk: PureCloudWebrtcSdk;
  let mockSessionManager: SessionManager;
  let on;

  beforeEach(() => {
    mockSdk = (new SimpleMockSdk() as any);
    // on = (mockSdk as any).on;

    mockSessionManager = new SessionManager(mockSdk);
    handler = new ScreenShareSessionHandler(mockSdk, mockSessionManager);
  });

  describe('handlePropose', () => {
    it('should emit pending session and proceed immediately', async () => {
      const superSpyHandlePropose = jest.spyOn(BaseSessionHandler.prototype, 'handlePropose');
      const superSpyProceed = jest.spyOn(BaseSessionHandler.prototype, 'proceedWithSession').mockImplementation();

      const spy = jest.fn();
      // on('pendingSession', spy);
      mockSdk.on('pendingSession', spy);

      const pendingSession = createPendingSession(SessionTypes.acdScreenShare);
      handler.handlePropose(pendingSession);

      expect(spy).toHaveBeenCalled();
      expect(superSpyHandlePropose).toHaveBeenCalled();
      expect(superSpyProceed).toHaveBeenCalled();
    });
  });

  describe('handleSessionInit', () => {
    it('should set a track listener that ends the session when all tracks have ended', async () => {

    });
  });
});
