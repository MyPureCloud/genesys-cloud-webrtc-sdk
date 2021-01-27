/* global MediaStream */

import { getSdk, GenesysCloudWebrtcSdk } from '../sdk-proxy';
import utils from './utils';

let currentSession;
let videoOpts;
let currentSessionId;
let webrtcSdk;
let conversationsApi;

function initWebrtcSDK (environmentData, _conversationsApi, noAuth) {
  let options = {};
  let initOptions = null;
  conversationsApi = _conversationsApi;

  if (noAuth) {
    initOptions = { securityCode: document.getElementById('security-key').value };
    options.organizationId = document.getElementById('org-id').value;
    options.autoConnectSessions = true;
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

  options.defaults = { monitorMicVolume: true };

  const SDK = GenesysCloudWebrtcSdk || getSdk();
  webrtcSdk = new SDK(options);
  window.webrtcSdk = webrtcSdk;

  connectEventHandlers();
  return webrtcSdk.initialize(initOptions)
    .then(() => {
      utils.writeToLog(`SDK initialized with ${JSON.stringify(options, null, 2)}`);
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

  /* media related */
  webrtcSdk.media.on('audioTrackVolume', handleAudioChange);
  webrtcSdk.media.on('state', handleMediaStateChanges);
}

function requestMicPermissions () {
  return webrtcSdk.media.requestMediaPermissions('audio');
}

function requestCameraPermissions () {
  return webrtcSdk.media.requestMediaPermissions('video');
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

function _getLogHeader (functionName) {
  return `${functionName}\n---------------------`;
}

function makeOutboundCall () {
  const numberToCall = getInputValue('outbound-phone-number');
  if (!numberToCall) {
    document.getElementById('log-data').value += 'Phone Number is required to place an outbound call\n';
    return;
  }

  let body = { phoneNumber: numberToCall };
  conversationsApi.postConversationsCalls(body)
    .catch(err => console.log(err));
}

async function endSession () {
  if (!currentSessionId) {
    utils.writeToLog('No active session');
    return;
  }

  try {
    await webrtcSdk.endSession({ id: currentSessionId });

    const controls = document.getElementById('video-actions');
    controls.classList.add('hidden');

    const startControls = document.querySelectorAll('.start-controls');
    startControls.forEach(el => el.classList.remove('hidden'));

    utils.writeToLog('Call ended');
  } catch (err) {
    console.error(err);
  }
}

function answerCall () {
  if (!currentSessionId) {
    utils.writeToLog('There is no session to connect to');
    return;
  }

  webrtcSdk.acceptPendingSession(currentSessionId);
  currentSessionId = null;
}

function disconnectSdk () {
  const reallyDisconnect = window.confirm('Are you sure you want to disconnect?');
  if (!reallyDisconnect) {
    return;
  }

  webrtcSdk.disconnect();
  utils.writeToLog('Disconnected -- Reauthenticate to reconnect');
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
    address: ${JSON.stringify(options.address)}
    conversationId: ${JSON.stringify(options.conversationId)}
    autoAnswer: ${JSON.stringify(options.autoAnswer)}`;

  currentSessionId = options.id;

  utils.writeToLog(output);
}

function cancelPendingSession (id) {
  let output = `${_getLogHeader('cancelPendingSession')}
    id: ${id}`;

  currentSessionId = null;
  utils.writeToLog(output);
}

function handledPendingSession (id) {
  let output = `${_getLogHeader('handledPendingSession')}
    id: ${id}`;

  currentSessionId = null;
  utils.writeToLog(output);
}

function getDeviceId (type) {
  const el = document.querySelector(`select#${type}-devices`);
  const value = el ? el.value : '';
  return value || true;
}

async function sessionStarted (session) {
  let output = `${_getLogHeader('sessionStarted')}
    sessionId: ${session.sid}`;

  currentSessionId = session.sid;
  currentSession = session;
  utils.writeToLog(output);

  if (session.sessionType === 'collaborateVideo') {
    const audioElement = document.getElementById('vid-audio');
    const videoElement = document.getElementById('vid-video');
    session.once('incomingMedia', () => {
      const element = document.getElementById('waiting-for-media');
      element.classList.add('hidden');

      const controls = document.getElementById('video-actions');
      controls.classList.remove('hidden');
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
    webrtcSdk.acceptSession({ id: session.id, audioElement, videoElement, mediaStream });
  }
}

function updateOutgoingMediaDevices (type = 'both'/* 'video' | 'audio' | 'both' */) {
  if (!currentSessionId) {
    utils.writeToLog('No active session');
    return;
  }
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

  webrtcSdk.updateOutgoingMedia({ sessionId: currentSessionId, videoDeviceId, audioDeviceId });
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
    reason: ${JSON.stringify(reason, null, 2)}`;

  currentSessionId = null;
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
    sessionId: ${session.sid}`;

  utils.writeToLog(output);
}

function changeConnectionState (session, connectionState) {
  let output = `${_getLogHeader('changeConnectionState')}
    connectionState: ${JSON.stringify(connectionState)}
    sessionId: ${session.sid}`;

  utils.writeToLog(output);
}

function changeInterrupted (session, interrupted) {
  let output = `${_getLogHeader('changeInterrupted')}
    sessionId: ${session.sid}
    interrupted: ${interrupted}`;

  utils.writeToLog(output);
}

function changeActive (session, active) {
  let output = `${_getLogHeader('changeActive')}
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
    webrtcSdk.acceptPendingSession(currentSessionId);
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
  webrtcSdk.setVideoMute({ id: currentSessionId, mute });
}

function setAudioMute (mute) {
  webrtcSdk.setAudioMute({ id: currentSessionId, mute });
}

function startScreenShare () {
  currentSession.startScreenShare();
}

function stopScreenShare () {
  currentSession.stopScreenShare();
}

function pinParticipantVideo () {
  currentSession.pinParticipantVideo(getInputValue('participant-pin'));
}

export default {
  getCurrentMediaState,
  requestMicPermissions,
  requestCameraPermissions,
  enumerateDevices,
  makeOutboundCall,
  startVideoConference,
  setVideoMute,
  setAudioMute,
  startScreenShare,
  stopScreenShare,
  endSession,
  updateOutgoingMediaDevices,
  updateOutputMediaDevice,
  updateDefaultDevices,
  answerCall,
  disconnectSdk,
  initWebrtcSDK,
  pinParticipantVideo
};
