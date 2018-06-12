const sdkHandler = require('./sdk-controller');
const utils = require('./utils');

function clearLog () {
  document.getElementById('log-data').value = '';
}

function initControls () {
  document.getElementById('outbound-call-start').addEventListener('click', sdkHandler.makeOutboundCall);
  document.getElementById('outbound-call-end').addEventListener('click', sdkHandler.endCall);
  document.getElementById('answer-inbound-call').addEventListener('click', sdkHandler.answerCall);
  document.getElementById('inbound-call-end').addEventListener('click', sdkHandler.endCall);
  document.getElementById('reject-inbound-call').addEventListener('click', sdkHandler.rejectCall);
  document.getElementById('disconnect-sdk').addEventListener('click', disconnect);
  document.getElementById('clear-log').addEventListener('click', clearLog);
}

function setAppControlVisiblity (visible) {
  const visibility = visible ? 'visible' : 'hidden';
  document.getElementById('app-controls').style.visibility = visibility;
}

function setInitTextVisibility (visible) {
  const display = visible ? 'block' : 'none';
  document.getElementById('init-text').style.display = display;
}

function initialize (environmentData) {
  setAppControlVisiblity(false);
  setInitTextVisibility(true);

  initControls();

  sdkHandler.initWebrtcSDK(environmentData)
    .then(() => {
      setAppControlVisiblity(true);
      setInitTextVisibility(false);
    })
    .catch((err) => {
      setAppControlVisiblity(false);
      setInitTextVisibility(false);
      utils.writeToLog(err);
    });
}

function disconnect () {
  sdkHandler.disconnectSdk();
  setAppControlVisiblity(false);
}

module.exports = {
  initialize: initialize,
  clearLog: clearLog
};
