import WebSocket from 'ws';
import nock from 'nock';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

import { ICustomerData, IPendingSession, ISdkConfig, ISessionInfo } from '../src/types/interfaces';
import { SessionTypes } from '../src/types/enums';
import { GenesysCloudWebrtcSdk } from '../src/index';
import { SdkMedia } from '../src/media/media';

declare var global: {
  window: any,
  document: any,
  crypto: any
} & NodeJS.Global;

/* spy here and in the constructor because some tests restoreMocks before initializing a SimpleMockSdk */
jest.spyOn(SdkMedia.prototype, 'initialize' as any).mockReturnValue(null);

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

export class SimpleMockSdk extends EventEmitter {
  constructor () {
    super();
    this.on(EventEmitter.errorMonitor, () => null);

    /* have to spy here to avoid issues with tests that restore mocks before initializing a SimplemockSdk */
    jest.spyOn(SdkMedia.prototype, 'initialize' as any).mockReturnValue(null);
    this.media = new SdkMedia(this as any as GenesysCloudWebrtcSdk);
  }

  media: SdkMedia;
  _config: ISdkConfig = {
    environment: 'mypurecloud.com',
    logLevel: 'debug',
    wsHost: 'wshost',
    allowedSessionTypes: Object.values(SessionTypes),
    defaults: {}
  };
  _personDetails = {
    id: 'USER_GUID'
  };
  _logBuffer = [];
  logger = {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  _streamingConnection = {
    notifications: {
      subscribe: jest.fn(),
      unsubscribe: jest.fn()
    },
    webrtcSessions: {
      initiateRtcSession: jest.fn(),
      acceptRtcSession: jest.fn(),
      rejectRtcSession: jest.fn(),
      rtcSessionAccepted: jest.fn(),
      notifyScreenShareStart: jest.fn(),
      notifyScreenShareStop: jest.fn()
    },
    _webrtcSessions: {
      refreshIceServers: jest.fn()
    }
  };
  sessionManager = {
    validateOutgoingMediaTracks: jest.fn()
  };
  setAudioMute = jest.fn();
  updateOutgoingMedia = jest.fn();
}

export class MockSender {
  track: MockTrack;
  constructor (track: MockTrack) {
    this.track = track;
  }
  async replaceTrack (track?: MockTrack): Promise<void> {
    this.track = track;
  }
}

class MockReceiver {
  track: MockTrack;
  constructor (track: MockTrack) {
    this.track = track;
  }
}

class MockPC extends EventTarget {
  _mockSession: MockSession;
  _senders: MockSender[] = [];
  _receivers: MockReceiver[] = [];
  constructor (session: MockSession) {
    super();
    // this._mockSession = session;
  }
  getSenders (): MockSender[] {
    return this._senders;
  }

  getReceivers (): MockReceiver[] {
    return this._receivers;
  }

  _addSender (track: MockTrack) {
    this._senders.push(new MockSender(track));
  }

  _addReceiver (track: MockTrack) {
    this._receivers.push(new MockReceiver(track));
  }
}

class MockSession extends EventEmitter {
  streams: MockStream[] = [];
  tracks: MockTrack[] = [];
  id: any;
  sid = random().toString();
  conversationId = random().toString();
  pc = new MockPC(this);
  _statsGatherer: any;
  _outboundStream: any;
  _screenShareStream: MockStream;
  _outputAudioElement: any;
  sessionType: SessionTypes;
  accept = jest.fn();
  addStream = jest.fn();
  end = jest.fn();
  mute = jest.fn();
  unmute = jest.fn();
  videoMuted: boolean = false;
  audioMuted: boolean = false;
  state = 'active';

  constructor (sessionType?: SessionTypes) {
    super();
    this.id = this.sid;
    this.sessionType = sessionType;
  }
  addTrack (track: MockTrack) {
    // this.tracks.push(track);
    this.pc._addSender(track);
  }
  getTracks (): MockTrack[] {
    return this.pc.getSenders().map(s => s.track).filter(t => !!t);
  }
}

class MockTrack {
  _listeners: { event: string, callback: Function }[] = [];
  readyState = 'ended';
  id = random();
  kind = 'video';
  label: string;
  enabled = true;
  muted = false;
  constructor (kind: 'video' | 'audio' = 'video', label?: string) {
    this.kind = kind;
    this.label = label || '';
  }

