const platformClient = require('platformClient');
const client = platformClient.ApiClient.instance;

(function() {
  function getInputValue (inputId) {
    return document.getElementById(inputId).value;
  }

  function initClientEnvironment (environment) {
    client.setPersistSettings(true, 'sdk-test');
    client.setEnvironment(environments[environment].uri);
  }

  function setAuthTextVisible (visible) {
    const style = visible ? 'visible' : 'hidden';
    document.getElementById('auth-text').style.visibility = style;
  }

  function authenticate () {
    const environment = getInputValue('environment');
    const clientId = environments[environment].clientId;
    initClientEnvironment(environment);

    client.loginImplicitGrant(clientId, 'https://localhost:4300/test/test-pages')
      .then(() => {
        setAuthTextVisible(true);

        const authInfo = JSON.parse(localStorage.getItem('sdk_test_auth_data'));
        platformClient.ApiClient.instance.authentications['PureCloud Auth'].accessToken = authInfo.accessToken;
        conversationsApi = new platformClient.ConversationsApi();
      })
      .catch((err) => {
        console.error(err);
      });
  }

  this.document.getElementById('auth-button').addEventListener('click', authenticate);
})();
