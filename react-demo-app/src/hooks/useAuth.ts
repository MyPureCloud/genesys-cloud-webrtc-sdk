import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import platformClient from 'purecloud-platform-client-v2';
import useSdk from './useSdk';
import { setAuthStatus } from '../features/authSlice';

export const environments: any = {
  dca: {
    clientId: '2e10c888-5261-45b9-ac32-860a1e67eff8',
    uri: 'inindca.com',
  },
  'pca-us': {
    clientId: '6b9f791c-86ef-4f7a-af85-3f3520dd0975',
    uri: 'mypurecloud.com',
  },
};

export default function useAuth() {
  const client = platformClient.ApiClient.instance;
  const persistentName = 'sdk_test';
  const { initWebrtcSDK } = useSdk();
  const dispatch = useDispatch();

  useEffect(() => {
    if (localStorage.getItem('sdk_test_auth_data')) {
      let parsedAuth = JSON.parse(
        localStorage.getItem('sdk_test_auth_data') || '{}'
      );

      setAuthData(parsedAuth);
      // React doesn't like making useEffect async so we will just create an anon function that returns our function.
      async () => await verifyToken();
      authenticateImplicitly();
    }
  }, []);

  // Verify the token we have saved locally is valid.
  async function verifyToken() {
    const tokensApi = new platformClient.TokensApi();
    await tokensApi.getTokensMe();
    return true;
  }

  async function checkAuthToken(auth: { token: string; env: string }) {
    const token = auth.token;
    if (!auth.token) {
      console.error('No token found!');
      return;
    }
    window.location.hash = `#access_token=${token}&env=${auth.env}`;
    authenticateFromUrlToken();
  }

  async function authenticateFromUrlToken() {
    const urlParams: any = getCurrentUrlParams();
    if (!urlParams) {
      return;
    }
    const environment: any = environments[urlParams.env];
    const token = (urlParams as any)['access_token'];

    setLocalStorage({
      accessToken: token,
      environment: environment.uri,
      clientId: environment.clientId,
    });
    setAuthData({ accessToken: token, environment: environment.uri });

    await initWebrtcSDK({ token, environment });
    dispatch(setAuthStatus(true));
  }

  // platformClient.setPersistSettings(true, persistentName) only sets the token, not the env so we'll do it all ourselves.
  function setLocalStorage(authData: {
    accessToken: string;
    environment: string;
    clientId: string;
  }) {
    window.localStorage.setItem(
      `${persistentName}_auth_data`,
      JSON.stringify(authData)
    );
  }

  function setAuthData(authData: { accessToken: string; environment: string }) {
    client.setEnvironment(authData.environment);
    client.setAccessToken(authData.accessToken);
  }
  function authenticateImplicitly() {
    const authData = JSON.parse(
      window.localStorage.getItem(`${persistentName}_auth_data`) || '{}'
    );
    client
      .loginImplicitGrant(authData.clientId, window.location.href)
      .then(async () => {
        await initWebrtcSDK({
          token: authData.accessToken,
          environment: {
            uri: authData.environment,
            clientId: authData.clientId,
          },
        });
        dispatch(setAuthStatus(true));
      })
      .catch((err) => {
        console.error(err);
      });
  }

  function getCurrentUrlParams() {
    let params: any = null;
    const urlParts = window.location.href.split('#');

    if (urlParts[1]) {
      const urlParamsArr = urlParts[1].split('&');

      if (urlParamsArr.length) {
        params = {};
        for (let i = 0; i < urlParamsArr.length; i++) {
          const currParam = urlParamsArr[i].split('=');
          const key = currParam[0];
          const value = currParam[1];
          params[key] = value;
        }
      }
    }
    return params;
  }

  return { checkAuthToken, authenticateFromUrlToken, authenticateImplicitly };
}
