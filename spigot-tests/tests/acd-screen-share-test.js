/* global describe, it, before, afterEach, after */
import { GenesysCloudWebrtcSdk } from '../../dist/genesys-cloud-webrtc-sdk';
import { testUtils, callUtils } from 'genesyscloud-spigot';
import * as utils from '../utils/utils';

describe('ACD Screen Share via webrtc-sdk [acd-screenshare-sdk] [sdk] [stable]', function () {
  let config;
  let client;
  let context;
  let sdk;
  let activeConversation;

  before(async function () {
    this.timeout(10000);
    context = testUtils.getContext();
    client = await utils.getConnectedStreamingClient(context.authToken);
    config = testUtils.getConfig();
    const iceServers = await client.webrtcSessions.refreshIceServers();
    if (!iceServers.length) {
      throw new Error('No ICE Servers received');
    }
    sdk = new GenesysCloudWebrtcSdk({
      environment: config.envHost,
      organizationId: context.org.id,
      logLevel: 'debug',
      logger: console
    });

    console.log('SDK VERSION', sdk.VERSION);
  });

  afterEach(async function () {
    this.timeout(10000);
    if (activeConversation) {
      console.log(`Active conversation found. Disconnecting call '${activeConversation.id}'.`);
      await callUtils.disconnectCall(activeConversation.id, true);
      console.log(`Active conversation disconnected '${activeConversation.id}'`);
    }
    client.webrtcSessions.off('*');
    client.webrtcSessions.off('incomingRtcSession');
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

    // create the call to get conversation information

    if (!context.userQueues || !context.userQueues.length) {
      throw new Error('No user queues configured for this user');
    }

    activeConversation = await callUtils.testCall(this, client, { phoneNumber: config.outboundNumber, callFromQueueId: context.userQueues[0].id });
    console.log('screen share activeConversation', activeConversation);

    const customer = activeConversation.participants.find(p => p.purpose === 'customer' || p.purpose === 'voicemail');
    const codeData = await testUtils.fetchJson(`${config.apiUrl}/conversations/${activeConversation.id}/participants/${customer.id}/codes`, {
      headers: testUtils.getHeaders(),
      method: 'POST',
      body: JSON.stringify({ mediaType: 'screenshare' })
    });
    console.log('CODES result', codeData);

    sdk.on('*', console.log.bind(console, 'sdk:event'));
    sdk.on('sessionStarted', (session) => {
      console.log('sdk.sessionStarted', session);
      window.session = session;
    });

    await sdk.initialize({ securityCode: codeData.addCommunicationCode });
    console.info('starting screenshare');
    await sdk.startScreenShare();
    sdk._streamingConnection.webrtcSessions.on('*', console.log.bind(console, 'sdk:webrtcSessions:event'));
    console.log('sdk._streamingConnection', sdk._streamingConnection);
    const jwt = testUtils.parseJwt(sdk._customerData.jwt);
    const jid = jwt.data.jid;

    const gotAgentSession = new Promise((resolve, reject) => {
      testUtils.rejectTimeout(reject, 'Agent Session', config.validationTimeout * 10);
      client.webrtcSessions.on('incomingRtcSession', session => {
        console.log('Got agent incoming session', session);
        session.accept();
        resolve(session);
      });
      client.webrtcSessions.on('*', console.log.bind(console, 'agentSessionEvent'));
    });

    client.webrtcSessions.initiateRtcSession({
      jid,
      mediaPurpose: 'screenShare',
      conversationId: codeData.conversation.id,
      sourceCommunicationId: codeData.sourceCommunicationId
    });

    const agentSession = await gotAgentSession;
    console.log('gotAgentSession', agentSession);

    await testUtils.timeout(4000);

    const peerStreamAdded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for remote stream')), config.validationTimeout);
      const hasIncomingVideo = agentSession.pc.getReceivers().filter((receiver) => receiver.track && receiver.track.kind === 'video');
      if (hasIncomingVideo) {
        return callUtils.attachStream(agentSession.streams[0], false, 'agent received intial customer stream').then(() => {
          clearTimeout(timer);
          return resolve(agentSession.streams[0]);
        });
      }
      agentSession.on('peerTrackAdded', async (session, stream) => {
        console.log('peerTrackAdded', { session });
        console.log('peerTrackAdded -> attaching stream');
        await callUtils.attachStream(stream, false, 'agent received customer stream');
        clearTimeout(timer);
        resolve(stream);
      });
    });

    const agentStream = await peerStreamAdded;

    await testUtils.timeout(config.callDelay);
    await testUtils.getConversationDetails(codeData.conversation.id);
    await callUtils.validateVideoStream(agentSession, agentStream, null);
  });
});
