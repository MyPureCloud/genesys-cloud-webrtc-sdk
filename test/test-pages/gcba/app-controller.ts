import * as sdkHandler from './sdk-controller';
import { getInputValue, writeToLog } from './utils';

function initControls () {

  /* misc */
  document.getElementById('disconnect-sdk').addEventListener('click', disconnect);
  document.getElementById('clear-log').addEventListener('click', () => clearLog('log-data'));
}

export function clearLog (elId = 'log-data') {
  (document.getElementById(elId) as HTMLTextAreaElement).value = '';
}

function setAppControlVisiblity (visible: boolean) {
  const display = visible ? 'block' : 'none';
  document.getElementById('app-controls').style.display = display;
}

function setInitTextVisibility (visible: boolean) {
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

export function initialize () {
  const envInput = getInputValue('environment');
  const environmentInfo = (window as any).environments[envInput];
  
  // setAppControlVisiblity(false);
  setInitTextVisibility(true);

  sdkHandler.initWebrtcSDK(environmentInfo)
    .then(() => {
      setInitTextVisibility(false);
    })
    .catch((err) => {
      // setAppControlVisiblity(false);
      setInitTextVisibility(false);
      writeToLog(err);
    });
}

function disconnect () {
  sdkHandler.disconnectSdk();
  // setAppControlVisiblity(false);
}

function onLoad () {
  document.getElementById('log-header').addEventListener('click', () => toggleDisplayNone('log-body'));
}

onLoad();