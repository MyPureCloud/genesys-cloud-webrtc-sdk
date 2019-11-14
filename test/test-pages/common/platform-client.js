const platformClient = require('platformClient');
const client = platformClient.ApiClient.instance;

(function () {
  function getInputValue (inputId) {
    return document.getElementById(inputId).value;
  }

  function initClientEnvironment (environment) {
    client.setPersistSettings(true, 'sdk-test');
    client.setEnvironment(window.environments[environment].uri);
  }

  function setAuthTextVisible (visible) {
    const style = visible ? 'visible' : 'hidden';
    document.getElementById('auth-text').style.visibility = style;
  }

  function authenticate () {
    const environment = getInputValue('environment');
    const clientId = window.environments[environment].clientId;
    initClientEnvironment(environment);

    client.loginImplicitGrant(clientId, window.location.href)
      .then(() => {
        const authInfo = JSON.parse(window.localStorage.getItem('sdk_test_auth_data'));
        platformClient.ApiClient.instance.authentications['PureCloud Auth'].accessToken = authInfo.accessToken;

        window.conversationsAPI = new platformClient.ConversationsApi();
        setAuthTextVisible(true);
      })
      .catch((err) => {
        console.error(err);
      });
  }

  function authenticateFromToken (token) {
    const environment = getInputValue('environment');
    initClientEnvironment(environment);

    platformClient.ApiClient.instance.authentications['PureCloud Auth'].accessToken = token;
    window.conversationsAPI = new platformClient.ConversationsApi();

    setAuthTextVisible(true);
  }

  function authenticateFromUrlToken () {
    const urlParams = window.getCurrentUrlParams();
    if (urlParams) {
      authenticateFromToken(urlParams.access_token);
      manualAuthInput.value = urlParams.access_token;
    }
  }

  function addTokenToUrl (submitEvent) {
    submitEvent.preventDefault();

    const token = manualAuthInput.value;

    if (!token) {
      console.error('No token found');
      return;
    }

    let url = window.location.href;
    url += `${url.indexOf('?') ? '&' : '?'}access_token=${token}`;
    window.location.href = url;
  }
  const form = this.document.getElementById('manual-form');
  const manualAuthInput = this.document.getElementById('manual-auth');

  // Check if there is auth info on the URL from a redirect
  const url = window.location.href;
  if (url.indexOf('access_token') > -1) {
    authenticateFromUrlToken();
  }

  if (form.attachEvent) {
    form.attachEvent('submit', addTokenToUrl);
  } else {
    form.addEventListener('submit', addTokenToUrl);
  }
  this.document.getElementById('auth-button').addEventListener('click', authenticate);
})();
