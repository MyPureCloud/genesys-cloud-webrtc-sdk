const utils = require('./utils');

let currentConversationId;
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
  const options = { accessToken, environment };

  webrtcSdk = new window.PureCloudWebrtcSdk(options);

  return webrtcSdk.initialize()
    .then(() => {
      connectEventHandlers();
      utils.writeToLog(`SDK initialized with ${JSON.stringify(options, null, 2)}`);
    });
}

function connectEventHandlers () {
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

  let body = {phoneNumber: numberToCall};
  conversationsApi.postConversationsCalls(body)
    .then((data) => {
      currentConversationId = data.id;
    })
    .catch(err => console.log(err));
}

function endCall () {
  if (!currentConversationId) {
    utils.writeToLog('No currently active conversation');
    return;
  }

  conversationsApi.postConversationDisconnect(currentConversationId)
    .then(() => {
      utils.writeToLog('Call ended');
      currentConversationId = null;
    })
    .catch(err => console.log(err));
}

function answerCall () {
  if (!currentSessionId) {
    utils.writeToLog('There is no session to connect to');
    return;
  }

  webrtcSdk.acceptPendingSession(currentSessionId);
}

function disconnectSdk () {
  const reallyDisconnect = window.confirm('Are you sure you want to disconnect?');
  if (!reallyDisconnect) {
    return;
  }

  webrtcSdk.disconnect();
  utils.writeToLog('Disconnected -- Reauthenticate to reconnect');
}

function rejectCall () {
  utils.writeToLog(`rejecting sessionId: ${currentSessionId}`);
  webrtcSdk.rejectPendingSession(currentSessionId);
}

function getInputValue (inputId) {
  return document.getElementById(inputId).value;
}

/* --------------------------- */
/* SDK EVENT HANDLER FUNCTIONS */
/* --------------------------- */

// pendingSession - {id, address, conversationId, autoAnswer}
function pendingSession (options) {
  let output = `${_getLogHeader('pendingSession')}
    id: ${JSON.stringify(options.id)}
    address: ${JSON.stringify(options.address)}
    conversationId: ${JSON.stringify(options.conversationId)}
    autoAnswer: ${JSON.stringify(options.autoAnswer)}`;

  currentSessionId = options.id;
  currentConversationId = options.conversationId;

  utils.writeToLog(output);
}

// cancelPendingSession
function cancelPendingSession (id) {
  let output = `${_getLogHeader('cancelPendingSession')}
    id: ${id}`;

  currentConversationId = null;
  currentSessionId = null;
  utils.writeToLog(output);
}

// handledPendingSession
function handledPendingSession (id) {
  let output = `${_getLogHeader('handledPendingSession')}
    id: ${id}`;

  currentSessionId = id;
  utils.writeToLog(output);
}

// sessionStarted
function sessionStarted (session) {
  let output = `${_getLogHeader('sessionStarted')}
    sessionId: ${session.sid}`;

  currentSessionId = session.sid;
  utils.writeToLog(output);
}

// sessionEnded
function sessionEnded (session, reason) {
  let output = `${_getLogHeader('sessionEnded')}
    sessionId: ${session.sid}
    reason: ${JSON.stringify(reason, null, 2)}`;

  currentSessionId = null;
  utils.writeToLog(output);
}

// trace
function trace (level, message, details) {
  let output = `${_getLogHeader('trace')}\n`;
  output += `  level: ${level}\n  message: ${message}\n  details: ${details}`;

  const logTraces = document.getElementById('log-traces-check').checked;
  if (logTraces) {
    utils.writeToLog(output);
  }
}

// error
function error (error, details) {
  let output = `${_getLogHeader('error')}
    error: ${error}\n  details: ${details}`;

  utils.writeToLog(output);
}

// terminated
function terminated (session, reason) {
  let output = `${_getLogHeader('terminated')}
    reason: ${reason}
    sessionId: ${session.sid}`;

  utils.writeToLog(output);
}

// change:connectionState
function changeConnectionState (session, connectionState) {
  let output = `${_getLogHeader('changeConnectionState')}
    connectionState: ${JSON.stringify(connectionState)}
    sessionId: ${session.sid}`;

  utils.writeToLog(output);
}

// change:interrupted
function changeInterrupted (session, interrupted) {
  let output = `${_getLogHeader('changeInterrupted')}
    sessionId: ${session.sid}
    interrupted: ${interrupted}`;

  utils.writeToLog(output);
}

// change:active
function changeActive (session, active) {
  let output = `${_getLogHeader('changeActive')}
    sessionId: ${session.sid}
    active: ${active}`;

  utils.writeToLog(output);
}

// endOfCandidates
function endOfCandidates () {
  utils.writeToLog('endOfCandidates event');
}

module.exports = {
  makeOutboundCall: makeOutboundCall,
  endCall: endCall,
  answerCall: answerCall,
  disconnectSdk: disconnectSdk,
  rejectCall: rejectCall,
  initWebrtcSDK: initWebrtcSDK
};
