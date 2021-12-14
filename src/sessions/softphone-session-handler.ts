import { pick, debounce, DebouncedFunc } from 'lodash';
import { JingleReason } from 'stanza/protocol';
import { Constants } from 'stanza';

import BaseSessionHandler from './base-session-handler';
import {
  IPendingSession,
  IAcceptSessionRequest,
  ISessionMuteRequest,
  IConversationParticipant,
  IExtendedMediaSession,
  IUpdateOutgoingMedia,
  IStartSoftphoneSessionParams,
  IConversationParticipantFromEvent,
  ICallStateFromParticipant,
  IStoredConversationState,
  ISdkConversationUpdateEvent,
  IConversationHeldRequest
} from '../types/interfaces';
import { SessionTypes, SdkErrorTypes, JingleReasons, CommunicationStates } from '../types/enums';
import { attachAudioMedia, logDeviceChange, createUniqueAudioMediaElement } from '../media/media-utils';
import { requestApi, isSoftphoneJid, createAndEmitSdkError } from '../utils';
import { ConversationUpdate } from '../conversations/conversation-update';
import { GenesysCloudWebrtcSdk } from '..';
import { SessionManager } from './session-manager';

type SdkConversationEvents = 'added' | 'removed' | 'updated';

export default class SoftphoneSessionHandler extends BaseSessionHandler {
  sessionType = SessionTypes.softphone;
  /* Could be active persistent connection or non concurrent session */
  activeSession?: IExtendedMediaSession;
  conversations: { [convesationId: string]: IStoredConversationState } = {};
  lastEmittedSdkConversationEvent: ISdkConversationUpdateEvent = {
    activeConversationId: undefined,
    current: [],
    added: [],
    removed: []
  };

  debouncedEmitCallError: DebouncedFunc<(update: ConversationUpdate, participant: IConversationParticipantFromEvent, callState: ICallStateFromParticipant) => void>;

  constructor (sdk: GenesysCloudWebrtcSdk, sessionManager: SessionManager) {
    super(sdk, sessionManager);
    this.debouncedEmitCallError = debounce(this.emitCallError, 500, { leading: true });
  }

  shouldHandleSessionByJid (jid: string): boolean {
    return isSoftphoneJid(jid);
  }

  handleConversationUpdate (update: ConversationUpdate, sessions: IExtendedMediaSession[]) {
    /* we will not have a user call participant if this is not a softphone conversation event */
    const participant = this.getUserParticipantFromConversationEvent(update);
    if (!participant) {
      return this.log('debug', 'user participant not found on the conversation update', update, { skipServer: true });
    }

    const callState = this.getCallStateFromParticipant(participant);
    if (!callState) {
      return this.log('debug', "user participant's call state not found on the conversation update. not processing", { update, participant }, { skipServer: true });
    }

    /* if we get here it means it was a softphone conversation event */
    const lastConversationUpdate = this.conversations[update.id];
    let session: IExtendedMediaSession;

    /* use our stored session for this conversation */
    if (lastConversationUpdate?.session) {
      session = lastConversationUpdate.session;
    }
    /* or, if LineAppearance is 1, use that session */
    else if (!this.sdk.isConcurrentSoftphoneSessionsEnabled()) {
      session = this.activeSession;
    }
    /* lastly, look through our sessions */
    else {
      session = sessions.find(s => s.conversationId === update.id);
    }

    /* if we didn't find a session AND we have persistent connection, we need to do an extra check */
    if (!session && this.sdk.isPersistentConnectionEnabled()) {
      /*
        if we have an active session
        AND it is not currently being used by another conversation
        AND our client handled it.
        this can happen when LA > 1 and persistentConnection is ON
      */
      if (
        this.hasActiveSession() &&
        !Object.values(this.conversations)
          .find(c => c.session === this.activeSession)
      ) {
        session = this.activeSession;
        this.log('info', 'we have an active session that is not in use by another conversation. using that session', {
          conversationId: update.id,
          sessionId: session.id,
          conversationIdCurrentlyOnSession: session.conversationId
        });
      }
    }

    this.handleSoftphoneConversationUpdate(update, participant, callState, session);
  }

