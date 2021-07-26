import WebSocket from 'ws';
import nock from 'nock';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { MockStream, random } from './test-utils';
import { GenesysCloudWebrtcSdk, ICustomerData, ISdkConfig } from '../src';

declare var global: {
  window: any,
  document: any,
  crypto: any
} & NodeJS.Global;

interface MockParticipant {
  id: string;
  state?: string;
  user?: {
    id: string
  };
}

interface MockConversation {
  participants: MockParticipant[];
}

interface MockApiOptions {
  failSecurityCode?: boolean;
  failOrg?: boolean;
  failUser?: boolean;
  failConversationPatch?: boolean;
  failStreaming?: boolean;
  failLogs?: boolean;
  failLogsPayload?: boolean;
  withMedia?: MockStream;
  conversationId?: string;
  participantId?: string;
  withLogs?: boolean;
  guestSdk?: boolean;
  withCustomerData?: boolean;
  conversation?: MockConversation;
}

interface MockSingleApiOptions {
  nockScope: nock.Scope;
  response?: any;
  conversationId?: string;
  participantId?: string;
  shouldFail?: Boolean;
}

interface MockApiReturns {
  getOrg: nock.Scope;
  getUser: nock.Scope;
  getConversation: nock.Scope;
  getChannel: nock.Scope;
  notificationSubscription: nock.Scope;
  getJwt: nock.Scope;
  sendLogs: nock.Scope;
  patchConversation: nock.Scope;
  sdk: GenesysCloudWebrtcSdk;
  mockCustomerData: ICustomerData;
  postConversation: nock.Scope;
}

// polyfill window.getRandomValues() for node (because we are using jest)
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: function (rawBytes: Uint8Array) {
      const buffer = crypto.randomBytes(rawBytes.length);
      for (let i = 0; i < rawBytes.length; i++) {
        rawBytes[i] = buffer[i];
      }
    }
  }
});


let wss: WebSocket.Server;
let ws: WebSocket;


const USER_ID = random();
const PARTICIPANT_ID = random();
const PARTICIPANT_ID_2 = random();

const MOCK_USER = {
  id: USER_ID,
  chat: { jabberId: 'hubert.j.farnsworth@planetexpress.mypurecloud.com' }
};

export const MOCK_CUSTOMER_DATA = {
  sourceCommunicationId: 'source-123567-1234',
  conversation: {
    id: 'conversation-aedvi38t5nbia-123'
  },
  jwt: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjE1YzFiNmIwLWQ4NDUtNDgzOS1hYWVmLWQwNTc0ZTQ5OGM0OSIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImppZCI6ImFjZC1jMjAxNjVkNS1hNDdmLTQzOTctYjlmMy03MjM3ZDI5YWJmZTAtNTQzMTcyQGNvbmZlcmVuY2UuVEVTVC12YWx2ZS0xeW0zN21qMWthby5vcmdzcGFuLmNvbSJ9LCJleHAiOjE1NjM2NDk0MTAsImlhdCI6MTU2MzU2NDM1MiwiaXNzIjoidXJuOnB1cmVjbG91ZDpjb252ZXJzYXRpb24iLCJvcmciOiI4MDg4MzMzMy04NjE3LTQ3MmYtODI3NC01OGQ1YjlhMTAwMzMifQ.ECYnVhuPvxtuapsmf_usB0FhX3PQ6taiFsJA-7TQqpfNWvBhXqxImPcM1UPV4PW23bBYsSFyxivANL5AGOeNpC4lBIO_O_ENfR2iziFZz5SqIY9tksxqTsEgq_b5D2VlQuGNC-xfNy7dK-TzjrA8ySHG_iSWD-MZ2M2vx8J5nW1BD8uoc9LtTYaldLCDi0IVfoPE-qMCYp53VxeN4XPGTFO7ULvgIfXmNImvSSDcEDXorrUs6N4ocaANdpFL1EYUbCL_EzvkjZ3tb5FT3GoGC6uFNgOJtRp69uB7TLmacnKGrRxI3v3sNkERiSqzvXSpB6-PI74pP3cEd1L9IlnyiA'
};

const MOCK_ORG = {
  thirdPartyOrgId: '3000'
};

const MOCK_CONVERSATION: MockConversation = {
  participants: [
    {
      id: PARTICIPANT_ID,
      state: 'connected',
      user: {
        id: USER_ID
      }
    },
    {
      id: random()
    }
  ]
};

function getMockConversation (): MockConversation {
  return JSON.parse(JSON.stringify(MOCK_CONVERSATION));
}

export function createNock (hostUri?: string): nock.Scope {
  return nock(hostUri || 'https://api.mypurecloud.com');
}

