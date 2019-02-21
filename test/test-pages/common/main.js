const controller = require('./app-controller');
const pureCloudWebTelemetry = require('purecloud-web-telemetry');

pureCloudWebTelemetry.wrap();
window.pureCloudWebTelemetry = pureCloudWebTelemetry;

function initApp () {
  const envInput = document.getElementById('environment').value;
  const environmentInfo = window.environments[envInput];
  controller.initialize(environmentInfo, window.conversationsAPI);
}

document.getElementById('start-app-button').addEventListener('click', initApp);
document.getElementById('clear-log').addEventListener('click', controller.clearLog);

// Pre-populate outbound call input with something to test
document.getElementById('outbound-phone-number').value = '*86';
