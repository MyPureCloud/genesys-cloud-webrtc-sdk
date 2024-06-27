/* global MediaStream */

import { HeadsetEvents } from 'softphone-vendor-headsets';
import { getSdk, GenesysCloudWebrtcSdk } from '../sdk-proxy';
import utils from './utils';
import { v4 as uuidv4 } from 'uuid';

let videoOpts;
let webrtcSdk;
let conversationsApi;
let currentConversationId;
let pendingSessions = [];
let conversationUpdatesToRender = {
  conversations: {},
  activeConversationId: ''
};
const videoResolutions = {
  "default": undefined,
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "2K": { width: 2560, height: 1440 },
  "4K": {width: 3840, height: 2160 }
}
let currentSession;

async function initWebrtcSDK (environmentData, _conversationsApi, noAuth, withDefaultAudio) {
  let options = {};
  let initOptions = null;
  conversationsApi = _conversationsApi;

  if (noAuth) {
    initOptions = { securityCode: document.getElementById('security-key').value };
    options.organizationId = document.getElementById('org-id').value;
    options.autoConnectSessions = true;
    localStorage.setItem('sdk_org_id', options.organizationId);
  } else {
    const accessToken = utils.getAccessToken();
    if (!accessToken) {
      window.alert('You have not authenticated yet');
      throw new Error('Not Authenticated');
    }
    options.accessToken = accessToken;
  }

  options.environment = environmentData.uri;
  options.logLevel = 'info';
  options.originAppId = uuidv4();
  options.originAppName = 'webrtc-demo-app';
  options.useHeadsets = true;
  // for sumo debugging
  // options.optOutOfTelemetry = true;

  options.defaults = { monitorMicVolume: true };

  if (withDefaultAudio) {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    options.defaults.audioStream = audioStream;
    window._defaultAudioStream = audioStream;

    // const formatter = (level, message, details, opts, next) => {
    //   if (message.includes('propose')) {
    //     message = 'decorated propose!!!'
    //   } else {
    //     message = `[decorated other] ${message}`
    //   }
    //   next(level, message, details, opts);
    // };
    // options.logFormatters = [formatter];

    const audioLabel = audioStream.getAudioTracks()[0].label;
    utils.writeToLog(`Using default audioStream with device: ${audioLabel}`);
  }

  const SDK = GenesysCloudWebrtcSdk || getSdk();
  window.SDK = SDK;

  webrtcSdk = new SDK(options);
  window.webrtcSdk = webrtcSdk;
  window.sdk = webrtcSdk;

  connectEventHandlers();
  exposeGlobalFunctions();

  return webrtcSdk.initialize(initOptions)
    .then(() => {
      utils.writeToLog(`SDK initialized with ${JSON.stringify(options, null, 2)}`);
      window.s = sdk.sessionManager.sessionHandlers.find(f => f.sessionType === 'softphone');
      renderUser(sdk._personDetails, sdk._orgDetails);
      handleStationUpdate({ station: sdk.station });
    });
}

function connectEventHandlers () {
  webrtcSdk.on('ready', ready);
  webrtcSdk.on('pendingSession', pendingSession);
  webrtcSdk.on('cancelPendingSession', cancelPendingSession);
  webrtcSdk.on('handledPendingSession', handledPendingSession);
  webrtcSdk.on('sessionStarted', sessionStarted);
  webrtcSdk.on('sessionEnded', sessionEnded);
  webrtcSdk.on('trace', trace);
  webrtcSdk.on('error', error);
  webrtcSdk.on('terminated', terminated);
  webrtcSdk.on('changeConnectionState', changeConnectionState);
  webrtcSdk.on('changeInterrupted', changeInterrupted);
  webrtcSdk.on('changeActive', changeActive);
  webrtcSdk.on('endOfCandidates', endOfCandidates);
  webrtcSdk.on('disconnected', disconnected);
  webrtcSdk.on('connected', connected);
  webrtcSdk.on('conversationUpdate', handleConversationUpdate);
  webrtcSdk.on('station', handleStationUpdate);
  webrtcSdk.on('resolutionUpdated', handleResolutionUpdate);

  /* media related */
  webrtcSdk.media.on('audioTrackVolume', handleAudioChange);
  webrtcSdk.media.on('state', handleMediaStateChanges);
  webrtcSdk.media.on('gumRequest', handleGumRequest);

  /* headset related */
  webrtcSdk.headset.headsetEvents$.subscribe(handleHeadsetEvent);
}

