function _getLogHeader(functionName) {
  return `${functionName}\n---------------------`;
}

//pendingSession - {id, address, conversationId, autoAnswer}
function pendingSession(options) {
  let output = `${_getLogHeader('pendingSession')}
    id: ${JSON.stringify(options.id)}
    address: ${JSON.stringify(options.address)}
    conversationId: ${JSON.stringify(options.conversationId)}
    autoAnswer: ${JSON.stringify(options.autoAnswer)}`;

  currentSessionId = options.id;
  currentConversationId = options.conversationId;
  writeToLog(output);
}

//cancelPendingSession
function cancelPendingSession(id) {
  let output = `${_getLogHeader('cancelPendingSession')}
    id: ${id}`;

  currentConversationId = null;
  currentSessionId = null;
  writeToLog(output);
}

//handledPendingSession
function handledPendingSession(id) {
  let output = `${_getLogHeader('handledPendingSession')}
    id: ${id}`;

  currentSessionId = id;
  writeToLog(output);
}

//sessionStarted
function sessionStarted(session) {
  let output = `${_getLogHeader('sessionStarted')}
    sessionId: ${session.sid}`;

  currentSessionId = session.sid;
  writeToLog(output);
}

//sessionEnded
function sessionEnded(session, reason) {
  let output = `${_getLogHeader('sessionEnded')}
    sessionId: ${session.sid}
    reason: ${JSON.stringify(reason)}`;

  currentSessionId = null;
  writeToLog(output);
}

//trace
function trace(level, message, details) {
  let output = `${_getLogHeader('trace')}\n`;
  output += `  level: ${level}\n  message: ${message}\n  details: ${details}`;

  const logTraces = document.getElementById('log-traces-check').checked;
  if (logTraces) {
    writeToLog(output);
  }
}

//error
function error(error, details) {
  let output = `${_getLogHeader('error')}`;
  output += `  error: ${error}\n  details: ${details}`;
  writeToLog(output);
}

//terminated
function terminated(session, reason) {
  let output = `${_getLogHeader('terminated')}`;
  output += `  reason: ${reason}
    sessionId: ${session.sid}`;
  writeToLog(output);
}

//change:connectionState
function changeConnectionState(session, connectionState) {
  let output = `${_getLogHeader('changeConnectionState')}`;
  output += `  connectionState: ${JSON.stringify(connectionState)}
    sessionId: ${sessionId}`;

    writeToLog(output);
}

//change:interrupted
function changeInterrupted(session, interrupted) {
  let output = `${_getLogHeader('changeInterrupted')}
   sessionId: ${sessionId}`;

   output += `  interrupted: ${interrupted}`;
}

//change:active
function changeActive(session, active) {
  let output = `${_getLogHeader('changeActive')}
   sessionId: ${sessionId}`;

   output += `  active: ${active}`;
}

//endOfCandidates
function endOfCandidates() {
  let output = `${_getLogHeader('endOfCandidates')}
   sessionId: ${sessionId}`;

   output += `endOfCandidates event triggered`;
}
