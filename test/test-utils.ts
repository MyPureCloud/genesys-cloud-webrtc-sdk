import WebSocket from 'ws';
import nock from 'nock';
import PureCloudWebrtcSdk from '../src/client';
import { SdkConstructOptions } from '../src/types/interfaces';

declare var global: {
  window: any,
  document: any
} & NodeJS.Global;

let wss;
let ws;

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

function mockApis ({ failOrg, failUser, failStreaming, failLogs, failLogsPayload, withMedia, conversationId, participantId, withLogs }: any = {}) {
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

  // global.window = global.window || {};
  Object.defineProperty(global, 'window', { value: global.window || {}, writable: true });

  if (withMedia) {
    // (window.navigator as any) = window.navigator || {};
    Object.defineProperty(window, 'navigator', { value: window.navigator || {}, writable: true });
    // (window.navigator.mediaDevices as any) = window.navigator.mediaDevices || {};
    Object.defineProperty(window.navigator, 'mediaDevices', { value: window.navigator.mediaDevices || {}, writable: true });
    // window.navigator.mediaDevices.getUserMedia = () => Promise.resolve(withMedia);
    Object.defineProperty(window.navigator.mediaDevices, 'getUserMedia', { value: () => Promise.resolve(withMedia), writable: true });
  }

  const sdk = new PureCloudWebrtcSdk({
    accessToken: '1234',
    wsHost: failStreaming ? null : 'ws://localhost:1234',
    logger: { debug () { }, log () { }, info () { }, warn () { }, error () { } }
    // logger: { debug () {}, log () {}, info () {}, warn: console.warn.bind(console), error: console.error.bind(console) }
  } as SdkConstructOptions);

  let sendLogs;
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
  // global.window.WebSocket = WebSocket;
  Object.defineProperty(global.window, 'WebSocket', { value: WebSocket, writable: true });
  ws = websocket;

  return { getOrg, getUser, getChannel, getConversation, sendLogs, patchConversation, sdk, websocket };
}

export {
  mockApis,
  wss,
  ws,
  random,
  timeout,
  closeWebSocketServer,
  PARTICIPANT_ID
};
