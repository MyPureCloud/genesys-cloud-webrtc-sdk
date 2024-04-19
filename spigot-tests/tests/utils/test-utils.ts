import { IUser, IOrg, IUserQueue, IContext } from '../../types/types';
import { TestConfig } from '../../types/test-config';
import { Subject, Observable, throwError } from 'rxjs';
// import { ErrorObservable } from 'rxjs/observable/ErrorObservable';
import { v4 as uuidv4 } from 'uuid';
import Logger from 'genesys-cloud-client-logger';
import GenesysCloudStreamingClient, { IClientOptions } from 'genesys-cloud-streaming-client';
import { assert } from 'chai';
import { filter, first, timeoutWith } from 'rxjs/operators';

let user: IUser;
let org: IOrg;
let userQueues: IUserQueue[];
let jid: string;
let wrapupCodes;

export const getConfig = function (): TestConfig {
  return (window as any).testConfig;
};

export const getContext = function (): IContext {
  return { user, org, userQueues, jid, authToken: getAuthToken(), wrapupCodes };
};

export const loadUserInformation = async function (): Promise<IContext> {
  if (user) {
    return getContext();
  }

  const orgDetails = getOrgDetails();
  const personDetails = getPersonDetails();
  await orgDetails;
  await personDetails;

  const userQueues = getUserQueues();
  const wrapupCodes = getWrapupCodes();
  await userQueues;
  await wrapupCodes;

  return getContext();
}

export const getAuthToken = function (): string {
  const search = window.location.search;

  const tokenRegex = /authToken=([^&]+)/;
  const matches = search.match(tokenRegex);
  return matches && matches[1] || '';
}

// from https://stackoverflow.com/questions/38552003/how-to-decode-jwt-token-in-javascript
export function parseJwt (token: string) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));

  return JSON.parse(jsonPayload);
}

export function rejectTimeout (reject: (obj?: any) => any, assertion: string, time: number): NodeJS.Timer {
  logger.debug(`Rejecting ${assertion} in ${time}`);
  return setTimeout(() => reject(new Error(`Timeout (${time / 1000}s) waiting for ${assertion}`)), time);
}

export const fetchJson = async function (url: string, options?: RequestInit) {
  const response = await window.fetch(url, options);
  if (!response.ok) {
    const correlationId = response.headers.get('inin-correlation-id');
    const err = `Response code ${response.status} making request to ${url}. inin-correlation-id: ${correlationId}`;
    logger.error(err, { options });
    throw Error(err);
  }
  return response.json();
};

export async function getConversationDetails (id) {
  const conversation = await fetchJson(`${getConfig().apiUrl}/conversations/${id}`, { headers: getHeaders() });
  logger.log('conversation details', conversation);
  return conversation;
}

export const getUserId = async function (username: string): Promise<string> {
  if (userIds[username]) {
    return userIds[username];
  }

  const searchBody = {
    pageSize: 1,
    pageNumber: 1,
    types: ['users'],
    query: [
      {
        fields: ['email'],
        value: username,
        type: 'exact'
      }
    ]
  };

  const results = await fetchJson(`${getConfig().apiUrl}/search`, {
    headers: getHeaders(),
    method: 'POST',
    body: JSON.stringify(searchBody)
  });

  if (results.results.length === 0) {
    throw new Error('user not found');
  }
  return results.results[0].guid;
};

export const getOrgDetails = async function (): Promise<IOrg> {
  org = await fetchJson(`${getConfig().apiUrl}/organizations/me`, { headers: getHeaders() });
  logger.debug('orgdetails', org);
  return org;
};

export const getUserQueues = async function (): Promise<IUserQueue[]> {
  try {
    const { entities } = await fetchJson(`${getConfig().apiUrl}/users/${user.id}/queues`, { headers: getHeaders() });
    userQueues = entities;
  } catch (e) {
    logger.warn('Failed to load queues', e);
    userQueues = [];
  }
  return userQueues;
};

export const getWrapupCodes = async function (): Promise<any[]> {
  const { entities } = await fetchJson(`${getConfig().apiUrl}/routing/wrapupcodes`, { headers: getHeaders() })
    .catch(() => ({ entities: [] }));
  logger.log('fetched wrap up codes', entities);
  wrapupCodes = entities;
  return wrapupCodes;
};

