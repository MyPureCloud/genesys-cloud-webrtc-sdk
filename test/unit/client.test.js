'use strict';

const test = require('ava');
const sinon = require('sinon');

const pcStream = require('../../src/client');

let xmppInfo, extendObject, client, stanzaioInstance;
test.beforeEach(() => {
  xmppInfo = {
    jid: 'anon@example.mypurecloud.com',
    authToken: 'AuthToken',
    host: 'wss://example.com/test'
  };

  // Stub stanzaio connection
  stanzaioInstance = {
    on: () => {
      return {
        bind: sinon.stub()
      };
    },
    connect: () => {
      return {
        bind: sinon.stub()
      };
    },
    disconnect: () => {
      return {
        bind: sinon.stub()
      };
    },
    emit: () => {
      return {
        bind: sinon.stub()
      };
    }
  };

  client = {
    createClient: sinon.stub()
  };

  client.createClient.withArgs(sinon.match.any).returns(stanzaioInstance);
});

test('client creation', t => {
  pcStream.client(xmppInfo);
  const clientOptions = {
    jid: 'anon@example.mypurecloud.com',
    credentials: {
      username: 'anon@example.mypurecloud.com',
      password: 'authKey:AuthToken'
    },
    transport: 'websocket',
    wsURL: 'wss://example.com/test/stream'
  };
  client.createClient(clientOptions);
  const expectedPayload = {
    jid: 'anon@example.mypurecloud.com',
    credentials: {
      username: 'anon@example.mypurecloud.com',
      password: 'authKey:AuthToken'
    },
    transport: 'websocket',
    wsURL: 'wss://example.com/test/stream'
  };
  t.deepEqual(client.createClient.args[0][0], expectedPayload);
});

test('connect jid override', t => {
  t.plan(0);
  let con = pcStream.client(xmppInfo);
  con.connect({
    jid: 'anon@example.mypurecloud.com'
  });
  const connectPayload = {
    jid: 'anon@example.mypurecloud.com',
    credentials: {
      username: 'anon@example.mypurecloud.com',
      password: 'authKey:AuthToken'
    },
    transport: 'websocket',
    wsURL: 'wss://example.com/test/stream'
  };
  stanzaioInstance.connect(connectPayload);
});

test('connect full override', t => {
  t.plan(0);
  let con = pcStream.client(xmppInfo);
  con.connect({
    jid: 'anon@example.mypurecloud.com',
    authToken: 'AuthTokenAlt',
    host: 'wss://example.com/testAlt'
  });
  const connectPayload = {
    jid: 'anon@example.mypurecloud.com',
    credentials: {
      username: 'anon@example.mypurecloud.com',
      password: 'authKey:AuthToken'
    },
    wsURL: 'wss://example.com/test/stream',
    transport: 'websocket'
  };
  stanzaioInstance.connect(connectPayload);
});

test('extend should return an extendObject', t => {
  class TestExtension {
    on () {}
    off () {}
  }
  t.plan(1);
  const actual = pcStream.extend('test1234', TestExtension);
  t.deepEqual(actual, extendObject);
});

test('should call handleIq or handleMessage on those events, if an extension registered for them', t => {
  t.plan(2);
  const testIq = { to: 'you', from: 'someone' };
  const testMessage = { to: 'you', from: 'someoneElse' };
  class TestExtension {
    on () {}
    off () {}
    handleIq (stanza) {
      t.is(stanza, testIq);
    }
    handleMessage (stanza) {
      t.is(stanza, testMessage);
    }
  }

  pcStream.extend('testIqAndMessageHandlers', TestExtension);
  let client = pcStream.client(xmppInfo);
  client._stanzaio.emit('iq', testIq);
  client._stanzaio.emit('message', testMessage);
});

test('Should see callbacks set when an iq callback is explicitly registered', t => {
  let client = pcStream.client(xmppInfo);
  client._stanzaio.on('iq:set:myTestTopic', () => {});

  t.is(client._stanzaio.callbacks['iq:set:myTestTopic'].length, 1);
});

test('Should begin to reconnect when it becomes disconnected', t => {
  let client = pcStream.client(xmppInfo);
  client._stanzaio.emit('disconnected');

  return new Promise(resolve => {
    client._stanzaio.connect = sinon.stub().callsFake(() => {
      client._stanzaio.emit('connected');
      resolve();
    });
  });
});

test('Disconnecting explicitly will set autoReconnect to false', t => {
  let client = pcStream.client(xmppInfo);
  t.is(client.autoReconnect, true);
  client._stanzaio.disconnect = sinon.stub();
  client.disconnect();
  t.is(client.autoReconnect, false);
  sinon.assert.calledOnce(client._stanzaio.disconnect);
});
