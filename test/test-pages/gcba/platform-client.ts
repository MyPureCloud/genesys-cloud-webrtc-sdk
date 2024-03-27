import { getCurrentUrlParams, getInputValue } from './utils';
const client = (window as any).platformClient.ApiClient.instance;
const persitentName = 'sdk_test';

(function () {
  function initClientEnvironment (environment) {
    client.setPersistSettings(true, persitentName);
    client.setEnvironment((window as any).environments[environment].uri);
  }

  function setAuthTextVisible (visible) {
    const style = visible ? 'visible' : 'hidden';
    document.getElementById('auth-text').style.visibility = style;
  }

  function signout () {
    const environment: any = getInputValue('environment');
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
    const clientId = (window as any).environments[environment].clientId;
    initClientEnvironment(environment);

    client.loginImplicitGrant(clientId, window.location.href)
      .then(() => {
        const authInfo = JSON.parse(window.localStorage.getItem(`${persitentName}_auth_data`));
        (client as any).authentications['PureCloud Auth'].accessToken = authInfo.accessToken;

        (window as any).conversationsAPI = new (window as any).platformClientConversationsApi();
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
    client.authentications['PureCloud OAuth'].accessToken = token;
    (window as any).conversationsAPI = new (window as any).platformClient.ConversationsApi();

    setAuthTextVisible(true);
  }

  function authenticateFromUrlToken () {
    const urlParams = getCurrentUrlParams();
    if (urlParams) {
      authenticateFromToken(urlParams.access_token);
      manualAuthInput.value = urlParams.access_token;
    }
  }

  function updateHashParams (newParams: {[param: string]: string}, mergeParams = true) {
    let params = newParams;

    if (mergeParams) {
      params = { ...getCurrentUrlParams(), ...newParams };
    }

    const hashStr = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    window.location.hash = `#${hashStr}`;
    window.location.reload();
  }

  function addTokenToUrl (submitEvent) {
    submitEvent.preventDefault();

    const token = manualAuthInput.value;

    if (!token) {
      console.error('No token found');
      return;
    }

    const env = getInputValue('environment');
    updateHashParams({ env, access_token: token });
  }

  function addJwtToUrl (submitEvent) {
    submitEvent.preventDefault();

    const jwt = jwtInput.value;

    if (!jwt) {
      console.error('No jwt found');
      return;
    }

    updateHashParams({ jwt });
  }

  async function fetchNewJwt () {
    const accessToken = manualAuthInput.value;

    if (!accessToken) {
      throw new Error('Must have an access token to');
    }

    const url = `https://api.${(window as any).environments[getInputValue('environment')].uri}/api/v2/screenrecording/token`;

    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `bearer ${accessToken}`,
        'Genesys-App': 'developercenter-cdn--webrtc-sdk-webui'
      },
      body: JSON.stringify({backgroundAssistantId: "5a106b00-b2d2-466d-94ea-75a0908cadeb"})
    });

    const { jwt } = await response.json();
    updateHashParams({ jwt });
  }

  const form = document.getElementById('manual-form') as HTMLFormElement;
  const manualAuthInput = document.getElementById('manual-auth') as HTMLInputElement;
  const jwtInput = document.getElementById('jwt-input') as HTMLInputElement;

  const urlParams = getCurrentUrlParams();

  if (urlParams && urlParams.env) {
    (document.getElementById('environment') as HTMLSelectElement).value = urlParams.env;
  }

  if (urlParams?.jwt) {
    jwtInput.value = urlParams.jwt
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

  const jwtForm = document.getElementById('jwt-form') as HTMLFormElement;
  if (jwtForm.attachEvent) {
    jwtForm.attachEvent('submit', addJwtToUrl);
  } else {
    jwtForm.addEventListener('submit', addJwtToUrl);
  }

  document.getElementById('auth-logout').addEventListener('click', signout);
  document.getElementById('fetch-jwt-button').addEventListener('click', fetchNewJwt);
})();
