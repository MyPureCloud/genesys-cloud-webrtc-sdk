/* global describe, it, beforeEach, after */

import { v4 as uuidv4 } from 'uuid';

import { GenesysCloudWebrtcSdk } from '../../';
import { IExtendedMediaSession } from '../../';
import * as testUtils from './utils/test-utils';
import { wait } from './utils/test-utils';

const logger = testUtils.getLogger();

let sdk: GenesysCloudWebrtcSdk;
let activeCall;

describe('Softphone Via WebRTC SDK [sdk] [stable]', function () {
  beforeEach(async function () {
    this.timeout(5000);

    if (activeCall) {
      return testUtils.disconnectCall(activeCall);
    }
  });

  afterEach(async function () {
    this.timeout(5000);
    sdk.removeAllListeners();

    await sdk.disconnect();
    sdk = null;
  });

  async function sdkTestCall (phoneNumber, options: { inbound?: boolean, manual?: boolean, waitForDisconnect?: boolean, ignore?: boolean, sdkDisconnect?: boolean, user?: string } = {}) {
    this.timeout(this.callDelay + testUtils.getConfig().validationTimeout * 10);
    if (!sdk) {
      sdk = await testUtils.getNewSdkConnection();
      logger.log('SDK connected', sdk);
    }
    let conversationId;
    // Convert session events to promise so we can await them
    const sessionEvents: Promise<IExtendedMediaSession> = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error(`Timeout waiting for ${options.inbound ? 'inbound' : 'outbound'} call to connect`)), testUtils.getConfig().validationTimeout);

      if (options.inbound) {
        if (options.ignore) {
          sdk.on('cancelPendingSession', async function (id) {
            resolve(null);
          });
        } else {
          // As soon as a call is requested, accept the propose
          sdk.on('pendingSession', async function (options) {
            conversationId = options.conversationId;
            await sdk.acceptPendingSession({ conversationId });
          });
        }
      }

      // Resolve when the session arrives, short circuiting the timeout/reject
      sdk.on('sessionStarted', async (session) => {
        logger.log('Session Started', { session, conversationId });

        session.on('terminated', function () {
          logger.log('SESSION TERMINATED', ...arguments);
        });

        if (options.manual) {
          await sdk.acceptSession({ conversationId: session.conversationId });
        }

        resolve(session);
      });
    });

    let sessionDisconnected;
    if (options.waitForDisconnect) {
      sessionDisconnected = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Timeout waiting for disconnect event')), testUtils.getConfig().validationTimeout * 5);
        sdk.on('sessionEnded', resolve);
      });
    }

    if (phoneNumber && !options.inbound) {
      // Make the call
      conversationId = await testUtils.makeCall({
        phoneNumber: options.user ? undefined : phoneNumber,
        callUserId: options.user ? phoneNumber : undefined
      });
      logger.info('Call conversationId', conversationId);
    }

    // wait for the session to arrive
    const session = await sessionEvents;

    if (!session && options.ignore) {
      return;
    }

    // convert peerStreamAdded event to promise
    const peerTrackAdded = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Timeout waiting for remote stream')), testUtils.getConfig().validationTimeout);
      if (session.streams.length === 1 && session.streams[0].getTracks().length > 0) {
        return resolve(session.streams[0]);
      }
      session.on('peerTrackAdded', async (track, stream) => {
        logger.log('peerTrackAdded', { track });
        resolve(stream);
      });
    });

    activeCall = conversationId;
    await peerTrackAdded;
    await wait(200); // we have to wait for some async tasks to finish before the `_outputAudioElement` is available

    const id = 'audio-' + uuidv4();
    session._outputAudioElement.id = id;
    const autoAttachedMediaEl = await testUtils.pollForTruthy(() => document.querySelector(`audio#${id}`));
    if (!autoAttachedMediaEl) {
      throw new Error('Failed to find auto attached media');
    }
    logger.log('validating stream', { activeCall });
    await testUtils.validateStream(session, autoAttachedMediaEl.srcObject,
      ((options.sdkDisconnect || options.waitForDisconnect) ? null : activeCall), false);
    logger.log('stream validated');

    if (options.sdkDisconnect) {
      logger.log('disconnecting via the SDK with session', session.id);
      await testUtils.timeout(testUtils.getConfig().callDelay);
      await sdk.endSession({ conversationId: session.conversationId });
    }
    if (options.waitForDisconnect) {
      logger.log('Waiting for the session to go disconnected');
      await sessionDisconnected;
    }
    activeCall = null;
  }

  it('can connect to voicemail (tc58390)', async function () {
    await sdkTestCall.call(this, '*86');
  });

  it('can connect a call (tc58391)', async function () {
    await sdkTestCall.call(this, testUtils.getConfig().outboundNumber);
  });
});