export function mockGetConversationApi (params: MockSingleApiOptions): nock.Scope {
  const intercept = params.nockScope.get(`/api/v2/conversations/calls/${params.conversationId}`);

  if (params.shouldFail) {
    return intercept.reply(500, params.response);
  }

  return intercept.reply(200, params.response || getMockConversation());
}

export function mockPatchConversationApi (params: MockSingleApiOptions): nock.Scope {
  const intercept = params.nockScope.patch(`/api/v2/conversations/calls/${params.conversationId}/participants/${params.participantId}`);

  if (params.shouldFail) {
    return intercept.reply(401);
  }
  return intercept.reply(202, {});
}

export function mockPostConversationApi (params: MockSingleApiOptions): nock.Scope {
  const intercept = params.nockScope.post(`/api/v2/conversations/calls`);

  if (params.shouldFail) {
    return intercept.reply(401);
  }

  return intercept.reply(202, params.response);
}

export function mockGetOrgApi (params: MockSingleApiOptions): nock.Scope {
  const intercept = params.nockScope.get(`/api/v2/organizations/me`);

  if (params.shouldFail) {
    return intercept.reply(401);
  }
  return intercept.reply(200, MOCK_ORG);
}

export function mockGetUserApi (params: MockSingleApiOptions): nock.Scope {
  const intercept = params.nockScope.get(`/api/v2/users/me`);

  if (params.shouldFail) {
    return intercept.reply(401);
  }
  return intercept.reply(200, MOCK_USER);
}

export function mockGetChannelApi (params: MockSingleApiOptions): nock.Scope {
  const intercept = params.nockScope.post(`/api/v2/notifications/channels?connectionType=streaming`);

  if (params.shouldFail) {
    return intercept.reply(401);
  }
  return intercept.reply(200, { id: 'somechannelid' });
}

export function mockNotificationSubscription (params: MockSingleApiOptions): nock.Scope {
  const intercept = params.nockScope.put(`/api/v2/notifications/channels/somechannelid/subscriptions`);
  return intercept.reply(200);
}

export function closeWebSocketServer (): Promise<void> {
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
    failConversationPatch,
    failStreaming,
    failLogs,
    failLogsPayload,
    withMedia,
    conversationId,
    participantId,
    withLogs,
    guestSdk,
    withCustomerData,
    conversation
  } = options;
  nock.cleanAll();
  const api = nock('https://api.mypurecloud.com');

  // easy to debug nock
  // api.log(console.error);

  const mockCustomerData: ICustomerData = withCustomerData ? MOCK_CUSTOMER_DATA : null;

  let getJwt: nock.Scope;
  let getOrg: nock.Scope;
  let getUser: nock.Scope;
  let getChannel: nock.Scope;
  let notificationSubscription: nock.Scope;

  if (guestSdk) {
    if (failSecurityCode) {
      getJwt = api.post('/api/v2/conversations/codes').reply(401);
    } else {
      getJwt = api.post('/api/v2/conversations/codes').reply(200, MOCK_CUSTOMER_DATA);
    }

    // getChannel = api
    //   .post('/api/v2/stream/jwt')
    //   .reply(200, { id: 'someguestchangeid' });

  } else {
    getOrg = mockGetOrgApi({ nockScope: api, shouldFail: failOrg });
    getUser = mockGetUserApi({ nockScope: api, shouldFail: failUser });
    getChannel = mockGetChannelApi({ nockScope: api });
    notificationSubscription = mockNotificationSubscription({ nockScope: api });
  }

  const conversationsApi = nock('https://api.mypurecloud.com');
  let getConversation: nock.Scope;
  if (conversationId) {
    getConversation = mockGetConversationApi({ conversationId, response: conversation, nockScope: conversationsApi });
  }

  let patchConversation: nock.Scope;
  if (conversationId && participantId) {
    patchConversation = mockPatchConversationApi({ conversationId, nockScope: conversationsApi, participantId, shouldFail: failConversationPatch });
  }

  let postConversation = mockPostConversationApi({ nockScope: conversationsApi });
  Object.defineProperty(global, 'window', { value: global.window || {}, writable: true });

  Object.defineProperty(window, 'MediaStream', { value: MockStream, writable: true });
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
    logger: { debug: jest.fn(), log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    // logger: { debug () { }, log () { }, info () { }, warn: console.warn.bind(console), error: console.error.bind(console) }
  } as ISdkConfig;

  const sdk = new GenesysCloudWebrtcSdk(sdkOpts);

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
    sdk._config.optOutOfTelemetry = true;
  }

  setupWss({ guestSdk, failStreaming });

  return { getOrg, getUser, getChannel, getConversation, getJwt, sendLogs, patchConversation, sdk, mockCustomerData, notificationSubscription, postConversation };
}

