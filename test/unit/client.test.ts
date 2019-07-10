import WildEmitter from 'wildemitter';
import sinon, { SinonSpy } from 'sinon';

import PureCloudWebrtcSdk from '../../src/client';

declare var global: {
  window: any,
  document: any
} & NodeJS.Global;

let { wss, ws, mockApis, random, PARTICIPANT_ID, closeWebSocketServer } = require('../test-utils');
const sandbox = sinon.createSandbox();

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
    sandbox.restore();
  });

  test('constructor | throws if options are not provided', () => {
    expect(() => {
      const sdk = new PureCloudWebrtcSdk(null); // eslint-disable-line
    }).toThrow();
  });

  test('constructor | throws if accessToken is not provided', () => {
    expect(() => {
      const sdk = new PureCloudWebrtcSdk({ environment: 'mypurecloud.com' }); // eslint-disable-line
    }).toThrow();
  });

  test('constructor | warns if environment is not valid', () => {
    const sdk1 = new PureCloudWebrtcSdk({ accessToken: '1234', environment: 'mypurecloud.con' }); // eslint-disable-line
    const sdk2 = new PureCloudWebrtcSdk({  // eslint-disable-line
      accessToken: '1234',
      environment: 'mypurecloud.con',
      logger: { warn: sinon.stub() }
    });

    sinon.assert.calledOnce(sdk2.logger.warn);
  });

  test('constructor | warns if the logLevel is not valid', () => {
    const sdk = new PureCloudWebrtcSdk({
      accessToken: '1234',
      environment: 'mypurecloud.com',
      logLevel: 'ERROR',
      logger: { warn: sinon.stub() }
    });
    sinon.assert.calledOnce(sdk.logger.warn);
  });

  test('constructor | does not warn if things are fine', () => {
    const sdk = new PureCloudWebrtcSdk({
      accessToken: '1234',
      environment: 'mypurecloud.com',
      logLevel: 'error',
      logger: { warn: sinon.stub() }
    });
    sinon.assert.notCalled(sdk.logger.warn);
  });

  test('constructor | sets up options with defaults', () => {
    const sdk = new PureCloudWebrtcSdk({ accessToken: '1234' });
    expect(sdk.logger).toBe(console);
    expect(sdk._accessToken).toBe('1234');
    expect(sdk._environment).toBe('mypurecloud.com');
    expect(sdk._autoConnectSessions).toBe(true);
    expect(typeof sdk._customIceServersConfig).toBe('undefined');
    expect(sdk._iceTransportPolicy).toBe('all');
  });

  test('constructor | sets up options when provided', () => {
    const logger = {};
    const iceServers = [];
    const sdk = new PureCloudWebrtcSdk({
      accessToken: '1234',
      environment: 'mypurecloud.ie',
      autoConnectSessions: false,
      iceServers,
      iceTransportPolicy: 'relay',
      logger
    });

    expect(sdk.logger).toBe(logger);
    expect(sdk._accessToken).toBe('1234');
    expect(sdk._environment).toBe('mypurecloud.ie');
    expect(sdk._autoConnectSessions).toBe(false);
    expect(sdk._customIceServersConfig).toBe(iceServers);
    expect(sdk._iceTransportPolicy).toBe('relay');
  });

  test('initialize | fetches org and person details, sets up the streaming connection', async () => {
    const { getOrg, getUser, getChannel, sdk } = mockApis();
    await sdk.initialize();
    getOrg.done();
    getUser.done();
    getChannel.done();
    expect(sdk._streamingConnection).toBeTruthy();
    sdk.logBuffer = [];
    sdk._optOutOfTelemetry = true;
  });

  test('initialize | throws if getting the org fails', done => {
    const { sdk } = mockApis({ failOrg: true });

    return sdk.initialize()
      .then(() => done.fail())
      .catch(() => done());
  });

  test('initialize | throws if getting the user fails', done => {
    const { sdk } = mockApis({ failUser: true });

    return sdk.initialize()
      .then(t => done.fail())
      .catch(() => done());
  });

  test('initialize | throws if setting up streaming connection fails', async done => {
    const { sdk } = mockApis({ failStreaming: true });
    sdk.initialize()
      .then(() => fail())
      .catch(() => done());
  }, 15 * 1000);

  test('initialize sets up event proxies', async () => {
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

  test('connected | returns the streaming client connection status', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();

    sdk._streamingConnection.connected = true;
    expect(sdk.connected).toBe(true);
    sdk._streamingConnection.connected = false;
    expect(sdk.connected).toBe(false);
  });

  test('acceptPendingSession | proxies the call to the streaming connection', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();

    const promise = new Promise(resolve => {
      sdk._streamingConnection.webrtcSessions.on('rtcSessionError', resolve);
    });
    sdk._streamingConnection._webrtcSessions.acceptRtcSession = sinon.stub();
    sdk.acceptPendingSession('4321');
    await promise;
  }
  );

  test('endSession | requests the conversation then patches the participant to disconnected', async () => {
    const sessionId = random();
    const conversationId = random();
    const participantId = PARTICIPANT_ID;
    const { sdk, getConversation, patchConversation } = mockApis({ conversationId, participantId });
    await sdk.initialize();

    const mockSession = { id: sessionId, conversationId, end: sinon.stub() };
    sdk._sessionManager.sessions = {};
    sdk._sessionManager.sessions[sessionId] = mockSession;

    await sdk.endSession({ id: sessionId });
    getConversation.done();
    patchConversation.done();
    sinon.assert.notCalled(mockSession.end);
  });

  // test.serial('endSession | requests the conversation then patches the participant to disconnected', async t => {
  //   const sessionId = random();
  //   const conversationId = random();
  //   const participantId = PARTICIPANT_ID;
  //   const { sdk, getConversation, patchConversation } = mockApis({ conversationId, participantId });
  //   await sdk.initialize();

  //   const mockSession = { id: sessionId, conversationId, end: sinon.stub() };
  //   sdk._sessionManager.sessions = {};
  //   sdk._sessionManager.sessions[sessionId] = mockSession;

  //   await sdk.endSession({ conversationId });
  //   getConversation.done();
  //   patchConversation.done();
  //   sinon.assert.notCalled(mockSession.end);
  // });

  test('endSession | rejects if not provided either an id or a conversationId', async done => {
    const { sdk } = mockApis();
    await sdk.initialize();
    await sdk.endSession({})
      .then(() => {
        done.fail();
      })
      .catch(err => {
        expect(err).toBeTruthy();
        done();
      });
  });

  test('endSession | rejects if not provided anything', async done => {
    const { sdk } = mockApis();
    await sdk.initialize();
    await sdk.endSession()
      .then(() => {
        done.fail();
      })
      .catch(err => {
        expect(err).toBeTruthy();
        done();
      });
  });

  test('endSession | rejects if the session is not found', async done => {
    const sessionId = random();
    const conversationId = random();
    const participantId = PARTICIPANT_ID;
    const { sdk } = mockApis({ conversationId, participantId });
    await sdk.initialize();

    const mockSession = { id: random(), conversationId, end: sinon.stub() };
    sdk._sessionManager.sessions = {};
    sdk._sessionManager.sessions[mockSession.id] = mockSession;

    await sdk.endSession({ id: sessionId })
      .then(() => {
        done.fail();
      })
      .catch(err => {
        expect(err).toBeTruthy();
        done();
      });
  });

  test('endSession | ends the session and rejects if there is an error fetching the conversation', async done => {
    const sessionId = random();
    const conversationId = random();
    const participantId = random();
    const { sdk } = mockApis({ conversationId, participantId });
    await sdk.initialize();

    const mockSession = { id: sessionId, conversationId, end: sinon.stub() };
    sdk._sessionManager.sessions = {};
    sdk._sessionManager.sessions[sessionId] = mockSession;

    await sdk.endSession({ id: sessionId })
      .then(() => {
        done.fail();
      })
      .catch(err => {
        expect(err).toBeTruthy();
        sinon.assert.calledOnce(mockSession.end);
        done();
      });
  });

  test('endSession | terminates the session of the existing session has no conversationId', async () => {
    const sessionId = random();
    const conversationId = random();
    const participantId = random();
    const { sdk, getConversation } = mockApis({ conversationId, participantId });
    await sdk.initialize();

    const mockSession = { id: sessionId, end: sinon.stub() };
    sdk._sessionManager.sessions = {};
    sdk._sessionManager.sessions[sessionId] = mockSession;
    await sdk.endSession({ id: sessionId });
    expect(() => getConversation.done()).toThrow();
    sinon.assert.calledOnce(mockSession.end);
  });

  test('disconnect | proxies the call to the streaming connection', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();

    sdk._streamingConnection.disconnect = sinon.stub();

    sdk.disconnect();
    sinon.assert.calledOnce(sdk._streamingConnection.disconnect);
    expect.assertions(0);
  });

  test('reconnect | proxies the call to the streaming connection', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();

    sdk._streamingConnection.reconnect = sinon.stub();

    sdk.reconnect();
    sinon.assert.calledOnce(sdk._streamingConnection.reconnect);
    expect.assertions(0);
  });

  test('_customIceServersConfig | gets reset if the client refreshes ice servers', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();
    sdk._customIceServersConfig = [{ something: 'junk' }];

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

  test('onPendingSession | emits a pendingSession event and accepts the session', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();

    sinon.stub(sdk, 'acceptPendingSession');
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
    sinon.assert.calledOnce(sdk.acceptPendingSession);
    sinon.assert.calledWithExactly(sdk.acceptPendingSession, '1077');
  });

  test('onPendingSession | emits a pendingSession event but does not accept the session if autoAnswer is false', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();

    sinon.stub(sdk, 'acceptPendingSession');
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
    sinon.assert.notCalled(sdk.acceptPendingSession);
  });

  class MockSession extends WildEmitter {
    streams: any[];
    sid: any;
    pc: any;
    _statsGatherer: any;
    _outboundStream: any;
    constructor () {
      super();
      this.streams = [];
      this.sid = random();
      this.pc = new WildEmitter();
    }
    accept () { }
    addStream () { }
    end () { }
  }

  class MockTrack {
    stop () { }
  }

  class MockStream {
    _tracks: MockTrack[];
    constructor () {
      this._tracks = [new MockTrack()];
    }
    getTracks () {
      return this._tracks;
    }
  }

  test('onSession | starts media, attaches it to the session, attaches it to the dom, accepts the session, and emits a started event', async () => {
    const mockOutboundStream = new MockStream();
    const { sdk } = mockApis({ withMedia: mockOutboundStream });
    await sdk.initialize();

    const sandbox = sinon.createSandbox();
    sandbox.spy(global.window.navigator.mediaDevices, 'getUserMedia');
    const bodyAppend = new Promise(resolve => {
      sandbox.stub(global.document.body, 'append').callsFake(resolve);
    });

    const sessionStarted = new Promise(resolve => sdk.on('sessionStarted', resolve));

    const mockSession = new MockSession();
    mockSession.sid = random();
    sdk._pendingSessions[mockSession.sid] = mockSession;
    mockSession.streams = [new MockStream()];
    sandbox.stub(mockSession, 'addStream');
    sandbox.stub(mockSession, 'accept');

    sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
    await sessionStarted;

    mockSession._statsGatherer.emit('traces', { some: 'traces' });
    mockSession._statsGatherer.emit('stats', { some: 'stats' });
    sandbox.stub(mockSession._statsGatherer, 'collectInitialConnectionStats');
    mockSession.emit('change:active', mockSession, true);
    sinon.assert.calledOnce(mockSession._statsGatherer.collectInitialConnectionStats);

    sinon.assert.calledOnce(mockSession.addStream as SinonSpy);
    sinon.assert.calledOnce(mockSession.accept as SinonSpy);
    sinon.assert.calledOnce(global.window.navigator.mediaDevices.getUserMedia);

    const attachedAudioElement: any = await bodyAppend;
    expect(attachedAudioElement.srcObject).toBe(mockSession.streams[0]);

    const sessionEnded = new Promise(resolve => sdk.on('sessionEnded', resolve));
    mockSession.emit('terminated', mockSession);
    mockSession.emit('change:active', mockSession, false);
    sinon.assert.calledOnce(mockSession._statsGatherer.collectInitialConnectionStats);
    await sessionEnded;

    sandbox.restore();
  });

  test('onSession | uses existing media, attaches it to the session, attaches it to the dom in existing element when ready, and emits a started event', async () => {
    const mockOutboundStream = new MockStream();
    const mockAudioElement: any = { classList: { add () { } } };
    const { sdk } = mockApis({ withMedia: {} });
    await sdk.initialize();
    sdk.pendingStream = mockOutboundStream;
    sdk._autoConnectSessions = false;

    const sandbox = sinon.createSandbox();
    sandbox.spy(global.window.navigator.mediaDevices, 'getUserMedia');
    sandbox.stub(global.document, 'querySelector').returns(mockAudioElement);
    sandbox.stub(global.document.body, 'append');

    const sessionStarted = new Promise(resolve => sdk.on('sessionStarted', resolve));

    const mockSession = new MockSession();
    sinon.stub(mockSession, 'addStream');
    sinon.stub(mockSession, 'accept');

    sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
    await sessionStarted;

    sinon.assert.calledOnce(mockSession.addStream as SinonSpy);
    sinon.assert.calledWithExactly(mockSession.addStream as SinonSpy, mockOutboundStream);
    sinon.assert.notCalled(mockSession.accept as SinonSpy);
    sinon.assert.notCalled(global.window.navigator.mediaDevices.getUserMedia as SinonSpy);

    const mockInboundStream = {};
    mockSession.emit('peerStreamAdded', mockSession, mockInboundStream);
    expect(mockAudioElement.srcObject).toBe(mockInboundStream);
    sinon.assert.notCalled(global.document.body.append);

    const sessionEnded = new Promise(resolve => sdk.on('sessionEnded', resolve));
    mockSession._outboundStream = null;
    mockSession.emit('terminated', mockSession);
    await sessionEnded;

    sandbox.restore();
  });

  test('onSession | uses existing media, attaches it to the session, attaches it to the dom in _pendingAudioElement element when ready, and emits a started event', async () => {
    const mockOutboundStream = new MockStream();
    const mockAudioElement: any = { classList: { add () { } } };
    const { sdk } = mockApis({ withMedia: {} });
    await sdk.initialize();
    sdk.pendingStream = mockOutboundStream;
    sdk._autoConnectSessions = false;
    sdk._pendingAudioElement = mockAudioElement;

    const sandbox = sinon.createSandbox();
    sandbox.spy(global.window.navigator.mediaDevices, 'getUserMedia');
    sandbox.stub(global.document.body, 'append');

    const sessionStarted = new Promise(resolve => sdk.on('sessionStarted', resolve));

    const mockSession = new MockSession();
    sinon.stub(mockSession, 'addStream');
    sinon.stub(mockSession, 'accept');

    sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
    await sessionStarted;

    sinon.assert.calledOnce(mockSession.addStream as SinonSpy);
    sinon.assert.calledWithExactly(mockSession.addStream as SinonSpy, mockOutboundStream);
    sinon.assert.notCalled(mockSession.accept as SinonSpy);
    sinon.assert.notCalled(global.window.navigator.mediaDevices.getUserMedia);

    const mockInboundStream = {};
    mockSession.emit('peerStreamAdded', mockSession, mockInboundStream);
    expect(mockAudioElement.srcObject).toBe(mockInboundStream);
    sinon.assert.notCalled(global.document.body.append);

    sandbox.restore();
  });

  test('_refreshTurnServers | refreshes the turn servers', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();

    sdk._streamingConnection.connected = true;
    expect(sdk.connected).toBe(true);

    sinon.stub(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').returns(Promise.resolve());
    await sdk._refreshTurnServers();
    sinon.assert.calledOnce(sdk._streamingConnection._webrtcSessions.refreshIceServers);
    expect(sdk._refreshTurnServersInterval).toBeTruthy();
  });

  test('_refreshTurnServers | emits an error if there is an error refreshing turn servers', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();

    sdk._streamingConnection.connected = true;
    expect(sdk.connected).toBe(true);

    const promise = new Promise(resolve => sdk.on('error', resolve));
    sinon.stub(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').returns(Promise.reject(new Error('fail')));
    await sdk._refreshTurnServers();
    sinon.assert.calledOnce(sdk._streamingConnection._webrtcSessions.refreshIceServers);
    await promise;
  });
});
