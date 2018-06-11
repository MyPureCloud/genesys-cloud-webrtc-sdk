const platformClient = require('platformClient');
const client = platformClient.ApiClient.instance;
const ORG_ID = 'e0c78f37-cab9-4985-9fea-74da8a3170a1';

let webrtc_sdk;
let currentConversationId;
let currentSessionId;

function writeToLog(output) {
  let timeStamp = new Date().toString();
  let stampedOutput = '\n' + timeStamp + '\n' + output + '\n';
  document.getElementById('log-data').value += stampedOutput;
}

(function(){
  const environments = {
    'dca': {
      clientId: '08d54b47-966c-4f4f-9811-f443a69a259f',
      uri: 'inindca.com'
    },
    'pca-us': {
      clientId: '21a1fa66-c7ea-4f06-8f29-cb2c99184101',
      uri: 'mypurecloud.com'
    }
  }

  function getInputValue(inputId) {
    return document.getElementById(inputId).value;
  }

  function setAuthTextVisible(visible) {
    const style = visible ? 'visible' : 'hidden';
    document.getElementById('auth-text').style.visibility = style;
  }

  function setAppControlsVisible(visible) {
    const style = visible ? 'visible' : 'hidden';
    document.getElementById('app-controls').style.visibility = style;
  }

  function initClientEnvironment(environment) {
    client.setPersistSettings(true, 'sdk-test');
    client.setEnvironment(environments[environment].uri);
  }

  function initWebrtcSDK(authInfo) {
    if (!authInfo) {
      throw new Error('Not authenticated');
    }

    const accessToken = authInfo.accessToken;
    const envInput = getInputValue('environment');
    const environment = environments[envInput].uri;
    const orgId = ORG_ID;
    const options = {accessToken, environment, orgId};

    webrtc_sdk = new PureCloudWebrtcSdk(options);
    webrtc_sdk.initialize();
    webrtc_sdk.on('pendingSession', pendingSession);
    webrtc_sdk.on('cancelPendingSession', cancelPendingSession);
    webrtc_sdk.on('handledPendingSession', handledPendingSession);
    webrtc_sdk.on('sessionStarted', sessionStarted);
    webrtc_sdk.on('sessionEnded', sessionEnded);
    webrtc_sdk.on('trace', trace);
    webrtc_sdk.on('error', error);
    webrtc_sdk.on('terminated', terminated);
    webrtc_sdk.on('changeConnectionState', changeConnectionState);
    webrtc_sdk.on('changeInterrupted', changeInterrupted);
    webrtc_sdk.on('changeActive', changeActive);
    webrtc_sdk.on('endOfCandidates', endOfCandidates);

    writeToLog('SDK initialized');
  }

  function initApis(authInfo) {
    if (!authInfo) {
      throw new Error('Not authenticated');
    }

    writeToLog('using access token: ' + authInfo.accessToken);
    initWebrtcSDK(authInfo);

    platformClient.ApiClient.instance.authentications['PureCloud Auth'].accessToken = authInfo.accessToken;
    conversationsApi = new platformClient.ConversationsApi();
  }

  function authenticate() {
    const environment = getInputValue('environment');
    const clientId = environments[environment].clientId;
    initClientEnvironment(environment);

      client.loginImplicitGrant(clientId, 'https://localhost:4300/test/test-pages')
      .then((data) => {
        setAuthTextVisible(true);
        setAppControlsVisible(true);

        const authInfo = JSON.parse(localStorage.getItem('sdk_test_auth_data'));
        initApis(authInfo);
      })
      .catch((err) => {
        console.error(err);
      });
  }

  this.document.getElementById('auth-button').addEventListener('click', authenticate);

  // test number
  this.document.getElementById('outbound-phone-number').value = '3172222222';
})();
