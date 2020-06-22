import controller from './app-controller';

function initApp (noAuth) {
  const envInput = noAuth ? document.getElementById('screenshare-environment').value : document.getElementById('environment').value;
  const environmentInfo = window.environments[envInput];
  controller.initialize(environmentInfo, window.conversationsAPI, noAuth);
}

document.getElementById('start-app-button').addEventListener('click', () => initApp(false));
document.getElementById('start-app-no-auth-button').addEventListener('click', () => initApp(true));
document.getElementById('clear-log').addEventListener('click', controller.clearLog);

// Pre-populate outbound call input with something to test
document.getElementById('outbound-phone-number').value = '*86';
