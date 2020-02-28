/* global describe, it, before, afterEach, after */
import { PureCloudWebrtcSdk } from '../../dist/purecloud-webrtc-sdk';
import { testUtils, callUtils } from 'genesyscloud-spigot';
import * as utils from '../utils/utils';

describe('ACD Screen Share via webrtc-sdk [acd-screenshare-sdk] [sdk] [stable]', function () {
  let config;
  let client;
  let context;
  let sdk;
  let activeConversation;

  before(async function () {
    if (testUtils.checkMultiSession()) {
      this.skip();
    }

    context = testUtils.getContext();
    client = await utils.getConnectedStreamingClient(context.authToken);
    config = testUtils.getConfig();
    const iceServers = await client.webrtcSessions.refreshIceServers();
    if (!iceServers.length) {
      throw new Error('No ICE Servers received');
    }
    sdk = new PureCloudWebrtcSdk({
      environment: config.envHost,
      organizationId: context.org.id,
      logLevel: 'debug',
      logger: console
    });
    console.log('SDK VERSION', sdk.VERSION);
  });

  afterEach(async () => {
    if (activeConversation) {
      console.log(`Active conversation found. Disconnecting call '${activeConversation.id}'.`);
      await callUtils.disconnectCall(activeConversation.id, true);
      console.log(`Active conversation disconnected '${activeConversation.id}'`);
    }
    client.webrtcSessions.off('*');
    client.webrtcSessions.off('incomingRtcSession');
  });

  after(async function () {
    this.timeout(5000);

    if (sdk) {
      await sdk.disconnect();
    }

    if (client) {
      await client.disconnect();
    }
  });

  it('should share screen via access code', async function () {
    this.skip();

    this.timeout(100000);

    // create the call to get conversation information

    activeConversation = await callUtils.testCall(this, client, { phoneNumber: config.outboundNumber, callFromQueueId: context.userQueues[0].id });
    console.log('activeConversation', activeConversation);

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
      setTimeout(() => reject(new Error('Timeout waiting for remote stream')), config.validationTimeout);
      if (agentSession.streams.length === 1 && agentSession.streams[0].getTracks().length > 0) {
        return callUtils.attachStream(agentSession.streams[0], false, 'agent received intial customer stream').then(() => {
          return resolve(agentSession.streams[0]);
        });
      }
      agentSession.on('peerTrackAdded', async (session, stream) => {
        console.log('peerTrackAdded', { session });
        console.log('peerTrackAdded -> attaching stream');
        await callUtils.attachStream(stream, false, 'agent received customer stream');
        resolve(stream);
      });
    });

    const agentStream = await peerStreamAdded;

    await testUtils.timeout(config.callDelay);
    await testUtils.getConversationDetails(codeData.conversation.id);
    await callUtils.validateVideoStream(agentSession, agentStream, null);
  });
});