function requestMicPermissions () {
  return webrtcSdk.media.requestMediaPermissions('audio');
}

function requestCameraPermissions () {
  return webrtcSdk.media.requestMediaPermissions('video');
}

function requestAllPermissions () {
  return webrtcSdk.media.requestMediaPermissions('both');
}

function enumerateDevices () {
  return webrtcSdk.media.enumerateDevices(true);
}

function logMediaState (state) {
  utils.writeToMediaStateLog(JSON.stringify(state, null, 2));
  console.log('mediaState', state);
}

function getCurrentMediaState () {
  const state = webrtcSdk.media.getState();
  logMediaState(state);


  /* if it was a device change, fill the device selectors */
  if (state.eventType === 'devices') {
    const addOptions = (elId, options, skipSysDefault = false) => {
      const element = document.querySelector('select#' + elId);
      let innerHtml = skipSysDefault ? '' : '<option value="">System Default</option>';
      const newOpts = options.map(opt => `<option value="${opt.deviceId}">${opt.label}</option>`);
      innerHtml += newOpts.join('\n');
      element.innerHTML = innerHtml;
    };

    addOptions('audio-devices', state.audioDevices);
    addOptions('video-devices', state.videoDevices);
    addOptions('output-devices', state.outputDevices, true);
  }
}

function handleGumRequest (request) {
  console.log('gumRequest', request);
}

function handleMediaStateChanges (state) {
  logMediaState(state);

  /* if it was a device change, fill the device selectors */
  if (state.eventType === 'devices') {
    const addOptions = (elId, devices) => {
      const element = document.querySelector('select#' + elId);
      const currentElValue = element.value;
      const devicesWithIdsAndLabels = devices.filter(d => d.deviceId && d.label);
      let innerHtml = `<option ${!devicesWithIdsAndLabels.length ? 'selected' : ''} value="">System Default</option>`;
      const newOpts = devicesWithIdsAndLabels.map(device => {
        return `<option ${currentElValue === device.deviceId ? 'selected' : ''} value="${device.deviceId}">${device.label}</option>`;
      });
      innerHtml += newOpts.join('\n');
      element.innerHTML = innerHtml;
    };

    addOptions('audio-devices', state.audioDevices);
    addOptions('video-devices', state.videoDevices);
    addOptions('output-devices', state.outputDevices);
  }
}

function handleAudioChange (info) {
  let allPids = document.querySelectorAll('.pid');
  let amountOfPids = Math.round(info.volume / 10);
  let elementsRange = Array.from(allPids).slice(0, amountOfPids);
  for (var i = 0; i < allPids.length; i++) {
    allPids[i].style.backgroundColor = "#e6e7e8";
  }
  for (var i = 0; i < elementsRange.length; i++) {
    elementsRange[i].style.backgroundColor = "#69ce2b";
  }
}

function acceptPendingSession ({ conversationId }) {
  webrtcSdk.acceptPendingSession({ conversationId });
}

function rejectPendingSession ({ conversationId }) {
  webrtcSdk.rejectPendingSession({ conversationId });
}

function setConversationHeld ({ held, conversationId }) {
  webrtcSdk.setConversationHeld({ held, conversationId });
}

function endSession (props) {
  webrtcSdk.endSession(props);

  document.getElementById('video-actions').classList.add('hidden');
  const startControls = document.querySelectorAll('.start-controls');
  startControls.forEach(el => el.classList.remove('hidden'));
}

function setAudioMute (props) {
  webrtcSdk.setAudioMute(props);
}