export const getPersonDetails = async function (): Promise<IUser> {
  if (user) {
    return user;
  }

  user = await fetchJson(getConfig().personDetailsUrl, { headers: getHeaders() });
  logger.debug('userdetails', user);
  jid = user.chat.jabberId;
  return user;
};

export const getHeaders = function (includeIninOrg = false): Headers {
  const headers = new window.Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `bearer ${getAuthToken()}`);
  headers.set('Genesys-App', 'developercenter-cdn--webrtc-sdk-webui');

  if (includeIninOrg) {
    headers.set('InIn-Organization-Id', org.id);
  }

  return headers;
};

export const pollForTruthy = function (testFn: () => any, intervalMs = 50, maxWaitMs = 2000): Promise<any> {
  if (typeof testFn !== 'function') {
    throw new Error('pollForTruthy requires a function for the first param');
  }

  // eslint-disable-next-line
  return new Promise(async (resolve, reject) => {
    let timedOut = false;
    let result;
    timeout(maxWaitMs).then(() => {
      timedOut = true;
      if (!result) {
        reject(new Error('pollForTruthy timed out'));
      }
    });

    // eslint-disable-next-line
    while (!result && !timedOut) {
      result = testFn();
      await timeout(intervalMs);
    }

    if (result) {
      resolve(result);
    }
  });
};