  hasActiveSession (): boolean {
    return this.activeSession?.state === 'active';
  }

  async handlePropose (pendingSession: IPendingSession): Promise<void> {
    await super.handlePropose(pendingSession);

    if (pendingSession.autoAnswer && !this.sdk._config.disableAutoAnswer) {
      await this.proceedWithSession(pendingSession);
    }
  }

  handleSoftphoneConversationUpdate (
    update: ConversationUpdate,
    participant: IConversationParticipantFromEvent,
    callState: ICallStateFromParticipant,
    session?: IExtendedMediaSession
  ) {
    const conversationId = update.id;
    const lastConversationUpdate = this.conversations[conversationId];

    if (session) {
      session.pcParticipant = participant as any;
    }

    this.log('debug', 'about to process conversation event', { session, update, lastConversationUpdate, callState });

    /* if we didn't have a previous update and this one is NOT in a pending state, that means we are not responsible for this conversation (another client handled it or we have already emitted the `sessionEnded` for it) */
    if (!lastConversationUpdate && !this.isPendingState(callState)) {
      return this.log('debug', 'received a conversation event for a conversation we are not responsible for. not processing', { update, callState }, { skipServer: true });
    }

    this.checkForCallErrors(update, participant, callState);

// TODO: we aren't getting 'handledPendingSession' if: we are on a call, then place an outbound call. That outbound does not emit 'handledPendingSession'

    /* update the conversation state */
    const conversationState: IStoredConversationState = {
      mostRecentCallState: callState,
      mostRecentUserParticipant: participant,
      conversationUpdate: update,
      conversationId: conversationId,
      /* this is just a precaution – session for the conversation should be added in `this.acceptSession()` */
      /* this is possible if we have an active PC and do not have an active call (ie. we are going to 1 from 0) */
      session: this.conversations[conversationId]?.session || lastConversationUpdate?.session || session
    };

    const previousCallState = this.getUsersCallStateFromConversationEvent(lastConversationUpdate?.conversationUpdate);

    this.conversations[conversationId] = conversationState;

    /* if the state didn't change at all, we can skip processing */
    if (!this.diffConversationCallStates(previousCallState, callState)) {
      return this.log('debug', 'conversation update received but state is unchanged. ignoring', {
        conversationId,
        previousCallState,
        callState,
        sessionType: this.sessionType
      });
    }

    const communicationStateChanged = previousCallState?.state !== callState.state;
    let eventToEmit: boolean | SdkConversationEvents = 'updated';

    /* only check for emitting if the state changes */
    if (communicationStateChanged) {
      /* `pendingSession` – only process these if we have a persistent connection */
      if (this.isPendingState(callState)) {
        /* only emit `pendingSession` if we already have an active session */
        if (session && session === this.activeSession) {
          const pendingSession: IPendingSession = {
            id: session.id,
            sessionId: session.id,
            autoAnswer: callState.direction === 'outbound', // Not always accurate. If inbound auto answer, we don't know about it from convo evt
            conversationId,
            sessionType: this.sessionType,
            originalRoomJid: session.originalRoomJid,
            fromUserId: session.fromUserId,
            fromJid: session.peerID,
            toJid: this.sdk._personDetails.chat.jabberId
          };
          this.sessionManager.pendingSessions[update.id] = pendingSession;
          this.sdk.emit('pendingSession', pendingSession);
        }
        /* we don't want to emit events for these */
        eventToEmit = false;
      } else if (this.isConnectedState(callState)) {
        /*
          if our conversationId is already on the session, that means it started using the standard `session-accept`.
          if our conversationId is not already on the session AND the previous state wasn't already connected, then
          we just accepted the session and we need to emit `sessionStarted`
        */
        if (
          conversationId !== session?.conversationId
          || (previousCallState && !this.isConnectedState(previousCallState))
        ) {
          /* if we are adding a session, but we don't have a session – it means another client took the conversation */
          if (!session) {
            this.log('info', 'incoming conversation started, but we do not have a session. assuming it was handled by a different client. ignoring', {
              ignoredConversation: this.conversations[conversationId],
              update
            });
            delete this.conversations[conversationId];
            return;
          }
          /* only emit `sessionStarted` if we have an active session */
          if (session === this.activeSession) {
            session.conversationId = conversationId;
            this.sdk.emit('sessionStarted', session);
            this.sessionManager.onHandledPendingSession(session.id, conversationId);
          }
          eventToEmit = 'added';
        }
      } else if (this.isEndedState(callState)) {
        /* we don't want to emit events for (most of) these */
        eventToEmit = false;
        /* we rejected a pendingSession */
        if (this.isPendingState(previousCallState)) {
          if (session && session === this.activeSession) {
            this.sessionManager.onCancelPendingSession(session.id, conversationId);
          }
          delete this.conversations[conversationId];
        } else if (previousCallState) {
          /*
            if there is a previous state, that means we are ending this call – otherwise it means we have
            already ended it (we get `disconnected` and `terminated` events back-to-back for ending calls. We only want to process one of them.)
          */
          if (session && session === this.activeSession) {
            session.conversationId = conversationId;
            this.sdk.emit('sessionEnded', session, { condition: JingleReasons.success });
          }
          eventToEmit = 'removed';
        }
      }
    }

    if (eventToEmit) {
      this.log('debug', 'about to emit based on conversation event', { eventToEmit, update: this.conversations[conversationId], previousCallState, callState, session }, { skipServer: true });
      this.emitConversationEvent(eventToEmit, this.conversations[conversationId], session);
    }
  }

