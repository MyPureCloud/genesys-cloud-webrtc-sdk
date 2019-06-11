'use strict';

const test = require('ava');
const sinon = require('sinon');
const nock = require('nock');
const WildEmitter = require('wildemitter');
const WebSocket = require('ws');

const PureCloudWebrtcSdk = require('../../src/client');

function random () {
  return `${Math.random()}`.split('.')[1];
}

const USER_ID = random();
const PARTICIPANT_ID = random();

const MOCK_USER = {
  id: USER_ID,
  chat: { jabberId: 'hubert.j.farnsworth@planetexpress.mypurecloud.com' }
};

const MOCK_ORG = {
  thirdPartyOrgId: '3000'
};

const MOCK_CONVERSATION = {
  participants: [
    {
      id: PARTICIPANT_ID,
      user: {
        id: USER_ID
      }
    },
    {
      id: random()
    }
  ]
};

function timeout (n) {
  return new Promise(resolve => setTimeout(resolve, n));
}

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

let wss;
let ws;
test.after(() => {
  wss.close();
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

function mockApis ({ failOrg, failUser, failStreaming, failLogs, failLogsPayload, withMedia, conversationId, participantId, withLogs } = {}) {
  nock.cleanAll();
  const api = nock('https://api.mypurecloud.com');

  // easy to debug nock
  // api.log(console.error);

  let getOrg;
  if (failOrg) {
    getOrg = api.get('/api/v2/organizations/me').reply(401);
  } else {
    getOrg = api.get('/api/v2/organizations/me').reply(200, MOCK_ORG);
  }

  let getUser;
  if (failUser) {
    getUser = api.get('/api/v2/users/me').reply(401);
  } else {
    getUser = api.get('/api/v2/users/me').reply(200, MOCK_USER);
  }

  const getChannel = api
    .post('/api/v2/notifications/channels?connectionType=streaming')
    .reply(200, { id: 'somechannelid' });

  const conversationsApi = nock('https://api.mypurecloud.com');
  let getConversation;
  if (conversationId) {
    getConversation = conversationsApi
      .get(`/api/v2/conversations/calls/${conversationId}`)
      .reply(200, MOCK_CONVERSATION);
  }

  let patchConversation;
  if (conversationId && participantId) {
    patchConversation = conversationsApi
      .patch(`/api/v2/conversations/calls/${conversationId}/participants/${participantId}`)
      .reply(202, {});
  }

  global.window = global.window || {};
  if (withMedia) {
    window.navigator = window.navigator || {};
    window.navigator.mediaDevices = window.navigator.mediaDevices || {};
    window.navigator.mediaDevices.getUserMedia = () => Promise.resolve(withMedia);
  }

  global.document = {
    createElement: sinon.stub().returns({
      addEventListener: (evt, callback) => setTimeout(callback, 10),
      classList: { add () {} }
    }),
    querySelector () {},
    body: {
      append () {}
    },
    head: {
      appendChild: sinon.stub().callsFake((script) => {
        global.window = global.window || {};
      })
    }
  };

  const sdk = new PureCloudWebrtcSdk({
    accessToken: '1234',
    wsHost: failStreaming ? null : 'ws://localhost:1234',
    logger: { debug () {}, log () {}, info () {}, warn () {}, error () {} }
    // logger: { debug () {}, log () {}, info () {}, warn: console.warn.bind(console), error: console.error.bind(console) }
  });

  let sendLogs;
  if (withLogs) {
    const logsApi = nock('https://api.mypurecloud.com').persist();

    if (failLogsPayload) {
      sendLogs = logsApi.post('/api/v2/diagnostics/trace').replyWithError({status: 413, message: 'test fail'});
    } else if (failLogs) {
      sendLogs = logsApi.post('/api/v2/diagnostics/trace').replyWithError({status: 419, message: 'test fail'});
    } else {
      sendLogs = logsApi.post('/api/v2/diagnostics/trace').reply(200);
    }
  } else {
    sdk._optOutOfTelemetry = true;
  }

  if (wss) {
    wss.close();
    wss = null;
  }

  wss = new WebSocket.Server({
    port: 1234
  });
  let websocket;
  wss.on('connection', function (ws) {
    websocket = ws;
    ws.on('message', function (msg) {
      // console.error('⬆️', msg);
      const send = function (r) {
        // console.error('⬇️', r);
        setTimeout(function () { ws.send(r); }, 15);
      };
      if (msg.indexOf('<open') === 0) {
        send('<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" xmlns:stream="http://etherx.jabber.org/streams" version="1.0" from="hawk" id="d6f681a3-358c-49df-819f-b231adb3cb97" xml:lang="en"></open>');
        if (ws.__authSent) {
          send(`<stream:features xmlns:stream="http://etherx.jabber.org/streams"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"></bind><session xmlns="urn:ietf:params:xml:ns:xmpp-session"></session></stream:features>`);
        } else {
          send('<stream:features xmlns:stream="http://etherx.jabber.org/streams"><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms></stream:features>');
        }
      } else if (msg.indexOf('<auth') === 0) {
        if (failStreaming) {
          send('<failure xmlns="urn:ietf:params:xml:ns:xmpp-sasl"></failure>');
        } else {
          send('<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"></success>');
        }
        ws.__authSent = true;
      } else if (msg.indexOf('<bind') !== -1) {
        const idRegexp = /id="(.*?)"/;
        const id = idRegexp.exec(msg)[1];
        send(`<iq xmlns="jabber:client" id="${id}" to="${MOCK_USER.chat.jabberId}" type="result"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>${MOCK_USER.chat.jabberId}/d6f681a3-358c-49df-819f-b231adb3cb97</jid></bind></iq>`);
      } else if (msg.indexOf('<session') !== -1) {
        const idRegexp = /id="(.*?)"/;
        const id = idRegexp.exec(msg)[1];
        send(`<iq xmlns="jabber:client" id="${id}" to="${MOCK_USER.chat.jabberId}/d6f681a3-358c-49df-819f-b231adb3cb97" type="result"></iq>`);
      } else if (msg.indexOf('ping') !== -1) {
        const idRegexp = /id="(.*?)"/;
        const id = idRegexp.exec(msg)[1];
        send(`<iq xmlns="jabber:client" to="${MOCK_USER.chat.jabberId}" type="result" id="${id}"></iq>`);
      } else if (msg.indexOf('extdisco') !== -1) {
        const idRegexp = / id="(.*?)"/;
        const id = idRegexp.exec(msg)[1];
        if (msg.indexOf('type="turn"') > -1) {
          send(`<iq xmlns="jabber:client" type="result" to="${MOCK_USER.chat.jabberId}" id="${id}"><services xmlns="urn:xmpp:extdisco:1"><service transport="udp" port="3456" type="turn" username="turnuser:12395" password="akskdfjka=" host="turn.us-east-1.mypurecloud.com"/></services></iq>`);
        } else {
          send(`<iq xmlns="jabber:client" type="result" to="${MOCK_USER.chat.jabberId}" id="${id}"><services xmlns="urn:xmpp:extdisco:1"><service transport="udp" port="3456" type="stun" host="turn.us-east-1.mypurecloud.com"/></services></iq>`);
        }
      }
    });
  });
  global.window.WebSocket = WebSocket;
  ws = websocket;

  return { getOrg, getUser, getChannel, getConversation, sendLogs, patchConversation, sdk, websocket };
}

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

test.serial('_log | will not notify logs if the logLevel is lower than configured', async t => {
  const { sdk } = mockApis({ withLogs: true });
  sdk._logLevel = 'warn';
  await sdk.initialize();
  sinon.stub(sdk, '_notifyLogs');
  sdk._log('debug', 'test', { details: 'etc' });
  sinon.assert.notCalled(sdk._notifyLogs);
});

test.serial('_log | will not notify logs if opted out', async t => {
  const { sdk } = mockApis({ withLogs: true });
  sdk._logLevel = 'debug';
  sdk._optOutOfTelemetry = true;
  await sdk.initialize();
  sinon.stub(sdk, '_notifyLogs');
  sdk._log('warn', 'test', { details: 'etc' });
  sinon.assert.notCalled(sdk._notifyLogs);
});

test.serial('_log | will buffer a log and notify it if the logLevel is gte configured', async t => {
  const { sdk } = mockApis({ withLogs: true });
  sdk._logLevel = 'warn';
  await sdk.initialize();
  sinon.stub(sdk, '_notifyLogs');
  console.log(sdk._logBuffer[0]);
  t.is(sdk._logBuffer.length, 0);
  sdk._log('warn', 'test', { details: 'etc' });
  sinon.assert.calledOnce(sdk._notifyLogs);
  t.is(sdk._logBuffer.length, 1);
});

test.serial('_notifyLogs | will debounce logs and only send logs once at the end', async t => {
  const { sdk } = mockApis({ withLogs: true });
  sdk._logLevel = 'warn';
  await sdk.initialize();
  sinon.stub(sdk, '_sendLogs');
  t.is(sdk._logBuffer.length, 0);
  sdk._log('warn', 'test', { details: 'etc' });
  sinon.assert.notCalled(sdk._sendLogs);
  for (let i = 1; i < 6; i++) {
    await timeout(100 * i);
    sdk._log('warn', 'test' + i);
  }
  sinon.assert.notCalled(sdk._sendLogs);
  t.is(sdk._logBuffer.length, 6);
  await timeout(1100);
  sinon.assert.calledOnce(sdk._sendLogs);
});

test.serial('_sendLogs | resets all flags related to backoff on success', async t => {
  const { sdk } = mockApis({ withLogs: true });
  sdk._logLevel = 'warn';
  await sdk.initialize();

  sdk._backoffActive = true;
  sdk._failedLogAttempts = 2;
  sdk._reduceLogPayload = true;
  sdk._logBuffer.push('log1');

  await sdk._sendLogs();
  t.is(sdk._backoffActive, false);
  t.is(sdk._failedLogAttempts, 0);
  t.is(sdk._reduceLogPayload, false);
});

test.serial('_sendLogs | resets the backoff on success', async t => {
  const { sdk } = mockApis({ withLogs: true });
  sdk._logLevel = 'warn';
  await sdk.initialize();

  const backoffResetSpy = sinon.spy(sdk._backoff, 'reset');
  sdk._logBuffer.push('log1');
  sdk._logBuffer.push('log1');

  await sdk._sendLogs();
  sinon.assert.calledOnce(backoffResetSpy);
});

test.serial('_sendLogs | should call backoff.backoff() again if there are still items in the _logBuffer after a successfull call to api', async t => {
  const { sdk } = mockApis({ withLogs: true });
  sdk._logLevel = 'warn';
  await sdk.initialize();

  const backoffSpy = sinon.spy(sdk._backoff, 'backoff');
  sdk._reduceLogPayload = true;
  sdk._logBuffer.push('log1');
  sdk._logBuffer.push('log2');
  sdk._logBuffer.push('log3');
  sdk._logBuffer.push('log4');

  await sdk._sendLogs();
  sinon.assert.calledOnce(backoffSpy);
});

test.serial('_sendLogs | will add logs back to buffer if request fails', async t => {
  const expectedFirstLog = 'log1';
  const expectedSecondLog = 'log2';
  const expectedThirdLog = 'log3';
  let { sdk } = mockApis({failLogs: true, withLogs: true});
  sdk._logLevel = 'warn';
  await sdk.initialize();

  t.is(sdk._logBuffer.length, 0);
  sdk._logBuffer.push(expectedFirstLog);
  sdk._logBuffer.push(expectedSecondLog);
  sdk._logBuffer.push(expectedThirdLog);

  await sdk._sendLogs();

  t.is(sdk._logBuffer.length, 3);
  t.is(sdk._logBuffer[0], expectedFirstLog, 'Log items should be put back into the buffer the same way they went out');
  t.is(sdk._logBuffer[1], expectedSecondLog, 'Log items should be put back into the buffer the same way they went out');
  t.is(sdk._logBuffer[2], expectedThirdLog, 'Log items should be put back into the buffer the same way they went out');
  sdk.logBuffer = [];
  sdk._optOutOfTelemetry = true;
});

test.serial('_sendLogs | increments _failedLogAttemps on failure', async t => {
  const { sdk } = mockApis({failLogsPayload: true, withLogs: true});
  sdk._logLevel = 'warn';
  await sdk.initialize();
  t.is(sdk._logBuffer.length, 0);
  sdk._logBuffer.push('log1');
  sdk._logBuffer.push('log2');
  t.is(sdk._failedLogAttempts, 0);

  await sdk._sendLogs();
  t.is(sdk._failedLogAttempts, 1);
});

test.serial('_sendLogs | sets _reduceLogPayload to true if error status is 413 (payload too large)', async t => {
  const { sdk } = mockApis({failLogsPayload: true, withLogs: true});
  sdk._logLevel = 'warn';
  await sdk.initialize();
  t.is(sdk._logBuffer.length, 0);
  sdk._logBuffer.push('log1');
  sdk._logBuffer.push('log2');
  t.is(sdk._reduceLogPayload, false);

  await sdk._sendLogs();
  t.is(sdk._reduceLogPayload, true);
});

test.serial('_sendLogs | should reset all backoff flags and reset the backoff if api request returns error and payload was only 1 log', async t => {
  const { sdk } = mockApis({failLogsPayload: true, withLogs: true});
  sdk._logLevel = 'warn';
  await sdk.initialize();
  sdk._logBuffer.push('log1');
  const backoffResetSpy = sinon.spy(sdk._backoff, 'reset');

  await sdk._sendLogs();
  t.is(sdk._backoffActive, false);
  t.is(sdk._failedLogAttempts, 0);
  t.is(sdk._reduceLogPayload, false);
  sinon.assert.calledOnce(backoffResetSpy);
});

test.serial('_sendLogs | set backoffActive to false if the backoff fails', async t => {
  const { sdk } = mockApis({failLogs: true, withLogs: true});
  sdk._logLevel = 'warn';
  sinon.spy(sdk, '_sendLogs');
  await sdk.initialize();
  sdk._log('error', 'log1');
  sdk._log('error', 'log2');

  sdk._backoff.failAfter(1); // means it will retry once, or 2 tries total

  sdk._notifyLogs();
  sdk._notifyLogs();
  await timeout(1000);
  sdk._notifyLogs();
  await timeout(5000);
  sinon.assert.calledTwice(sdk._sendLogs);
  t.is(sdk._backoffActive, false);
});

test.serial('_getLogPayload | returns the entire _logBuffer if _reduceLogPayload is false', async t => {
  const { sdk } = mockApis({ withLogs: true });
  await sdk.initialize();
  sdk._reduceLogPayload = false;
  sdk._logBuffer = [0, 1, 2, 3, 4];

  const result = sdk._getLogPayload();

  t.is(result.length, 5);
  t.is(result[0], 0);
  t.is(result[1], 1);
  t.is(result[2], 2);
  t.is(result[3], 3);
  t.is(result[4], 4);
  t.is(sdk._logBuffer.length, 0, 'Items should have been removed from _logBuffer');
});

test.serial('_getLogPayload | returns part of _logBuffer if _reduceLogPayload is true', async t => {
  const { sdk } = mockApis({ withLogs: true });
  await sdk.initialize();
  sdk._reduceLogPayload = true;
  sdk._failedLogAttempts = 1;
  sdk._logBuffer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  const result = sdk._getLogPayload();

  t.is(result.length, 5);
  t.is(result[0], 0);
  t.is(result[1], 1);
  t.is(result[2], 2);
  t.is(result[3], 3);
  t.is(result[4], 4);

  t.is(sdk._logBuffer.length, 5, 'Items should have been removed from _logBuffer');
  t.is(sdk._logBuffer[0], 5);
  t.is(sdk._logBuffer[1], 6);
  t.is(sdk._logBuffer[2], 7);
  t.is(sdk._logBuffer[3], 8);
  t.is(sdk._logBuffer[4], 9);
});

test.serial('_getLogPayload | returns part of _logBuffer if _reduceLogPayload is true and _failedLogAttempts is 0', async t => {
  const { sdk } = mockApis({ withLogs: true });
  await sdk.initialize();
  sdk._reduceLogPayload = true;
  sdk._failedLogAttempts = 0;
  sdk._logBuffer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  const result = sdk._getLogPayload();

  t.is(result.length, 5);
  t.is(result[0], 0);
  t.is(result[1], 1);
  t.is(result[2], 2);
  t.is(result[3], 3);
  t.is(result[4], 4);

  t.is(sdk._logBuffer.length, 5, 'Items should have been removed from _logBuffer');
  t.is(sdk._logBuffer[0], 5);
  t.is(sdk._logBuffer[1], 6);
  t.is(sdk._logBuffer[2], 7);
  t.is(sdk._logBuffer[3], 8);
  t.is(sdk._logBuffer[4], 9);
});

test.serial('_resetBackoffFlags | should reset values of _backoffActive, _failedLogAttempts, and _reduceLogPaylod', async t => {
  const { sdk } = mockApis({ withLogs: true });
  await sdk.initialize();
  sdk._backoffActive = true;
  sdk._failedLogAttempts = 3;
  sdk._reduceLogPayload = true;

  sdk._resetBackoffFlags();

  t.is(sdk._backoffActive, false);
  t.is(sdk._failedLogAttempts, 0);
  t.is(sdk._reduceLogPayload, false);
});

test.serial('_getReducedLogPayload | should return at least one log item', async t => {
  const { sdk } = mockApis({ withLogs: true });
  await sdk.initialize();

  sdk._logBuffer = [1, 2, 3, 4, 5];
  const result = sdk._getReducedLogPayload(6);

  t.is(result.length, 1);
});

test.serial('_getReducesLogPayload | should remove items from _logBuffer and return them', async t => {
  const { sdk } = mockApis({ withLogs: true });
  await sdk.initialize();

  sdk._logBuffer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const result = sdk._getReducedLogPayload(1);

  t.is(result.length, 5);
  t.is(result[0], 0);
  t.is(result[1], 1);
  t.is(result[2], 2);
  t.is(result[3], 3);
  t.is(result[4], 4);

  t.is(sdk._logBuffer.length, 5, 'Items should have been removed from the _logBuffer');
  t.is(sdk._logBuffer[0], 5);
  t.is(sdk._logBuffer[1], 6);
  t.is(sdk._logBuffer[2], 7);
  t.is(sdk._logBuffer[3], 8);
  t.is(sdk._logBuffer[4], 9);
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
