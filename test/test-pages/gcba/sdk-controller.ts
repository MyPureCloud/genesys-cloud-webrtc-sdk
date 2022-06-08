/* global MediaStream */
import GenesysCloudWebrtSdk, { ConversationUpdate, IExtendedMediaSession, ISdkConfig, ISdkConversationUpdateEvent, IStoredConversationState, SdkError, SessionTypes } from '../../../src';
import { getInputValue, writeToLog } from './utils';

let webrtcSdk: GenesysCloudWebrtSdk;
let pendingSessions = [];

let conversationUpdatesToRender: {[conversationId: string]: IExtendedMediaSession} = { };

export async function initWebrtcSDK (environmentData) {
  const jwt = getInputValue('jwt-input');
  if (!jwt) {
    window.alert('You need a jwt token');
    throw new Error('Not Authenticated');
  }

  const options: ISdkConfig = {
    jwt,
    originAppId: 'gcba-demo',
    originAppName: 'gcba-demo',
    autoAcceptPendingScreenRecordingRequests: true
  }

  options.environment = environmentData.uri;
  options.logLevel = 'info';
  // for sumo debugging
  // options.optOutOfTelemetry = true;

  const SDK = GenesysCloudWebrtSdk;
  (window as any).SDK = SDK;

  webrtcSdk = new SDK(options);
  (window as any).webrtcSdk = webrtcSdk;
  (window as any).sdk = webrtcSdk;

  connectEventHandlers();
  exposeGlobalFunctions();

  await webrtcSdk.initialize()
  writeToLog(`SDK initialized with ${JSON.stringify(options, null, 2)}`);
  renderUser(webrtcSdk._personDetails, webrtcSdk._orgDetails);
}

function connectEventHandlers () {
  webrtcSdk.on('ready', ready);
  webrtcSdk.on('pendingSession', pendingSession);
  webrtcSdk.on('cancelPendingSession', cancelPendingSession);
  webrtcSdk.on('handledPendingSession', handledPendingSession);
  webrtcSdk.on('sessionStarted', sessionStarted);
  webrtcSdk.on('sessionEnded', sessionEnded);
  webrtcSdk.on('trace', trace);
  webrtcSdk.on('sdkError', error);
  webrtcSdk.on('disconnected', disconnected);
  webrtcSdk.on('connected', connected);
}

function acceptPendingSession ({ conversationId }) {
  webrtcSdk.acceptPendingSession({ conversationId });
}

function rejectPendingSession ({ conversationId }) {
  webrtcSdk.rejectPendingSession({ conversationId });
}

function endSession ({ conversationId }) {
  webrtcSdk.endSession({ conversationId });
}

function exposeGlobalFunctions () {
  (window as any).acceptPendingSession = acceptPendingSession;
  (window as any).rejectPendingSession = rejectPendingSession;
  (window as any).endSession = endSession;
}

function _getLogHeader (functionName) {
  return `${functionName}\n---------------------`;
}

export function disconnectSdk () {
  const reallyDisconnect = window.confirm('Are you sure you want to disconnect?');
  if (!reallyDisconnect) {
    return;
  }

  webrtcSdk.disconnect();
  writeToLog('Disconnected -- Reauthenticate to reconnect');
}

/* --------------------------- */
/* SDK EVENT HANDLER FUNCTIONS */
/* --------------------------- */

function ready () {
  if (!webrtcSdk._personDetails) {
    webrtcSdk.startScreenShare();
  }
  writeToLog('webrtcSDK ready event emitted');
}

// pendingSession - {id, address, conversationId, autoAnswer}
function pendingSession (options) {
  let output = `${_getLogHeader('pendingSession')}
    id: ${JSON.stringify(options.id)}
    sessionType: ${JSON.stringify(options.sessionType)}
    fromJid: ${JSON.stringify(options.fromJid)}
    conversationId: ${JSON.stringify(options.conversationId)}
    autoAnswer: ${JSON.stringify(options.autoAnswer)}
    `;

  const existingPendingSession = pendingSessions.find(s => s.conversationId === options.conversationId);
  if (!existingPendingSession) {
    pendingSessions.push(options);
    renderPendingSessions();
  }

  writeToLog(output);
}

function renderUser (user, org) {
  const userEl = document.querySelector('#user-element');
  if (!user || !org) {
    return userEl.innerHTML = `
      <h5 class="text-danger m-3">
        (Unauthenticated User)
      </h5>`;
  }

  userEl.innerHTML = `
    <table class="table">
      <thead>
        <th scope="col">Name</th>
        <th scope="col">Email</th>
        <th scope="col">ID</th>
        <th scope="col">Org</th>
      </thead>
      <tbody>
        <tr>
          <th scope="row">${user.name}</th>
          <th >${user.email}</th>
          <td>${user.id}</td>
          <td>${org.id}</td>
        </tr>
      </tbody>
    </table>`;
}

