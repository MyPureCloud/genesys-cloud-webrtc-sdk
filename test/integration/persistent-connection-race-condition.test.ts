import { Logger } from 'genesys-cloud-client-logger';
import StreamingClient from 'genesys-cloud-streaming-client';
import { SessionManager } from '../../src/sessions/session-manager';
import * as windows11Utils from '../../src/windows11-first-session-hack';
import {
  GenesysCloudWebrtcSdk,
  ISdkConfig,
  SessionTypes,
  SdkMedia,
  IStation,
  ConversationUpdate,
  CommunicationStates
} from '../../src';
import { EventEmitter } from 'events';
import SoftphoneSessionHandler from '../../src/sessions/softphone-session-handler';
import uuid from 'uuid';
jest.mock('../../src/media/media');

jest.mock('genesys-cloud-streaming-client', () => {
  const actualDep = jest.requireActual('genesys-cloud-streaming-client');
  return {
    ...actualDep,
    __esModule: true,
    default: function (config) {
      this.notifications = Object.assign(
        new EventEmitter(),
        {
          subscribe: jest.fn().mockResolvedValue(null)
        }
      );

      this._notifications = this.notifications;
      
      this.webrtcSessions = Object.assign(
        new EventEmitter(),
        {
            getAllSessions: jest.fn().mockReturnValue([])
        }
      );
      this._webrtcSessions = this.webrtcSessions;

      this.connect = jest.fn().mockImplementation(() => {
        this.emit('connected');
        return Promise.resolve();
      });

      this.disconnect = jest.fn().mockResolvedValue(null);

      const ev = new EventEmitter();
      Object.getOwnPropertyNames(EventEmitter.prototype).forEach(name => {
        if (name !== 'constructor') {
          this[name] = ev[name];
        }
      });
    }
  };
});


describe('Persistent Connection Race Conditions', () => {
  let sdk: GenesysCloudWebrtcSdk;
  let constructSdk: (config?: ISdkConfig) => Promise<GenesysCloudWebrtcSdk>;

  const mockLogger: jest.Mocked<Logger> = {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    setAccessToken: jest.fn()
  } as any;

  beforeEach(() => {
    jest.spyOn(windows11Utils, 'setupWebrtcForWindows11').mockResolvedValue();
    
    constructSdk = async (config?: ISdkConfig) => {
      /* if we have no config, then use some defaults */
      if (config === undefined) {
        config = { logger: mockLogger as any, accessToken: 'secure', environment: 'mypurecloud.com', optOutOfTelemetry: true };
      }
      /* if we have `truthy`, make sure we always have the mock logger */
      else if (config) {
        config = { logger: mockLogger as any, optOutOfTelemetry: true, ...config };
      }

      sdk = new GenesysCloudWebrtcSdk(config);
      
      sdk.fetchOrganization = jest.fn().mockResolvedValue({
        id: 'myorgid',
        name: 'my org name'
      });
      sdk.fetchAuthenticatedUser = jest.fn().mockImplementation(async () => {
        sdk._personDetails = {
          id: 'userId',
          name: 'user name',
          chat: {
            jabberId: 'user@jid.com'
          },
          station: {}
        };
      });
      sdk.fetchUsersStation = jest.fn().mockImplementation(async () => {
        sdk.station = {
          id: 'stationId',
          name: 'my webrtc phone',
          status: 'ASSOCIATED',
          userId: 'userId',
          webRtcUserId: 'webrtcUserId',
          type: 'inin_webrtc_softphone',
          webRtcPersistentEnabled: true,
          webRtcForceTurn: false,
          webRtcCallAppearances: 100
        } as IStation;
      });

      await sdk.initialize();

      return sdk;
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (sdk) {
      await sdk.destroy();
      sdk = undefined as any;
    }
  });

  it('should proceed session if propose comes in after pending session is proceeded via api call', async () => {
    const sdk = await constructSdk();

    expect(sdk).toBeTruthy();

    // mimick state of an established, idle persistent connection
    const softphoneHandler = sdk.sessionManager.getSessionHandler({ sessionType: SessionTypes.softphone }) as SoftphoneSessionHandler;
    const firstSessionId = uuid.v4();
    const firstSession = softphoneHandler['activeSession'] = {
      id: firstSessionId,
      peerConnection: {
        connectionState: 'connected'
      }
    } as any;

    // when the fake conversation event comes in, we should get a fake pendingSession
    const pendingSessionSpy = jest.fn();
    sdk.on('pendingSession', pendingSessionSpy);

    // fake a conversation update for an incoming call
    const fakeConversationUpdate = new ConversationUpdate({});
    fakeConversationUpdate.id = 'conversation2';
    fakeConversationUpdate.participants = [
      {
        id: 'participant1',
        purpose: 'agent',
        userId: 'userId',
        videos: [],
        calls: [
          {
            confined: false,
            direction: 'inbound',
            held: false,
            id: 'call1',
            muted: false,
            provider: 'provider',
            state: CommunicationStates.alerting,
          }
        ]
      }
    ];
    sdk.sessionManager.handleConversationUpdate(fakeConversationUpdate);

    expect(pendingSessionSpy).toHaveBeenCalled();

    // consuming app answers the fake pendingSession
    const acceptViaApiSpy = softphoneHandler['patchPhoneCall'] = jest.fn();
    await sdk.acceptPendingSession({ conversationId: fakeConversationUpdate.id });
    expect(acceptViaApiSpy).toHaveBeenCalled();
    acceptViaApiSpy.mockReset();
    expect(pendingSessionSpy.mock.calls[0][0].accepted).toBeTruthy();

    // propose is received for the fake pendingSession
    const proposeHandlerSpy = softphoneHandler.handlePropose = jest.fn();
    const proceedSpy = (softphoneHandler as any).__proto__.proceedWithSession = jest.fn();
    await sdk.sessionManager.onPropose({
      conversationId: fakeConversationUpdate.id,
      autoAnswer: false,
      fromJid: 'call@gjoll.com',
      id: 'stanzaId',
      sessionId: 'secondSessionId',
      sessionType: SessionTypes.softphone,
      toJid: 'someone'
    });
    expect(proposeHandlerSpy).not.toHaveBeenCalled();
    expect(proceedSpy).toHaveBeenCalled();
    expect(acceptViaApiSpy).not.toHaveBeenCalled();
  });
});