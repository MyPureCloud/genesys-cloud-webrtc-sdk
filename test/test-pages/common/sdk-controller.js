/* global MediaStream */

import { getSdk, PureCloudWebrtcSdk } from '../sdk-proxy';
import utils from './utils';

let currentSession;
let startVideoOpts;
let currentSessionId;
let webrtcSdk;
let conversationsApi;

function initWebrtcSDK (environmentData, _conversationsApi) {
  conversationsApi = _conversationsApi;

  const accessToken = utils.getAccessToken();
  if (!accessToken) {
    window.alert('You have not authenticated yet');
    throw new Error('Not Authenticated');
  }

  const environment = environmentData.uri;
  const options = { accessToken, environment, logLevel: 'info' };

  const SDK = PureCloudWebrtcSdk || getSdk();
  webrtcSdk = new SDK(options);
  window.webrtcSdk = webrtcSdk;

  connectEventHandlers();
  return webrtcSdk.initialize()
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
}

function _getLogHeader (functionName) {
  return `${functionName}\n---------------------`;
}

function makeOutboundCall () {
  const numberToCall = getInputValue('outbound-phone-number');
  if (!numberToCall) {
    document.getElementById('output-data').value += 'Phone Number is required to place an outbound call\n';
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

    const controls = document.getElementById('video-controls');
    controls.classList.add('hidden');

    const startControls = document.getElementById('start-controls');
    startControls.classList.remove('hidden');

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
  utils.writeToLog('webrtcSDK ready event emitted');
}

// pendingSession - {id, address, conversationId, autoAnswer}
function pendingSession (options) {
  let output = `${_getLogHeader('pendingSession')}
    id: ${JSON.stringify(options.id)}
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

      const controls = document.getElementById('video-controls');
      controls.classList.remove('hidden');
    });

    let mediaStream;

    if (!startVideoOpts.video && !startVideoOpts.audio) {
      mediaStream = new MediaStream();
    } else if (!startVideoOpts.video || !startVideoOpts.audio) {
      if (startVideoOpts.video) {
        startVideoOpts.video = document.querySelector('select#video-device').value || true;
      }

      if (startVideoOpts.audio) {
        startVideoOpts.audio = document.querySelector('select#audio-device').value || true;
      }

      console.log({ startVideoOpts });
      mediaStream = await webrtcSdk.createMedia(startVideoOpts);
    }

    const sessionEventsToLog = ['participantsUpdate', 'activeVideoParticipantsUpdate', 'speakersUpdate'];
    sessionEventsToLog.forEach((eventName) => {
      session.on(eventName, (e) => console.info(eventName, e));
    });
    webrtcSdk.acceptSession({ id: session.id, audioElement, videoElement, mediaStream });
  }
}

function updateOutgoingMediaDevices () {
  if (!currentSessionId) {
    utils.writeToLog('No active session');
    return;
  }

  // TODO: I broke the "start-without-..." buttons because this element does not exist yet
  //   fix, should probably just show these buttons because we want to be able to start
  //   with desired media
  const audioDeviceId = document.querySelector('select#audio-devices').value || true;
  const videoDeviceId = (currentSession.sessionType === 'collaborateVideo')
    ? document.querySelector('select#video-devices').value || true
    : false;

  webrtcSdk.updateOutgoingMedia({ sessionId: currentSessionId, videoDeviceId, audioDeviceId });
}

function updateOutputMediaDevice () {
  const audioOutputDeviceId = document.querySelector('select#output-devices').value;
  webrtcSdk.updateOutputDevice(audioOutputDeviceId);
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

async function startVideoConference ({ noAudio, noVideo } = {}) {
  const roomJid = getInputValue('video-jid');
  if (!roomJid) {
    document.getElementById('output-data').value += 'Phone Number is required to place an outbound call\n';
    return;
  }

  startVideoOpts = { video: !noVideo, audio: !noAudio };

  webrtcSdk.startVideoConference(roomJid);
  const element = document.getElementById('waiting-for-media');
  element.classList.remove('hidden');

  const startControls = document.getElementById('start-controls');
  startControls.classList.add('hidden');
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

export default {
  makeOutboundCall,
  startVideoConference,
  setVideoMute,
  setAudioMute,
  startScreenShare,
  stopScreenShare,
  endSession,
  updateOutgoingMediaDevices,
  updateOutputediaDevice: updateOutputMediaDevice,
  answerCall,
  disconnectSdk,
  initWebrtcSDK
};
