const platformClient = require('platformClient');
const client = platformClient.ApiClient.instance;
const persitentName = 'sdk_test';

(function () {
  function getInputValue (inputId) {
    return document.getElementById(inputId).value;
  }

  function initClientEnvironment (environment) {
    client.setPersistSettings(true, persitentName);
    client.setEnvironment(window.environments[environment].uri);
  }

  function setAuthTextVisible (visible) {
    const style = visible ? 'visible' : 'hidden';
    document.getElementById('auth-text').style.visibility = style;
  }

  function signout () {
    const environment = getInputValue('environment');
    initClientEnvironment(environment);

    const host = window.location.host;
    let redirectUri = 'https://';

    if (host === 'localhost:8443') {
      redirectUri += host;
    } else {
      redirectUri += environment.uri;
    }

    redirectUri += window.location.pathname;
    console.debug('Signing out with redirect of: ' + redirectUri);

    client.logout(redirectUri);
  }

  function authenticate () {
    const environment = getInputValue('environment');
    const clientId = window.environments[environment].clientId;
    initClientEnvironment(environment);

    client.loginImplicitGrant(clientId, window.location.href)
      .then(() => {
        const authInfo = JSON.parse(window.localStorage.getItem(`${persitentName}_auth_data`));
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

    window.localStorage.setItem(`${persitentName}_auth_data`, JSON.stringify({ accessToken: token }));
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

    const env = document.getElementById('environment').value;
    window.location.hash = `#access_token=${token}&env=${env}`;
    window.location.reload(true);
  }
  const form = document.getElementById('manual-form');
  const manualAuthInput = document.getElementById('manual-auth');

  const urlParams = window.getCurrentUrlParams();

  if (urlParams && urlParams.env) {
    document.getElementById('environment').value = urlParams.env;
  }

  // Check if there is auth info on the URL from a redirect
  if (urlParams && urlParams.access_token) {
    authenticateFromUrlToken();
  }

  if (form.attachEvent) {
    form.attachEvent('submit', addTokenToUrl);
  } else {
    form.addEventListener('submit', addTokenToUrl);
  }
  document.getElementById('auth-button').addEventListener('click', authenticate);
  document.getElementById('auth-logout').addEventListener('click', signout);
})();
