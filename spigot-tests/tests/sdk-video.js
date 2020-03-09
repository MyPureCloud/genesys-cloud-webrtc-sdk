/* global describe, it, beforeEach, afterEach */

import { testUtils } from 'genesyscloud-spigot';
import { v4 as uuid } from 'uuid';
import { getNewSdkConnection } from '../utils/utils';

let sdk;
let context;

describe('Video Via WebRTC SDK [videosdk] [sdk] [stable]', function () {
  beforeEach(async function () {
    this.timeout(10000);
    context = testUtils.getContext();
    sdk = await getNewSdkConnection();
  });

  afterEach(async function () {
    this.timeout(10000);
    if (sdk) {
      sdk.off('sessionStarted');
      sdk.off('cancelPendingSession');
      sdk.off('pendingSession');
      sdk._config.autoConnectSessions = true;
      await sdk.disconnect();
      sdk = null;
    }
  });

  async function testVideo (roomJid, options = {}) {
    this.timeout(this.callDelay + testUtils.getConfig().validationTimeout * 10);

    let conversationId;
    const audioElement = document.createElement('audio');
    const randomId = uuid();
    audioElement.classList.add(randomId + '-audio');
    const videoElement = document.createElement('video');
    videoElement.classList.add(randomId + '-video');

    // Convert session events to promise so we can await them
    const sessionEvents = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error(`Timeout waiting for ${options.inbound ? 'inbound' : 'outbound'} call to connect`)), testUtils.getConfig().validationTimeout);

      // Resolve when the session arrives, short circuiting the timeout/reject
      sdk.on('sessionStarted', async (session) => {
        console.log('Session Started', { session, conversationId });

        session.on('terminated', function (...args) {
          console.log('SESSION TERMINATED', ...args);
        });

        if (!options.manual) {
          await sdk.acceptSession({ id: session.id, videoElement, audioElement });
        }

        resolve(session);
      });
    });

    let sessionDisconnected = Promise.resolve();
    if (options.waitForDisconnect) {
      sessionDisconnected = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Timeout waiting for disconnect event')), testUtils.getConfig().validationTimeout * 5);
        sdk.on('sessionEnded', resolve);
      });
    }

    await sdk.startVideoConference(roomJid);

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
      console.log('disconnecting via the SDK with session', session.id);
      await testUtils.timeout(testUtils.getConfig().callDelay);
      await sdk.endSession({ id: session.id });
    }
    if (options.waitForDisconnect) {
      console.log('Waiting for the session to go disconnected');
      await sessionDisconnected;
    }
  }

  it('can connect group video', async function () {
    this.timeout(20000);
    const roomJid = testUtils.getRandomVideoRoomJid(context.jid);
    await testVideo.call(this, roomJid);
  });
});
