import WebSocket from 'ws';
import nock from 'nock';
import WildEmitter from 'wildemitter';
import PureCloudWebrtcSdk from '../src/client';
import { SdkConstructOptions } from '../src/types/interfaces';

declare var global: {
  window: any,
  document: any
} & NodeJS.Global;

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

interface MockApiOptions {
  failSecurityCode?: boolean;
  failOrg?: boolean;
  failUser?: boolean;
  failStreaming?: boolean;
  failLogs?: boolean;
  failLogsPayload?: boolean;
  withMedia?: MockStream;
  conversationId?: string;
  participantId?: string;
  withLogs?: boolean;
  guestSdk?: boolean;
}

interface MockApiReturns {
  getOrg: nock.Scope;
  getUser: nock.Scope;
  getConversation: nock.Scope;
  getChannel: nock.Scope;
  getJwt: nock.Scope;
  sendLogs: nock.Scope;
  patchConversation: nock.Scope;
  sdk: PureCloudWebrtcSdk;
  websocket: WebSocket;
}

let wss: WebSocket.Server;
let ws: WebSocket;

function random (): string {
  return `${Math.random()}`.split('.')[1];
}

function timeout (n: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, n));
}

const USER_ID = random();
const PARTICIPANT_ID = random();

const MOCK_USER = {
  id: USER_ID,
  chat: { jabberId: 'hubert.j.farnsworth@planetexpress.mypurecloud.com' }
};

