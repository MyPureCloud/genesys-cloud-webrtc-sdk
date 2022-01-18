const platformClient = require('platformClient');
const WebrtcSdk = window.GenesysCloudWebrtcSdk.default;

const client = platformClient.ApiClient.instance;
client.setPersistSettings(true, 'uber_test');
client.setEnvironment('mypurecloud.com');

const conversationsApi = new platformClient.ConversationsApi();
const stationsApi = new platformClient.StationsApi();
const usersApi = new platformClient.UsersApi();

const clientId = '6b9f791c-86ef-4f7a-af85-3f3520dd0975';
const timers = {};

let me, webrtcSdk;

client.loginImplicitGrant(clientId, window.location.href)
  .then(() => {
    t('getUsersMe', 'Getting user');
    return usersApi.getUsersMe({ expand: ['station'] });
  })
  .then((userMe) => {
    t('getUsersMe');
    me = userMe;
    output(`Welcome, ${me.name}`);

    if (me.station && me.station.effectiveStation) {
      stationsApi.getStation(me.station.effectiveStation.id)
        .then((station) => {
          window.$('#station').val(station.name);
          output('Effective station is currently ' + station.name);
        })
        .catch((err) => {
          console.log(err);
          output(`Error ${err.message ? err.message : err}`);
        });
    }
  })
  .then(() => {
    webrtcSdk = new WebrtcSdk({ accessToken: client.authData.accessToken });
    webrtcSdk.on('pendingSession', data => {
      t('WebRTC SDK', 'onPendingSession');
      webrtcSdk.acceptPendingSession({ id: data.id });
    });
    t('Initializing WebRTC SDK', 'starting');
    return webrtcSdk.initialize()
      .then(() => {
        t('Initializing WebRTC SDK');
      });
  })
  .catch((err) => {
    console.log(err);
    output(`Error ${err.message ? err.message : err}`);
  });

function output (msg) {
  if (webrtcSdk) {
    webrtcSdk._log('info', msg);
  }
  window.$('#output').prepend(msg + '\n');
}

function t (name, message) {
  const now = new Date();
  if (timers[name]) {
    output(`[END   ${name} ${now.toISOString()}] ${now.getTime() - timers[name].getTime()}ms ${message || ''}`);
    delete timers[name];
  } else {
    timers[name] = now;
    if (message) {
      output(`[START ${name} ${timers[name].toISOString()}] ${message}`);
    }
  }
}

function dial (number, maxAttempts, attempt = 0) {
  attempt++;
  if (attempt > maxAttempts) {
    return t('dialing', 'Done dialing');
  }

  output(`**** Dialing ${number}, attempt ${attempt}/${maxAttempts} ****`);
  conversationsApi.postConversationsCalls({
    phoneNumber: number
  })
    .then((conversation) => {
      console.log(conversation);
      t(conversation.id, 'Conversation started');
      conversationActions([
        {
          id: conversation.id,
          action: 'getdata',
          timeout: 1000
        },
        {
          id: conversation.id,
          action: 'hold',
          timeout: 10000
        },
        {
          id: conversation.id,
          action: 'unhold',
          timeout: 2000
        },
        {
          id: conversation.id,
          action: 'disconnect',
          timeout: 2000
        },
        {
          action: 'dial',
          number: number,
          maxAttempts: maxAttempts,
          attempt: attempt,
          timeout: 1000
        }
      ]);
    })
    .catch((err) => {
      console.log(err);
      output(`Error ${err.message ? err.message : err}`);
    });
}

function conversationActions (actions) {
  if (actions.length === 0) {
    return;
  }

  const action = actions[0];
  const timeout = action.timeout || 0;
  output(`Running action ${action.action} in ${timeout}ms`);
  setTimeout(doAction.bind(this, actions), timeout);
}

