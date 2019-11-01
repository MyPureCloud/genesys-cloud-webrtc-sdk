import { PureCloudWebrtcSdk } from '../../src/client';
import { ISdkConstructOptions, ICustomerData } from '../../src/types/interfaces';
import { MockStream, MockSession, mockApis, timeout, MockTrack } from '../test-utils';
import { SdkError } from '../../src/utils';
import { SdkErrorTypes, LogLevels } from '../../src/types/enums';

declare var global: {
  window: any,
  document: any
} & NodeJS.Global;

let { wss, ws, random, PARTICIPANT_ID, closeWebSocketServer } = require('../test-utils');

describe('Client', () => {
  // check to make sure the server isn't running
  beforeAll(async () => {
    await closeWebSocketServer();
  });

  afterAll(async () => {
    await closeWebSocketServer();
  });

  afterEach(async () => {
    if (ws) {
      await Promise.resolve(ws.close());
      ws = null;
    }
    if (wss) {
      wss.removeAllListeners();
    }
    jest.resetAllMocks();
  });

  describe('constructor()', () => {
    test('throws if options are not provided', () => {
      try {
        new PureCloudWebrtcSdk(null); // tslint:disable-line
        fail();
      } catch (err) {
        expect(err).toEqual(new SdkError(SdkErrorTypes.invalid_options, 'Options required to create an instance of the SDK'));
      }
    });

    test('throws if accessToken and organizationId is not provided', () => {
      try {
        new PureCloudWebrtcSdk({ environment: 'mypurecloud.com' }); // tslint:disable-line
        fail();
      } catch (err) {
        expect(err).toEqual(new SdkError(SdkErrorTypes.invalid_options, 'Access token is required to create an authenticated instance of the SDK. Otherwise, provide organizationId for a guest/anonymous user.'));
      }
    });

    test('warns if environment is not valid', () => {
      const sdk1 = new PureCloudWebrtcSdk({ accessToken: '1234', environment: 'mypurecloud.con' });
      const sdk2 = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.con',
        logger: { warn: jest.fn(), debug: jest.fn() } as any
      } as ISdkConstructOptions);

      expect(sdk2.logger.warn).toHaveBeenCalled();
    });

    test('warns if the logLevel is not valid', () => {
      const sdk = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.com',
        logLevel: 'error__' as LogLevels,
        logger: { warn: jest.fn(), debug: jest.fn() } as any
      } as ISdkConstructOptions);
      expect(sdk.logger.warn).toHaveBeenCalled();
    });

    test('does not warn if things are fine', () => {
      const sdk = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.com',
        logLevel: 'error',
        logger: { warn: jest.fn(), debug: jest.fn() } as any
      } as ISdkConstructOptions);
      expect(sdk.logger.warn).not.toHaveBeenCalled();
    });

    test('sets up options with defaults', () => {
      const sdk = new PureCloudWebrtcSdk({ accessToken: '1234' } as ISdkConstructOptions);
      expect(sdk.logger).toBe(console);
      expect(sdk._config.accessToken).toBe('1234');
      expect(sdk._config.environment).toBe('mypurecloud.com');
      expect(sdk._config.autoConnectSessions).toBe(true);
      expect(typeof sdk._config.customIceServersConfig).toBe('undefined');
      expect(sdk._config.iceTransportPolicy).toBe('all');
      expect(sdk.isGuest).toBe(false);
    });

    test('sets up options when provided', () => {
      const logger = { debug: jest.fn() };
      const iceServers = [];
      const sdk = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.ie',
        autoConnectSessions: false,
        iceServers: iceServers as any,
        iceTransportPolicy: 'relay',
        logger: logger as any
      } as ISdkConstructOptions);

      expect(sdk.logger).toBe(logger);
      expect(sdk._config.accessToken).toBe('1234');
      expect(sdk._config.environment).toBe('mypurecloud.ie');
      expect(sdk._config.autoConnectSessions).toBe(false);
      expect(sdk._config.customIceServersConfig).toBe(iceServers);
      expect(sdk._config.iceTransportPolicy).toBe('relay');
      expect(sdk.isGuest).toBe(false);
    });
  });

  describe('initialize()', () => {
    test('fetches org and person details, sets up the streaming connection', async () => {
      const { getOrg, getUser, getChannel, sdk } = mockApis();
      await sdk.initialize();
      getOrg.done();
      getUser.done();
      getChannel.done();
      expect(sdk._streamingConnection).toBeTruthy();
      sdk._logBuffer = [];
      sdk._config.optOutOfTelemetry = true;
    });

    test('fetches jwt for guest users, sets up the streaming connection', async () => {
      const { getJwt, sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true });
      await sdk.initialize({ securityCode: '123456' });
      getJwt.done();
      expect(sdk._streamingConnection).toBeTruthy();
    }, 15 * 1000);

    test('should use the customerData when passed in', async () => {
      const { sdk, mockCustomerData } = mockApis({ withMedia: new MockStream(), guestSdk: true, withCustomerData: true });

      await sdk.initialize(mockCustomerData);
      expect(sdk._streamingConnection).toBeTruthy();
    }, 15 * 1000);

    test('should throw if invalid customerData is passed in', async () => {
      const { sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true });

      const invalidCustomerData = {};
      try {
        await sdk.initialize(invalidCustomerData as ICustomerData);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeTruthy();
      }
    }, 15 * 1000);

    test('throws error for guest users without a security code', async () => {
      const { sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true });
      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e).toEqual(new SdkError(SdkErrorTypes.initialization, '`securityCode` is required to initialize the SDK as a guest'));
      }
    }, 15 * 1000);

    test('throws if getting the jwt fails', async () => {
      const { sdk } = mockApis({ withMedia: new MockStream(), guestSdk: true, failSecurityCode: true });

      try {
        await sdk.initialize({ securityCode: '12345' });
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.http);
      }
    });

    test('throws if getting the org fails', async () => {
      const { sdk } = mockApis({ failOrg: true });

      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.http);
      }
    });

    test('throws if getting the user fails', async () => {
      const { sdk } = mockApis({ failUser: true });

      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.http);
      }
    });

    test('throws if setting up streaming connection fails', async () => {
      const { sdk } = mockApis({ failStreaming: true });
      try {
        await sdk.initialize();
        fail();
      } catch (e) {
        expect(e.type).toBe(SdkErrorTypes.initialization);
      }
    }, 15 * 1000);

    test('sets up event proxies', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      const eventsToVerify = [
        { name: 'error', trigger: 'error', args: [new Error('test'), {}] },
        { name: 'trace', trigger: 'traceRtcSession' },
        {
          name: 'handledPendingSession',
          trigger: 'handledIncomingRtcSession',
          args: [1],
          transformedArgs: [1]
        },
        {
          name: 'cancelPendingSession',
          trigger: 'cancelIncomingRtcSession',
          args: [1],
          transformedArgs: [1]
        },
        { name: 'error', trigger: 'rtcSessionError' },
        { name: 'disconnected', trigger: 'session:end', args: [], transformedArgs: ['Streaming API connection disconnected'] }
      ];

      async function awaitEvent (sdk, eventName, trigger, args = [], transformedArgs) {
        if (!transformedArgs) {
          transformedArgs = args;
        }
        const promise = new Promise(resolve => {
          const handler = (...eventArgs) => {
            expect(transformedArgs).toEqual(eventArgs);
            sdk.off(eventName, handler);
            resolve();
          };
          sdk.on(eventName, handler);
        });
        if (typeof trigger === 'string') {
          sdk._streamingConnection._webrtcSessions.emit(trigger, ...args);
          sdk._streamingConnection._stanzaio.emit(trigger, ...args);
        } else {
          trigger(args);
        }
        await promise;
      }

      await Promise.all(eventsToVerify.map(e => awaitEvent(sdk, e.name, e.trigger, e.args, e.transformedArgs)));
    });
  });

  describe('startScreenShare()', () => {
    test('should reject if authenticated user', () => {
      const { sdk } = mockApis();
      expect.assertions(1);
      sdk.startScreenShare()
        .then(() => fail('should have failed'))
        .catch(e => expect(e).toEqual(new Error('Agent screen share is not yet supported')));
    });

    test('should initiate a RTC session', async () => {
      const media = new MockStream();
      const { sdk } = mockApis({ guestSdk: true, withMedia: media });

      await sdk.initialize({ securityCode: '123454' });
      const spy = jest.spyOn(sdk._streamingConnection.webrtcSessions, 'initiateRtcSession').mockImplementation();

      await sdk.startScreenShare();
      expect(spy).toHaveBeenCalledWith({
        stream: media,
        jid: expect.any(String),
        mediaPurpose: 'screenShare',
        conversationId: expect.any(String),
        sourceCommunicationId: expect.any(String)
      });
    });
  });

  describe('connected()', () => {
    test('returns the streaming client connection status', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);
      sdk._streamingConnection.connected = false;
      expect(sdk.connected).toBe(false);
    });
  });

  describe('acceptPendingSession()', () => {
    test('proxies the call to the streaming connection', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      const promise = new Promise(resolve => {
        sdk._streamingConnection.webrtcSessions.on('rtcSessionError', resolve);
      });
      sdk._streamingConnection._webrtcSessions.acceptRtcSession = jest.fn();
      sdk.acceptPendingSession('4321');
      await promise;
    });
  });

  describe('endSession()', () => {
    test('rejects if not provided either an id or a conversationId', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();
      try {
        await sdk.endSession({});
        fail();
      } catch (e) {
        expect(e).toEqual(new SdkError(SdkErrorTypes.session, 'Unable to end session: must provide session id or conversationId.'));
      }
    });

    test('should throw if it cannot find the session', async () => {
      const { sdk } = mockApis({});
      const sessionId = random();
      await sdk.initialize();
      try {
        await sdk.endSession({ id: sessionId });
      } catch (e) {
        expect(e).toEqual(new SdkError(SdkErrorTypes.session, 'Unable to end session: session not connected.'));
      }
    });

    test('terminates the session if the existing session has no conversationId', async () => {
      const sessionId = random();
      const conversationId = random();
      const participantId = random();
      const { sdk, getConversation } = mockApis({ conversationId, participantId });
      await sdk.initialize();

      const mockSession = { id: sessionId, end: jest.fn() };
      sdk._sessionManager.sessions = {};
      sdk._sessionManager.sessions[sessionId] = mockSession;
      await sdk.endSession({ id: sessionId });
      expect(() => getConversation.done()).toThrow();
      expect(mockSession.end).toHaveBeenCalledTimes(1);
    });

    test('should end the session for guests', async () => {
      const sessionId = random();
      const conversationId = random();
      const participantId = random();
      const { sdk, getConversation, getJwt } = mockApis({ conversationId, participantId, guestSdk: true });
      await sdk.initialize({ securityCode: 'adf' });

      const mockSession = { id: sessionId, end: jest.fn() };
      sdk._sessionManager.sessions = {};
      sdk._sessionManager.sessions[sessionId] = mockSession;
      await sdk.endSession({ id: sessionId, conversationId });
      getJwt.done();
      expect(() => getConversation.done()).toThrow();
      expect(mockSession.end).toHaveBeenCalledTimes(1);
    });

    test('requests the conversation then patches the participant to "disconnected"', async () => {
      const sessionId = random();
      const conversationId = random();
      const participantId = PARTICIPANT_ID;
      const { sdk, getConversation, patchConversation } = mockApis({ conversationId, participantId });
      await sdk.initialize();

      const mockSession = { id: sessionId, conversationId, end: jest.fn() };
      sdk._sessionManager.sessions = {};
      sdk._sessionManager.sessions[sessionId] = mockSession;

      await sdk.endSession({ id: sessionId });
      getConversation.done();
      patchConversation.done();
      expect(mockSession.end).not.toHaveBeenCalled();
    });

    test('ends the session and rejects if there is an error fetching the conversation', async () => {
      const sessionId = random();
      const conversationId = random();
      const participantId = random();
      const { sdk } = mockApis({ conversationId, participantId });
      await sdk.initialize();

      const mockSession = { id: sessionId, conversationId, end: jest.fn() };
      sdk._sessionManager.sessions = {};
      sdk._sessionManager.sessions[sessionId] = mockSession;

      try {
        await sdk.endSession({ id: sessionId });
        fail();
      } catch (e) {
        expect(mockSession.end).toHaveBeenCalled();
        expect(e.type).toBe(SdkErrorTypes.http);
      }
    });

    test('ends the session directly if patching the conversation fails', async () => {
      const sessionId = random();
      const conversationId = random();
      const participantId = PARTICIPANT_ID;
      const { sdk, getConversation, patchConversation } = mockApis({ conversationId, participantId, failConversationPatch: true });
      await sdk.initialize();

      const mockSession = { id: sessionId, conversationId, end: jest.fn() };
      sdk._sessionManager.sessions = {};
      sdk._sessionManager.sessions[sessionId] = mockSession;

      try {
        await sdk.endSession({ id: sessionId });
        fail();
      } catch (e) {
        getConversation.done();
        patchConversation.done();
        expect(mockSession.end).toHaveBeenCalled();
        expect(e.type).toBe(SdkErrorTypes.http);
      }
    });
  });

  describe('reconnect()', () => {
    test('proxies the call to the streaming connection', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.reconnect = jest.fn();

      await sdk.reconnect();
      expect(sdk._streamingConnection.reconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect()', () => {
    test('proxies the call to the streaming connection', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.disconnect = jest.fn();

      await sdk.disconnect();
      expect(sdk._streamingConnection.disconnect).toHaveBeenCalledTimes(1);
    });

    test('_config.customIceServersConfig | gets reset if the client refreshes ice servers', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();
      sdk._config.customIceServersConfig = [{ something: 'junk' }] as RTCConfiguration;

      sdk._streamingConnection.sessionManager = {
        iceServers: [{ urls: ['turn:mypurecloud.com'] }]
      };

      await sdk._streamingConnection.webrtcSessions.refreshIceServers();
      const actual = sdk._sessionManager.iceServers;
      expect(actual).toEqual([
        {
          type: 'turn',
          urls: 'turn:turn.us-east-1.mypurecloud.com:3456',
          username: 'turnuser:12395',
          credential: 'akskdfjka='
        },
        {
          type: 'stun',
          urls: 'stun:turn.us-east-1.mypurecloud.com:3456'
        }
      ]);
    });
  });

  describe('onPendingSession()', () => {
    test('emits a pendingSession event and accepts the session', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk, 'acceptPendingSession');
      const pendingSession = new Promise(resolve => {
        sdk.on('pendingSession', resolve);
      });

      sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
        sessionId: '1077',
        autoAnswer: true,
        conversationId: 'deadbeef-guid',
        fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
      });

      const sessionInfo: any = await pendingSession;
      expect(sessionInfo.id).toBe('1077');
      expect(sessionInfo.conversationId).toBe('deadbeef-guid');
      expect(sessionInfo.address).toBe('+15558675309');
      expect(sessionInfo.autoAnswer).toBe(true);
      expect(sdk.acceptPendingSession).toHaveBeenCalledTimes(1);
      expect(sdk.acceptPendingSession).toHaveBeenCalledWith('1077');
    });

    test('emits a pendingSession event and does not accept the session if disableAutoAnwer is true', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();
      sdk._config.disableAutoAnswer = true;

      jest.spyOn(sdk, 'acceptPendingSession');
      const pendingSession = new Promise(resolve => {
        sdk.on('pendingSession', resolve);
      });

      sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
        sessionId: '1077',
        autoAnswer: true,
        conversationId: 'deadbeef-guid',
        fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
      });

      const sessionInfo: any = await pendingSession;
      expect(sessionInfo.id).toBe('1077');
      expect(sessionInfo.conversationId).toBe('deadbeef-guid');
      expect(sessionInfo.address).toBe('+15558675309');
      expect(sessionInfo.autoAnswer).toBe(true);
      expect(sdk.acceptPendingSession).toHaveBeenCalledTimes(0);
    });

    test('should handles double pending sessions', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk, 'acceptPendingSession').mockImplementation();
      const pendingSession = new Promise(resolve => {
        sdk.on('pendingSession', resolve);
      });

      sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
        sessionId: '1077',
        autoAnswer: true,
        conversationId: 'deadbeef-guid',
        fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
      });

      sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
        sessionId: '1078',
        autoAnswer: true,
        conversationId: 'deadbeef-guid',
        fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
      });

      const sessionInfo: any = await pendingSession;
      expect(sessionInfo.id).toBe('1077');
      expect(sessionInfo.conversationId).toBe('deadbeef-guid');
      expect(sessionInfo.address).toBe('+15558675309');
      expect(sessionInfo.autoAnswer).toBe(true);
      expect(sdk.acceptPendingSession).toHaveBeenCalledTimes(1);
      expect(sdk.acceptPendingSession).toHaveBeenCalledWith('1077');
    });

    test('should allow double pending sessions after 10 seconds', async () => {

      const { sdk } = mockApis();
      await sdk.initialize();
      jest.spyOn(sdk, 'acceptPendingSession').mockImplementation();
      const pendingSession = new Promise(resolve => {
        const done = function () {
          sdk.off('pendingSession', done);
          resolve(...arguments);
        };
        sdk.on('pendingSession', done);
      });

      sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
        sessionId: '1077',
        autoAnswer: true,
        conversationId: 'deadbeef-guid',
        fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
      });

      sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
        sessionId: '1078',
        autoAnswer: true,
        conversationId: 'deadbeef-guid',
        fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
      });

      const sessionInfo: any = await pendingSession;
      expect(sessionInfo.id).toBe('1077');
      expect(sessionInfo.conversationId).toBe('deadbeef-guid');
      expect(sessionInfo.address).toBe('+15558675309');
      expect(sessionInfo.autoAnswer).toBe(true);
      expect(sdk.acceptPendingSession).toHaveBeenCalledTimes(1);
      expect(sdk.acceptPendingSession).toHaveBeenCalledWith('1077');

      await timeout(1100);

      const pendingSession2 = new Promise(resolve => {
        const done = function () {
          sdk.off('pendingSession', done);
          resolve(...arguments);
        };
        sdk.on('pendingSession', done);
      });

      sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
        sessionId: '1078',
        autoAnswer: true,
        conversationId: 'deadbeef-guid',
        fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
      });

      const sessionInfo2: any = await pendingSession2;
      expect(sessionInfo2.id).toBe('1078');
      expect(sessionInfo2.conversationId).toBe('deadbeef-guid');
      expect(sessionInfo2.address).toBe('+15558675309');
      expect(sessionInfo2.autoAnswer).toBe(true);
      expect(sdk.acceptPendingSession).toHaveBeenCalledTimes(2);
    });

    test('emits a pendingSession event but does not accept the session if autoAnswer is false', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      jest.spyOn(sdk, 'acceptPendingSession');
      const pendingSession = new Promise(resolve => {
        sdk.on('pendingSession', resolve);
      });

      sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
        sessionId: '1077',
        autoAnswer: false,
        conversationId: 'deadbeef-guid',
        fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
      });

      const sessionInfo: any = await pendingSession;
      expect(sessionInfo.id).toBe('1077');
      expect(sessionInfo.conversationId).toBe('deadbeef-guid');
      expect(sessionInfo.address).toBe('+15558675309');
      expect(sessionInfo.autoAnswer).toBe(false);
      expect(sdk.acceptPendingSession).not.toHaveBeenCalled();
    });
  });

  describe('onSession()', () => {
    describe('authenticated user | softphone', () => {
      test('starts media, attaches it to the session, attaches it to the dom, accepts the session, and emits a started event', async () => {
        const mockOutboundStream = new MockStream();
        const { sdk } = mockApis({ withMedia: mockOutboundStream });
        await sdk.initialize();

        const getUserMediaSpy = jest.spyOn(global.window.navigator.mediaDevices, 'getUserMedia');
        const bodyAppend = new Promise(resolve => {
          jest.spyOn(global.document.body, 'append').mockImplementation(resolve);
        });

        const sessionStarted = new Promise(resolve => sdk.on('sessionStarted', resolve));

        const mockSession = new MockSession();
        mockSession.sid = random();
        sdk._pendingSessions[mockSession.sid] = mockSession;
        mockSession.streams = [new MockStream()];
        jest.spyOn(mockSession, 'addStream');
        jest.spyOn(mockSession, 'accept');

        sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
        await sessionStarted;

        mockSession._statsGatherer.emit('traces', { some: 'traces' });
        mockSession._statsGatherer.emit('stats', { some: 'stats' });
        jest.spyOn(mockSession._statsGatherer, 'collectInitialConnectionStats');
        mockSession.emit('change:active', mockSession, true);

        expect(mockSession._statsGatherer.collectInitialConnectionStats).toHaveBeenCalledTimes(1);
        expect(mockSession.addStream).toHaveBeenCalledTimes(1);
        expect(mockSession.accept).toHaveBeenCalledTimes(1);
        expect(getUserMediaSpy).toHaveBeenCalledTimes(1);

        const attachedAudioElement: any = await bodyAppend;
        expect(attachedAudioElement.srcObject).toBe(mockSession.streams[0]);

        const sessionEnded = new Promise(resolve => sdk.on('sessionEnded', resolve));
        mockSession.emit('terminated', mockSession);
        mockSession.emit('change:active', mockSession, false);
        expect(mockSession._statsGatherer.collectInitialConnectionStats).toHaveBeenCalledTimes(1);
        await sessionEnded;
      });

      test('uses existing media, attaches it to the session, attaches it to the dom in existing element when ready, and emits a started event', async () => {
        const mockOutboundStream = new MockStream();
        const mockAudioElement: any = { classList: { add () { } } };
        const { sdk } = mockApis({ withMedia: {} as MockStream });
        await sdk.initialize();
        sdk.pendingStream = mockOutboundStream as unknown as MediaStream;
        sdk._config.autoConnectSessions = false;

        const getUserMediaSpy = jest.spyOn(global.window.navigator.mediaDevices, 'getUserMedia');

        jest.spyOn(global.document, 'querySelector').mockReturnValue(mockAudioElement);
        jest.spyOn(global.document.body, 'append');

        const sessionStarted = new Promise(resolve => sdk.on('sessionStarted', resolve));

        const mockSession = new MockSession();
        jest.spyOn(mockSession, 'addStream');
        jest.spyOn(mockSession, 'accept');

        sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
        await sessionStarted;

        expect(mockSession.addStream).toHaveBeenCalledTimes(1);
        expect(mockSession.addStream).toHaveBeenCalledWith(mockOutboundStream);
        expect(mockSession.accept).not.toHaveBeenCalled();
        expect(getUserMediaSpy).not.toHaveBeenCalled();

        const mockInboundStream = {};
        mockSession.emit('peerStreamAdded', mockSession, mockInboundStream);
        expect(mockAudioElement.srcObject).toBe(mockInboundStream);
        expect(global.document.body.append).not.toHaveBeenCalled();

        const sessionEnded = new Promise(resolve => sdk.on('sessionEnded', resolve));
        mockSession._outboundStream = null;
        mockSession.emit('terminated', mockSession);
        await sessionEnded;
      });

      test('uses existing media, attaches it to the session, attaches it to the dom in _pendingAudioElement element when ready, and emits a started event', async () => {
        const mockOutboundStream = new MockStream();
        const mockAudioElement: any = { classList: { add () { } } };
        const { sdk } = mockApis({ withMedia: {} as MockStream });
        await sdk.initialize();
        sdk.pendingStream = mockOutboundStream as unknown as MediaStream;
        sdk._config.autoConnectSessions = false;
        sdk._pendingAudioElement = mockAudioElement;

        const getUserMediaSpy = jest.spyOn(global.window.navigator.mediaDevices, 'getUserMedia');
        jest.spyOn(global.document.body, 'append');

        const sessionStarted = new Promise(resolve => sdk.on('sessionStarted', resolve));

        const mockSession = new MockSession();
        jest.spyOn(mockSession, 'addStream');
        jest.spyOn(mockSession, 'accept');

        sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
        await sessionStarted;

        expect(mockSession.addStream).toHaveBeenCalledTimes(1);
        expect(mockSession.addStream).toHaveBeenCalledWith(mockOutboundStream);
        expect(mockSession.accept).not.toHaveBeenCalled();
        expect(getUserMediaSpy).not.toHaveBeenCalled();

        const mockInboundStream = {};
        mockSession.emit('peerStreamAdded', mockSession, mockInboundStream);
        expect(mockAudioElement.srcObject).toBe(mockInboundStream);
        expect(global.document.body.append).not.toHaveBeenCalled();
      });
    });

    describe('guest user | screenshare', () => {
      test('starts media, attaches it to the session, accepts the session, and emits a started event', async () => {
        const mockOutboundStream = new MockStream();
        const { sdk } = mockApis({ withMedia: mockOutboundStream, guestSdk: true });
        await sdk.initialize({ securityCode: '129034' });
        await sdk.startScreenShare();

        const sessionStarted = new Promise(resolve => sdk.on('sessionStarted', resolve));

        const mockSession = new MockSession();
        mockSession.sid = random();
        sdk._pendingSessions[mockSession.sid] = mockSession;
        mockSession.streams = [new MockStream()];
        jest.spyOn(mockSession, 'addStream');
        jest.spyOn(mockSession, 'accept');

        sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
        await sessionStarted;

        mockSession._statsGatherer.emit('traces', { some: 'traces' });
        mockSession._statsGatherer.emit('stats', { some: 'stats' });
        jest.spyOn(mockSession._statsGatherer, 'collectInitialConnectionStats');
        mockSession.emit('change:active', mockSession, true);

        expect(mockSession._statsGatherer.collectInitialConnectionStats).toHaveBeenCalledTimes(1);
        expect(mockSession.addStream).toHaveBeenCalledTimes(1);
        expect(mockSession.accept).toHaveBeenCalledTimes(1);

        const sessionEnded = new Promise(resolve => sdk.on('sessionEnded', resolve));
        mockSession.emit('terminated', mockSession);
        mockSession.emit('change:active', mockSession, false);
        expect(mockSession._statsGatherer.collectInitialConnectionStats).toHaveBeenCalledTimes(1);
        await sessionEnded;
      });

      test.skip('ends session if the stream stops', async () => {
        const mockOutboundStream = new MockStream();
        const { sdk } = mockApis({ withMedia: mockOutboundStream, guestSdk: true });
        await sdk.initialize({ securityCode: '129034' });
        await sdk.startScreenShare();

        const sessionStarted = new Promise(resolve => sdk.on('sessionStarted', resolve));

        const mockSession = new MockSession();
        mockSession.sid = random();
        sdk._pendingSessions[mockSession.sid] = mockSession;
        mockSession.streams = [new MockStream()];
        jest.spyOn(mockSession, 'addStream');
        jest.spyOn(mockSession, 'accept');
        jest.spyOn(mockSession, 'end');

        // mockSession.streams.forEach((stream: MockStream) => {
        console.log('mockOutboundStream', mockOutboundStream);
        const tracks = mockOutboundStream.getTracks();
        console.log('tracks', tracks);
        tracks.forEach((track: MockTrack) => {
          console.log('listeners', track._listeners);

          const handler = track._listeners.find(listener => listener.event === 'ended');
          console.log(handler);
          handler.callback();
          mockSession.emit('terminated', mockSession);
          mockSession.emit('change:active', mockSession, false);
        });
        // });

        sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
        await sessionStarted;

        mockSession.emit('change:active', mockSession, true);

        expect(mockSession.accept).toHaveBeenCalledTimes(1);
        const sessionEnded = new Promise(resolve => sdk.on('sessionEnded', resolve));

        // jest.spyOn(mockSession._statsGatherer, 'collectInitialConnectionStats');
        // expect(mockSession._statsGatherer.collectInitialConnectionStats).toHaveBeenCalledTimes(1);

        await sessionEnded;
        expect(mockSession.end).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('_refreshTurnServers()', () => {
    test('refreshes the turn servers', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);

      jest.spyOn(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').mockReturnValue(Promise.resolve());
      await sdk._refreshTurnServers();
      expect(sdk._streamingConnection._webrtcSessions.refreshIceServers).toHaveBeenCalledTimes(1);
      expect(sdk._refreshTurnServersInterval).toBeTruthy();
    }, 15 * 1000);

    test('emits an error if there is an error refreshing turn servers', async () => {
      const { sdk } = mockApis();
      await sdk.initialize();

      sdk._streamingConnection.connected = true;
      expect(sdk.connected).toBe(true);

      const promise = new Promise(resolve => sdk.on('error', resolve));
      jest.spyOn(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').mockReturnValue(Promise.reject(new Error('fail')));
      try {
        await sdk._refreshTurnServers();
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeTruthy();
      }
      expect(sdk._streamingConnection._webrtcSessions.refreshIceServers).toHaveBeenCalledTimes(1);
      await promise;
    }, 15 * 1000);
  });

  describe('isCustomerData()', () => {
    let sdk: PureCloudWebrtcSdk;
    let isCustomerData: PureCloudWebrtcSdk['isCustomerData'];

    beforeEach(() => {
      sdk = mockApis().sdk;
      isCustomerData = sdk['isCustomerData'];
    });

    test('should return true if valid customerData is present', () => {
      const customerData = {
        jwt: 'JWT',
        sourceCommunicationId: 'source-123',
        conversation: { id: 'convo-123' }
      };
      expect(isCustomerData(customerData)).toBe(true);
    });

    test('should return false if no customerData is present', () => {
      let customerData: ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    test('should return false if conversation is missing from customerData', () => {
      const customerData = {
        jwt: 'string',
        sourceCommunicationId: 'commId'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    test('should return false if conversation.id is missing from customerData', () => {
      const customerData = {
        conversation: {},
        jwt: 'string',
        sourceCommunicationId: 'commId'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    test('should return false if jwt is missing from customerData', () => {
      const customerData = {
        conversation: { id: 'convoId' },
        sourceCommunicationId: 'commId'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });

    test('should return false if sourceCommunicationId is missing from customerData', () => {
      const customerData = {
        conversation: { id: 'convoId' },
        jwt: 'string'
      } as ICustomerData;
      expect(isCustomerData(customerData)).toBe(false);
    });
  });

  describe('isSecurityCode()', () => {
    let sdk: PureCloudWebrtcSdk;
    let isSecurityCode: PureCloudWebrtcSdk['isSecurityCode'];

    beforeEach(() => {
      sdk = mockApis().sdk;
      isSecurityCode = sdk['isSecurityCode'];
    });

    test('should return true if object has securityKey', () => {
      expect(isSecurityCode({ securityCode: '123456' })).toBe(true);
    });

    test('should return false if object is missing securityKey', () => {
      expect(isSecurityCode({ key: 'prop' } as any)).toBe(false);
    });

    test('should return false if nothing is passed in', () => {
      expect(isSecurityCode(undefined as any)).toBe(false);
    });
  });
});