  diffConversationCallStates (call1: ICallStateFromParticipant, call2: ICallStateFromParticipant): boolean {
    return !call1
      || !call2
      || call1.state !== call2.state
      || call1.confined !== call2.confined
      || call1.held !== call2.held
      || call1.muted !== call2.muted;
  }

  checkForCallErrors (
    update: ConversationUpdate,
    participant: IConversationParticipantFromEvent,
    callState: ICallStateFromParticipant
  ) {
    if (callState.errorInfo) {
      this.debouncedEmitCallError(update, participant, callState);
    }
  }

  private emitCallError (
    update: ConversationUpdate,
    participant: IConversationParticipantFromEvent,
    callState: ICallStateFromParticipant
  ) {
    createAndEmitSdkError.call(
      this.sdk,
      SdkErrorTypes.call,
      'Call error has occurred',
      { errorInfo: callState.errorInfo, conversationId: update.id }
    );
  }

  emitConversationEvent (event: SdkConversationEvents, conversation: IStoredConversationState, session: IExtendedMediaSession): void {
    const current = Object.values(this.conversations);
    const currentEmittedEvent: ISdkConversationUpdateEvent = {
      added: [],
      removed: [],
      current,
      activeConversationId: ''
    };


    if (event === 'added') {
      currentEmittedEvent.added.push(conversation);
    } else if (event === 'removed') {
      currentEmittedEvent.removed.push(conversation);
      delete this.conversations[conversation.conversationId];
    }

    currentEmittedEvent.activeConversationId = this.determineActiveConversationId(session);

    this.log('debug', 'emitting `conversationUpdate`', { event, previousEmittedEvent: this.lastEmittedSdkConversationEvent, currentEmittedEvent, session }, { skipServer: true });
    this.lastEmittedSdkConversationEvent = currentEmittedEvent;

    this.sdk.emit('conversationUpdate', currentEmittedEvent);
  }

