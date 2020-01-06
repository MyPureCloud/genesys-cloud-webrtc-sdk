import sdkHandler from './sdk-controller';
import utils from './utils';

function clearLog () {
  document.getElementById('log-data').value = '';
}

function initControls () {
  document.getElementById('video-start').addEventListener('click', () => sdkHandler.startVideoConference());
  document.getElementById('video-start-no-audio').addEventListener('click', () => sdkHandler.startVideoConference({ noAudio: true }));
  document.getElementById('video-start-no-video').addEventListener('click', () => sdkHandler.startVideoConference({ noVideo: true }));
  document.getElementById('video-start-no-audio-video').addEventListener('click', () => sdkHandler.startVideoConference({ noVideo: true, noAudio: true }));
  document.getElementById('outbound-call-start').addEventListener('click', sdkHandler.makeOutboundCall);
  document.getElementById('outbound-call-end').addEventListener('click', sdkHandler.endSession);
  document.getElementById('video-mute').addEventListener('click', () => sdkHandler.setVideoMute(true));
  document.getElementById('video-unmute').addEventListener('click', () => sdkHandler.setVideoMute(false));
  document.getElementById('audio-mute').addEventListener('click', () => sdkHandler.setAudioMute(true));
  document.getElementById('audio-unmute').addEventListener('click', () => sdkHandler.setAudioMute(false));
  document.getElementById('video-end').addEventListener('click', sdkHandler.endSession);
  document.getElementById('start-screen-share').addEventListener('click', sdkHandler.startScreenShare);
  document.getElementById('stop-screen-share').addEventListener('click', sdkHandler.stopScreenShare);
  document.getElementById('answer-inbound-call').addEventListener('click', sdkHandler.answerCall);
  document.getElementById('inbound-call-end').addEventListener('click', sdkHandler.endSession);
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

function initialize (environmentData, conversationsApi) {
  setAppControlVisiblity(false);
  setInitTextVisibility(true);

  initControls();

  sdkHandler.initWebrtcSDK(environmentData, conversationsApi)
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

export default {
  initialize,
  clearLog
};
