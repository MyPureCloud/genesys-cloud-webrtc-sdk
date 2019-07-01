'use strict';
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
exports.__esModule = true;
var test = require('ava');
var sinon = require('sinon');
var nock = require('nock');
var WildEmitter = require('wildemitter');
// const WebSocket = require('ws');
var ws_1 = require("ws");
var PureCloudWebrtcSdk = require('../../src/client');
function random() {
    return ("" + Math.random()).split('.')[1];
}
var USER_ID = random();
var PARTICIPANT_ID = random();
var MOCK_USER = {
    id: USER_ID,
    chat: { jabberId: 'hubert.j.farnsworth@planetexpress.mypurecloud.com' }
};
var MOCK_ORG = {
    thirdPartyOrgId: '3000'
};
var MOCK_CONVERSATION = {
    participants: [
        {
            id: PARTICIPANT_ID,
            user: {
                id: USER_ID
            }
        },
        {
            id: random()
        }
    ]
};
function timeout(n) {
    return new Promise(function (resolve) { return setTimeout(resolve, n); });
}
test.serial('constructor | throws if options are not provided', function (t) {
    t.throws(function () {
        var sdk = new PureCloudWebrtcSdk(); // eslint-disable-line
    });
});
test.serial('constructor | throws if accessToken is not provided', function (t) {
    t.throws(function () {
        var sdk = new PureCloudWebrtcSdk({ environment: 'mypurecloud.com' }); // eslint-disable-line
    });
});
test.serial('constructor | warns if environment is not valid', function (t) {
    var sdk1 = new PureCloudWebrtcSdk({ accessToken: '1234', environment: 'mypurecloud.con' }); // eslint-disable-line
    var sdk2 = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.con',
        logger: { warn: sinon.stub() }
    });
    sinon.assert.calledOnce(sdk2.logger.warn);
});
test.serial('constructor | warns if the logLevel is not valid', function (t) {
    var sdk = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.com',
        logLevel: 'ERROR',
        logger: { warn: sinon.stub() }
    });
    sinon.assert.calledOnce(sdk.logger.warn);
});
test.serial('constructor | does not warn if things are fine', function (t) {
    var sdk = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.com',
        logLevel: 'error',
        logger: { warn: sinon.stub() }
    });
    sinon.assert.notCalled(sdk.logger.warn);
});
test.serial('constructor | sets up options with defaults', function (t) {
    var sdk = new PureCloudWebrtcSdk({ accessToken: '1234' });
    t.is(sdk.logger, console);
    t.is(sdk._accessToken, '1234');
    t.is(sdk._environment, 'mypurecloud.com');
    t.is(sdk._autoConnectSessions, true);
    t.is(typeof sdk._customIceServersConfig, 'undefined');
    t.is(sdk._iceTransportPolicy, 'all');
});
test.serial('constructor | sets up options when provided', function (t) {
    var logger = {};
    var iceServers = [];
    var sdk = new PureCloudWebrtcSdk({
        accessToken: '1234',
        environment: 'mypurecloud.ie',
        autoConnectSessions: false,
        iceServers: iceServers,
        iceTransportPolicy: 'relay',
        logger: logger
    });
    t.is(sdk.logger, logger);
    t.is(sdk._accessToken, '1234');
    t.is(sdk._environment, 'mypurecloud.ie');
    t.is(sdk._autoConnectSessions, false);
    t.is(sdk._customIceServersConfig, iceServers);
    t.is(sdk._iceTransportPolicy, 'relay');
});
var wss;
var ws;
test.after(function () {
    wss.close();
});
var sandbox = sinon.createSandbox();
test.afterEach(function () {
    if (ws) {
        ws.close();
        ws = null;
    }
    if (wss) {
        wss.removeAllListeners();
    }
    sandbox.restore();
});
function mockApis(_a) {
    var _b = _a === void 0 ? {} : _a, failOrg = _b.failOrg, failUser = _b.failUser, failStreaming = _b.failStreaming, failLogs = _b.failLogs, failLogsPayload = _b.failLogsPayload, withMedia = _b.withMedia, conversationId = _b.conversationId, participantId = _b.participantId, withLogs = _b.withLogs;
    nock.cleanAll();
    var api = nock('https://api.mypurecloud.com');
    // easy to debug nock
    // api.log(console.error);
    var getOrg;
    if (failOrg) {
        getOrg = api.get('/api/v2/organizations/me').reply(401);
    }
    else {
        getOrg = api.get('/api/v2/organizations/me').reply(200, MOCK_ORG);
    }
    var getUser;
    if (failUser) {
        getUser = api.get('/api/v2/users/me').reply(401);
    }
    else {
        getUser = api.get('/api/v2/users/me').reply(200, MOCK_USER);
    }
    var getChannel = api
        .post('/api/v2/notifications/channels?connectionType=streaming')
        .reply(200, { id: 'somechannelid' });
    var conversationsApi = nock('https://api.mypurecloud.com');
    var getConversation;
    if (conversationId) {
        getConversation = conversationsApi
            .get("/api/v2/conversations/calls/" + conversationId)
            .reply(200, MOCK_CONVERSATION);
    }
    var patchConversation;
    if (conversationId && participantId) {
        patchConversation = conversationsApi
            .patch("/api/v2/conversations/calls/" + conversationId + "/participants/" + participantId)
            .reply(202, {});
    }
    global.window = global.window || {};
    if (withMedia) {
        window.navigator = window.navigator || {};
        window.navigator.mediaDevices = window.navigator.mediaDevices || {};
        window.navigator.mediaDevices.getUserMedia = function () { return Promise.resolve(withMedia); };
    }
    global.document = {
        createElement: sinon.stub().returns({
            addEventListener: function (evt, callback) { return setTimeout(callback, 10); },
            classList: { add: function () { } }
        }),
        querySelector: function () { },
        body: {
            append: function () { }
        },
        head: {
            appendChild: sinon.stub().callsFake(function (script) {
                global.window = global.window || {};
            })
        }
    };
    var sdk = new PureCloudWebrtcSdk({
        accessToken: '1234',
        wsHost: failStreaming ? null : 'ws://localhost:1234',
        logger: { debug: function () { }, log: function () { }, info: function () { }, warn: function () { }, error: function () { } }
        // logger: { debug () {}, log () {}, info () {}, warn: console.warn.bind(console), error: console.error.bind(console) }
    });
    var sendLogs;
    if (withLogs) {
        var logsApi = nock('https://api.mypurecloud.com').persist();
        if (failLogsPayload) {
            sendLogs = logsApi.post('/api/v2/diagnostics/trace').replyWithError({ status: 413, message: 'test fail' });
        }
        else if (failLogs) {
            sendLogs = logsApi.post('/api/v2/diagnostics/trace').replyWithError({ status: 419, message: 'test fail' });
        }
        else {
            sendLogs = logsApi.post('/api/v2/diagnostics/trace').reply(200);
        }
    }
    else {
        sdk._optOutOfTelemetry = true;
    }
    if (wss) {
        wss.close();
        wss = null;
    }
    wss = new ws_1["default"].Server({
        port: 1234
    });
    var websocket;
    wss.on('connection', function (ws) {
        websocket = ws;
        ws.on('message', function (msg) {
            // console.error('⬆️', msg);
            var send = function (r) {
                // console.error('⬇️', r);
                setTimeout(function () { ws.send(r); }, 15);
            };
            if (msg.indexOf('<open') === 0) {
                send('<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" xmlns:stream="http://etherx.jabber.org/streams" version="1.0" from="hawk" id="d6f681a3-358c-49df-819f-b231adb3cb97" xml:lang="en"></open>');
                if (ws.__authSent) {
                    send("<stream:features xmlns:stream=\"http://etherx.jabber.org/streams\"><bind xmlns=\"urn:ietf:params:xml:ns:xmpp-bind\"></bind><session xmlns=\"urn:ietf:params:xml:ns:xmpp-session\"></session></stream:features>");
                }
                else {
                    send('<stream:features xmlns:stream="http://etherx.jabber.org/streams"><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms></stream:features>');
                }
            }
            else if (msg.indexOf('<auth') === 0) {
                if (failStreaming) {
                    send('<failure xmlns="urn:ietf:params:xml:ns:xmpp-sasl"></failure>');
                }
                else {
                    send('<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"></success>');
                }
                ws.__authSent = true;
            }
            else if (msg.indexOf('<bind') !== -1) {
                var idRegexp = /id="(.*?)"/;
                var id = idRegexp.exec(msg)[1];
                send("<iq xmlns=\"jabber:client\" id=\"" + id + "\" to=\"" + MOCK_USER.chat.jabberId + "\" type=\"result\"><bind xmlns=\"urn:ietf:params:xml:ns:xmpp-bind\"><jid>" + MOCK_USER.chat.jabberId + "/d6f681a3-358c-49df-819f-b231adb3cb97</jid></bind></iq>");
            }
            else if (msg.indexOf('<session') !== -1) {
                var idRegexp = /id="(.*?)"/;
                var id = idRegexp.exec(msg)[1];
                send("<iq xmlns=\"jabber:client\" id=\"" + id + "\" to=\"" + MOCK_USER.chat.jabberId + "/d6f681a3-358c-49df-819f-b231adb3cb97\" type=\"result\"></iq>");
            }
            else if (msg.indexOf('ping') !== -1) {
                var idRegexp = /id="(.*?)"/;
                var id = idRegexp.exec(msg)[1];
                send("<iq xmlns=\"jabber:client\" to=\"" + MOCK_USER.chat.jabberId + "\" type=\"result\" id=\"" + id + "\"></iq>");
            }
            else if (msg.indexOf('extdisco') !== -1) {
                var idRegexp = / id="(.*?)"/;
                var id = idRegexp.exec(msg)[1];
                if (msg.indexOf('type="turn"') > -1) {
                    send("<iq xmlns=\"jabber:client\" type=\"result\" to=\"" + MOCK_USER.chat.jabberId + "\" id=\"" + id + "\"><services xmlns=\"urn:xmpp:extdisco:1\"><service transport=\"udp\" port=\"3456\" type=\"turn\" username=\"turnuser:12395\" password=\"akskdfjka=\" host=\"turn.us-east-1.mypurecloud.com\"/></services></iq>");
                }
                else {
                    send("<iq xmlns=\"jabber:client\" type=\"result\" to=\"" + MOCK_USER.chat.jabberId + "\" id=\"" + id + "\"><services xmlns=\"urn:xmpp:extdisco:1\"><service transport=\"udp\" port=\"3456\" type=\"stun\" host=\"turn.us-east-1.mypurecloud.com\"/></services></iq>");
                }
            }
        });
    });
    global.window.WebSocket = ws_1["default"];
    ws = websocket;
    return { getOrg: getOrg, getUser: getUser, getChannel: getChannel, getConversation: getConversation, sendLogs: sendLogs, patchConversation: patchConversation, sdk: sdk, websocket: websocket };
}
test.serial('initialize | fetches org and person details, sets up the streaming connection', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var _a, getOrg, getUser, getChannel, sdk;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _a = mockApis(), getOrg = _a.getOrg, getUser = _a.getUser, getChannel = _a.getChannel, sdk = _a.sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _b.sent();
                getOrg.done();
                getUser.done();
                getChannel.done();
                t.truthy(sdk._streamingConnection);
                sdk.logBuffer = [];
                sdk._optOutOfTelemetry = true;
                return [2 /*return*/];
        }
    });
}); });
test.serial('initialize | throws if getting the org fails', function (t) {
    var sdk = mockApis({ failOrg: true }).sdk;
    return sdk.initialize().then(function () { return t.fail(); })["catch"](function () { return t.pass(); });
});
test.serial('initialize | throws if getting the user fails', function (t) {
    var sdk = mockApis({ failUser: true }).sdk;
    return sdk.initialize().then(function (t) { return t.fail(); })["catch"](function () { return t.pass(); });
});
test.serial('initialize | throws if setting up streaming connection fails', function (t) {
    var sdk = mockApis({ failStreaming: true }).sdk;
    return sdk.initialize().then(function () { return t.fail(); })["catch"](function () { return t.pass(); });
});
test.serial('initialize sets up event proxies', function (t) { return __awaiter(_this, void 0, void 0, function () {
    function awaitEvent(sdk, eventName, trigger, args, transformedArgs) {
        if (args === void 0) { args = []; }
        return __awaiter(this, void 0, void 0, function () {
            var promise;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!transformedArgs) {
                            transformedArgs = args;
                        }
                        promise = new Promise(function (resolve) {
                            var handler = function () {
                                var eventArgs = [];
                                for (var _i = 0; _i < arguments.length; _i++) {
                                    eventArgs[_i] = arguments[_i];
                                }
                                t.deepEqual(transformedArgs, eventArgs, "Args match for " + eventName);
                                sdk.off(eventName, handler);
                                resolve();
                            };
                            sdk.on(eventName, handler);
                        });
                        if (typeof trigger === 'string') {
                            (_a = sdk._streamingConnection._webrtcSessions).emit.apply(_a, [trigger].concat(args));
                            (_b = sdk._streamingConnection._stanzaio).emit.apply(_b, [trigger].concat(args));
                        }
                        else {
                            trigger(args);
                        }
                        return [4 /*yield*/, promise];
                    case 1:
                        _c.sent();
                        return [2 /*return*/];
                }
            });
        });
    }
    var sdk, eventsToVerify;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                eventsToVerify = [
                    { name: 'error', trigger: 'error', args: [new Error('test'), {}] },
                    { name: 'trace', trigger: 'traceRtcSession' },
                    {
                        name: 'handledPendingSession',
                        trigger: 'handledIncomingRtcSession',
                        args: [1],
                        transformedArgs: [1]
                    },
                    {
                        name: 'cancelPendingSession',
                        trigger: 'cancelIncomingRtcSession',
                        args: [1],
                        transformedArgs: [1]
                    },
                    { name: 'error', trigger: 'rtcSessionError' },
                    { name: 'disconnected', trigger: 'session:end', args: [], transformedArgs: ['Streaming API connection disconnected'] }
                ];
                return [2 /*return*/, Promise.all(eventsToVerify.map(function (e) { return awaitEvent(sdk, e.name, e.trigger, e.args, e.transformedArgs); }))];
        }
    });
}); });
test.serial('connected | returns the streaming client connection status', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._streamingConnection.connected = true;
                t["true"](sdk.connected);
                sdk._streamingConnection.connected = false;
                t["false"](sdk.connected);
                return [2 /*return*/];
        }
    });
}); });
test.serial('acceptPendingSession | proxies the call to the streaming connection', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, promise;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                promise = new Promise(function (resolve) {
                    sdk._streamingConnection.webrtcSessions.on('rtcSessionError', resolve);
                });
                sdk._streamingConnection._webrtcSessions.acceptRtcSession = sinon.stub();
                sdk.acceptPendingSession('4321');
                return [4 /*yield*/, promise];
            case 2:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
test.serial('endSession | requests the conversation then patches the participant to disconnected', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sessionId, conversationId, participantId, _a, sdk, getConversation, patchConversation, mockSession;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                sessionId = random();
                conversationId = random();
                participantId = PARTICIPANT_ID;
                _a = mockApis({ conversationId: conversationId, participantId: participantId }), sdk = _a.sdk, getConversation = _a.getConversation, patchConversation = _a.patchConversation;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _b.sent();
                mockSession = { id: sessionId, conversationId: conversationId, end: sinon.stub() };
                sdk._sessionManager.sessions = {};
                sdk._sessionManager.sessions[sessionId] = mockSession;
                return [4 /*yield*/, sdk.endSession({ id: sessionId })];
            case 2:
                _b.sent();
                getConversation.done();
                patchConversation.done();
                sinon.assert.notCalled(mockSession.end);
                return [2 /*return*/];
        }
    });
}); });
test.serial('endSession | requests the conversation then patches the participant to disconnected', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sessionId, conversationId, participantId, _a, sdk, getConversation, patchConversation, mockSession;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                sessionId = random();
                conversationId = random();
                participantId = PARTICIPANT_ID;
                _a = mockApis({ conversationId: conversationId, participantId: participantId }), sdk = _a.sdk, getConversation = _a.getConversation, patchConversation = _a.patchConversation;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _b.sent();
                mockSession = { id: sessionId, conversationId: conversationId, end: sinon.stub() };
                sdk._sessionManager.sessions = {};
                sdk._sessionManager.sessions[sessionId] = mockSession;
                return [4 /*yield*/, sdk.endSession({ conversationId: conversationId })];
            case 2:
                _b.sent();
                getConversation.done();
                patchConversation.done();
                sinon.assert.notCalled(mockSession.end);
                return [2 /*return*/];
        }
    });
}); });
test.serial('endSession | rejects if not provided either an id or a conversationId', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                return [4 /*yield*/, sdk.endSession({})
                        .then(function () {
                        t.fail();
                    })["catch"](function (err) {
                        t.truthy(err);
                        t.pass();
                    })];
            case 2:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
test.serial('endSession | rejects if not provided anything', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                return [4 /*yield*/, sdk.endSession()
                        .then(function () {
                        t.fail();
                    })["catch"](function (err) {
                        t.truthy(err);
                        t.pass();
                    })];
            case 2:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
test.serial('endSession | rejects if the session is not found', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sessionId, conversationId, participantId, sdk, mockSession;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sessionId = random();
                conversationId = random();
                participantId = PARTICIPANT_ID;
                sdk = mockApis({ conversationId: conversationId, participantId: participantId }).sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                mockSession = { id: random(), conversationId: conversationId, end: sinon.stub() };
                sdk._sessionManager.sessions = {};
                sdk._sessionManager.sessions[mockSession.id] = mockSession;
                return [4 /*yield*/, sdk.endSession({ id: sessionId })
                        .then(function () {
                        t.fail();
                    })["catch"](function (err) {
                        t.truthy(err);
                        t.pass();
                    })];
            case 2:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
test.serial('endSession | ends the session and rejects if there is an error fetching the conversation', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sessionId, conversationId, participantId, sdk, mockSession;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sessionId = random();
                conversationId = random();
                participantId = random();
                sdk = mockApis({ conversationId: conversationId, participantId: participantId }).sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                mockSession = { id: sessionId, conversationId: conversationId, end: sinon.stub() };
                sdk._sessionManager.sessions = {};
                sdk._sessionManager.sessions[sessionId] = mockSession;
                return [4 /*yield*/, sdk.endSession({ id: sessionId })
                        .then(function () {
                        t.fail();
                    })["catch"](function (err) {
                        t.truthy(err);
                        sinon.assert.calledOnce(mockSession.end);
                    })];
            case 2:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
test.serial('endSession | terminates the session of the existing session has no conversationId', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sessionId, conversationId, participantId, _a, sdk, getConversation, mockSession;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                sessionId = random();
                conversationId = random();
                participantId = random();
                _a = mockApis({ conversationId: conversationId, participantId: participantId }), sdk = _a.sdk, getConversation = _a.getConversation;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _b.sent();
                mockSession = { id: sessionId, end: sinon.stub() };
                sdk._sessionManager.sessions = {};
                sdk._sessionManager.sessions[sessionId] = mockSession;
                return [4 /*yield*/, sdk.endSession({ id: sessionId })];
            case 2:
                _b.sent();
                t.throws(function () { return getConversation.done(); });
                sinon.assert.calledOnce(mockSession.end);
                return [2 /*return*/];
        }
    });
}); });
test.serial('disconnect | proxies the call to the streaming connection', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._streamingConnection.disconnect = sinon.stub();
                sdk.disconnect();
                sinon.assert.calledOnce(sdk._streamingConnection.disconnect);
                t.plan(0);
                return [2 /*return*/];
        }
    });
}); });
test.serial('reconnect | proxies the call to the streaming connection', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._streamingConnection.reconnect = sinon.stub();
                sdk.reconnect();
                sinon.assert.calledOnce(sdk._streamingConnection.reconnect);
                t.plan(0);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_customIceServersConfig | gets reset if the client refreshes ice servers', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, actual;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._customIceServersConfig = [{ something: 'junk' }];
                sdk._streamingConnection.sessionManager = {
                    iceServers: [{ urls: ['turn:mypurecloud.com'] }]
                };
                return [4 /*yield*/, sdk._streamingConnection.webrtcSessions.refreshIceServers()];
            case 2:
                _a.sent();
                actual = sdk._sessionManager.iceServers;
                t.deepEqual(actual, [
                    {
                        type: 'turn',
                        urls: 'turn:turn.us-east-1.mypurecloud.com:3456',
                        username: 'turnuser:12395',
                        credential: 'akskdfjka='
                    },
                    {
                        type: 'stun',
                        urls: 'stun:turn.us-east-1.mypurecloud.com:3456'
                    }
                ]);
                return [2 /*return*/];
        }
    });
}); });
test.serial('onPendingSession | emits a pendingSession event and accepts the session', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, pendingSession, sessionInfo;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sinon.stub(sdk, 'acceptPendingSession');
                pendingSession = new Promise(function (resolve) {
                    sdk.on('pendingSession', resolve);
                });
                sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
                    sessionId: '1077',
                    autoAnswer: true,
                    conversationId: 'deadbeef-guid',
                    fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
                });
                return [4 /*yield*/, pendingSession];
            case 2:
                sessionInfo = _a.sent();
                t.is(sessionInfo.id, '1077');
                t.is(sessionInfo.conversationId, 'deadbeef-guid');
                t.is(sessionInfo.address, '+15558675309');
                t.is(sessionInfo.autoAnswer, true);
                sinon.assert.calledOnce(sdk.acceptPendingSession);
                sinon.assert.calledWithExactly(sdk.acceptPendingSession, '1077');
                return [2 /*return*/];
        }
    });
}); });
test.serial('onPendingSession | emits a pendingSession event but does not accept the session if autoAnswer is false', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, pendingSession, sessionInfo;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sinon.stub(sdk, 'acceptPendingSession');
                pendingSession = new Promise(function (resolve) {
                    sdk.on('pendingSession', resolve);
                });
                sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
                    sessionId: '1077',
                    autoAnswer: false,
                    conversationId: 'deadbeef-guid',
                    fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
                });
                return [4 /*yield*/, pendingSession];
            case 2:
                sessionInfo = _a.sent();
                t.is(sessionInfo.id, '1077');
                t.is(sessionInfo.conversationId, 'deadbeef-guid');
                t.is(sessionInfo.address, '+15558675309');
                t.is(sessionInfo.autoAnswer, false);
                sinon.assert.notCalled(sdk.acceptPendingSession);
                return [2 /*return*/];
        }
    });
}); });
var MockSession = /** @class */ (function (_super) {
    __extends(MockSession, _super);
    function MockSession() {
        var _this = _super.call(this) || this;
        _this.streams = [];
        _this.sid = random();
        _this.pc = new WildEmitter();
        return _this;
    }
    MockSession.prototype.accept = function () { };
    MockSession.prototype.addStream = function () { };
    MockSession.prototype.end = function () { };
    return MockSession;
}(WildEmitter));
var MockTrack = /** @class */ (function () {
    function MockTrack() {
    }
    MockTrack.prototype.stop = function () { };
    return MockTrack;
}());
var MockStream = /** @class */ (function () {
    function MockStream() {
        this._tracks = [new MockTrack()];
    }
    MockStream.prototype.getTracks = function () {
        return this._tracks;
    };
    return MockStream;
}());
test.serial('onSession | starts media, attaches it to the session, attaches it to the dom, accepts the session, and emits a started event', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var mockOutboundStream, sdk, sandbox, bodyAppend, sessionStarted, mockSession, attachedAudioElement, sessionEnded;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mockOutboundStream = new MockStream();
                sdk = mockApis({ withMedia: mockOutboundStream }).sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sandbox = sinon.createSandbox();
                sandbox.spy(global.window.navigator.mediaDevices, 'getUserMedia');
                bodyAppend = new Promise(function (resolve) {
                    sandbox.stub(global.document.body, 'append').callsFake(resolve);
                });
                sessionStarted = new Promise(function (resolve) { return sdk.on('sessionStarted', resolve); });
                mockSession = new MockSession();
                mockSession.sid = random();
                sdk._pendingSessions[mockSession.sid] = mockSession;
                mockSession.streams = [new MockStream()];
                sandbox.stub(mockSession, 'addStream');
                sandbox.stub(mockSession, 'accept');
                sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
                return [4 /*yield*/, sessionStarted];
            case 2:
                _a.sent();
                mockSession._statsGatherer.emit('traces', { some: 'traces' });
                mockSession._statsGatherer.emit('stats', { some: 'stats' });
                sandbox.stub(mockSession._statsGatherer, 'collectInitialConnectionStats');
                mockSession.emit('change:active', mockSession, true);
                sinon.assert.calledOnce(mockSession._statsGatherer.collectInitialConnectionStats);
                sinon.assert.calledOnce(mockSession.addStream);
                sinon.assert.calledOnce(mockSession.accept);
                sinon.assert.calledOnce(global.window.navigator.mediaDevices.getUserMedia);
                return [4 /*yield*/, bodyAppend];
            case 3:
                attachedAudioElement = _a.sent();
                t.is(attachedAudioElement.srcObject, mockSession.streams[0]);
                sessionEnded = new Promise(function (resolve) { return sdk.on('sessionEnded', resolve); });
                mockSession.emit('terminated', mockSession);
                mockSession.emit('change:active', mockSession, false);
                sinon.assert.calledOnce(mockSession._statsGatherer.collectInitialConnectionStats);
                return [4 /*yield*/, sessionEnded];
            case 4:
                _a.sent();
                sandbox.restore();
                return [2 /*return*/];
        }
    });
}); });
test.serial('onSession | uses existing media, attaches it to the session, attaches it to the dom in existing element when ready, and emits a started event', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var mockOutboundStream, mockAudioElement, sdk, sandbox, sessionStarted, mockSession, mockInboundStream, sessionEnded;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mockOutboundStream = new MockStream();
                mockAudioElement = { classList: { add: function () { } } };
                sdk = mockApis({ withMedia: {} }).sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk.pendingStream = mockOutboundStream;
                sdk._autoConnectSessions = false;
                sandbox = sinon.createSandbox();
                sandbox.spy(global.window.navigator.mediaDevices, 'getUserMedia');
                sandbox.stub(global.document, 'querySelector').returns(mockAudioElement);
                sandbox.stub(global.document.body, 'append');
                sessionStarted = new Promise(function (resolve) { return sdk.on('sessionStarted', resolve); });
                mockSession = new MockSession();
                sinon.stub(mockSession, 'addStream');
                sinon.stub(mockSession, 'accept');
                sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
                return [4 /*yield*/, sessionStarted];
            case 2:
                _a.sent();
                sinon.assert.calledOnce(mockSession.addStream);
                sinon.assert.calledWithExactly(mockSession.addStream, mockOutboundStream);
                sinon.assert.notCalled(mockSession.accept);
                sinon.assert.notCalled(global.window.navigator.mediaDevices.getUserMedia);
                mockInboundStream = {};
                mockSession.emit('peerStreamAdded', mockSession, mockInboundStream);
                t.is(mockAudioElement.srcObject, mockInboundStream);
                sinon.assert.notCalled(global.document.body.append);
                sessionEnded = new Promise(function (resolve) { return sdk.on('sessionEnded', resolve); });
                mockSession._outboundStream = null;
                mockSession.emit('terminated', mockSession);
                return [4 /*yield*/, sessionEnded];
            case 3:
                _a.sent();
                sandbox.restore();
                return [2 /*return*/];
        }
    });
}); });
test.serial('onSession | uses existing media, attaches it to the session, attaches it to the dom in _pendingAudioElement element when ready, and emits a started event', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var mockOutboundStream, mockAudioElement, sdk, sandbox, sessionStarted, mockSession, mockInboundStream;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                mockOutboundStream = new MockStream();
                mockAudioElement = { classList: { add: function () { } } };
                sdk = mockApis({ withMedia: {} }).sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk.pendingStream = mockOutboundStream;
                sdk._autoConnectSessions = false;
                sdk._pendingAudioElement = mockAudioElement;
                sandbox = sinon.createSandbox();
                sandbox.spy(global.window.navigator.mediaDevices, 'getUserMedia');
                sandbox.stub(global.document.body, 'append');
                sessionStarted = new Promise(function (resolve) { return sdk.on('sessionStarted', resolve); });
                mockSession = new MockSession();
                sinon.stub(mockSession, 'addStream');
                sinon.stub(mockSession, 'accept');
                sdk._streamingConnection._webrtcSessions.emit('incomingRtcSession', mockSession);
                return [4 /*yield*/, sessionStarted];
            case 2:
                _a.sent();
                sinon.assert.calledOnce(mockSession.addStream);
                sinon.assert.calledWithExactly(mockSession.addStream, mockOutboundStream);
                sinon.assert.notCalled(mockSession.accept);
                sinon.assert.notCalled(global.window.navigator.mediaDevices.getUserMedia);
                mockInboundStream = {};
                mockSession.emit('peerStreamAdded', mockSession, mockInboundStream);
                t.is(mockAudioElement.srcObject, mockInboundStream);
                sinon.assert.notCalled(global.document.body.append);
                sandbox.restore();
                return [2 /*return*/];
        }
    });
}); });
test.serial('_log | will not notify logs if the logLevel is lower than configured', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                sdk._logLevel = 'warn';
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sinon.stub(sdk, '_notifyLogs');
                sdk._log('debug', 'test', { details: 'etc' });
                sinon.assert.notCalled(sdk._notifyLogs);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_log | will not notify logs if opted out', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                sdk._logLevel = 'debug';
                sdk._optOutOfTelemetry = true;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sinon.stub(sdk, '_notifyLogs');
                sdk._log('warn', 'test', { details: 'etc' });
                sinon.assert.notCalled(sdk._notifyLogs);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_log | will buffer a log and notify it if the logLevel is gte configured', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                sdk._logLevel = 'warn';
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sinon.stub(sdk, '_notifyLogs');
                console.log(sdk._logBuffer[0]);
                t.is(sdk._logBuffer.length, 0);
                sdk._log('warn', 'test', { details: 'etc' });
                sinon.assert.calledOnce(sdk._notifyLogs);
                t.is(sdk._logBuffer.length, 1);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_notifyLogs | will debounce logs and only send logs once at the end', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, i;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                sdk._logLevel = 'warn';
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sinon.stub(sdk, '_sendLogs');
                t.is(sdk._logBuffer.length, 0);
                sdk._log('warn', 'test', { details: 'etc' });
                sinon.assert.notCalled(sdk._sendLogs);
                i = 1;
                _a.label = 2;
            case 2:
                if (!(i < 6)) return [3 /*break*/, 5];
                return [4 /*yield*/, timeout(100 * i)];
            case 3:
                _a.sent();
                sdk._log('warn', 'test' + i);
                _a.label = 4;
            case 4:
                i++;
                return [3 /*break*/, 2];
            case 5:
                sinon.assert.notCalled(sdk._sendLogs);
                t.is(sdk._logBuffer.length, 6);
                return [4 /*yield*/, timeout(1100)];
            case 6:
                _a.sent();
                sinon.assert.calledOnce(sdk._sendLogs);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_sendLogs | resets all flags related to backoff on success', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                sdk._logLevel = 'warn';
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._backoffActive = true;
                sdk._failedLogAttempts = 2;
                sdk._reduceLogPayload = true;
                sdk._logBuffer.push('log1');
                return [4 /*yield*/, sdk._sendLogs()];
            case 2:
                _a.sent();
                t.is(sdk._backoffActive, false);
                t.is(sdk._failedLogAttempts, 0);
                t.is(sdk._reduceLogPayload, false);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_sendLogs | resets the backoff on success', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, backoffResetSpy;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                sdk._logLevel = 'warn';
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                backoffResetSpy = sinon.spy(sdk._backoff, 'reset');
                sdk._logBuffer.push('log1');
                sdk._logBuffer.push('log1');
                return [4 /*yield*/, sdk._sendLogs()];
            case 2:
                _a.sent();
                sinon.assert.calledOnce(backoffResetSpy);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_sendLogs | should call backoff.backoff() again if there are still items in the _logBuffer after a successfull call to api', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, backoffSpy;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                sdk._logLevel = 'warn';
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                backoffSpy = sinon.spy(sdk._backoff, 'backoff');
                sdk._reduceLogPayload = true;
                sdk._logBuffer.push('log1');
                sdk._logBuffer.push('log2');
                sdk._logBuffer.push('log3');
                sdk._logBuffer.push('log4');
                return [4 /*yield*/, sdk._sendLogs()];
            case 2:
                _a.sent();
                sinon.assert.calledOnce(backoffSpy);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_sendLogs | will add logs back to buffer if request fails', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var expectedFirstLog, expectedSecondLog, expectedThirdLog, sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                expectedFirstLog = 'log1';
                expectedSecondLog = 'log2';
                expectedThirdLog = 'log3';
                sdk = mockApis({ failLogs: true, withLogs: true }).sdk;
                sdk._logLevel = 'warn';
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                t.is(sdk._logBuffer.length, 0);
                sdk._logBuffer.push(expectedFirstLog);
                sdk._logBuffer.push(expectedSecondLog);
                sdk._logBuffer.push(expectedThirdLog);
                return [4 /*yield*/, sdk._sendLogs()];
            case 2:
                _a.sent();
                t.is(sdk._logBuffer.length, 3);
                t.is(sdk._logBuffer[0], expectedFirstLog, 'Log items should be put back into the buffer the same way they went out');
                t.is(sdk._logBuffer[1], expectedSecondLog, 'Log items should be put back into the buffer the same way they went out');
                t.is(sdk._logBuffer[2], expectedThirdLog, 'Log items should be put back into the buffer the same way they went out');
                sdk.logBuffer = [];
                sdk._optOutOfTelemetry = true;
                return [2 /*return*/];
        }
    });
}); });
test.serial('_sendLogs | increments _failedLogAttemps on failure', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ failLogsPayload: true, withLogs: true }).sdk;
                sdk._logLevel = 'warn';
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                t.is(sdk._logBuffer.length, 0);
                sdk._logBuffer.push('log1');
                sdk._logBuffer.push('log2');
                t.is(sdk._failedLogAttempts, 0);
                return [4 /*yield*/, sdk._sendLogs()];
            case 2:
                _a.sent();
                t.is(sdk._failedLogAttempts, 1);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_sendLogs | sets _reduceLogPayload to true if error status is 413 (payload too large)', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ failLogsPayload: true, withLogs: true }).sdk;
                sdk._logLevel = 'warn';
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                t.is(sdk._logBuffer.length, 0);
                sdk._logBuffer.push('log1');
                sdk._logBuffer.push('log2');
                t.is(sdk._reduceLogPayload, false);
                return [4 /*yield*/, sdk._sendLogs()];
            case 2:
                _a.sent();
                t.is(sdk._reduceLogPayload, true);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_sendLogs | should reset all backoff flags and reset the backoff if api request returns error and payload was only 1 log', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, backoffResetSpy;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ failLogsPayload: true, withLogs: true }).sdk;
                sdk._logLevel = 'warn';
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._logBuffer.push('log1');
                backoffResetSpy = sinon.spy(sdk._backoff, 'reset');
                return [4 /*yield*/, sdk._sendLogs()];
            case 2:
                _a.sent();
                t.is(sdk._backoffActive, false);
                t.is(sdk._failedLogAttempts, 0);
                t.is(sdk._reduceLogPayload, false);
                sinon.assert.calledOnce(backoffResetSpy);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_sendLogs | set backoffActive to false if the backoff fails', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ failLogs: true, withLogs: true }).sdk;
                sdk._logLevel = 'warn';
                sinon.spy(sdk, '_sendLogs');
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._log('error', 'log1');
                sdk._log('error', 'log2');
                sdk._backoff.failAfter(1); // means it will retry once, or 2 tries total
                sdk._notifyLogs();
                sdk._notifyLogs();
                return [4 /*yield*/, timeout(1000)];
            case 2:
                _a.sent();
                sdk._notifyLogs();
                return [4 /*yield*/, timeout(5000)];
            case 3:
                _a.sent();
                sinon.assert.calledTwice(sdk._sendLogs);
                t.is(sdk._backoffActive, false);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_getLogPayload | returns the entire _logBuffer if _reduceLogPayload is false', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._reduceLogPayload = false;
                sdk._logBuffer = [0, 1, 2, 3, 4];
                result = sdk._getLogPayload();
                t.is(result.length, 5);
                t.is(result[0], 0);
                t.is(result[1], 1);
                t.is(result[2], 2);
                t.is(result[3], 3);
                t.is(result[4], 4);
                t.is(sdk._logBuffer.length, 0, 'Items should have been removed from _logBuffer');
                return [2 /*return*/];
        }
    });
}); });
test.serial('_getLogPayload | returns part of _logBuffer if _reduceLogPayload is true', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._reduceLogPayload = true;
                sdk._failedLogAttempts = 1;
                sdk._logBuffer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
                result = sdk._getLogPayload();
                t.is(result.length, 5);
                t.is(result[0], 0);
                t.is(result[1], 1);
                t.is(result[2], 2);
                t.is(result[3], 3);
                t.is(result[4], 4);
                t.is(sdk._logBuffer.length, 5, 'Items should have been removed from _logBuffer');
                t.is(sdk._logBuffer[0], 5);
                t.is(sdk._logBuffer[1], 6);
                t.is(sdk._logBuffer[2], 7);
                t.is(sdk._logBuffer[3], 8);
                t.is(sdk._logBuffer[4], 9);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_getLogPayload | returns part of _logBuffer if _reduceLogPayload is true and _failedLogAttempts is 0', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._reduceLogPayload = true;
                sdk._failedLogAttempts = 0;
                sdk._logBuffer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
                result = sdk._getLogPayload();
                t.is(result.length, 5);
                t.is(result[0], 0);
                t.is(result[1], 1);
                t.is(result[2], 2);
                t.is(result[3], 3);
                t.is(result[4], 4);
                t.is(sdk._logBuffer.length, 5, 'Items should have been removed from _logBuffer');
                t.is(sdk._logBuffer[0], 5);
                t.is(sdk._logBuffer[1], 6);
                t.is(sdk._logBuffer[2], 7);
                t.is(sdk._logBuffer[3], 8);
                t.is(sdk._logBuffer[4], 9);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_resetBackoffFlags | should reset values of _backoffActive, _failedLogAttempts, and _reduceLogPaylod', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._backoffActive = true;
                sdk._failedLogAttempts = 3;
                sdk._reduceLogPayload = true;
                sdk._resetBackoffFlags();
                t.is(sdk._backoffActive, false);
                t.is(sdk._failedLogAttempts, 0);
                t.is(sdk._reduceLogPayload, false);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_getReducedLogPayload | should return at least one log item', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._logBuffer = [1, 2, 3, 4, 5];
                result = sdk._getReducedLogPayload(6);
                t.is(result.length, 1);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_getReducesLogPayload | should remove items from _logBuffer and return them', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis({ withLogs: true }).sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._logBuffer = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
                result = sdk._getReducedLogPayload(1);
                t.is(result.length, 5);
                t.is(result[0], 0);
                t.is(result[1], 1);
                t.is(result[2], 2);
                t.is(result[3], 3);
                t.is(result[4], 4);
                t.is(sdk._logBuffer.length, 5, 'Items should have been removed from the _logBuffer');
                t.is(sdk._logBuffer[0], 5);
                t.is(sdk._logBuffer[1], 6);
                t.is(sdk._logBuffer[2], 7);
                t.is(sdk._logBuffer[3], 8);
                t.is(sdk._logBuffer[4], 9);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_refreshTurnServers | refreshes the turn servers', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._streamingConnection.connected = true;
                t["true"](sdk.connected);
                sinon.stub(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').returns(Promise.resolve());
                return [4 /*yield*/, sdk._refreshTurnServers()];
            case 2:
                _a.sent();
                sinon.assert.calledOnce(sdk._streamingConnection._webrtcSessions.refreshIceServers);
                t.truthy(sdk._refreshTurnServersInterval);
                return [2 /*return*/];
        }
    });
}); });
test.serial('_refreshTurnServers | emits an error if there is an error refreshing turn servers', function (t) { return __awaiter(_this, void 0, void 0, function () {
    var sdk, promise;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sdk = mockApis().sdk;
                return [4 /*yield*/, sdk.initialize()];
            case 1:
                _a.sent();
                sdk._streamingConnection.connected = true;
                t["true"](sdk.connected);
                promise = new Promise(function (resolve) { return sdk.on('error', resolve); });
                sinon.stub(sdk._streamingConnection._webrtcSessions, 'refreshIceServers').returns(Promise.reject(new Error('fail')));
                return [4 /*yield*/, sdk._refreshTurnServers()];
            case 2:
                _a.sent();
                sinon.assert.calledOnce(sdk._streamingConnection._webrtcSessions.refreshIceServers);
                return [4 /*yield*/, promise];
            case 3:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
