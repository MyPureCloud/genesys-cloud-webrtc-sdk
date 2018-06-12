const controller = require('./app-controller');

function initApp () {
  const envInput = document.getElementById('environment').value;
  const environmentInfo = environments[envInput];
  controller.initialize(environmentInfo);
}

document.getElementById('start-app-button').addEventListener('click', initApp);
document.getElementById('clear-log').addEventListener('click', controller.clearLog);

// Pre-populate outbound call input with something to test
document.getElementById('outbound-phone-number').value = '*86';