function requestWebhidPermissions ({ callback }) {
  const element = document.getElementById('webhid-permissions-btn');
  element.classList.remove('d-none');
  element.onclick = () => {
    callback();
    element.classList.add('d-none');
  }
}

function exposeGlobalFunctions () {
  window.acceptPendingSession = acceptPendingSession;
  window.rejectPendingSession = rejectPendingSession;
  window.setAudioMute = setAudioMute;
  window.startScreenShare = startScreenShare;
  window.setConversationHeld = setConversationHeld;
  window.endSession = endSession;
}

function handleHeadsetEvent (event) {
  const payload = event.payload || {};
  const { holdRequested, isMuted, conversationId } = payload;

  let loggable = event;
  if (event.event === HeadsetEvents.implementationChanged) {
    loggable = { event: event.event, payload: '** REDACTED **' };
  }
  utils.writeToLog(`Headset Event: ${JSON.stringify(loggable)}`);

  switch(event.event) {
    case HeadsetEvents.implementationChanged:
      const name = payload.vendorName || 'none';
      document.getElementById('headset-vendor').innerText = name;
      break;
    case HeadsetEvents.deviceHoldStatusChanged:
      setConversationHeld({ held: holdRequested, conversationId })
      break;
    case HeadsetEvents.deviceMuteStatusChanged:
      setAudioMute({ mute: isMuted, conversationId: currentConversationId });
      break;
    case HeadsetEvents.deviceAnsweredCall:
      if (sdk.sessionManager.getPendingSession({ conversationId })) {
        acceptPendingSession({ conversationId });
      }
      break;
    case HeadsetEvents.deviceEndedCall:
      endSession({ conversationId });
      break;
    case HeadsetEvents.deviceRejectedCall:
      rejectPendingSession({ conversationId });
      break;
    case HeadsetEvents.webHidPermissionRequested:
      requestWebhidPermissions(event.payload);
      break;
    case HeadsetEvents.deviceConnectionStatusChanged:
      document.getElementById('headset-connection').innerText = payload;
      break;
  }
}

function _getLogHeader (functionName) {
  return `${functionName}\n---------------------`;
}

function startSoftphoneSession () {
  const numberToCall = getInputValue('outbound-phone-number');
  if (!numberToCall) {
    document.getElementById('log-data').value += 'Phone Number is required to place an outbound call\n';
    return;
  }

  let body = { phoneNumber: numberToCall };
  webrtcSdk.startSoftphoneSession(body);
}

function changeVolume () {
  const volume = parseInt(getInputValue('volume-input'), 10);

  webrtcSdk.updateAudioVolume(volume);
}

function disconnectSdk () {
  const reallyDisconnect = window.confirm('Are you sure you want to disconnect?');
  if (!reallyDisconnect) {
    return;
  }

  webrtcSdk.disconnect();
  utils.writeToLog('Disconnected -- Reauthenticate to reconnect');
}

async function destroySdk () {
  utils.writeToLog('destroying sdk');
  await webrtcSdk.destroy();
  utils.writeToLog('sdk completely destroyed');
}

function getInputValue (inputId) {
  return document.getElementById(inputId).value;
}

/* --------------------------- */
/* SDK EVENT HANDLER FUNCTIONS */
/* --------------------------- */

