import * as testUtils from './utils/test-utils';
import { IExtendedMediaSession } from '../../dist/src/types/interfaces';
import GenesysCloudWebrtcSdk from '../../dist/src/client';
import Client from 'genesys-cloud-streaming-client';

const logger = testUtils.getLogger();

describe('ACD Screen Share via webrtc-sdk [acd-screenshare-sdk] [sdk] [stable]', function () {
  let config;
  let client: Client;
  let context;
  let sdk: GenesysCloudWebrtcSdk;
  let activeConversation;

  before(async function () {
    this.timeout(10000);
    context = testUtils.getContext();
    client = await testUtils.getConnectedStreamingClient(context.authToken);
    logger.info('test streaming client connected');
    config = testUtils.getConfig();
    // const iceServers = await client.webrtcSessions.refreshIceServers();
    // if (!iceServers.length) {
    //   throw new Error('No ICE Servers received');
    // }
    // sdk = await testUtils.getNewSdkConnection();

    sdk = new (window as any).GenesysCloudWebrtcSdk({
      environment: config.envHost,
      organizationId: context.org.id,
      logLevel: 'debug',
      logger: logger
    });

    logger.log('SDK VERSION', sdk.VERSION);
  });

  afterEach(async function () {
    this.timeout(10000);
    if (activeConversation) {
      logger.log(`Active conversation found. Disconnecting call '${activeConversation.id}'.`);
      await testUtils.disconnectCall(activeConversation.id, true);
      logger.log(`Active conversation disconnected '${activeConversation.id}'`);
    }
    client._webrtcSessions.removeAllListeners();
  });

  after(async function () {
    this.timeout(10000);

    if (sdk) {
      await sdk.disconnect();
    }

    if (client) {
      await client.disconnect();
    }
  });

  it('should share screen via access code', async function () {
    this.timeout(100000);

    // await testUtils.wait(15000);

    // create the call to get conversation information

    if (!context.userQueues || !context.userQueues.length) {
      throw new Error('No user queues configured for this user');
    }

    activeConversation = await testUtils.testCall(this, client, { phoneNumber: config.outboundNumber, callFromQueueId: context.userQueues[0].id });
    logger.log('screen share activeConversation', activeConversation);

    const customer = activeConversation.participants.find(p => p.purpose === 'customer' || p.purpose === 'voicemail');
    const codeData = await testUtils.fetchJson(`${config.apiUrl}/conversations/${activeConversation.id}/participants/${customer.id}/codes`, {
      headers: testUtils.getHeaders(),
      method: 'POST',
      body: JSON.stringify({ mediaType: 'screenshare' })
    });
    logger.log('CODES result', codeData);

    // sdk.on('*', logger.log.bind(logger, 'sdk:event'));
    sdk.on('sessionStarted', (session) => {
      logger.log('sdk.sessionStarted', session);
      (window as any).session = session;
    });

    await sdk.initialize({ securityCode: codeData.addCommunicationCode });
    logger.info('starting screenshare');
    await sdk.startScreenShare();
    sdk._streamingConnection.webrtcSessions.on('*', logger.log.bind(logger, 'sdk:webrtcSessions:event'));
    // logger.debug('sdk._streamingConnection', sdk._streamingConnection);
    const jwt = testUtils.parseJwt(sdk._customerData.jwt);
    const jid = jwt.data.jid;

    const gotAgentSession: Promise<IExtendedMediaSession> = new Promise((resolve, reject) => {
      testUtils.rejectTimeout(reject, 'Agent Session', config.validationTimeout * 10);
      client.webrtcSessions.on('incomingRtcSession', session => {
        logger.log('Got agent incoming session', session);
        session.accept();
        session.on('stats', (stats) => {
          logger.info('acd-screenshare-stats', stats);
        });
        resolve(session);
      });
      client.webrtcSessions.on('*', logger.log.bind(logger, 'agentSessionEvent'));

    });

    await client.webrtcSessions.initiateRtcSession({
      jid,
      mediaPurpose: 'screenShare',
      conversationId: codeData.conversation.id,
      sourceCommunicationId: codeData.sourceCommunicationId
    });

    const agentSession = await gotAgentSession;
    logger.log('gotAgentSession', agentSession);

    await testUtils.timeout(4000);

    const peerStreamAdded: Promise<MediaStream> = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for remote stream')), config.validationTimeout);
      const hasIncomingVideo = agentSession.pc.getReceivers().filter((receiver) => receiver.track && receiver.track.kind === 'video');
      if (hasIncomingVideo) {
        return testUtils.attachStream(agentSession.streams[0], false, 'agent received intial customer stream').then(() => {
          clearTimeout(timer);
          return resolve(agentSession.streams[0]);
        });
      }

      logger.info('waiting on peerTrackAdded', agentSession);

      agentSession.on('peerTrackAdded', async (track) => {
        logger.log('peerTrackAdded', { track });
        logger.log('peerTrackAdded -> attaching stream');

        const stream = new MediaStream();
        stream.addTrack(track);
        await testUtils.attachStream(stream, false, 'agent received customer stream');
        clearTimeout(timer);
        resolve(stream);
      });
    });

    const agentStream = await peerStreamAdded;

    await testUtils.timeout(config.callDelay);
    await testUtils.getConversationDetails(codeData.conversation.id);
    await testUtils.validateVideoStream(agentSession, agentStream);
    agentSession.end();
  });
});
