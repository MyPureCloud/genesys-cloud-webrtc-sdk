import WebSocket, { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import AxiosMockAdapter from 'axios-mock-adapter';
import axios from 'axios';

import { MockStream, random } from './test-utils';
import { GenesysCloudWebrtcSdk, ICustomerData, ISdkConfig, IPersonDetails, IStation } from '../src';

declare var global: {
  window: any,
  document: any,
  crypto: any
} & typeof globalThis;

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
  failStation?: boolean;
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
  response?: any;
  conversationId?: string;
  participantId?: string;
  shouldFail?: Boolean;
}

interface MockApiReturns {
  sdk: GenesysCloudWebrtcSdk;
  mockCustomerData?: ICustomerData;
}

let wss: WebSocketServer | undefined;
let ws: WebSocket;
let mockAxios: AxiosMockAdapter;

const USER_ID = random();
const PARTICIPANT_ID = random();
const PARTICIPANT_ID_2 = random();

export function resetMocks () {
  mockAxios = new AxiosMockAdapter(axios)
}

export function getAxiosAdapter () {
  if (!mockAxios) {
    resetMocks();
  }

  return mockAxios;
}

export const MOCK_STATION: IStation = {
  id: 'luke-skywalker-123',
  name: 'LukeSkywalker',
  status: 'ASSOCIATED',
  userId: USER_ID,
  webRtcUserId: USER_ID,
  type: 'inin_webrtc_softphone',
  webRtcPersistentEnabled: false,
  webRtcForceTurn: false,
  webRtcCallAppearances: 100
};

export const MOCK_USER = {
  id: USER_ID,
  chat: { jabberId: 'hubert.j.farnsworth@planetexpress.mypurecloud.com' },
  station: {
    associatedStation: { id: MOCK_STATION.id }
  }
} as IPersonDetails;


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

export function getDefaultHostUri () {
  return 'https://api.mypurecloud.com';
}

export function mockGetConversationApi (params: MockSingleApiOptions): AxiosMockAdapter {
  const intercept = getAxiosAdapter().onGet(`${getDefaultHostUri()}/api/v2/conversations/calls/${params.conversationId}`);

  if (params.shouldFail) {
    return intercept.reply(500, params.response);
  }

  return intercept.reply(200, params.response || getMockConversation());
}

export function mockPatchConversationApi (params: MockSingleApiOptions): AxiosMockAdapter {
  const intercept = getAxiosAdapter().onPatch(`${getDefaultHostUri()}/api/v2/conversations/calls/${params.conversationId}/participants/${params.participantId}`);

  if (params.shouldFail) {
    return intercept.reply(401);
  }
  return intercept.reply(202, {});
}

export function mockPostConversationApi (params: MockSingleApiOptions): AxiosMockAdapter {
  const intercept = getAxiosAdapter().onPost(`${getDefaultHostUri()}/api/v2/conversations/calls`);

  if (params.shouldFail) {
    return intercept.reply(401);
  }

  return intercept.reply(202, params.response);
}

export function mockGetOrgApi (params: MockSingleApiOptions): AxiosMockAdapter {
  const intercept = getAxiosAdapter().onGet(`${getDefaultHostUri()}/api/v2/organizations/me`);

  if (params.shouldFail) {
    return intercept.reply(401);
  }
  return intercept.reply(200, MOCK_ORG);
}

export function mockGetUserApi (params: MockSingleApiOptions): AxiosMockAdapter {
  const intercept = getAxiosAdapter().onGet(`${getDefaultHostUri()}/api/v2/users/me?expand=station`);

  if (params.shouldFail) {
    return intercept.reply(401);
  }
  return intercept.reply(200, MOCK_USER);
}

export function mockGetChannelApi (params: MockSingleApiOptions): AxiosMockAdapter {
  const intercept = getAxiosAdapter().onPost(`${getDefaultHostUri()}/api/v2/notifications/channels?connectionType=streaming`);

  if (params.shouldFail) {
    return intercept.reply(401);
  }
  return intercept.reply(200, { id: 'somechannelid' });
}

export function mockGetStationApi (params: MockSingleApiOptions): AxiosMockAdapter {
  const intercept = getAxiosAdapter().onGet(`${getDefaultHostUri()}/api/v2/stations/${MOCK_STATION.id}`);

  if (params.shouldFail) {
    return intercept.reply(404);
  }
  return intercept.reply(200, MOCK_STATION);
}

export function mockNotificationSubscription (params: MockSingleApiOptions): AxiosMockAdapter {
  const intercept = getAxiosAdapter().onPut(`${getDefaultHostUri()}/api/v2/notifications/channels/somechannelid/subscriptions`);
  return intercept.reply(200);
}