const MOCK_JWT = { jwt: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjE1YzFiNmIwLWQ4NDUtNDgzOS1hYWVmLWQwNTc0ZTQ5OGM0OSIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImppZCI6ImFjZC1jMjAxNjVkNS1hNDdmLTQzOTctYjlmMy03MjM3ZDI5YWJmZTAtNTQzMTcyQGNvbmZlcmVuY2UuVEVTVC12YWx2ZS0xeW0zN21qMWthby5vcmdzcGFuLmNvbSJ9LCJleHAiOjE1NjM2NDk0MTAsImlhdCI6MTU2MzU2NDM1MiwiaXNzIjoidXJuOnB1cmVjbG91ZDpjb252ZXJzYXRpb24iLCJvcmciOiI4MDg4MzMzMy04NjE3LTQ3MmYtODI3NC01OGQ1YjlhMTAwMzMifQ.ECYnVhuPvxtuapsmf_usB0FhX3PQ6taiFsJA-7TQqpfNWvBhXqxImPcM1UPV4PW23bBYsSFyxivANL5AGOeNpC4lBIO_O_ENfR2iziFZz5SqIY9tksxqTsEgq_b5D2VlQuGNC-xfNy7dK-TzjrA8ySHG_iSWD-MZ2M2vx8J5nW1BD8uoc9LtTYaldLCDi0IVfoPE-qMCYp53VxeN4XPGTFO7ULvgIfXmNImvSSDcEDXorrUs6N4ocaANdpFL1EYUbCL_EzvkjZ3tb5FT3GoGC6uFNgOJtRp69uB7TLmacnKGrRxI3v3sNkERiSqzvXSpB6-PI74pP3cEd1L9IlnyiA' };

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

function closeWebSocketServer (): Promise<void> {
  if (wss) {
    return new Promise(resolve => {
      wss.clients.forEach(wsClient => wsClient.close());
      wss.close(() => {
        console.log('Closed the server...');
        resolve();
      });
    });
  }
  return Promise.resolve();
}

function mockApis (options: MockApiOptions = {}): MockApiReturns {
  const {
    failSecurityCode,
    failOrg,
    failUser,
    failStreaming,
    failLogs,
    failLogsPayload,
    withMedia,
    conversationId,
    participantId,
    withLogs,
    guestSdk
  } = options;
  nock.cleanAll();
  const api = nock('https://api.mypurecloud.com');

  // easy to debug nock
  // api.log(console.error);

  let getJwt: nock.Scope;
  let getOrg: nock.Scope;
  let getUser: nock.Scope;
  let getChannel: nock.Scope;

  if (guestSdk) {
    if (failSecurityCode) {
      getJwt = api.post('/api/v2/conversations/codes').reply(401);
    } else {
      getJwt = api.post('/api/v2/conversations/codes').reply(200, MOCK_JWT);
    }
  } else {
    if (failOrg) {
      getOrg = api.get('/api/v2/organizations/me').reply(401);
    } else {
      getOrg = api.get('/api/v2/organizations/me').reply(200, MOCK_ORG);
    }

    if (failUser) {
      getUser = api.get('/api/v2/users/me').reply(401);
    } else {
      getUser = api.get('/api/v2/users/me').reply(200, MOCK_USER);
    }

    getChannel = api
      .post('/api/v2/notifications/channels?connectionType=streaming')
      .reply(200, { id: 'somechannelid' });
  }

  const conversationsApi = nock('https://api.mypurecloud.com');
  let getConversation: nock.Scope;
  if (conversationId) {
    getConversation = conversationsApi
      .get(`/api/v2/conversations/calls/${conversationId}`)
      .reply(200, MOCK_CONVERSATION);
  }

  let patchConversation: nock.Scope;
  if (conversationId && participantId) {
    patchConversation = conversationsApi
      .patch(`/api/v2/conversations/calls/${conversationId}/participants/${participantId}`)
      .reply(202, {});
  }

  Object.defineProperty(global, 'window', { value: global.window || {}, writable: true });
  Object.defineProperty(window.navigator, 'mediaDevices', { value: window.navigator.mediaDevices || {}, writable: true });
  Object.defineProperty(window.navigator.mediaDevices, 'getDisplayMedia', { value: () => Promise.resolve(), writable: true });

  if (withMedia) {
    Object.defineProperty(window, 'navigator', { value: window.navigator || {}, writable: true });
    Object.defineProperty(window.navigator, 'mediaDevices', { value: window.navigator.mediaDevices || {}, writable: true });
    Object.defineProperty(window.navigator.mediaDevices, 'getUserMedia', { value: () => Promise.resolve(withMedia), writable: true });

    Object.defineProperty(window.navigator.mediaDevices, 'getDisplayMedia', { value: () => Promise.resolve(withMedia), writable: true });
  }
  let sdkOpts = {
    accessToken: guestSdk ? undefined : '1234',
    organizationId: '4589546-12349vn4-2345',
    wsHost: failStreaming ? null : 'ws://localhost:1234',
    logger: { debug () { }, log () { }, info () { }, warn () { }, error () { } }
    // logger: { debug () { }, log () { }, info () { }, warn: console.warn.bind(console), error: console.error.bind(console) }
  } as SdkConstructOptions;

  const sdk = new PureCloudWebrtcSdk(sdkOpts);

  let sendLogs: nock.Scope;
  if (withLogs) {
    const logsApi = nock('https://api.mypurecloud.com').persist();

    if (failLogsPayload) {
      sendLogs = logsApi.post('/api/v2/diagnostics/trace').replyWithError({ status: 413, message: 'test fail' });
    } else if (failLogs) {
      sendLogs = logsApi.post('/api/v2/diagnostics/trace').replyWithError({ status: 419, message: 'test fail' });
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
  let websocket: WebSocket;

  wss.on('connection', function (ws: WebSocket & { __authSent: boolean }) {
    websocket = ws;
    ws.on('message', function (msg: string) {
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
          if (guestSdk) {
            send('<stream:features xmlns:stream="http://etherx.jabber.org/streams"><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>ANONYMOUS</mechanism></mechanisms></stream:features>');
          } else {
            send('<stream:features xmlns:stream="http://etherx.jabber.org/streams"><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms></stream:features>');
          }
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
  Object.defineProperty(global.window, 'WebSocket', { value: WebSocket, writable: true });
  ws = websocket;

  return { getOrg, getUser, getChannel, getConversation, getJwt, sendLogs, patchConversation, sdk, websocket };
}

export {
  mockApis,
  wss,
  ws,
  random,
  timeout,
  closeWebSocketServer,
  PARTICIPANT_ID,
  MockSession,
  MockStream,
  MockTrack
};
