'use strict';

const Notifications = require('../../src/notifications');
const test = require('ava');

test('subscribe should subscribeToNode', t => {
  const client = {
    subscribeToNode: (subscription) => {
      return {
        type: 'set',
        to: '123456',
        pubsub: {
          subscribe: {}
        }
      };
    },
    on: () => {},
    createSubscription: () => {}
  };

  const notification = new Notifications(client);
  const args = [
    'ournode',
    { topic: [() => {}, () => {}] },
    (err) => {
      if (!err) {
        t.truthy('subscribed');
        t.end();
      }
    }
  ];
  t.is(notification.expose.subscribe(...args), undefined);
});

test('unsubscribe should unsubscribe', t => {
  const client = {
    createClient: (client) => {
      return {
        jid: 'codecraftsmanships@gitter.im',
        transport: 'websocket',
        wsURL: 'wss://gitter.im/xmpp-websocket',
        credentials: {
          auth: 'auth'
        }
      };
    },
    unsubscribeFromNode: (subscription) => {
      return {
        type: 'set',
        to: '123456',
        pubsub: {
          subscribe: {}
        }
      };
    },
    on: () => {},
    createSubscription: () => {}
  };
  const notification = new Notifications(client);
  const args = [{ topic: [() => {}, () => {}] }, () => {}];
  t.is(notification.expose.unsubscribe.call(...args, undefined));
  t.is(notification.expose.unsubscribe.call({ topic: [() => {}, () => {}] }, () => {}), undefined);
});