export function closeWebSocketServer (): Promise<void> {
  if (wss) {
    return new Promise(resolve => {
      wss!.clients.forEach(wsClient => wsClient.close());
      wss!.close(() => {
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
    failStation,
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
  resetMocks();

  // easy to debug nock
  // api.log(console.error);

  const mockCustomerData: ICustomerData | undefined = withCustomerData ? MOCK_CUSTOMER_DATA : undefined;

  if (guestSdk) {
    if (failSecurityCode) {
      getAxiosAdapter().onPost(`${getDefaultHostUri()}/api/v2/conversations/codes`).reply(401);
    } else {
      getAxiosAdapter().onPost(`${getDefaultHostUri()}/api/v2/conversations/codes`).reply(200, MOCK_CUSTOMER_DATA);
    }

    // getChannel = api
    //   .post('/api/v2/stream/jwt')
    //   .reply(200, { id: 'someguestchangeid' });

  } else {
    mockGetOrgApi({ shouldFail: failOrg });
    mockGetUserApi({ shouldFail: failUser });
    mockGetChannelApi({ });
    mockNotificationSubscription({ });
    mockGetStationApi({ shouldFail: failStation });
  }

  let getConversation: AxiosMockAdapter;
  if (conversationId) {
    getConversation = mockGetConversationApi({ conversationId, response: conversation });
  }

  let patchConversation: AxiosMockAdapter;
  if (conversationId && participantId) {
    patchConversation = mockPatchConversationApi({ conversationId, participantId, shouldFail: failConversationPatch });
  }

  let postConversation = mockPostConversationApi({ });
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
    optOutOfTelemetry: true,
    logger: { debug: jest.fn(), log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any
    // logger: { debug () { }, log () { }, info () { }, warn: console.warn.bind(console), error: console.error.bind(console) }
  } as ISdkConfig;


  let sendLogs: AxiosMockAdapter;
  if (withLogs) {
    if (failLogsPayload) {
      sendLogs = getAxiosAdapter().onPost(`${getDefaultHostUri()}/api/v2/diagnostics/trace`).reply(413, { status: 413, message: 'test fail' });
    } else if (failLogs) {
      sendLogs = getAxiosAdapter().onPost(`${getDefaultHostUri()}/api/v2/diagnostics/trace`).reply(413, { status: 419, message: 'test fail' });
    } else {
      sendLogs = getAxiosAdapter().onPost(`${getDefaultHostUri()}/api/v2/diagnostics/trace`).reply(200);
    }
  } else {
    sdkOpts.optOutOfTelemetry = true;
  }

  const sdk = new GenesysCloudWebrtcSdk(sdkOpts);

  setupWss({ guestSdk, failStreaming });

  return { sdk, mockCustomerData };
}

function setupWss (opts: { guestSdk?: boolean, failStreaming?: boolean } = {}) {
  if (wss) {
    wss.close();
    wss = undefined;
  }

  wss = new WebSocketServer({ port: 1234 });

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
        const id = idRegexp.exec(msg)![1];
        send(`<iq xmlns="jabber:client" id="${id}" to="${MOCK_USER.chat.jabberId}" type="result"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>${MOCK_USER.chat.jabberId}/d6f681a3-358c-49df-819f-b231adb3cb97</jid></bind></iq>`);
      } else if (msg.indexOf('<session') !== -1) {
        const idRegexp = /id="(.*?)"/;
        const id = idRegexp.exec(msg)![1];
        send(`<iq xmlns="jabber:client" id="${id}" to="${MOCK_USER.chat.jabberId}/d6f681a3-358c-49df-819f-b231adb3cb97" type="result"></iq>`);
      } else if (msg.indexOf('ping') !== -1) {
        const idRegexp = /id="(.*?)"/;
        const id = idRegexp.exec(msg)![1];
        send(`<iq xmlns="jabber:client" to="${MOCK_USER.chat.jabberId}" type="result" id="${id}"></iq>`);
      } else if (msg.indexOf('<pubsub') !== -1) {
        const idRegexp = /id="(.*?)"/;
        const id = idRegexp.exec(msg)![1];
        send(`<iq xmlns="jabber:client" id="${id}" to="${MOCK_USER.chat.jabberId}" type="result"><pubsub xmlns="http://jabber.org/protocol/pubsub">
        <subscription node="v2.users.1c280af5-c623-4a5b-bf00-aafa7f6c0a03.conversations" jid="601d95fb6c8be51b97b54089@genesys.orgspan.com/mediahelper_0bd8f077-b2ec-43f5-9764-04f683c78d77" subscription="subscribed" /></pubsub></iq>`);
      } else if (msg.indexOf('extdisco') !== -1) {
        const idRegexp = / id="(.*?)"/;
        const id = idRegexp.exec(msg)![1];
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