export const timeout = function (ms: number): Promise<void> {
  logger.debug(`Generic timeout ${ms}ms`);
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const getJidDomain = function (jid: string): string {
  return jid.split('@')[1];
};

export function getConversation (conversationId: string) {
  const options = {
    method: 'GET',
    headers: getHeaders()
  };

  return fetchJson(`${getConfig().apiUrl}/conversations/${conversationId}`, options);
}

export function setupStreamingPubsub (topic: string, streamingClient: any, bulk = true): Observable<any> {
  const streamingMessages = new Subject();
  const bufferMsg = (evt) => {
    streamingMessages.next(evt.eventBody);
  };
  if (bulk) {
    streamingClient.notifications.bulkSubscribe([topic]);
    streamingClient.on(`notify:${topic}`, bufferMsg);
  } else {
    streamingClient.notifications.subscribe(topic, bufferMsg);
  }
  return streamingMessages.asObservable();
}

// export function observableError (msg: any): ErrorObservable {
//   return Observable.throw(new Error(msg));
// }

export function getRandomVideoRoomJid (myJid: string) {
  return `adhoc-${uuidv4()}@conference.${getJidDomain(myJid)}`;
}

// const logger: any = console;

let logger: Logger;

function initializeLogging () {
  const { appVersion, appName, envHost } = getConfig();
  const { authToken } = getContext();

  // logger = console as any;
  // logger.config = {
  //   appName,
  //   appVersion,
  //   accessToken: 'fake',
  //   url: 'no.com'
  // };
  logger = new Logger({
    accessToken: authToken,
    url: `https://api.${envHost}/api/v2/diagnostics/trace`,
    appVersion,
    appName: `spigot-${appName}`,
    logLevel: 'debug',
    uploadDebounceTime: 1000,
    initializeServerLogging: true,
    stringify: true
  });
}

export async function getConnectedStreamingClient (authToken?: string, jwt?: string) {
  const conn = createConnection(authToken);
  await conn.connect();
  return conn;
}

export function createConnection (authToken?: string, jwt?: string) {
  const options: IClientOptions = {
    authToken,
    logger: console,
    host: getConfig().host,
    apiHost: getConfig().envHost,
    signalIceConnected: true,
    jwt
  };
  console.log('Streaming connection options: ', JSON.stringify(options));
  const _client = new GenesysCloudStreamingClient(options);

  _client.on('stream:error', error => {
    console.error('Error from streaming connection:', JSON.stringify(error));
  });

  _client.on('raw:incoming', (msg) => {
    // console.debug('streaming <<<:', JSON.stringify(msg));
  });
  _client.on('raw:outgoing', (msg) => {
    // console.debug('streaming >>>:', JSON.stringify(msg));
  });
  _client.on('connected', () => {
    console.log('streaming connection authenticated');
  });

  return _client;
}

export async function getNewSdkConnection () {
  const config = getConfig();

  const newSdk = new (window as any).GenesysCloudWebrtcSdk.default({
    environment: config.envHost,
    accessToken: getAuthToken(),
    logLevel: 'info',
    appName: logger.config.appName,
    appVersion: logger.config.appVersion,
    appId: logger.clientId
  });

  await newSdk.initialize();
  return newSdk;
}

export function getUserMedia (constraints = { video: false, audio: true }) {
  return navigator.mediaDevices.getUserMedia(constraints);
}

// testContext is Mocha.context
export async function testCall (testContext: any, streamingClient: any, callOptions) {
  if (!streamingClient) {
    throw new Error('Test call requires a valid streaming client as the second param');
  }
  // Yes, this timeout is long, but it's because we're making a real call
  const context = getContext();
  testContext.timeout(getConfig().validationTimeout * 5);

  // pre-request media
  const mediaStream = await getUserMedia();

  // Convert incomingRtcSession event into promise so we can await it
  const incomingRtcSession = new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('Timeout waiting for incoming session')), getConfig().validationTimeout);

    // As soon as a call is requested, accept the propose
    streamingClient._webrtcSessions.once('requestIncomingRtcSession', async function (options) {
      logger.info('Received Propose', options);
      logger.info('Accepting propose', options);
      streamingClient.webrtcSessions.acceptRtcSession(options.sessionId);
      logger.info('propose accepted', options);

    });

    // Resolve when the session arrives, short circuiting the timeout/reject
    streamingClient._webrtcSessions.once('incomingRtcSession', (session) => {
      logger.log('Pending Session received', { session });
      resolve(session);
    });
  });

  let conversationId; // eslint-disable-line

  const subscription = setupStreamingPubsub(`v2.users.${context.user.id}.conversations`, streamingClient)
    .pipe(
      filter(message => {
        logger.debug('checking streaming client pubsub message', message);
        if (!message) {
          return false;
        }
        if (!message.participants || message.participants.length !== 2) {
          return false;
        }
        if (conversationId && conversationId !== message.id) {
          return false;
        }
        return message.participants.filter(p => p.calls && p.calls.length > 0 && p.calls[0].state === 'connected').length === 2;
      }),
      first(),
      timeoutWith(getConfig().validationTimeout, throwError('Timeout waiting for conversation connected event on carrier pigeon'))
    )
    .toPromise();

  // Make the call
  conversationId = await makeCall(callOptions);
  logger.info('Call conversationId', conversationId);

  // wait for the session to arrive
  const session: any = await incomingRtcSession;
  session.converationId = conversationId;
  session.on('log:*', (evt, ...args) => {
    const level = evt.split(':')[1];
    logger[level]('session log', ...args);
  });

  // convert peerStreamAdded event to promise
  const peerTrackAdded = new Promise((resolve, reject) => {
    rejectTimeout(reject, 'remote stream', getConfig().validationTimeout);
    if (session.streams.length === 1 && session.streams[0].getAudioTracks().length > 0) {
      return resolve(session.streams[0]);
    }
    session.on('peerTrackAdded', async (session, track) => {
      resolve(track);
    });
  });

  // add the local stream and accept
  // session.addStream(mediaStream);
  const promises = mediaStream.getTracks().map((track) => session.pc.addTrack(track));
  await Promise.all(promises);
  session.accept();
  const remoteStream = await peerTrackAdded;
  await validateStream(session, remoteStream as MediaStream);
  return subscription;
}

export async function makeCall (callOptions) {
  if (!callOptions.phoneNumber && !callOptions.callUserId) {
    throw new Error('Invalid call address');
  }
  const options = {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(callOptions)
  };

  const { id } = await fetchJson(`${getConfig().apiUrl}/conversations/calls`, options);
  logger.log('Call placed', { conversationId: id });
  return id;
}

