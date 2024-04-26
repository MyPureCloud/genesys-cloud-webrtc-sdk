import * as testUtils from './utils/test-utils';
import { v4 as uuidv4 } from 'uuid';
import { IExtendedMediaSession } from '../../';

const logger = testUtils.getLogger();

let sdk: any;
let context;

describe('Video Via WebRTC SDK [videosdk] [sdk] [stable]', function () {
  beforeEach(async function () {
    this.timeout(10000);
    context = testUtils.getContext();
    sdk = await testUtils.getNewSdkConnection();
  });

  afterEach(async function () {
    this.timeout(10000);
    if (sdk) {
      sdk.removeAllListeners();
      sdk._config.autoConnectSessions = true;
      await sdk.disconnect();
      sdk = null;
    }
  });

  async function testVideo (roomJid, options: { inbound?: boolean, manual?: boolean, waitForDisconnect?: boolean, ignore?: boolean, sdkDisconnect?: boolean } = {}) {
    this.timeout(this.callDelay + testUtils.getConfig().validationTimeout * 10);

    let conversationId;
    const audioElement = document.createElement('audio');
    const randomId = uuidv4();
    audioElement.classList.add(randomId + '-audio');
    const videoElement = document.createElement('video');
    videoElement.classList.add(randomId + '-video');
    // Convert session events to promise so we can await them
    const sessionEvents: Promise<IExtendedMediaSession> = new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${options.inbound ? 'inbound' : 'outbound'} call to connect. conversationId: ${conversationId}`)), testUtils.getConfig().validationTimeout);

      // Resolve when the session arrives, short circuiting the timeout/reject
      sdk.on('sessionStarted', async (session) => {
        logger.log('Session Started', { session, conversationId });

        session.on('terminated', function (...args) {
          logger.log('SESSION TERMINATED', ...args);
        });

        if (!options.manual) {
          await sdk.acceptSession({ conversationId: session.conversationId, videoElement, audioElement });
        }

        clearTimeout(timer);
        resolve(session);
      });
    });

    let sessionDisconnected = Promise.resolve();
    if (options.waitForDisconnect) {
      sessionDisconnected = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for disconnect event')), testUtils.getConfig().validationTimeout * 5);
        sdk.on('sessionEnded', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    const info = await sdk.startVideoConference(roomJid);
    conversationId = info.conversationId;
    logger.log('video conversationId', conversationId);

    // wait for the session to arrive
    const session = await sessionEvents;

    if (!session && options.ignore) {
      return;
    }

    // convert peerStreamAdded event to promise
    const isMediaAttached = function () {
      return videoElement.srcObject && audioElement.srcObject;
    };

    await testUtils.pollForTruthy(isMediaAttached);

    if (options.sdkDisconnect) {
      logger.log('disconnecting via the SDK with session', session.id);
      await testUtils.timeout(testUtils.getConfig().callDelay);
      await sdk.endSession({ conversationId: session.conversationId });
    }
    if (options.waitForDisconnect) {
      logger.log('Waiting for the session to go disconnected');
      await sessionDisconnected;
    }
  }

  it('can connect group video', async function () {
    this.timeout(20000);
    const roomJid = testUtils.getRandomVideoRoomJid(context.jid);
    await testVideo.call(this, roomJid, { sdkDisconnect: true, waitForDisconnect: true });
  });
});