function ready () {
  if (!webrtcSdk._personDetails) {
    webrtcSdk.startScreenShare();
  }
  utils.writeToLog('webrtcSDK ready event emitted');
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

  utils.writeToLog(output);
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
          <th scope="row">${user.email}</th>
          <th >${user.name}</th>
          <td>${user.id}</td>
          <td>${org.name}</td>
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

function handleConversationUpdate (event) {
  console.debug('received `conversationUpdate` event', event);
  conversationUpdatesToRender.activeConversationId = event.activeConversationId;
  currentConversationId = event.activeConversationId;
  event.current.forEach(convoEvt => {
    conversationUpdatesToRender.conversations[convoEvt.conversationId] = convoEvt;
  });
  event.removed.forEach(convoEvt => {
    conversationUpdatesToRender.conversations[convoEvt.conversationId] = convoEvt;
  });
  renderSessions();
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
          <th scope="col">Is the active convo?</th>
          <th scope="col">Non concurrent Sess.</th>
          <th scope="col">session state</th>
          <th scope="col">direction</th>
          <th scope="col">call state</th>
          <th scope="col">muted</th>
          <th scope="col">held</th>
          <th scope="col">confined</th>
          <th scope="col">Mute</th>
          <th scope="col">Hold</th>
          <th scope="col">End</th>
        </tr>
      </thead>
      <tbody id="${tableBodyId}">
      </tbody>
    </table>`;
    tableBody = document.getElementById(tableBodyId);
  }

  Object.values(conversationUpdatesToRender.conversations).forEach(update => {
    const isTheActiveConversation = update.conversationId === conversationUpdatesToRender.activeConversationId;
    const isSessionActive = update.session ? update.session.state === 'active' : undefined;
    const isCallActive = update.mostRecentCallState.state !== 'disconnected'
      && update.mostRecentCallState.state !== 'terminated'
    const isCallMuted = update.mostRecentCallState.muted;
    const isCallHeld = update.mostRecentCallState.held;
    const isCallConfined = update.mostRecentCallState.confined;

    html += `<tr>
    <th scope="row">${update.conversationId}</th>
    <td>${update.session ? update.session.id : '(none)'}</td>
    <td
      class="${isTheActiveConversation ? 'text-success' : ''}"
    >${isTheActiveConversation}</td>
    <td>${!sdk.isConcurrentSoftphoneSessionsEnabled()}</td>
    <td
      class="${isSessionActive ? 'text-success' : 'text-danger'}"
    >${update.session ? update.session.state : '(none)'}</td>
    <td>${update.mostRecentCallState.direction}</td>
    <td
      class="${isCallActive ? 'text-success' : 'text-danger'}"
    >${update.mostRecentCallState.state}</td>
    <td
      class="${isCallMuted ? 'text-warning' : 'text-info'}"
    >${isCallMuted}</td>
    <td
      class="${isCallHeld ? 'text-warning' : 'text-info'}"
    >${isCallHeld}</td>
    <td
      class="${isCallConfined ? 'text-warning' : 'text-info'}"
    >${isCallConfined}</td>

    <td>
      <button type="button" class="btn btn-info btn-sm"
        onclick="setAudioMute({mute: ${!isCallMuted},conversationId:'${update.conversationId}'})"
        ${isCallActive ? '' : 'disabled'}
      >${isCallMuted ? 'Unmute' : 'Mute'}</button>
    </td>
    <td>
      <button type="button" class="btn btn-info btn-sm"
        onclick="setConversationHeld({held: ${!isCallHeld},conversationId:'${update.conversationId}'})"
        ${isCallActive ? '' : 'disabled'}
      >${isCallHeld ? 'Unhold' : 'Hold'}</button>
    </td>
    <td>
      <button type="button" class="btn btn-danger btn-sm"
        onclick="endSession({conversationId:'${update.conversationId}'})"
        ${isCallActive ? '' : 'disabled'}
      >End</button>
    </td>
  </tr>`
  });
  tableBody.innerHTML = html;
}

function handleStationUpdate (event) {
  const stationEl = document.querySelector('#stations-element');
  if (!event.station) {
    return stationEl.innerHTML = `
      <h5 class="no-station text-danger m-3">
        (No Station)
      </h5>`;
  }

  const {
    name,
    status,
    type,
    webRtcPersistentEnabled,
    webRtcCallAppearances,
    webRtcForceTurn
  } = event.station;

  stationEl.innerHTML = `
  <table class="table">
    <thead>
      <th scope="col">Name</th>
      <th scope="col">Status</th>
      <th scope="col">Type</th>
      <th scope="col">Persistent Conn.</th>
      <th scope="col">Line Appearance</th>
      <th scope="col">Force TURN</th>
    </thead>
    <tbody>
      <tr>
        <td scope="row">${name}</td>
        <td>${status}</td>
        <td>${type}</td>
        <td>${webRtcPersistentEnabled}</td>
        <td>${webRtcCallAppearances}</td>
        <td>${webRtcForceTurn}</td>
      </tr>
    </tbody>
  </table>`;
}

function handleResolutionUpdate (event) {
  const { requestedResolution, actualResolution } = event;
  if (requestedResolution?.width !== actualResolution?.width && requestedResolution?.height !== actualResolution?.height) {
    const resolutionShorthands = Object.keys(videoResolutions);
    const selectedShorthand = resolutionShorthands.find(resolutionKey => {
      if (resolutionKey === 'default' && !requestedResolution) {
        return resolutionKey;
      }
      return videoResolutions[resolutionKey]?.width === actualResolution?.width && videoResolutions[resolutionKey]?.height === actualResolution?.height;
    });

    if (selectedShorthand) {
      document.getElementById('video-resolutions').selectedIndex = resolutionShorthands.indexOf(selectedShorthand);
    } else {
      document.getElementById('unique-resolution').innerText = actualResolution.height + " x " + actualResolution.width;
      document.getElementById('unique-resolution').value = JSON.stringify({ width: actualResolution.width, height: actualResolution.height });
      document.getElementById('video-resolutions').selectedIndex = resolutionShorthands.length;
    }
  }
}

function cancelPendingSession (params) {
  let output = `${_getLogHeader('cancelPendingSession')}
    sessionId: ${params.sessionId}
    conversationId: ${params.conversationId}`;

  pendingSessions = pendingSessions.filter(s => s.conversationId !== params.conversationId);
  renderPendingSessions();
  utils.writeToLog(output);
}

function handledPendingSession (params) {
  let output = `${_getLogHeader('handledPendingSession')}
    sessionId: ${params.sessionId}
    conversationId: ${params.conversationId}`;

  pendingSessions = pendingSessions.filter(s => s.conversationId !== params.conversationId);
  renderPendingSessions();
  utils.writeToLog(output);
}

function getDeviceId (type) {
  const el = document.querySelector(`select#${type}-devices`);
  const value = el ? el.value : '';
  return value || true;
}

async function sessionStarted (session) {
  let output = `${_getLogHeader('sessionStarted')}
    conversationId: ${session.conversationId}
    sessionId: ${session.sid}`;
  // conversationUpdatesToRender.push(session);
  // renderSessions();
  utils.writeToLog(output);

  if (session.sessionType === 'collaborateVideo') {
    currentConversationId = session.conversationId;
    const audioElement = document.getElementById('vid-audio');
    const videoElement = document.getElementById('vid-video');
    const vanityVideoElement = document.getElementById('vanity-view');
    session.once('incomingMedia', () => {
      const element = document.getElementById('waiting-for-media');
      element.classList.add('hidden');

      const controls = document.getElementById('video-actions');
      controls.classList.remove('hidden');

      document.getElementById('select-video-resolution').classList.remove('hidden')
    });

    let mediaStream;

    if (!videoOpts.video && !videoOpts.audio) {
      mediaStream = new MediaStream();
    } else if (!videoOpts.video || !videoOpts.audio || videoOpts.videoResolution) {
      if (videoOpts.video) {
        videoOpts.video = getDeviceId('video');
      }

      if (videoOpts.audio) {
        videoOpts.audio = getDeviceId('audio');
      }

      console.log({ videoOpts });
      mediaStream = await webrtcSdk.startMedia(videoOpts);
    }

    const sessionEventsToLog = ['participantsUpdate', 'activeVideoParticipantsUpdate', 'speakersUpdate'];
    sessionEventsToLog.forEach((eventName) => {
      session.on(eventName, (e) => {
        console.info(eventName, e);
        utils.writeToLog(JSON.stringify({ eventName, details: e }, null, 2));
      });
    });
    webrtcSdk.acceptSession({ conversationId: session.conversationId, audioElement, videoElement, mediaStream });

    session.once('incomingMedia', () => {
      vanityVideoElement.autoplay = true;
      vanityVideoElement.volume = 0;
      vanityVideoElement.srcObject = session._outboundStream;
    });
    currentSession = session;
  }
}

function updateOutgoingMediaDevices (type = 'both'/* 'video' | 'audio' | 'both' */) {
  let audioDeviceId;
  let videoDeviceId;

  if (type === 'both' || type === 'video') {
    videoDeviceId = getDeviceId('video');
  }

  if (type === 'both' || type === 'audio') {
    audioDeviceId = getDeviceId('audio');
  }

  // let videoDeviceId = (currentSession.sessionType === 'collaborateVideo')
  //   ? document.querySelector('select#video-devices').value || true
  //   : false;

  webrtcSdk.updateDefaultDevices({ videoDeviceId, audioDeviceId, updateActiveSessions: true });
}

function updateOutputMediaDevice () {
  const audioOutputDeviceId = getDeviceId('output');
  webrtcSdk.updateOutputDevice(audioOutputDeviceId);
}

function updateDefaultDevices (options) {
  /* options = {
    updateVideoDefault: boolean;
    updateAudioDefault: boolean;
    updateOutputDefault: boolean;
    updateActiveSessions: boolean;
  } */
  const sdkOpts = {
    videoDeviceId: undefined, // `undefined` will not change that device | `null` will reset to system default
    audioDeviceId: undefined,
    outputDeviceId: undefined,
    updateActiveSessions: options.updateActiveSessions
  };

  if (options.updateVideoDefault) {
    const value = getDeviceId('video');
    sdkOpts.videoDeviceId = value !== false ? value : null; // `null` resets to sys default
  }

  if (options.updateAudioDefault) {
    const value = getDeviceId('audio');
    sdkOpts.audioDeviceId = value !== false ? value : null; // `null` resets to sys default
  }

  if (options.updateOutputDefault) {
    const value = getDeviceId('output');
    sdkOpts.outputDeviceId = value; // defaults are not allowed for output
  }

  webrtcSdk.updateDefaultDevices(sdkOpts);
}

function sessionEnded (session, reason) {
  let output = `${_getLogHeader('sessionEnded')}
    sessionId: ${session.sid}
    conversationId: ${session.conversationId}
    isPersistentConnection: ${session.isPersistentConnection}
    isSessionStillActive: ${session.active}
    reason: ${JSON.stringify(reason, null, 2)}`;

  currentConversationId = null;
  utils.writeToLog(output);
}

function trace (level, message, details) {
  let output = `${_getLogHeader('trace')}\n`;
  output += `  level: ${level}\n  message: ${message}\n  details: ${details}`;

  const logTraces = document.getElementById('log-traces-check').checked;
  if (logTraces) {
    utils.writeToLog(output);
  }
}

function error (error, details) {
  let output = `${_getLogHeader('error')}
    error: ${error}\n  details: ${details}`;

  utils.writeToLog(output);
}

function terminated (session, reason) {
  let output = `${_getLogHeader('terminated')}
    reason: ${reason}
    conversationId: ${session.conversationId}
    sessionId: ${session.sid}`;

  utils.writeToLog(output);
}

function changeConnectionState (session, connectionState) {
  let output = `${_getLogHeader('changeConnectionState')}
    connectionState: ${JSON.stringify(connectionState)}
    conversationId: ${session.conversationId}
    sessionId: ${session.sid}`;

  utils.writeToLog(output);
}

function changeInterrupted (session, interrupted) {
  let output = `${_getLogHeader('changeInterrupted')}
    conversationId: ${session.conversationId}
    sessionId: ${session.sid}
    interrupted: ${interrupted}`;

  utils.writeToLog(output);
}

function changeActive (session, active) {
  let output = `${_getLogHeader('changeActive')}
    conversationId: ${session.conversationId}
    sessionId: ${session.sid}
    active: ${active}`;

  utils.writeToLog(output);
}

function endOfCandidates () {
  utils.writeToLog('endOfCandidates event');
}

function disconnected (e) {
  utils.writeToLog('disconnected event' + e);
}

function connected (e) {
  utils.writeToLog('connected event', e);
}

async function startVideoConference ({ noAudio, noVideo, mediaStream, useConstraints } = {}, answerPendingSession) {
  let videoResolution;

  if (useConstraints) {
    videoResolution = JSON.parse(window['media-constraints'].value);
    console.log('proceeding with custom resolution', videoResolution);
  }

  videoOpts = { video: !noVideo, audio: !noAudio, mediaStream, videoResolution };

  if (answerPendingSession) {
    webrtcSdk.acceptPendingSession({ conversationId: currentConversationId });
  } else {
    const roomJid = getInputValue('video-jid');
    if (!roomJid) {
      const message = 'roomJid required to start a video call';
      document.getElementById('log-data').value += `${message}\n`;
      throw new Error(message);
    }

    localStorage.setItem('sdk_room_jid', roomJid);

    webrtcSdk.startVideoConference(roomJid, getInputValue('invitee-jid'));
  }

  const element = document.getElementById('waiting-for-media');
  element.classList.remove('hidden');

  const startControls = document.querySelectorAll('.start-controls');
  startControls.forEach(el => el.classList.add('hidden'));
}

function setVideoMute (mute) {
  webrtcSdk.setVideoMute({ conversationId: currentConversationId, mute });
}


function startScreenShare () {
  currentSession.startScreenShare();
  const vanityVideoElement = document.getElementById('vanity-view');
  vanityVideoElement.autoplay = true;
  vanityVideoElement.volume = 0;
  vanityVideoElement.srcObject = currentSession._outboundStream;
}

function stopScreenShare () {
  currentSession.stopScreenShare();
}

function pinParticipantVideo () {
  webrtcSdk.pinParticipantVideo(getInputValue('participant-pin'));
}

function updateVideoResolution () {
  const requestedResolution = document.getElementById('video-resolutions').value
  if (requestedResolution.includes('width') && requestedResolution.includes('height')) {
    const requestedResolutionAsObject = JSON.parse(requestedResolution);
    webrtcSdk.updateDefaultResolution({ width: requestedResolutionAsObject.width, height: requestedResolutionAsObject.height }, true);
  } else {
    webrtcSdk.updateDefaultResolution(videoResolutions[requestedResolution], true);
  }
}

let systemPresences;
async function updateOnQueueStatus (goingOnQueue) {
  if (!systemPresences) {
    systemPresences = (await webrtcSdk._http.requestApi(`systempresences`, {
      method: 'get',
      host: webrtcSdk._config.environment,
      authToken: webrtcSdk._config.accessToken
    })).data;
  }

  let presenceDefinition;
  if (goingOnQueue) {
    presenceDefinition = systemPresences.find(p => p.name === 'ON_QUEUE');
  } else {
    presenceDefinition = systemPresences.find(p => p.name === 'AVAILABLE');
  }

  const requestOptions = {
    method: 'patch',
    host: webrtcSdk._config.environment,
    authToken: webrtcSdk._config.accessToken,
    data: JSON.stringify({ presenceDefinition })
  };
  return await webrtcSdk._http.requestApi(`users/${webrtcSdk._personDetails.id}/presences/PURECLOUD`, requestOptions);
}

export default {
  getCurrentMediaState,
  requestMicPermissions,
  requestCameraPermissions,
  requestAllPermissions,
  enumerateDevices,
  startSoftphoneSession,
  changeVolume,
  startVideoConference,
  setVideoMute,
  setAudioMute,
  startScreenShare,
  stopScreenShare,
  updateOutgoingMediaDevices,
  updateOutputMediaDevice,
  updateDefaultDevices,
  disconnectSdk,
  destroySdk,
  initWebrtcSDK,
  pinParticipantVideo,
  updateOnQueueStatus,
  endSession,
  updateVideoResolution
};
