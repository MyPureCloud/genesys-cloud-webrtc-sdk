'use strict';

const test = require('ava');
const WildEmitter = require('wildemitter');
const Reconnector = require('../../src/reconnector');

function timeout (time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

// controls whether clients can reconnect or not
let SIMULTATE_ONLINE = false;

class Client extends WildEmitter {
  constructor () {
    super();
    this.connected = false;
    this.connectAttempts = 0;
  }

  connect () {
    this.connectAttempts++;
    setTimeout(() => {
      if (SIMULTATE_ONLINE) {
        this.emit('connected');
        this.connected = true;
      } else {
        this.emit('disconnected');
        this.connected = false;
      }
    }, 10);
  }
}

test('when started it reconnects on backoff', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  reconnect.start();

  // move forward in time to where two connections should have been attempted.
  await timeout(350);
  t.is(client.connectAttempts, 2);

  await timeout(600);
  t.is(client.connectAttempts, 3);

  SIMULTATE_ONLINE = true;
  await timeout(1100);
  t.is(client.connectAttempts, 4);
  t.is(client.connected, true);

  // make sure it didn't keep trying
  await timeout(10000);
  t.is(client.connectAttempts, 4);
});

test('when stopped it will cease the backoff', async t => {
  const client = new Client();
  const reconnect = new Reconnector(client);
  reconnect.start();

  // move forward in time to where two connections should have been attempted.
  await timeout(350);
  t.is(client.connectAttempts, 2);

  await timeout(600);
  t.is(client.connectAttempts, 3);

  reconnect.stop();
  await timeout(1100);
  t.is(client.connectAttempts, 3);
  t.is(client.connected, false);

  // make sure it didn't keep trying
  await timeout(10000);
  t.is(client.connectAttempts, 3);
});
