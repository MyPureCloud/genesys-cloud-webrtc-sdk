/* global describe, it, beforeEach, after */

import { testUtils, callUtils } from 'purecloud-spigot';
import { getNewSdkConnection } from '../utils/utils';

let sdk;
let activeCall;

describe('Softphone Via WebRTC SDK [sdk] [stable]', function () {
  beforeEach(async function () {
    this.timeout(5000);

    if (activeCall) {
      return callUtils.disconnectCall(activeCall);
    }

    if (sdk) {
      sdk.off('sessionStarted');
      sdk.off('cancelPendingSession');
      sdk.off('pendingSession');
      sdk._autoConnectSessions = true;
    }
  });

  after(async function () {
    this.timeout(5000);

    await sdk.disconnect();
  });

  async function sdkTestCall (phoneNumber, options = {}) {
    this.timeout(this.callDelay + testUtils.getConfig().validationTimeout * 10);
    if (!sdk) {
      sdk = await getNewSdkConnection();
      console.log('SDK connected', sdk);
    }
    let conversationId;
    // Convert session events to promise so we can await them
    const sessionEvents = new Promise((resolve, reject) => {
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
            sdk.acceptPendingSession(options.id);
          });
        }
      }

      // Resolve when the session arrives, short circuiting the timeout/reject
      sdk.on('sessionStarted', async (session) => {
        console.log('Session Started', { session, conversationId });

        session.on('terminated', function () {
          console.log('SESSION TERMINATED', ...arguments);
        });

        if (options.manual) {
          await sdk.acceptSession({ id: session.id });
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
      conversationId = await callUtils.makeCall({
        phoneNumber: options.user ? undefined : phoneNumber,
        callUserId: options.user ? phoneNumber : undefined
      });
      console.info('Call conversationId', conversationId);
    }

    // wait for the session to arrive
    const session = await sessionEvents;

    if (!session && options.ignore) {
      return;
    }

    // convert peerStreamAdded event to promise
    const peerStreamAdded = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Timeout waiting for remote stream')), testUtils.getConfig().validationTimeout);
      if (session.streams.length === 1 && session.streams[0].getTracks().length > 0) {
        return resolve(session.streams[0]);
      }
      session.on('peerStreamAdded', async (session, stream) => {
        console.log('peerStreamAdded', { session });
        resolve(stream);
      });
    });

    activeCall = conversationId;
    await peerStreamAdded;

    const autoAttachedMediaEl = await testUtils.pollForTruthy(() => document.querySelector('audio.__pc-webrtc-inbound'));
    if (!autoAttachedMediaEl) {
      throw new Error('Failed to find auto attached media');
    }
    console.log('validating stream', { activeCall });
    await callUtils.validateStream(session, autoAttachedMediaEl.srcObject,
      ((options.sdkDisconnect || options.waitForDisconnect) ? null : activeCall), false);
    console.log('stream validated');

    if (options.sdkDisconnect) {
      console.log('disconnecting via the SDK with session', session.id);
      await testUtils.timeout(testUtils.getConfig().callDelay);
      await sdk.endSession({ id: session.id });
    }
    if (options.waitForDisconnect) {
      console.log('Waiting for the session to go disconnected');
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
