import PureCloudWebrtcSdk from '../../src/client';

const test = require('ava');
const sinon = require('sinon');
const WildEmitter = require('wildemitter');

let { wss, ws, mockApis, random, PARTICIPANT_ID } = require('../test-utils');

test.serial('constructor | throws if options are not provided', t => {
  t.throws(() => {
    const sdk = new PureCloudWebrtcSdk(); // eslint-disable-line
  });
});

test.serial('constructor | throws if accessToken is not provided', t => {
  t.throws(() => {
    const sdk = new PureCloudWebrtcSdk({ environment: 'mypurecloud.com' }); // eslint-disable-line
  });
});

test.serial('constructor | warns if environment is not valid', t => {
  const sdk1 = new PureCloudWebrtcSdk({ accessToken: '1234', environment: 'mypurecloud.con' }); // eslint-disable-line
  const sdk2 = new PureCloudWebrtcSdk({  // eslint-disable-line
    accessToken: '1234',
    environment: 'mypurecloud.con',
    logger: { warn: sinon.stub() }
  });

  sinon.assert.calledOnce(sdk2.logger.warn);
});

test.serial('constructor | warns if the logLevel is not valid', t => {
  const sdk = new PureCloudWebrtcSdk({
    accessToken: '1234',
    environment: 'mypurecloud.com',
    logLevel: 'ERROR',
    logger: { warn: sinon.stub() }
  });
  sinon.assert.calledOnce(sdk.logger.warn);
});

test.serial('constructor | does not warn if things are fine', t => {
  const sdk = new PureCloudWebrtcSdk({
    accessToken: '1234',
    environment: 'mypurecloud.com',
    logLevel: 'error',
    logger: { warn: sinon.stub() }
  });
  sinon.assert.notCalled(sdk.logger.warn);
});

test.serial('constructor | sets up options with defaults', t => {
  const sdk = new PureCloudWebrtcSdk({ accessToken: '1234' });
  t.is(sdk.logger, console);
  t.is(sdk._accessToken, '1234');
  t.is(sdk._environment, 'mypurecloud.com');
  t.is(sdk._autoConnectSessions, true);
  t.is(typeof sdk._customIceServersConfig, 'undefined');
  t.is(sdk._iceTransportPolicy, 'all');
});

test.serial('constructor | sets up options when provided', t => {
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

  t.is(sdk.logger, logger);
  t.is(sdk._accessToken, '1234');
  t.is(sdk._environment, 'mypurecloud.ie');
  t.is(sdk._autoConnectSessions, false);
  t.is(sdk._customIceServersConfig, iceServers);
  t.is(sdk._iceTransportPolicy, 'relay');
});

test.after(() => {
  if (wss) {
    wss.close();
  }
});

const sandbox = sinon.createSandbox();
test.afterEach(() => {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (wss) {
    wss.removeAllListeners();
  }
  sandbox.restore();
});

test.serial('initialize | fetches org and person details, sets up the streaming connection', async t => {
  const { getOrg, getUser, getChannel, sdk } = mockApis();

  await sdk.initialize();
  getOrg.done();
  getUser.done();
  getChannel.done();
  t.truthy(sdk._streamingConnection);
  sdk.logBuffer = [];
  sdk._optOutOfTelemetry = true;
});

test.serial('initialize | throws if getting the org fails', t => {
  const { sdk } = mockApis({ failOrg: true });

  return sdk.initialize().then(() => t.fail()).catch(() => t.pass());
});

test.serial('initialize | throws if getting the user fails', t => {
  const { sdk } = mockApis({ failUser: true });

  return sdk.initialize().then(t => t.fail()).catch(() => t.pass());
});

test.serial('initialize | throws if setting up streaming connection fails', t => {
  const { sdk } = mockApis({ failStreaming: true });

  return sdk.initialize().then(() => t.fail()).catch(() => t.pass());
});