  determineActiveConversationId (session?: IExtendedMediaSession): string {
    const conversations = Object.values(this.conversations);
    if (conversations.length === 0) {
      return this.activeSession?.conversationId || session?.conversationId || '';
    } else if (conversations.length === 1) {
      return conversations[0].conversationId;
    }

    /* find the active call */
    const connectedConversations = conversations.filter(c => this.isConnectedState(c.mostRecentCallState));

    /* if there is only one connected call, use it */
    if (connectedConversations.length === 1) {
      return connectedConversations[0].conversationId;
    } else if (connectedConversations.length > 1) {
      /* if there are multiple, find the one that isn't held */
      const nonHeldConversations = connectedConversations.find(c => c.mostRecentCallState.held === false);
      if (nonHeldConversations) {
        return nonHeldConversations.conversationId;
      }
    }

    /* else, just keep the current id on the session */
    return session?.conversationId || ''; // this gets wonky if there are multiple calls all on hold...
  }

  getUsersCallStateFromConversationEvent (update: ConversationUpdate, state?: CommunicationStates): ICallStateFromParticipant | undefined {
    state = state || CommunicationStates.connected;
    return this.getCallStateFromParticipant(
      this.getUserParticipantFromConversationEvent(update, state)
    );
  }

  getUserParticipantFromConversationEvent (update: ConversationUpdate, state?: CommunicationStates): IConversationParticipantFromEvent | undefined {
    if (!update) {
      return;
    }

    const participantsForUser = update.participants.filter(p => p.userId === this.sdk._personDetails.id);
    let participant: IConversationParticipantFromEvent;

    if (!participantsForUser.length) {
      this.log('warn', 'user not found on conversation as a participant', { conversationId: update.id });
      return;
    }

    /* one participant */
    if (participantsForUser.length === 1) {
      participant = participantsForUser[0];
    }

    /* find user participant with desired call state */
    if (!participant && state) {
      participant = participantsForUser.filter(p => p.calls.find(c => c.state === state))[0];
    }

    /* find user participant with a call */
    if (!participant) {
      participant = participantsForUser.find(p => p.calls.length)
    }

    /* find the most recent user participant */
    if (!participant) {
      participant = participantsForUser[0];
    }

    return participant;
  }

  getCallStateFromParticipant (participant: IConversationParticipantFromEvent): ICallStateFromParticipant | undefined {
    const calls = participant?.calls;
    const callLen = calls?.length;

    if (!callLen) {
      this.log('debug', 'no call found on participant', { userId: participant?.userId, participantId: participant?.id });
      return;
    }

    /* if we only have one, use it */
    if (callLen === 1) {
      return calls[0];
    }

    const nonEndedCalls = calls.filter(c => !this.isEndedState(c));

    /* if we only have one non-ended call, use it */
    if (nonEndedCalls.length === 1) {
      return nonEndedCalls[0];
    }

    /* else, grab the last one (which should be the most recent) */
    return calls[callLen - 1];
  }

  private setCurrentSession (session: IExtendedMediaSession): void {
    const loggy = () => ({
      persistentConnectionSessionId: session.id,
      currentConversationId: session.conversationId,
      isConcurrentSoftphoneSessionsEnabled: this.sdk.isConcurrentSoftphoneSessionsEnabled(),
      isPersistentConnectionEnabled: this.sdk.isPersistentConnectionEnabled(),
      otherActiveSession: this.sdk.sessionManager.getAllActiveSessions()
        .map(s => ({ sessionId: s.id, conversationId: s.conversationId }))
    });
    this.log('info', 'setting current session', loggy());

    this.activeSession = session;
    session.once('terminated', () => {
      this.log('info', 'current session has terminated', loggy());
      const otherActiveSessions = this.sdk.sessionManager.getAllActiveSessions();
      if (this.sdk.isPersistentConnectionEnabled() && !!otherActiveSessions.length) {
        this.log('debug', 'active session ended. Using next available session as persistent connection', {
          terminatedSession: { sessionId: session.id, conversationId: session.conversationId },
          selectedSession: { sessionId: otherActiveSessions[0].id, conversationId: otherActiveSessions[0].conversationId }
        });
        this.setCurrentSession(otherActiveSessions[0]);
      } else {
        this.activeSession = null;
      }
    });
  }