export async function disconnectCall (conversationId: string, immediate?: boolean) {
  if (getConfig().callDelay && !immediate) {
    logger.debug('Not disconnecting call yet. timeout', getConfig().callDelay);
    await timeout(getConfig().callDelay);
    return disconnectCall(conversationId, true);
  }
  logger.log('Disconnecting call', { conversationId });
  const conversation = await getConversation(conversationId);
  logger.log('Fetched conversation details', { conversation });
  const userId = getContext().user.id;
  const participant = conversation.participants.find(p => p.userId === userId);

  if (!participant) {
    logger.warn('Cannot disconnect conversation; no participant found');
    return;
  }

  const body: any = { state: 'disconnected' };
  const participantUrl = `${getConfig().apiUrl}/conversations/${conversationId}/participants/${participant.id}`;
  let haveWrapUpCode: Promise<void>;
  const { wrapupCodes } = getContext();
  if (wrapupCodes && wrapupCodes.length) {
    body.wrapup = { code: wrapupCodes[0].id };
    haveWrapUpCode = Promise.resolve();
  } else {
    const defaultWrapUpCodeOptions = {
      method: 'GET',
      headers: getHeaders()
    };
    haveWrapUpCode = fetchJson(`${participantUrl}/wrapupcodes`, defaultWrapUpCodeOptions)
      .then(codes => {
        logger.log('fetched participant wrap up codes', codes);
        body.wrapup = { code: codes[0].id };
      });
  }

  await haveWrapUpCode;
  const options = {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(body)
  };

  return window.fetch(participantUrl, options);
}

export async function validateStream (session: any, stream: MediaStream, conversationId?: string, shouldAttach = true, reattach?: boolean, descriptor?: string) {
  if (shouldAttach) {
    await attachStream(stream, reattach, descriptor);
  }
  logger.log('stream attached');
  const track = stream.getTracks()[0];
  if (track.readyState !== 'live') {
    logger.error('tracks', stream.getTracks());
    throw new Error('Audio track never went live');
  }
  logger.log('validating stats');
  await validateAudioStats(session);

  if (conversationId) {
    logger.log('disconnecting call');
    await disconnectCall(conversationId);
  }
  logger.log('stream validated');
}

export async function attachStream (stream: MediaStream, reattach?: boolean, descriptor?: string) {
  logger.log('Remote stream added', { stream });
  const elType = stream.getVideoTracks().length ? 'video' : 'audio';
  const existingElement = Array.from(document.getElementsByTagName(elType)).filter(el => !el.classList.contains('ignore'));
  let el;
  if (reattach && existingElement && existingElement[0]) {
    el = existingElement[0];
  } else {
    el = document.createElement(elType);
    document.body.append(el);
  }
  if (elType === 'video') {
    el.style = 'border: 2px solid rebeccapurple';
  }
  el.title = descriptor;
  el.autoplay = true;
  el.srcObject = stream;
  logger.debug('starting auto play of element', stream);

  // sometimes this doesn't play for whatever reason
  // await el.play()

  logger.debug('auto play returned');
  let streamReady;
  if (stream.active) {
    logger.debug('stream is ready');
    streamReady = Promise.resolve();
  } else {
    logger.debug('waiting for stream to activate');

    streamReady = new Promise(resolve => {
      logger.debug('stream activated');
      // This doesn't appear to be a thing outside of chrome
      (stream as any).onactive = resolve;
      logger.warn('Stream was not active and the `onactive` event may or may not fire');
    });
  }
  return streamReady;
}