test.serial('initialize sets up event proxies', async t => {
  const { sdk } = mockApis();
  await sdk.initialize();

  const eventsToVerify = [
    { name: 'error', trigger: 'error', args: [new Error('test'), {}] },
    { name: 'trace', trigger: 'traceRtcSession' },
    {
      name: 'handledPendingSession',
      trigger: 'handledIncomingRtcSession',
      args: [ 1 ],
      transformedArgs: [ 1 ]
    },
    {
      name: 'cancelPendingSession',
      trigger: 'cancelIncomingRtcSession',
      args: [ 1 ],
      transformedArgs: [ 1 ]
    },
    { name: 'error', trigger: 'rtcSessionError' },
    { name: 'disconnected', trigger: 'session:end', args: [], transformedArgs: [ 'Streaming API connection disconnected' ] }
  ];

  async function awaitEvent (sdk, eventName, trigger, args = [], transformedArgs) {
    if (!transformedArgs) {
      transformedArgs = args;
    }
    const promise = new Promise(resolve => {
      const handler = (...eventArgs) => {
        t.deepEqual(transformedArgs, eventArgs, `Args match for ${eventName}`);
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

  return Promise.all(eventsToVerify.map(e => awaitEvent(sdk, e.name, e.trigger, e.args, e.transformedArgs)));
});

test.serial('connected | returns the streaming client connection status', async t => {
  const { sdk } = mockApis();
  await sdk.initialize();

  sdk._streamingConnection.connected = true;
  t.true(sdk.connected);
  sdk._streamingConnection.connected = false;
  t.false(sdk.connected);
});

test.serial('acceptPendingSession | proxies the call to the streaming connection', async t => {
  const { sdk } = mockApis();
  await sdk.initialize();

  const promise = new Promise(resolve => {
    sdk._streamingConnection.webrtcSessions.on('rtcSessionError', resolve);
  });
  sdk._streamingConnection._webrtcSessions.acceptRtcSession = sinon.stub();
  sdk.acceptPendingSession('4321');
  await promise;
});

test.serial('endSession | requests the conversation then patches the participant to disconnected', async t => {
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

test.serial('endSession | requests the conversation then patches the participant to disconnected', async t => {
  const sessionId = random();
  const conversationId = random();
  const participantId = PARTICIPANT_ID;
  const { sdk, getConversation, patchConversation } = mockApis({ conversationId, participantId });
  await sdk.initialize();

  const mockSession = { id: sessionId, conversationId, end: sinon.stub() };
  sdk._sessionManager.sessions = {};
  sdk._sessionManager.sessions[sessionId] = mockSession;

  await sdk.endSession({ conversationId });
  getConversation.done();
  patchConversation.done();
  sinon.assert.notCalled(mockSession.end);
});

test.serial('endSession | rejects if not provided either an id or a conversationId', async t => {
  const { sdk } = mockApis();
  await sdk.initialize();
  await sdk.endSession({})
    .then(() => {
      t.fail();
    })
    .catch(err => {
      t.truthy(err);
      t.pass();
    });
});

test.serial('endSession | rejects if not provided anything', async t => {
  const { sdk } = mockApis();
  await sdk.initialize();
  await sdk.endSession()
    .then(() => {
      t.fail();
    })
    .catch(err => {
      t.truthy(err);
      t.pass();
    });
});

test.serial('endSession | rejects if the session is not found', async t => {
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
      t.fail();
    })
    .catch(err => {
      t.truthy(err);
      t.pass();
    });
});

test.serial('endSession | ends the session and rejects if there is an error fetching the conversation', async t => {
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
      t.fail();
    })
    .catch(err => {
      t.truthy(err);
      sinon.assert.calledOnce(mockSession.end);
    });
});

test.serial('endSession | terminates the session of the existing session has no conversationId', async t => {
  const sessionId = random();
  const conversationId = random();
  const participantId = random();
  const { sdk, getConversation } = mockApis({ conversationId, participantId });
  await sdk.initialize();

  const mockSession = { id: sessionId, end: sinon.stub() };
  sdk._sessionManager.sessions = {};
  sdk._sessionManager.sessions[sessionId] = mockSession;
  await sdk.endSession({ id: sessionId });
  t.throws(() => getConversation.done());
  sinon.assert.calledOnce(mockSession.end);
});

test.serial('disconnect | proxies the call to the streaming connection', async t => {
  const { sdk } = mockApis();
  await sdk.initialize();

  sdk._streamingConnection.disconnect = sinon.stub();

  sdk.disconnect();
  sinon.assert.calledOnce(sdk._streamingConnection.disconnect);
  t.plan(0);
});

test.serial('reconnect | proxies the call to the streaming connection', async t => {
  const { sdk } = mockApis();
  await sdk.initialize();

  sdk._streamingConnection.reconnect = sinon.stub();

  sdk.reconnect();
  sinon.assert.calledOnce(sdk._streamingConnection.reconnect);
  t.plan(0);
});

test.serial('_customIceServersConfig | gets reset if the client refreshes ice servers', async t => {
  const { sdk } = mockApis();
  await sdk.initialize();
  sdk._customIceServersConfig = [{ something: 'junk' }];

  sdk._streamingConnection.sessionManager = {
    iceServers: [{ urls: ['turn:mypurecloud.com'] }]
  };

  await sdk._streamingConnection.webrtcSessions.refreshIceServers();
  const actual = sdk._sessionManager.iceServers;
  t.deepEqual(actual, [
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

test.serial('onPendingSession | emits a pendingSession event and accepts the session', async t => {
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

  const sessionInfo = await pendingSession;
  t.is(sessionInfo.id, '1077');
  t.is(sessionInfo.conversationId, 'deadbeef-guid');
  t.is(sessionInfo.address, '+15558675309');
  t.is(sessionInfo.autoAnswer, true);
  sinon.assert.calledOnce(sdk.acceptPendingSession);
  sinon.assert.calledWithExactly(sdk.acceptPendingSession, '1077');
});

test.serial('onPendingSession | emits a pendingSession event but does not accept the session if autoAnswer is false', async t => {
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

  const sessionInfo = await pendingSession;
  t.is(sessionInfo.id, '1077');
  t.is(sessionInfo.conversationId, 'deadbeef-guid');
  t.is(sessionInfo.address, '+15558675309');
  t.is(sessionInfo.autoAnswer, false);
  sinon.assert.notCalled(sdk.acceptPendingSession);
});

class MockSession extends WildEmitter {
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
  stop () {}
}

class MockStream {
  constructor () {
    this._tracks = [ new MockTrack() ];
  }
  getTracks () {
    return this._tracks;
  }
}

test.serial('onSession | starts media, attaches it to the session, attaches it to the dom, accepts the session, and emits a started event', async t => {
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
  mockSession.streams = [ new MockStream() ];
  sandbox.stub(mockSession, 'addStream');
  sandbox.stub(mockSession, 'accept');

  sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
  await sessionStarted;

  mockSession._statsGatherer.emit('traces', { some: 'traces' });
  mockSession._statsGatherer.emit('stats', { some: 'stats' });
  sandbox.stub(mockSession._statsGatherer, 'collectInitialConnectionStats');
  mockSession.emit('change:active', mockSession, true);
  sinon.assert.calledOnce(mockSession._statsGatherer.collectInitialConnectionStats);

  sinon.assert.calledOnce(mockSession.addStream);
  sinon.assert.calledOnce(mockSession.accept);
  sinon.assert.calledOnce(global.window.navigator.mediaDevices.getUserMedia);

  const attachedAudioElement = await bodyAppend;
  t.is(attachedAudioElement.srcObject, mockSession.streams[0]);

  const sessionEnded = new Promise(resolve => sdk.on('sessionEnded', resolve));
  mockSession.emit('terminated', mockSession);
  mockSession.emit('change:active', mockSession, false);
  sinon.assert.calledOnce(mockSession._statsGatherer.collectInitialConnectionStats);
  await sessionEnded;

  sandbox.restore();
});

test.serial('onSession | uses existing media, attaches it to the session, attaches it to the dom in existing element when ready, and emits a started event', async t => {
  const mockOutboundStream = new MockStream();
  const mockAudioElement = { classList: { add () {} } };
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

  sinon.assert.calledOnce(mockSession.addStream);
  sinon.assert.calledWithExactly(mockSession.addStream, mockOutboundStream);
  sinon.assert.notCalled(mockSession.accept);
  sinon.assert.notCalled(global.window.navigator.mediaDevices.getUserMedia);

  const mockInboundStream = {};
  mockSession.emit('peerStreamAdded', mockSession, mockInboundStream);
  t.is(mockAudioElement.srcObject, mockInboundStream);
  sinon.assert.notCalled(global.document.body.append);

  const sessionEnded = new Promise(resolve => sdk.on('sessionEnded', resolve));
  mockSession._outboundStream = null;
  mockSession.emit('terminated', mockSession);
  await sessionEnded;

  sandbox.restore();
});

test.serial('onSession | uses existing media, attaches it to the session, attaches it to the dom in _pendingAudioElement element when ready, and emits a started event', async t => {
  const mockOutboundStream = new MockStream();
  const mockAudioElement = { classList: { add () {} } };
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

  sinon.assert.calledOnce(mockSession.addStream);
  sinon.assert.calledWithExactly(mockSession.addStream, mockOutboundStream);
  sinon.assert.notCalled(mockSession.accept);
  sinon.assert.notCalled(global.window.navigator.mediaDevices.getUserMedia);

  const mockInboundStream = {};
  mockSession.emit('peerStreamAdded', mockSession, mockInboundStream);
  t.is(mockAudioElement.srcObject, mockInboundStream);
  sinon.assert.notCalled(global.document.body.append);

  sandbox.restore();
});

test.serial('_refreshTurnServers | refreshes the turn servers', async t => {
  const { sdk } = mockApis();
  await sdk.initialize();

  sdk._streamingConnection.connected = true;
  t.true(sdk.connected);

  sinon.stub(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').returns(Promise.resolve());
  await sdk._refreshTurnServers();
  sinon.assert.calledOnce(sdk._streamingConnection._webrtcSessions.refreshIceServers);
  t.truthy(sdk._refreshTurnServersInterval);
});

test.serial('_refreshTurnServers | emits an error if there is an error refreshing turn servers', async t => {
  const { sdk } = mockApis();
  await sdk.initialize();

  sdk._streamingConnection.connected = true;
  t.true(sdk.connected);

  const promise = new Promise(resolve => sdk.on('error', resolve));
  sinon.stub(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').returns(Promise.reject(new Error('fail')));
  await sdk._refreshTurnServers();
  sinon.assert.calledOnce(sdk._streamingConnection._webrtcSessions.refreshIceServers);
  await promise;
});