function setupWss (opts: { guestSdk?: boolean, failStreaming?: boolean } = {}) {
  if (wss) {
    wss.close();
    wss = null;
  }
  wss = new WebSocket.Server({
    port: 1234
  });

  let openSockets = 0;
  const hash = random().toString().substr(0, 4);

  const log = (direction: 'IN' | 'OUT', message: string) => {
    /* this function can be useful for debugging WS messages */
    return;
    const fileName = path.resolve('test/unit', './test-log.json');

    if (!fs.existsSync(fileName)) {
      fs.writeFileSync(fileName, '{}');
    }

    const file = fs.readFileSync(fileName);
    const contents = file.toString();

    let json = JSON.parse(contents || '{}');
    let key = openSockets + '-' + hash;

    if (direction === 'IN' && message.startsWith('<open')) {
      key = ++openSockets + '-' + hash;
      json[key] = [];
    }

    json[key].push({ direction, message });
    fs.writeFileSync(fileName, JSON.stringify(json));
  };

  wss.on('connection', function (websocket: WebSocket & { __authSent: boolean }) {
    ws = websocket;
    ws.on('message', function (msg: string) {
      log('IN', msg);
      // console.error('⬆️', msg);
      const send = function (r) {
        // console.error('⬇️', r);
        setTimeout(function () {
          log('OUT', r);
          ws.send(r);
        }, 15);
      };
      if (msg.indexOf('<open') === 0) {
        send('<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" xmlns:stream="http://etherx.jabber.org/streams" version="1.0" from="hawk" id="d6f681a3-358c-49df-819f-b231adb3cb97" xml:lang="en"></open>');
        if (websocket.__authSent) {
          send(`<stream:features xmlns:stream="http://etherx.jabber.org/streams"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"></bind><session xmlns="urn:ietf:params:xml:ns:xmpp-session"></session></stream:features>`);
        } else {
          if (opts.guestSdk) {
            send('<stream:features xmlns:stream="http://etherx.jabber.org/streams"><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>ANONYMOUS</mechanism></mechanisms></stream:features>');
          } else {
            send('<stream:features xmlns:stream="http://etherx.jabber.org/streams"><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms></stream:features>');
          }
        }
      } else if (msg.indexOf('<auth') === 0) {
        if (opts.failStreaming) {
          send('<failure xmlns="urn:ietf:params:xml:ns:xmpp-sasl"></failure>');
        } else {
          send('<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"></success>');
        }
        websocket.__authSent = true;
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
      } else if (msg.indexOf('<pubsub') !== -1){
        const idRegexp = /id="(.*?)"/;
        const id = idRegexp.exec(msg)[1];
        send(`<iq xmlns="jabber:client" id="${id}" to="${MOCK_USER.chat.jabberId}" type="result"><pubsub xmlns="http://jabber.org/protocol/pubsub">
        <subscription node="v2.users.1c280af5-c623-4a5b-bf00-aafa7f6c0a03.conversations" jid="601d95fb6c8be51b97b54089@genesys.orgspan.com/mediahelper_0bd8f077-b2ec-43f5-9764-04f683c78d77" subscription="subscribed" /></pubsub></iq>`);
      } else if (msg.indexOf('extdisco') !== -1) {
        const idRegexp = / id="(.*?)"/;
        const id = idRegexp.exec(msg)[1];
        if (msg.indexOf('type="turn"') > -1) {
          send(`<iq xmlns="jabber:client" type="result" to="${MOCK_USER.chat.jabberId}" id="${id}"><services xmlns="urn:xmpp:extdisco:1"><service transport="udp" port="3456" type="turn" username="turnuser:12395" password="akskdfjka=" host="turn.us-east-1.mypurecloud.com"/></services></iq>`);
        } else {
          send(`<iq xmlns="jabber:client" type="result" to="${MOCK_USER.chat.jabberId}" id="${id}"><services xmlns="urn:xmpp:extdisco:1"><service transport="udp" port="3456" type="stun" host="turn.us-east-1.mypurecloud.com"/></services></iq>`);
        }
      } else if (msg.indexOf('<close') === 0) {
        send(`<close xmlns="urn:ietf:params:xml:ns:xmpp-framing" version="1.0"></close>`);
        ws.close();
      } else {
        console.warn('Incoming stanza that does not have a test handler to send a response', msg);
      }
    });
  });
  Object.defineProperty(global.window, 'WebSocket', { value: WebSocket, writable: true });
}

export {
  mockApis,
  setupWss,
  wss,
  ws,
  getMockConversation,
  USER_ID,
  PARTICIPANT_ID,
  PARTICIPANT_ID_2,
};
