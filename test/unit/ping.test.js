'use strict';

const test = require('ava');
const sinon = require('sinon');

let standardOptions, client, clock, createPing;
let pingCallCount = 0;

// we have to reset the doubles for every test.
test.beforeEach(() => {
  standardOptions = {
    jid: 'anon@example.mypurecloud.com'
  };

  clock = sinon.useFakeTimers();
  createPing = require('../../src/ping.js');
  client = {
    ping: (options, cb) => {
      pingCallCount++;
      return cb(options);
    },
    sendStreamError: sinon.stub()
  };
});

test.afterEach(() => {
  pingCallCount = 0;
  client = null;
  clock.restore();
});

test('accepts null options', t => {
  createPing(null);
  t.pass('made it');
});

test('when started it sends a ping on an interval', t => {
  let ping = createPing(client, standardOptions);

  ping.start();

  // move forward in time to where two pings should have been sent.
  clock.tick(5100);

  // verify we got two pings sent.
  client.ping(standardOptions, (val, error) => val);
  t.is(pingCallCount, 2);
});

test('when no pings it closes the connection', t => {
  let ping = createPing(client, standardOptions);
  ping.start();

  // move forward in time to one ping
  clock.tick(21000);
  client.ping(standardOptions, (val) => val);

  // move forward again
  clock.tick(21000);
  client.ping(standardOptions, (val) => val);

  // verify it sends a stream error
  t.is(client.sendStreamError.called, true);
  t.is(client.sendStreamError.getCall(0).args[0].condition, 'connection-timeout');
  t.is(client.sendStreamError.getCall(0).args[0].text, 'too many missed pongs');
});

test('receiving a ping response resets the failure mechanism', t => {
  let ping = createPing(client, standardOptions);
  ping.start();

  // move forward in time to one ping
  clock.tick(5100);
  client.ping(standardOptions, (val) => val);

  // move forward again
  clock.tick(5100);
  client.ping(standardOptions, (val) => val);

  // move forward again
  clock.tick(5100);
  standardOptions = {
    jid: 'anon@example.mypurecloud.com'
  };
  client.ping(standardOptions, val => val);

  // verify it doesn't send a stream error a third time
  t.is(client.sendStreamError.callCount, 2);
});

test('allows ping interval override', t => {
  const options = {
    jid: 'anon@example.mypurecloud.com',
    pingInterval: 60000
  };
  let ping = createPing(client, options);
  ping.start();

  // move forward in time to the standard ping interval
  clock.tick(21000);

  // verify there have been no calls yet
  t.is(pingCallCount, 0, 'no calls yet');

  // now move out further
  clock.tick(40000);

  client.ping(standardOptions, val => val);
});

test('allows failure number override', t => {
  const options = {
    jid: 'anon@example.mypurecloud.com',
    failedPingsBeforeDisconnect: 2
  };
  let ping = createPing(client, options);
  ping.start();

  // move forward in time to one ping
  clock.tick(5100);
  client.ping(standardOptions, val => val);
  t.is(pingCallCount, 2);

  // move forward again
  clock.tick(5100);
  client.ping(standardOptions, val => val);
  t.is(pingCallCount, 4);

  // make sure sendStreamError event not sent
  t.is(client.sendStreamError.notCalled, true);

  // move forward again
  clock.tick(5100);
  client.ping(standardOptions, val => val);
  t.is(pingCallCount, 6);

  // verify it sends a stream error
  t.truthy(client.sendStreamError.called);
});

test('stop should cause no more pings', t => {
  let ping = createPing(client, standardOptions);
  ping.start();

  // move forward in time to one ping
  clock.tick(5100);

  ping.stop();

  // now step forward and make sure only one ping ever gets sent.
  clock.tick(60000);

  t.is(pingCallCount, 1);
});

test('more than one stop is okay', t => {
  let ping = createPing(standardOptions);
  ping.start();

  ping.stop();
  ping.stop();
  t.is(pingCallCount, 0);
});