  async handleSessionInit (session: IExtendedMediaSession): Promise<void> {
    await super.handleSessionInit(session);

    if (this.sdk._config.autoConnectSessions) {
      return this.acceptSession(session, { conversationId: session.conversationId });
    }
  }

  async acceptSession (session: IExtendedMediaSession, params: IAcceptSessionRequest): Promise<any> {
    const lineAppearance1 = !this.sdk.isConcurrentSoftphoneSessionsEnabled();
    /* if we have an active non-concurrent session, we can drop this accept on the floor */
    if (lineAppearance1 && this.hasActiveSession() && session.id === this.activeSession.id) {
      return this.log('debug',
        '`acceptSession` called with an active session and LineAppearance of 1. no further action needed. session will automatically accept', {
        conversationId: session.conversationId,
        sessionId: session.id
      });
    }
    /* If we are don't already have a session stored, store this one */
    else if (
      (this.sdk.isPersistentConnectionEnabled() || lineAppearance1) &&
      !this.hasActiveSession()
    ) {
      this.setCurrentSession(session);
    }

    let stream = params.mediaStream || this.sdk._config.defaults.audioStream;
    if (!stream) {
      this.log('info', 'No mediaStream provided, starting media', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
      stream = await this.sdk.media.startMedia({
        audio: this.sdk.media.getValidSdkMediaRequestDeviceId(params.audioDeviceId),
        session
      });
      this.log('info', 'Media started', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType });
    }
    await this.addMediaToSession(session, stream);
    session._outboundStream = stream;

    const ids = { conversationId: session.conversationId, sessionId: session.id };
    const volume = this.sdk._config.defaults.audioVolume;

    let element = params.audioElement || this.sdk._config.defaults.audioElement;

    /* if we aren't given an element, then we need to setup our own, unique one (per session), then tear it down on terminate */
    if (!element) {
      element = createUniqueAudioMediaElement();
      session.once('terminated', () => {
        if (session._outputAudioElement === element) {
          this.log('debug', 'session ended and was using a unique audio element. removing from DOM', { sessionId: session.id, conversationId: session.conversationId, sessionType: session.sessionType });
          session._outputAudioElement.parentNode.removeChild(session._outputAudioElement);
        }
      });
    }

    if (session.streams.length === 1 && session.streams[0].getTracks().length > 0) {
      session._outputAudioElement = attachAudioMedia(this.sdk, session.streams[0], volume, element, ids);
    } else {
      session.on('peerTrackAdded', (_track: MediaStreamTrack, stream: MediaStream) => {
        session._outputAudioElement = attachAudioMedia(this.sdk, stream, volume, element, ids);
      });
    }

    /* make sure we store the session with the conversation state: this is used for LA > 1 _and_ for initial (ie. 1st) sessions */
    if (!this.conversations[session.conversationId]) {
      this.conversations[session.conversationId] = { session } as any;
    } else {
      this.conversations[session.conversationId].session = session;
    }

    await super.acceptSession(session, params);
    logDeviceChange(this.sdk, session, 'sessionStarted');
  }

  async proceedWithSession (pendingSession: IPendingSession) {
    if (!this.hasActiveSession() || pendingSession.id !== this.activeSession.id) {
      return super.proceedWithSession(pendingSession);
    }

    this.log('info', 'proceeding with proposed session via HTTP request', {
      conversationId: pendingSession.conversationId,
      sessionId: pendingSession.id
    });

    let participant = this.getUserParticipantFromConversationEvent(
      this.conversations[pendingSession.conversationId]?.conversationUpdate
    );

    if (!participant) {
      participant = await this.fetchUserParticipantFromConversationId(pendingSession.conversationId);
    }

    // const participant = await this.getParticipantForSession(pendingSession);
    this.log('info', '`acceptSession` called with an active persistent connection. accepting via HTTP request', {
      sessionId: pendingSession.id,
      conversationId: pendingSession.conversationId
    });

    return this.patchPhoneCall(pendingSession.conversationId, participant.id, {
      state: CommunicationStates.connected
    });
  }

