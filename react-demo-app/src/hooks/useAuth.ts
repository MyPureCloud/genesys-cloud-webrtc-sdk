import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import platformClient from 'purecloud-platform-client-v2';
import useSdk from './useSdk';
import { setAuthStatus, setAuthLoading, setAuthError } from '../features/authSlice';

const clientId = '2e10c888-5261-45b9-ac32-860a1e67eff8';

// Your environment configuration remains the same
export const environments: { [envKey: string]: { uri: string } } = {
  dca: {
    uri: 'inindca.com',
  },
  tca: {
    uri: 'inintca.com',
  },
  'pca-us': {
    uri: 'mypurecloud.com',
  },
};

type EnvKey = keyof typeof environments;

type SavedAuthRequest = {
  envKey: EnvKey;
  codeVerifier: string;
}

type SavedAuthData = {
  accessToken: string;
  envKey: EnvKey;
  expires?: Date;
};

const authRequestStorageKey = 'sdk_test_auth_request';
const authDataStorageKey = 'sdk_test_auth_data';

// Module-level variables to hold singleton state
let isAuthInitialized = false;
const authState: SavedAuthData | undefined = undefined;

// Helper functions for saving/loading auth data remain the same
function saveAuthRequest(request: SavedAuthRequest) {
  sessionStorage.setItem(authRequestStorageKey, JSON.stringify(request));
}

function getSavedAuthRequest(): SavedAuthRequest {
  const data = sessionStorage.getItem(authRequestStorageKey);
  if (!data) {
    throw new Error('No saved auth request data');
  }
  return JSON.parse(data) as SavedAuthRequest;
}

function saveAuthData(data: SavedAuthData) {
  localStorage.setItem(authDataStorageKey, JSON.stringify(data));
}

function getSavedAuthData(): SavedAuthData | undefined {
  const authData = localStorage.getItem(authDataStorageKey);
  if (authData) {
    try {
      return JSON.parse(authData);
    } catch (err) {
      console.error('Failed to parse saved auth data', { error: err });
      return;
    }
  }
}

function generateCodeVerifier() {
  const a = new Uint8Array(43);
  crypto.getRandomValues(a);
  return Array.from(a, n => n.toString(36)).join('');
}

async function createCodeChallenge(verifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashedBuf = await crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...(new Uint8Array(hashedBuf)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return challenge;
}

function hasPotentiallyValidAuthData(): boolean {
  const authData = getSavedAuthData();
  if (!authData) {
    return false;
  }
  if (authData.expires && Date.now() > new Date(authData.expires).getTime()) {
    return false;
  }
  return true;
}

// Main Hook Implementation
export default function useAuth() {
  const client = platformClient.ApiClient.instance;
  const dispatch = useDispatch();
  const [authData, setAuthData] = useState<SavedAuthData | undefined>(authState);
  const { initWebrtcSDK } = useSdk();

  // useEffect will run only once due to the isAuthInitialized flag
  useEffect(() => {
    if (isAuthInitialized) return;

    isAuthInitialized = true;

    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);

    if (urlParams.has('code')) {
      dispatch(setAuthLoading(true));
      (async () => {
        try {
          await finishAuthenticationPkce(urlParams.get('code')!);
        } catch (err) {
          dispatch(setAuthLoading(false));
        }
      })();
    } else if (hasPotentiallyValidAuthData()) {
      const savedAuthData = getSavedAuthData();
      setAuthData(savedAuthData); // Store auth data in state
      dispatch(setAuthLoading(true));
      (async () => {
        try {
          await verifyToken(savedAuthData!);
          dispatch(setAuthLoading(false));
          postAuthentication();
        } catch (err) {
          dispatch(setAuthLoading(false));
          localStorage.removeItem(authDataStorageKey); // Clear invalid saved data
        }
      })();
    } else if (urlParams.has('access_token')) {
      authenticateFromUrlToken();
    }
  }, []);

  // Same helper functions as before
  async function authenticateWithPkce(env: string) {
    const environment = environments[env];
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await createCodeChallenge(codeVerifier);
    dispatch(setAuthError(undefined));

    saveAuthRequest({
      envKey: env as EnvKey,
      codeVerifier,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: window.location.origin + '/',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    location.assign(`https://login.${environment.uri}/oauth/authorize?${params.toString()}`);
  }

  async function finishAuthenticationPkce(code: string) {
    const requestData = getSavedAuthRequest();
    try {
      const tokenResponse = await fetch(`https://login.${environments[requestData.envKey].uri}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: window.location.origin + '/',
          client_id: clientId,
          code_verifier: requestData.codeVerifier,
        }).toString(),
      });
      const tokenInfo = await tokenResponse.json();

      if (tokenResponse.status >= 400) {
        throw new Error(`Unexpected response: ${tokenInfo.error}`);
      }

      saveAuthData({
        accessToken: tokenInfo.access_token,
        expires: new Date(Date.now() + tokenInfo.expires_in * 1000),
        envKey: requestData.envKey,
      });

      history.replaceState(null, '', '/'); // Remove the code from URL
      await postAuthentication();
    } catch (error) {
      dispatch(setAuthError((error as {message?: string}).message));
      dispatch(setAuthLoading(false));
    }
  }

  async function authenticateFromUrlToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('access_token');
    const envKey = urlParams.get('env_key');
    dispatch(setAuthError(undefined));

    try {
      if (!token || !envKey) {
        throw new Error('Token or envKey missing');
      }

      await verifyToken({ accessToken: token, envKey });
      saveAuthData({ accessToken: token, envKey });
      postAuthentication();
    } catch (err) {
      console.error('Failed to auth with token', err);
      dispatch(setAuthError((err as {message?: string}).message));
      dispatch(setAuthLoading(false));
    }
  }

  async function checkAuthToken(auth: { token: string; env: string }) {
    const token = auth.token;
    if (!auth.token) {
      dispatch(setAuthError('No auth token found'));
      return;
    }
    dispatch(setAuthLoading(true));

    const urlParams = new URLSearchParams();

    urlParams.set('access_token', token);
    urlParams.set('env_key', auth.env);

    const newUrl = window.location.pathname + '?' + urlParams.toString();

    // Use history.replaceState() to update the URL without reloading the page
    window.history.replaceState(null, '', newUrl);

    authenticateFromUrlToken();
  }

  async function verifyToken(authData: SavedAuthData) {
    client.setEnvironment(environments[authData.envKey].uri);
    client.setAccessToken(authData.accessToken);
    const tokensApi = new platformClient.TokensApi();
    await tokensApi.getTokensMe();
    return true;
  }

  function logout() {
    localStorage.removeItem(authDataStorageKey);
    window.location.href = window.location.origin;
  }

  async function postAuthentication() {
    const authData = getSavedAuthData()!;
    await initWebrtcSDK({
      token: authData.accessToken,
      environment: {
        uri: environments[authData.envKey].uri,
        clientId
      },
    });
    dispatch(setAuthStatus(true));
    dispatch(setAuthLoading(false));
  }

  return {
    checkAuthToken,
    authenticateFromUrlToken,
    authenticateWithPkce,
    logout,
    authData,
  };
}