  stop = jest.fn();
  addEventListener (event: string, callback: Function) {
    this._listeners.push({ event, callback });
  }

  getSettings = jest.fn().mockReturnValue({ height: 1080, width: 1920, frameRate: 30 });

  applyConstraints = jest.fn();
}

class MockStream {
  constructor (withMediaOrConstraints: { video?: boolean, audio?: boolean } | boolean = false) {
    /* if true, add both types of media tracks */
    if (withMediaOrConstraints === true) {
      this._tracks.push(new MockTrack('video'));
      this._tracks.push(new MockTrack('audio'));
      /* we have a `truthy` value */
    } else if (withMediaOrConstraints) {
      if (withMediaOrConstraints.video) this._tracks.push(new MockTrack('video'));
      if (withMediaOrConstraints.audio) this._tracks.push(new MockTrack('audio'));
    } /* else `falsey`, don't add any tracks */
  }
  id = random();
  _tracks: MockTrack[] = [];
  getVideoTracks () {
    return this.getTracks().filter((t) => t.kind === 'video');
  }
  getAudioTracks () {
    return this.getTracks().filter((t) => t.kind === 'audio');
  }
  getTracks () {
    return this._tracks;
  }

  addTrack (track) {
    this._tracks.push(track);
  }

  removeTrack (track: MockTrack): void {
    const index = this._tracks.findIndex(t => t.id === track.id);
    this._tracks.splice(index, 1);
  }
}

export class MockAudioContext {
  createMediaStreamSource (stream: MediaStream | MockStream): MockAudioSource {
    return new MockAudioSource();
  }
  createAnalyser (): MockAnalyser {
    return new MockAnalyser();
  }
}

export class MockAudioSource {
  connect (_analyzer: MockAnalyser) { }
}

export class MockAnalyser {
  fftSize: number;
  minDecibels: number;
  maxDecibels: number;
  smoothingTimeConstant: number;
  frequencyBinCount = 10;
  getByteFrequencyData (array: Uint8Array): void { }
}

export function addTrackToMockStream (stream: MockStream, trackKind: 'video' | 'audio'): string {
  const mockTrack = new MockTrack(trackKind);
  stream._tracks.push(mockTrack);
  return mockTrack.id;
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
  withIceRefresh?: boolean;
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
}

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

let wss: WebSocket.Server;
let ws: WebSocket;

function random (): string {
  return `${Math.random()}`.split('.')[1];
}

export function getRandomIntInclusive (min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min); //The maximum is inclusive and the minimum is inclusive
}

function timeout (n: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, n));
}

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

export function wait (milliseconds: number = 10): Promise<void> {
  return new Promise(res => setTimeout(res, milliseconds));
}

export function createSessionInfo (): ISessionInfo {
  const roomJid = `${random()}@${random()}.com`;

  return {
    autoAnswer: true,
    conversationId: random().toString(),
    fromJid: roomJid,
    sessionId: random().toString(),
    originalRoomJid: roomJid
  };
}

export function createPendingSession (type: SessionTypes = SessionTypes.softphone): IPendingSession {
  const base = {
    id: random(),
    conversationId: random(),
    autoAnswer: false,
    sessionType: type
  };

  let specifics;
  switch (type) {
    case SessionTypes.acdScreenShare: {
      specifics = { address: `acd-${random()}@org.com` };
      break;
    }
    default: {
      specifics = { address: `${random()}@gjoll.com` };
    }
  }
  return Object.assign(base, specifics);
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
    conversation,
    withIceRefresh
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
    logger: { debug: jest.fn(), log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    // logger: { debug () { }, log () { }, info () { }, warn: console.warn.bind(console), error: console.error.bind(console) }
  } as ISdkConfig;

  const sdk = new GenesysCloudWebrtcSdk(sdkOpts);

  /* if we don't need to test refreshing the ice servers, then mock it */
  if (!withIceRefresh) {
    sdk._refreshIceServers = jest.fn().mockResolvedValue([]);
  }

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

  return { getOrg, getUser, getChannel, getConversation, getJwt, sendLogs, patchConversation, sdk, mockCustomerData, notificationSubscription };
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
  random,
  timeout,
  getMockConversation,
  USER_ID,
  PARTICIPANT_ID,
  PARTICIPANT_ID_2,
  MockSession,
  MockStream,
  MockTrack
};