  async rejectPendingSession (pendingSession: IPendingSession): Promise<any> {
    if (!this.hasActiveSession()) {
      return super.rejectPendingSession(pendingSession);
    }
    this.log('info', 'rejecting pending session with an active persistent connection', {
      sessionId: pendingSession.id,
      conversationId: pendingSession.conversationId
    });

    let participant = this.getUserParticipantFromConversationEvent(
      this.conversations[pendingSession.conversationId]?.conversationUpdate
    );

    if (!participant) {
      participant = await this.fetchUserParticipantFromConversationId(pendingSession.conversationId);
    }

    return this.patchPhoneCall(pendingSession.conversationId, participant.id, {
      state: CommunicationStates.disconnected
    });
  }

  async endSession (conversationId: string, session: IExtendedMediaSession, reason?: Constants.JingleReasonCondition): Promise<void> {
    try {
      const participant = await this.getUserParticipantFromConversationId(conversationId);

      const patchPromise = this.patchPhoneCall(conversationId, participant.id, {
        state: CommunicationStates.disconnected
      });
      const terminatedPromise = new Promise<JingleReason>((resolve) => {
        const listener = (endedSession: IExtendedMediaSession, reason: JingleReason) => {
          if (endedSession.id === session.id && endedSession.conversationId === conversationId) {
            this.log('debug', 'received "sessionEnded" event from session requested by `sdk.endSession()`', {
              endedSession,
              conversationId,
              session
            }, { skipServer: true });
            this.sdk.off('sessionEnded', listener);
            return resolve(reason);
          } else {
            this.log('debug', 'received "sessionEnded" event from session that was NOT requested by `sdk.endSession()`', {
              endedSession,
              conversationId,
              session
            }, { skipServer: true });
          }
        }

        this.sdk.on('sessionEnded', listener);
      });

      await Promise.all([patchPromise, terminatedPromise]);
    } catch (error) {
      this.log('error', 'Failed to end session gracefully', { conversationId, sessionId: session.id, error });
      /* if LA > 1, just end the session */
      if (this.sdk.isConcurrentSoftphoneSessionsEnabled()) {
        return this.endSessionFallback(conversationId, session, reason);
      }
      /* LA == 1, we can only end it if our current call count is 1 (because multiple calls could be using this session) */
      const otherActiveSessions = Object.values(this.conversations)
        .filter(convo => {
          return convo.conversationId !== conversationId
            && (this.isPendingState(convo.mostRecentCallState) || this.isConnectedState(convo.mostRecentCallState));
        })
        .map(convo => ({
          conversationId: convo.conversationId,
          sessionId: convo.session?.id
        }));

      if (!otherActiveSessions.length) {
        this.log('warn', 'session has LineAppearance as 1 but no other active sessions. Will attempt to end session', {
          conversationId, sessionId: session.id, error
        });
        return this.endSessionFallback(conversationId, session, reason);
      }

      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.http,
        'Unable to end the session directly as a fallback because LineAppearance is 1 and there are other active conversations', {
        failedSession: { conversationId, sessionId: session.id },
        otherActiveSessions,
        error
      });
    }
  }

  async endSessionFallback (conversationId: string, session: IExtendedMediaSession, reason?: Constants.JingleReasonCondition): Promise<void> {
    this.log('info', 'Attempting to end session directly', { sessionId: session.id, conversationId: session.conversationId, sessionType: session.sessionType, reason });
    try {
      await super.endSession(conversationId, session, reason);
    } catch (error) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to end session directly', { conversationId: session.conversationId, sessionId: session.id, sessionType: session.sessionType, error });
    }
  }

  async fetchUserParticipantFromConversationId (conversationId: string): Promise<IConversationParticipantFromEvent> {
    const { body } = await requestApi.call(this.sdk, `/conversations/calls/${conversationId}`);

    if (body && body.participants) {
      body.participants = body.participants.map((p: any) => {
        const participant: IConversationParticipant = pick(p, ['id', 'address', 'purpose', 'state', 'direction', 'muted', 'confined']);
        participant.userId = p.user && p.user.id;
        return participant;
      });
    }

    return this.getUserParticipantFromConversationEvent(body, CommunicationStates.connected);
  }

  private async getUserParticipantFromConversationId (conversationId: string): Promise<IConversationParticipantFromEvent> {
    let userParticipant = this.conversations[conversationId]?.mostRecentUserParticipant;

    if (!userParticipant) {
      userParticipant = await this.fetchUserParticipantFromConversationId(conversationId);
    }

    if (!userParticipant) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'participant not found for converstionId', { conversationId });
    }
    return userParticipant;
  }

  async setAudioMute (session: IExtendedMediaSession, params: ISessionMuteRequest) {
    const conversationId = params.conversationId || session.conversationId;
    this.log('info', 'setting audio mute state', {
      params,
      sessionId: session.id,
      conversationId,
      sessionType: session.sessionType
    });

    try {
      const userParticipant = await this.getUserParticipantFromConversationId(conversationId);

      return await this.patchPhoneCall(conversationId, userParticipant.id, { muted: params.mute });
    } catch (error) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to set audioMute', {
        conversationId: session.conversationId,
        sessionId: session.id,
        sessionType: session.sessionType,
        params,
        error
      });
    }
  }

  async setConversationHeld (session: IExtendedMediaSession, params: IConversationHeldRequest) {
    this.log('info', 'setting conversation "held" state', {
      conversationId: session.conversationId,
      sessionId: session.id,
      sessionType: session.sessionType,
      params
    });

    try {
      const userParticipant = await this.getUserParticipantFromConversationId(params.conversationId);

      return await this.patchPhoneCall(
        params.conversationId,
        userParticipant.id,
        { held: params.held }
      );
    } catch (error) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to set held state', {
        conversationId: session.conversationId,
        sessionId: session.id,
        sessionType: session.sessionType,
        params,
        error
      });
    }
  }

  // since softphone sessions will *never* have video, we set the videoDeviceId to undefined so we don't spin up the camera
  async updateOutgoingMedia (session: IExtendedMediaSession, options: IUpdateOutgoingMedia): Promise<any> {
    const newOptions: IUpdateOutgoingMedia = { ...options, videoDeviceId: undefined };
    return super.updateOutgoingMedia(session, newOptions);
  }

  async startSession (params: IStartSoftphoneSessionParams): Promise<{ id: string, selfUri: string }> {
    this.log('info', 'Creating softphone call from SDK', { conversationIds: params.conversationIds, sessionType: this.sessionType });
    const response = await requestApi.call(this.sdk, `/conversations/calls`, {
      method: 'post',
      data: JSON.stringify(params)
    });
    return { id: response.body.id, selfUri: response.body.selfUri };
  }

  private async patchPhoneCall (
    conversationId: string,
    participantId: string,
    body: { muted: boolean } | { state: CommunicationStates } | { held: boolean }
  ): Promise<any> {
    return requestApi.call(this.sdk, `/conversations/calls/${conversationId}/participants/${participantId}`, {
      method: 'patch',
      data: JSON.stringify(body)
    });
  }

  private isPendingState (call: ICallStateFromParticipant): boolean {
    return call?.state === CommunicationStates.alerting || call?.state === CommunicationStates.contacting;
  }

  private isConnectedState (call: ICallStateFromParticipant): boolean {
    return call?.state === CommunicationStates.dialing || call?.state === CommunicationStates.connected;
  }

  private isEndedState (call: ICallStateFromParticipant): boolean {
    return call?.state === CommunicationStates.disconnected || call?.state === CommunicationStates.terminated;
  }
}