function doAction (actions) {
  const action = actions.shift();
  output('Action: ' + action.action);

  switch (action.action) {
    case 'getdata': {
      conversationsApi.getConversationsCall(action.id)
        .then((call) => {
          console.log(call);
          let thisParticipantId;
          call.participants.some((p) => {
            if (p.user && p.user.id === me.id) {
              thisParticipantId = p.id;
              return true;
            }
          });

          // Add participant id to actions
          if (thisParticipantId) {
            actions.forEach((a) => { a.participantId = thisParticipantId; });
          } else {
            output('WARNING: Didn\'t find user participant');
          }

          conversationActions(actions);
        })
        .catch((err) => {
          console.log(err);
          output(`Error ${err.message ? err.message : err}`);
        });
      break;
    }
    case 'hold': {
      const body = {
        held: true
      };
      t(action.id + '-hold', 'Initiating hold');
      conversationsApi.patchConversationsCallParticipant(action.id, action.participantId, body)
        .then(() => {
          t(action.id + '-hold', 'Complete');
          conversationActions(actions);
        })
        .catch((err) => {
          console.log(err);
          output(`Error ${err.message ? err.message : err}`);
        });
      break;
    }
    case 'unhold': {
      const body = {
        held: false
      };
      t(action.id + '-unhold', 'Initiating unhold');
      conversationsApi.patchConversationsCallParticipant(action.id, action.participantId, body)
        .then(() => {
          t(action.id + '-unhold', 'Complete');
          conversationActions(actions);
        })
        .catch((err) => {
          console.log(err);
          output(`Error ${err.message ? err.message : err}`);
        });
      break;
    }
    case 'disconnect': {
      const body = {
        state: 'disconnected'
      };
      t(action.id + '-disconnect', 'Initiating disconnect');
      conversationsApi.patchConversationsCallParticipant(action.id, action.participantId, body)
        .then(() => {
          t(action.id + '-disconnect', 'Complete');
          conversationActions(actions);
        })
        .catch((err) => {
          console.log(err);
          output(`Error ${err.message ? err.message : err}`);
        });
      break;
    }
    case 'dial': {
      dial(action.number, action.maxAttempts, action.attempt);
      conversationActions(actions);
      break;
    }
    default: {
      output('Error: Unknown action ' + action.action);
      conversationActions(actions);
    }
  }
}

window.$(document).ready(() => {
  window.$('#setStation').click((evt) => {
    evt.preventDefault();

    const stationText = window.$('#station').val();
    if (!stationText || stationText === '') {
      return output('Enter a station name first');
    }

    stationsApi.getStations({
      name: stationText
    })
      .then((stations) => {
        if (stations.entities.length === 0) {
          throw Error('No stations found');
        } else if (stations.entities.length > 1) {
          let stationNames = '';
          stations.entities.forEach((station) => {
            stationNames += station.name + ', ';
          });
          stationNames = stationNames.substring(0, stationNames.length - 2);
          throw Error('Multiple stations found. Choose from the following names: ' + stationNames);
        } else {
          t('set station', `Setting station: ${stations.entities[0].name} (${stations.entities[0].id})`);
          return usersApi.putUserStationAssociatedstationStationId(me.id, stations.entities[0].id);
        }
      })
      .then(() => {
        t('set station', 'Station set successfully');
      })
      .catch((err) => {
        console.log(err);
        output(`Error: ${err.message ? err.message : err}`);
      });
  });

  window.$('#startDialing').click((evt) => {
    evt.preventDefault();

    const numberToDial = window.$('#numberToDial').val();
    let attempts = window.$('#attempts').val();
    if (attempts) {
      attempts = parseInt(attempts);
    }

    if (!numberToDial || numberToDial === '') {
      return output('Provide a number to dial first');
    }
    if (!attempts || isNaN(attempts) || attempts < 1) {
      return output('Set number of attempts first');
    }

    t('dialing', `Starting ${attempts} attempts to ${numberToDial}...`);
    dial(numberToDial, attempts);
  });
});
