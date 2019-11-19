describe('endSession', () => {
  test('requests the conversation then patches the correct participant to be disconnected', async () => {
    const sessionId = random();
    const conversationId = random();

    // create a conversation with a second participant with the same user id
    const participantId = PARTICIPANT_ID_2;
    const conversation = getMockConversation();
    conversation.participants[0].state = 'terminated';
    const participant = JSON.parse(JSON.stringify(conversation.participants[0]));
    participant.state = 'connected';
    participant.id = participantId;
    conversation.participants.push(participant);
    const { sdk, getConversation, patchConversation } = mockApis({ conversationId, participantId, conversation });
    await sdk.initialize();

    const mockSession = { id: sessionId, conversationId, end: jest.fn() };
    sdk._sessionManager.sessions = {};
    sdk._sessionManager.sessions[sessionId] = mockSession;

    await sdk.endSession({ conversationId });
    getConversation.done();
    patchConversation.done();
    expect(mockSession.end).not.toHaveBeenCalled();
    await sdk.disconnect();
  });

  test('requests the conversation then patches the correct participant to be disconnected regardless of participant order', async () => {
    const sessionId = random();
    const conversationId = random();

    // create a conversation with a second participant with the same user id
    const participantId = PARTICIPANT_ID;
    const conversation = getMockConversation();
    conversation.participants[0].state = 'connected';
    const participant = JSON.parse(JSON.stringify(conversation.participants[0]));
    participant.state = 'terminated';
    participant.id = PARTICIPANT_ID;
    conversation.participants.push(participant);
    const { sdk, getConversation, patchConversation } = mockApis({ conversationId, participantId, conversation });
    await sdk.initialize();

    const mockSession = { id: sessionId, conversationId, end: jest.fn() };
    sdk._sessionManager.sessions = {};
    sdk._sessionManager.sessions[sessionId] = mockSession;

    await sdk.endSession({ conversationId });
    getConversation.done();
    patchConversation.done();
    expect(mockSession.end).not.toHaveBeenCalled();
    await sdk.disconnect();
  });

  test('ends the session and rejects if there is an error fetching the conversation', async () => {
    const sessionId = random();
    const conversationId = random();
    const participantId = random();
    const { sdk } = mockApis({ conversationId, participantId });
    await sdk.initialize();

    const mockSession = { id: sessionId, conversationId, end: jest.fn() };
    sdk.sessionManager.jingle.sessions = {};
    sdk.sessionManager.jingle.sessions[sessionId] = mockSession;

    try {
      await sdk.endSession({ id: sessionId });
      fail();
    } catch (e) {
      expect(mockSession.end).toHaveBeenCalled();
      expect(e.type).toBe(SdkErrorTypes.http);
    }
    await sdk.disconnect();
  });

  test('ends the session directly if patching the conversation fails', async () => {
    const sessionId = random();
    const conversationId = random();
    const participantId = PARTICIPANT_ID;
    const { sdk, getConversation, patchConversation } = mockApis({ conversationId, participantId, failConversationPatch: true });
    await sdk.initialize();

    const mockSession = { id: sessionId, conversationId, end: jest.fn() };
    sdk.sessionManager.jingle.sessions = {};
    sdk.sessionManager.jingle.sessions[sessionId] = mockSession;

    try {
      await sdk.endSession({ id: sessionId });
      fail();
    } catch (e) {
      getConversation.done();
      patchConversation.done();
      expect(mockSession.end).toHaveBeenCalled();
      expect(e.type).toBe(SdkErrorTypes.http);
    }
    await sdk.disconnect();
  });
});

describe('handlePropose', () => {
  test('emits a pendingSession event and accepts the session', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();

    jest.spyOn(sdk, 'acceptPendingSession');
    const pendingSession = new Promise(resolve => {
      sdk.on('pendingSession', resolve);
    });

    sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
      sessionId: '1077',
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

  test('emits a pendingSession event and does not accept the session if disableAutoAnwer is true', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();
    sdk._config.disableAutoAnswer = true;

    jest.spyOn(sdk, 'acceptPendingSession');
    const pendingSession = new Promise(resolve => {
      sdk.on('pendingSession', resolve);
    });

    sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
      sessionId: '1077',
      autoAnswer: true,
      conversationId: 'deadbeef-guid',
      fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
    });

    const sessionInfo: any = await pendingSession;
    expect(sessionInfo.id).toBe('1077');
    expect(sessionInfo.conversationId).toBe('deadbeef-guid');
    expect(sessionInfo.address).toBe('+15558675309');
    expect(sessionInfo.autoAnswer).toBe(true);
    expect(sdk.acceptPendingSession).toHaveBeenCalledTimes(0);
    await sdk.disconnect();
  });

  test('emits a pendingSession event but does not accept the session if autoAnswer is false', async () => {
    const { sdk } = mockApis();
    await sdk.initialize();

    jest.spyOn(sdk, 'acceptPendingSession');
    const pendingSession = new Promise(resolve => {
      sdk.on('pendingSession', resolve);
    });

    sdk._streamingConnection._webrtcSessions.emit('requestIncomingRtcSession', {
      sessionId: '1077',
      autoAnswer: false,
      conversationId: 'deadbeef-guid',
      fromJid: '+15558675309@gjoll.mypurecloud.com/instance-id'
    });

    const sessionInfo: any = await pendingSession;
    expect(sessionInfo.id).toBe('1077');
    expect(sessionInfo.conversationId).toBe('deadbeef-guid');
    expect(sessionInfo.address).toBe('+15558675309');
    expect(sessionInfo.autoAnswer).toBe(false);
    expect(sdk.acceptPendingSession).not.toHaveBeenCalled();
    await sdk.disconnect();
  });
});

describe('handleSessionInit', () => {
  it('should call super\'s fn', () => {

  });

  it('should auto connect session based on the config', () => {

  });
});

describe('acceptSession', () => {
  it('should use provided media', async () => {

  });

  it('should use provided audio element', async () => {

  });

  it('should use config\'s default media if not provided in params', async () => {

  });

  it('should use config\'s default audio element if not provided in params', async () => {

  });

  it('should create new media if not provided and no default in the config', async () => {

  });
});