export async function validateAudioStats (session: any) {
  let handleStats;
  const statsVerified = new Promise((resolve, reject) => {
    rejectTimeout(reject, `the session stats to have acceptable audio stats (coversationId: ${session.conversationId}`, getConfig().validationTimeout);
    handleStats = function (stats) {
      logger.log('StatsGatherer', stats);
      if (stats.name !== 'getStats' || stats.remoteTracks.length === 0 || stats.tracks.length === 0) {
        return;
      }
      try {
        const remoteTrack = stats.remoteTracks[0];
        const localTrack = stats.tracks[0];
        assert.ok(remoteTrack.audioLevel, 'remote audio level is defined and greater than 0');
        assert.ok(localTrack.audioLevel, 'local audio level is defined and greater than 0');

        // For some reason these are unreliable - this needs fixed
        // maybe stats gatherer is picking up the wrong candidate pair?
        // assert.ok(stats.bytesReceived > 0, 'bytes received is greater than 0');
        // assert.ok(stats.bytesSent > 0, 'bytes sent is greater than 0');

        assert.ok(stats.networkType, 'network type is defined');
        assert.ok(localTrack.codec, 'local codec is defined');
        assert.ok(remoteTrack.codec, 'remote codec is defined');
        assert.ok(localTrack.bytes, 'local track has bytes count');
        assert.ok(remoteTrack.bytes, 'remote track has bytes count');
        logger.info('validateAudioStats succeeded', { stats, sessionId: session.sid });
      } catch (e: any) {
        logger.warn('stats validation failed', { message: e.message, stats });
        return;
      }
      // can't assert on packetloss because it might not have occurred
      resolve(null);
    };
  });
  logger.log('checking stats', { sg: session.statsGatherer, pc: session.pc });
  session.on('stats', handleStats);
  await statsVerified;
  window.clearInterval(session.statsGatherer._pollingInterval);
}

export async function validateVideoStats (session: any) {
  let handleStats;
  const statsVerified = new Promise((resolve, reject) => {
    handleStats = function (stats) {
      rejectTimeout(reject, 'the session stats to have acceptable video stats', getConfig().validationTimeout);
      logger.debug('StatsGatherer Video', stats);
      if (stats.remoteTracks.length === 0) {
        return;
      }
      try {
        const remoteTrack = stats.remoteTracks.find(t => t.kind === 'video');
        assert.ok(remoteTrack.bitrate, 'remote track bitrate is defined');
        assert.ok(stats.networkType, 'network type is defined');
        assert.ok(remoteTrack.codec, 'remote codec is defined');
        assert.ok(remoteTrack.bytes, 'remote track has bytes count');
        assert.equal(remoteTrack.kind, 'video');
        // can't assert on packetloss because it might not have occurred
        session.off('stats', handleStats);
        logger.info('validateVideoStats succeeded', { stats, sessionId: session.sid });
      } catch (e: any) {
        logger.warn('stats validation failed', { message: e.message, stats });
        return;
      }
      resolve(null);
    };
  });
  session.on('stats', handleStats);
  await statsVerified;
}

export async function validateVideoStream (session: any, stream: MediaStream) {
  await attachStream(stream, true);
  if (stream.getVideoTracks().length === 0) {
    throw new Error('No Video track on stream');
  }
  const videoTrack = stream.getVideoTracks()[0];

  if (videoTrack.readyState !== 'live') {
    throw new Error('Video track never went live');
  }
  await validateVideoStats(session);
}

export async function disconnectVideoCall (conversationId: string, immediate?: boolean) {
  if (getConfig().callDelay && !immediate) {
    await timeout(getConfig().callDelay);
    return disconnectVideoCall(conversationId, true);
  }

  logger.log('Disconnecting video call', { conversationId });
  const conversation = await getConversation(conversationId);
  logger.log('Fetched video conversation details', { conversation });
  const userId = getContext().user.id;
  const participants = conversation.participants.filter(p => p.userId === userId);

  if (!participants || participants.length === 0) {
    logger.warn('Cannot disconnect conversation; no participant found');
    return;
  }

  // just send disconnect for all participants mapping user,
  // wait for all to complete
  return Promise.all(participants.map(participant => {
    const body = { state: 'disconnected' };
    const participantUrl = `${getConfig().apiUrl}/conversations/${conversationId}/participants/${participant.id}`;

    const options = {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(body)
    };

    return window.fetch(participantUrl, options).catch(e => {
      logger.warn('Attempt to disconnect participant failed', e);
    });
  }));
}

export function observableError (msg: any): Observable<any> {
  return Observable.throw(new Error(msg));
}

export function wait (ms: number = 2000) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

initializeLogging();

const userIds: { [username: string]: string } = {};

export const getLogger = (): Logger => logger;

(window as any)['loadUserInformation'] = loadUserInformation;
