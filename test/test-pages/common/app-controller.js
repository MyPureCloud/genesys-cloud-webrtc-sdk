import sdkHandler from './sdk-controller';
import utils from './utils';

function clearLog () {
  document.getElementById('log-data').value = '';
}

function initControls () {
  /* softphone */
  document.getElementById('outbound-call-start').addEventListener('click', sdkHandler.makeOutboundCall);
  document.getElementById('outbound-call-end').addEventListener('click', sdkHandler.endSession);
  document.getElementById('answer-inbound-call').addEventListener('click', sdkHandler.answerCall);
  document.getElementById('inbound-call-end').addEventListener('click', sdkHandler.endSession);

  /* video controls */
  document.getElementById('video-start').addEventListener('click', () => sdkHandler.startVideoConference());
  document.getElementById('video-start-constraints').addEventListener('click', () => sdkHandler.startVideoConference({ useConstraints: true }));
  document.getElementById('video-start-no-audio').addEventListener('click', () => sdkHandler.startVideoConference({ noAudio: true }));
  document.getElementById('video-start-no-video').addEventListener('click', () => sdkHandler.startVideoConference({ noVideo: true }));
  document.getElementById('video-start-no-audio-video').addEventListener('click', () => sdkHandler.startVideoConference({ noVideo: true, noAudio: true }));
  document.getElementById('video-mute').addEventListener('click', () => sdkHandler.setVideoMute(true));
  document.getElementById('video-unmute').addEventListener('click', () => sdkHandler.setVideoMute(false));
  document.getElementById('audio-mute').addEventListener('click', () => sdkHandler.setAudioMute(true));
  document.getElementById('audio-unmute').addEventListener('click', () => sdkHandler.setAudioMute(false));
  document.getElementById('participant-pin-btn').addEventListener('click', () => sdkHandler.pinParticipantVideo());
  document.getElementById('video-end').addEventListener('click', sdkHandler.endSession);
  document.getElementById('start-screen-share').addEventListener('click', sdkHandler.startScreenShare);
  document.getElementById('stop-screen-share').addEventListener('click', sdkHandler.stopScreenShare);

  /* media devices */
  document.getElementById('update-audio-media').addEventListener('click', () => sdkHandler.updateOutgoingMediaDevices('audio'));
  document.getElementById('update-video-media').addEventListener('click', () => sdkHandler.updateOutgoingMediaDevices('video'));
  document.getElementById('update-outgoing-media').addEventListener('click', () => sdkHandler.updateOutgoingMediaDevices('both'));
  document.getElementById('update-output-media').addEventListener('click', sdkHandler.updateOutputMediaDevice);
  document.getElementById('update-defaults').addEventListener('click', () => sdkHandler.updateDefaultDevices(parseDeviceDefaultOptions()));

  /* misc */
  document.getElementById('disconnect-sdk').addEventListener('click', disconnect);
  document.getElementById('clear-log').addEventListener('click', clearLog);
  document.getElementById('media-devices-header').addEventListener('click', () => toggleDisplayNone('media-devices'));
}

function parseDeviceDefaultOptions () {
  const options = {
    updateVideoDefault: document.querySelector('input#video-device-check-box').checked,
    updateAudioDefault: document.querySelector('input#audio-device-check-box').checked,
    updateOutputDefault: document.querySelector('input#output-device-check-box').checked,
    updateActiveSessions: undefined
  };
  document.querySelectorAll('input[name=updateActiveSessionsWithDefault]').forEach(el => {
    if (el.checked) {
      options.updateActiveSessions = el.value === 'true' ? true : false;
    }
  });
  console.log(options);
  return options;
}

/*
adhoc-878d4f0a-a882-4fe4-87ec-e2605e3a69ca@conference.test-valve-1ym37mj1kao.orgspan.com
*/
function initDevices () {
  window.navigator.mediaDevices.enumerateDevices()
    .then(devices => {
      const video = [];
      const audio = [];
      const output = [];

      devices.forEach((device) => {
        switch (device.kind) {
          case 'videoinput': {
            video.push(device);
            break;
          }
          case 'audioinput': {
            audio.push(device);
            break;
          }
          case 'audiooutput': {
            output.push(device);
            break;
          }
        }
      });

      const addOptions = (elId, options, skipSysDefault = false) => {
        const element = document.querySelector('select#' + elId);
        let innerHtml = skipSysDefault ? '' : '<option value="">System Default</option>';
        const newOpts = options.map(opt => `<option value="${opt.deviceId}">${opt.label}</option>`);
        innerHtml += newOpts.join('\n');
        element.innerHTML = innerHtml;
      };

      addOptions('audio-devices', audio);
      addOptions('video-devices', video);
      addOptions('output-devices', output, true);
    })
    .catch(e => utils.writeToLog(e));
}

function setAppControlVisiblity (visible) {
  const visibility = visible ? 'visible' : 'hidden';
  document.getElementById('app-controls').style.visibility = visibility;
}

function setInitTextVisibility (visible) {
  const display = visible ? 'block' : 'none';
  document.getElementById('init-text').style.display = display;
}

function toggleDisplayNone (elementId) {
  const displayNone = 'd-none';
  const element = document.getElementById(elementId);
  const isHidden = element.classList.contains(displayNone);
  if (isHidden) {
    element.classList.remove(displayNone);
  } else {
    element.classList.add(displayNone);
  }
}

function initialize (environmentData, conversationsApi) {
  setAppControlVisiblity(false);
  setInitTextVisibility(true);

  initControls();
  initDevices();

  window.navigator.mediaDevices.ondevicechange = initDevices;

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

function onLoad () {
  document.getElementById('log-header').addEventListener('click', () => toggleDisplayNone('log-body'));
}

onLoad();

export default {
  initialize,
  clearLog
};
