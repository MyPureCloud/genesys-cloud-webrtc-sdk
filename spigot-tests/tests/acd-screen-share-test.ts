import * as testUtils from './utils/test-utils';
import { IExtendedMediaSession } from '../../';
import { GenesysCloudWebrtcSdk } from '../../';
import Client from 'genesys-cloud-streaming-client';

const logger = testUtils.getLogger();

describe('ACD Screen Share via webrtc-sdk [acd-screenshare-sdk] [sdk] [stable]', function () {
  let config;
  let agentsStreamingClient: Client;
  let context;
  let customerSdk: GenesysCloudWebrtcSdk;
  let activeConversation;

  before(async function () {
    this.timeout(10000);
    context = testUtils.getContext();
    agentsStreamingClient = await testUtils.getConnectedStreamingClient(context.authToken);
    logger.info('test streaming client connected');
    config = testUtils.getConfig();
    // const iceServers = await client.webrtcSessions.refreshIceServers();
    // if (!iceServers.length) {
    //   throw new Error('No ICE Servers received');
    // }
    // sdk = await testUtils.getNewSdkConnection();

    customerSdk = new (window as any).GenesysCloudWebrtcSdk.default({
      environment: config.envHost,
      organizationId: context.org.id,
      logLevel: 'debug',
      logger: logger
    });

    logger.log('SDK VERSION', customerSdk.VERSION);
  });

  afterEach(async function () {
    this.timeout(10000);
    if (activeConversation) {
      logger.log(`Active conversation found. Disconnecting call '${activeConversation.id}'.`);
      await testUtils.disconnectCall(activeConversation.id, true);
      logger.log(`Active conversation disconnected '${activeConversation.id}'`);
    }
    agentsStreamingClient._webrtcSessions.removeAllListeners();
  });

  after(async function () {
    this.timeout(15000);

    let customerDisconnected = Promise.resolve();
    if (customerSdk) {
      customerDisconnected = customerSdk.disconnect();
    }

    let agentDisconnected = Promise.resolve();
    if (agentsStreamingClient) {
      agentDisconnected = agentsStreamingClient.disconnect();
    }

    await Promise.all([customerDisconnected, agentDisconnected]);
  });

  it('should share screen via access code', async function () {
    this.timeout(100000);

    // await testUtils.wait(15000);

    // create the call to get conversation information

    if (!context.userQueues || !context.userQueues.length) {
      throw new Error('No user queues configured for this user');
    }

    activeConversation = await testUtils.testCall(this, agentsStreamingClient, { phoneNumber: config.outboundNumber, callFromQueueId: context.userQueues[0].id });
    logger.log('screen share activeConversation', activeConversation);

    const customer = activeConversation.participants.find(p => p.purpose === 'customer' || p.purpose === 'voicemail');
    const codeData = await testUtils.fetchJson(`${config.apiUrl}/conversations/${activeConversation.id}/participants/${customer.id}/codes`, {
      headers: testUtils.getHeaders(),
      method: 'POST',
      body: JSON.stringify({ mediaType: 'screenshare' })
    });
    logger.log('CODES result', codeData);

    // sdk.on('*', logger.log.bind(logger, 'sdk:event'));
    customerSdk.on('sessionStarted', (session) => {
      logger.log('sdk.sessionStarted', session);
      (window as any).session = session;
    });

    await customerSdk.initialize({ securityCode: codeData.addCommunicationCode });
    logger.info('starting screenshare');
    const stream = await customerSdk.startScreenShare();
    logger.info('customer started screenshare', { stream });

    // put the outgoing video in the dom
    const videoEl = document.createElement('video');
    videoEl.classList.add('ignore');
    videoEl.srcObject = stream;
    videoEl.style.width = "200px";
    videoEl.style.height = "200px";
    videoEl.autoplay = true;

    const container = document.createElement('div');
    container.textContent = "Outgoing Video";
    container.appendChild(videoEl);
    document.body.appendChild(container);

    customerSdk._streamingConnection.webrtcSessions.on('*', logger.log.bind(logger, 'sdk:webrtcSessions:event'));
    // logger.debug('sdk._streamingConnection', sdk._streamingConnection);
    const jwt = testUtils.parseJwt(customerSdk._customerData.jwt);
    const jid = jwt.data.jid;

    const gotAgentSession: Promise<IExtendedMediaSession> = new Promise((resolve, reject) => {
      testUtils.rejectTimeout(reject, 'Agent Session', config.validationTimeout * 10);
      agentsStreamingClient.webrtcSessions.on('incomingRtcSession', session => {
        logger.log('Got agent incoming session', session);
        session.accept();
        session.on('stats', (stats) => {
          logger.info('acd-screenshare-stats', stats);
        });
        resolve(session);
      });
      agentsStreamingClient.webrtcSessions.on('*', logger.log.bind(logger, 'agentSessionEvent'));

    });

    await agentsStreamingClient.webrtcSessions.initiateRtcSession({
      jid,
      conversationId: codeData.conversation.id,
      sourceCommunicationId: codeData.sourceCommunicationId
    });

    const agentSession = await gotAgentSession;
    logger.log('gotAgentSession', agentSession);

    await testUtils.timeout(4000);

    const peerStreamAdded: Promise<MediaStream> = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for remote stream')), config.validationTimeout);
      const videoReceiver = agentSession.pc.getReceivers().find((receiver) => receiver.track && receiver.track.kind === 'video');
      if (videoReceiver) {
        const stream = new MediaStream();
        stream.addTrack(videoReceiver.track);
        return testUtils.attachStream(stream, false, 'agent received intial customer stream').then(() => {
          clearTimeout(timer);
          return resolve(agentSession.streams[0]);
        });
      }

      logger.info('waiting on peerTrackAdded', agentSession);

      agentSession.on('peerTrackAdded', async (track, a) => {
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
