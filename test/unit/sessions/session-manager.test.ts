describe('endSession', () => {
  test('rejects if not provided either an id or a conversationId', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();
    try {
      await sdk.endSession({});
      fail();
    } catch (e) {
      expect(e).toEqual(new SdkError(SdkErrorTypes.session, 'Unable to end session: must provide session id or conversationId.'));
    }
    await sdk.disconnect();
  });

  test('should throw if it cannot find the session', async () => {
    const { sdk } = mockApis({});
    const sessionId = random();
    await sdk.initialize();
    try {
      await sdk.endSession({ id: sessionId });
    } catch (e) {
      expect(e).toEqual(new SdkError(SdkErrorTypes.session, 'Unable to end session: session not connected.'));
    }
    await sdk.disconnect();
  });
});

describe('handlePropose', () => {
  test('should handles double pending sessions', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();

    jest.spyOn(sdk, 'acceptPendingSession').mockImplementation();
    const pendingSession = new Promise(resolve => {
      sdk.on('pendingSession', resolve);
    });

    sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
      sessionId: '1077',
      autoAnswer: true,
      conversationId: 'deadbeef-guid',
      fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
    });

    sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
      sessionId: '1078',
      autoAnswer: true,
      conversationId: 'deadbeef-guid',
      fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
    });

    const sessionInfo: any = await pendingSession;
    expect(sessionInfo.id).toBe('1077');
    expect(sessionInfo.conversationId).toBe('deadbeef-guid');
    expect(sessionInfo.address).toBe('+15558675309');
    expect(sessionInfo.autoAnswer).toBe(true);
    expect(sdk.acceptPendingSession).toHaveBeenCalledTimes(1);
    expect(sdk.acceptPendingSession).toHaveBeenCalledWith('1077');
    await sdk.disconnect();
  });

  test('should allow double pending sessions after 10 seconds', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();
    jest.spyOn(sdk, 'acceptPendingSession').mockImplementation();
    const pendingSession = new Promise(resolve => {
      const done = function () {
        sdk.off('pendingSession', done);
        resolve(...arguments);
      };
      sdk.on('pendingSession', done);
    });

    sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
      sessionId: '1077',
      autoAnswer: true,
      conversationId: 'deadbeef-guid',
      fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
    });

    sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
      sessionId: '1078',
      autoAnswer: true,
      conversationId: 'deadbeef-guid',
      fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
    });

    const sessionInfo: any = await pendingSession;
    expect(sessionInfo.id).toBe('1077');
    expect(sessionInfo.conversationId).toBe('deadbeef-guid');
    expect(sessionInfo.address).toBe('+15558675309');
    expect(sessionInfo.autoAnswer).toBe(true);
    expect(sdk.acceptPendingSession).toHaveBeenCalledTimes(1);
    expect(sdk.acceptPendingSession).toHaveBeenCalledWith('1077');

    await timeout(1100);

    const pendingSession2 = new Promise(resolve => {
      const done = function () {
        sdk.off('pendingSession', done);
        resolve(...arguments);
      };
      sdk.on('pendingSession', done);
    });

    sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
      sessionId: '1078',
      autoAnswer: true,
      conversationId: 'deadbeef-guid',
      fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
    });

    const sessionInfo2: any = await pendingSession2;
    expect(sessionInfo2.id).toBe('1078');
    expect(sessionInfo2.conversationId).toBe('deadbeef-guid');
    expect(sessionInfo2.address).toBe('+15558675309');
    expect(sessionInfo2.autoAnswer).toBe(true);
    expect(sdk.acceptPendingSession).toHaveBeenCalledTimes(2);
    await sdk.disconnect();
  });
});

describe('onSessionInit', () => {

});
