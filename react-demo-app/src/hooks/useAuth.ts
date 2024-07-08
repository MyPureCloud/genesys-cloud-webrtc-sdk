import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import platformClient from 'purecloud-platform-client-v2';
import useSdk from './useSdk';
import { setAuthStatus } from '../features/authSlice';

interface IAuthData {
  token: string;
  environment: {
    clientId: string;
    uri: string;
  };
}

const client = platformClient.ApiClient.instance;
const persistentName = 'sdk_test';

export const environments = {
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
  const { initWebrtcSDK } = useSdk();
  const dispatch = useDispatch();

  /* Uncomment this to login implicitly without clicking. */
  // useEffect(() => {
  //   if (localStorage.getItem('sdk_test_auth_data')) {
  //     authenticateImplicitly('dca');
  //   }
  // }, []);
  async function checkAuthToken(auth: any) {
    const token = auth.token;
    if (!auth.token) {
      console.error('No token found!');
      return;
    }
    window.location.hash = `#access_token=${token}&env=${auth.env}`;
    authenticateFromUrlToken();
  }

  async function authenticateFromUrlToken() {
    const urlParams = getCurrentUrlParams();
    if (!urlParams) {
      return;
    }
    const environment = (environments as any)[(urlParams as any).env];
    const token = (urlParams as any)['access_token'];

    client.setPersistSettings(true, persistentName);
    client.setEnvironment(environment.uri);

    window.localStorage.setItem(
      `${persistentName}_auth_data`,
      JSON.stringify({ accessToken: token })
    );
    (platformClient.ApiClient as any).instance.authentications[
      'PureCloud OAuth'
    ].accessToken = token;
    (window as any).conversationsAPI = new platformClient.ConversationsApi();
    await initWebrtcSDK({ token, environment });
    dispatch(setAuthStatus(true));
  }

  function authenticateImplicitly(environment: any) {
    const environmentData = (environments as any)[environment];
    client.setPersistSettings(true, persistentName);
    client.setEnvironment(environmentData.uri);

    client
      .loginImplicitGrant(environmentData.clientId, window.location.href)
      .then(() => {
        const authInfo = JSON.parse(
          (window as any).localStorage.getItem(`${persistentName}_auth_data`)
        );
        const authData: IAuthData = {
          token: authInfo.accessToken,
          environment: environmentData,
        };
        (platformClient.ApiClient as any).instance.authentications[
          'PureCloud OAuth'
        ].accessToken = authInfo.accessToken;
        (window as any).conversationsAPI =
          new platformClient.ConversationsApi();
        initWebrtcSDK(authData);
        dispatch(setAuthStatus(true));
      })
      .catch((err) => {
        console.error(err);
      });
  }

  function getCurrentUrlParams() {
    let params = null;
    const urlParts = window.location.href.split('#');

    if (urlParts[1]) {
      const urlParamsArr = urlParts[1].split('&');

      if (urlParamsArr.length) {
        params = {};
        for (let i = 0; i < urlParamsArr.length; i++) {
          const currParam = urlParamsArr[i].split('=');
          const key = currParam[0];
          const value = currParam[1];
          (params as any)[key] = value;
        }
      }
    }
    return params;
  }

  return { checkAuthToken, authenticateFromUrlToken, authenticateImplicitly };
}
