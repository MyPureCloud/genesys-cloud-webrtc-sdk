import { GenesysCloudWebrtcSdk } from '../../dist/genesys-cloud-webrtc-sdk';
import { testUtils } from 'genesyscloud-spigot';
import StreamingClient from 'genesys-cloud-streaming-client';

export function getConnectedStreamingClient (authToken, jwt) {
  return new Promise((resolve) => {
    const conn = createConnection(authToken);
    conn.on('connected', () => {
      resolve(conn);
    });
    conn.connect();
  });
}

export function createConnection (authToken, jwt) {
  const options = {
    authToken,
    logger: console,
    host: testUtils.getConfig().host,
    apiHost: testUtils.getConfig().envHost,
    signalIceConnected: true,
    jwt
  };
  console.log('Streaming connection options: ', JSON.stringify(options));
  const _client = new StreamingClient(options);

  _client.on('stream:error', error => {
    console.error('Error from streaming connection:', JSON.stringify(error));
  });

  _client.on('raw:incoming', (msg) => {
    // console.debug('streaming <<<:', JSON.stringify(msg));
  });
  _client.on('raw:outgoing', (msg) => {
    // console.debug('streaming >>>:', JSON.stringify(msg));
  });
  _client.on('connected', () => {
    console.log('streaming connection authenticated');
  });

  return _client;
}

export async function getNewSdkConnection () {
  const config = testUtils.getConfig();

  const newSdk = new GenesysCloudWebrtcSdk({
    environment: config.envHost,
    accessToken: testUtils.getAuthToken(),
    logLevel: 'debug',
    logger: console
  });

  await newSdk.initialize();
  return newSdk;
}