function renderPendingSessions () {
  const parentNode = document.getElementById('pending-sessions');
  console.log('rendering pending sessions table', pendingSessions);
  if (!pendingSessions.length) {
    parentNode.innerHTML = '';
    return;
  }

  let html = `<table class="table">
    <thead>
      <tr>
        <th scope="col">conversationId</th>
        <th scope="col">sessionId</th>
        <th scope="col">autoAnswer</th>
        <th scope="col">Answer</th>
        <th scope="col">Decline</th>
      </tr>
    </thead>
    <tbody>`;


  pendingSessions.forEach(session => {
    html += `<tr>
    <th scope="row">${session.conversationId}</th>
    <td>${session.id}</td>
    <td>${session.autoAnswer}</td>
    <td><button type="button" class="btn btn-success btn-sm" onclick="acceptPendingSession({conversationId:'${session.conversationId}'})"
      >Answer</button>
    </td>
    <td><button type="button" class="btn btn-danger btn-sm" onclick="rejectPendingSession({conversationId:'${session.conversationId}'})"
      >Decline</button>
    </td>
  </tr>`
  });

  html += `</tbody>
  </table>`;

  parentNode.innerHTML = html;
}

function renderSessions () {
  const tableBodyId = 'session-tbody';
  let tableBody = document.getElementById(tableBodyId);
  let html = '';

  if (!tableBody) {
    const parentNode = document.getElementById('sessions-element');
    parentNode.innerHTML = `<table class="table">
      <thead>
        <tr>
          <th scope="col" scope="row">conversationId</th>
          <th scope="col">sessionId</th>
          <th scope="col">session state</th>
        </tr>
      </thead>
      <tbody id="${tableBodyId}">
      </tbody>
    </table>`;
    tableBody = document.getElementById(tableBodyId);
  }

  Object.values(conversationUpdatesToRender).forEach(session => {
    const isSessionActive = session ? session.state === 'active' : undefined;

    html += `<tr>
    <th scope="row">${session.conversationId}</th>
    <td>${session.id}</td>
    <td class="${isSessionActive ? 'text-success' : 'text-danger'}">
      ${session.state}
    </td>
  </tr>`
  });
  tableBody.innerHTML = html;
}

function cancelPendingSession (params) {
  let output = `${_getLogHeader('cancelPendingSession')}
    sessionId: ${params.sessionId}
    conversationId: ${params.conversationId}`;

  pendingSessions = pendingSessions.filter(s => s.conversationId !== params.conversationId);
  renderPendingSessions();
  writeToLog(output);
}

function handledPendingSession (params) {
  let output = `${_getLogHeader('handledPendingSession')}
    sessionId: ${params.sessionId}
    conversationId: ${params.conversationId}`;

  pendingSessions = pendingSessions.filter(s => s.conversationId !== params.conversationId);
  renderPendingSessions();
  writeToLog(output);
}

async function sessionStarted (session: IExtendedMediaSession) {
  let output = `${_getLogHeader('sessionStarted')}
    conversationId: ${session.conversationId}
    sessionId: ${session.sid}`;
  conversationUpdatesToRender[session.conversationId] = session;

  session.on('connectionState', () => renderSessions());
  renderSessions();
  writeToLog(output);

  const screenStream = await webrtcSdk.media.startDisplayMedia();

  // create metadatas
  const track = screenStream.getTracks()[0];
  const { height, width, deviceId } = track.getSettings();
  const screenRecordingMetadatas = [
    {
      trackId: track.id,
      screenId: deviceId, // some applications give you a deviceId on the track which is uniquely tied to a specific monitor
      originX: 0,
      originY: 0,
      resolutionX: width,
      resolutionY: height,
    primary: true,
    }
  ];

  webrtcSdk.acceptSession({ conversationId: session.conversationId, sessionType: session.sessionType, mediaStream: screenStream, screenRecordingMetadatas });
}

function trace (level, message, details) {
  let output = `${_getLogHeader('trace')}\n`;
  output += `  level: ${level}\n  message: ${message}\n  details: ${details}`;

  const logTraces = (document.getElementById('log-traces-check') as any).checked;
  if (logTraces) {
    writeToLog(output);
  }
}

function error (error: SdkError) {
  let output = `${_getLogHeader('error')}
    error: ${error.message}\n  details: ${error.details}`;

  writeToLog(output);
}

function sessionEnded (session, reason) {
  let output = `${_getLogHeader('terminated')}
    reason: ${reason}
    conversationId: ${session.conversationId}
    sessionId: ${session.sid}`;

  renderSessions();

  writeToLog(output);
}

function disconnected (e) {
  writeToLog('disconnected event' + e);
}

function connected (e) {
  writeToLog('connected event', e);
}
