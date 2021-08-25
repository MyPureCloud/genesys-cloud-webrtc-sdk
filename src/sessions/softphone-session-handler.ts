import { pick } from 'lodash';
import { JingleReason } from 'stanza/protocol';

import BaseSessionHandler from './base-session-handler';
import { IPendingSession, IAcceptSessionRequest, ISessionMuteRequest, IConversationParticipant, IExtendedMediaSession, IUpdateOutgoingMedia, IStartSoftphoneSessionParams } from '../types/interfaces';
import { SessionTypes, SdkErrorTypes, JingleReasons, CommunicationStates } from '../types/enums';
import { attachAudioMedia, logDeviceChange, createUniqueAudioMediaElement } from '../media/media-utils';
import { requestApi, isSoftphoneJid, createAndEmitSdkError } from '../utils';
import { ConversationUpdate, IConversationParticipantFromEvent, IParticipantCall } from '../types/conversation-update';

export default class SoftphoneSessionHandler extends BaseSessionHandler {
  sessionType = SessionTypes.softphone;

  persistentConnectionSession?: IExtendedMediaSession;
  lastConversationEvent: { [conversationId: string]: ConversationUpdate } = {};

  constructor (sdk, handler) {
    super(sdk, handler);
    (window as any).s = this;
  }

  shouldHandleSessionByJid (jid: string): boolean {
    return isSoftphoneJid(jid);
  }

  hasActivePersistentConnect (): boolean {
    return this.persistentConnectionSession?.state === 'active';
  }

  async handlePropose (pendingSession: IPendingSession): Promise<void> {
    await super.handlePropose(pendingSession);

    if (pendingSession.autoAnswer && !this.sdk._config.disableAutoAnswer) {
      await this.proceedWithSession(pendingSession);
    }
  }

  handleConversationUpdate (session: IExtendedMediaSession, update: ConversationUpdate) {
    /* this just logs the event */
    super.handleConversationUpdate(session, update);

    if (!this.hasActivePersistentConnect()) {
      return this.log('debug', 'conversation event received but there is no persistent connection. ignoring', update, true);
    }

    const lastConversationUpdate = this.lastConversationEvent[update.id];
    this.lastConversationEvent[update.id] = update;

    const participant = this.getUserParticipant(update);

    if (!participant) {
      return this.log('debug', 'user participant not found on the conversation update', update, true);
    }

    const callState = this.getParticipantsCall(participant);

    if (!callState) {
      return this.log('debug', "user participant's call state not found on the conversation update", update, true);
    }

    const lastParticipantEvent = this.getUserParticipant(lastConversationUpdate);
    const previousCallState = this.getParticipantsCall(lastParticipantEvent);
    const stateChangedFromPreviousState = previousCallState?.state !== callState.state;

    if (lastParticipantEvent) {
      session.pcParticipant = lastParticipantEvent as any;
    }

    /* if the call state hasn't changed, we don't need to process anything */
    if (!stateChangedFromPreviousState) {
      return this.log('debug', 'call state has not changed since last conversation update. not processing', { previousCallState, callState, conversationUpdate: update });
    }

    /* if we are in any state other than `alerting`, make sure our session's convoId is in sync */
    if (session.conversationId !== update.id) {
      // TODO: I think we only should set this if we are `connected` _or_ if there isn't already a `connected` conversation on the session
      this.log('info', 'updating conversationId on the session for a persistentConnection based on conversation event received', {
        sessionId: session.id,
        oldConversationId: session.conversationId,
        newConversationId: update.id
      });
      session.conversationId = update.id;
    }

    // test the connection state and emit events if necessary
    switch (callState.state) {
      /* alerting means "pending" or "ringing" */
      case 'alerting': {
        const pendingSession: IPendingSession = {
          id: session.id,
          sessionId: session.id,
          autoAnswer: false, // always `false` because we are pending // TODO: make sure we don't get `alerting` for inbound auto-answer calls
          address: session.peerID, // session.fromJid,
          conversationId: session.conversationId,
          persistentConversationId: session.persistentConversationId,
          sessionType: this.sessionType,
          originalRoomJid: session.originalRoomJid,
          fromUserId: session.fromUserId
        };
        this.sdk.emit('pendingSession', pendingSession);
        break;
      }
      case 'contacting': {
        /* if it was alerting, that means we have now answered it */
        if (previousCallState?.state !== 'alerting') {
          this.log('debug', 'conversation event was is in "contacting" state and has not previously emitted. emitting as pendingSession', update, true);
          /* if we weren't alerting, that means we are getting a pendingSession with autoanswer */
          const pendingSession: IPendingSession = {
            id: session.id,
            sessionId: session.id,
            autoAnswer: true, // always `true` because we skipped the `alerting` state
            address: session.peerID, // session.fromJid,
            conversationId: session.conversationId,
            persistentConversationId: session.persistentConversationId,
            sessionType: this.sessionType,
            originalRoomJid: session.originalRoomJid,
            fromUserId: session.fromUserId
          };
          this.sdk.emit('pendingSession', pendingSession);
        } else {
          this.log('debug', 'conversation event was already emitted from `alerting` event. not re-emitting as pendingSession', update, true);
        }
        break;
      }
      case 'connected': {
        this.sdk.emit('sessionStarted', this.persistentConnectionSession);
        break;
      }
      case 'disconnected':
      case 'terminated': {
        this.sdk.emit('sessionEnded', this.persistentConnectionSession, { condition: JingleReasons.success });
        break;
      }
      default: {
        this.log('info', 'unknown conversation event received for persistent connection conversation', {
          eventConversationId: update.id,
          sessionId: session.id,
          sessionType: this.sessionType,
          userId: this.sdk._personDetails.id,
          persistentConversationId: this.persistentConnectionSession.persistentConversationId
        });
      }

    }
  }

  private getUserParticipant (update: ConversationUpdate, state?: CommunicationStates): IConversationParticipantFromEvent | undefined {
    if (!update) {
      return;
    }

    const participantsForUser = update.participants.filter(p => p.userId === this.sdk._personDetails.id);
    let participant: IConversationParticipantFromEvent;

    if (!participantsForUser.length) {
      this.log('warn', 'user not found on conversations as a participant', { conversationId: update.id });
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

  private getParticipantsCall (participant: IConversationParticipantFromEvent): IParticipantCall | undefined {
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

    const nonEndedCalls = calls.filter(c => c.state !== 'disconnected' && c.state !== 'terminated');

    /* if we only have one non-ended call, use it */
    if (nonEndedCalls.length === 1) {
      return nonEndedCalls[0];
    }

    /* else, grab the last one (which should be the most recent) */
    return calls[callLen - 1];
  }

  private setPersistentConnection (session: IExtendedMediaSession): void {
    // TODO: remove me
    (window as any).pc = session;

    const loggy = () => ({
      persistentConnectionSessionId: session.id,
      persistentConnectionConversationId: session.persistentConversationId,
      currentConversationId: session.conversationId
    })
    this.log('info', 'setting persistent connection session', loggy());

    this.persistentConnectionSession = session;
    session.on('terminated', () => {
      this.log('info', 'Persistent connection has terminated', loggy());
      this.persistentConnectionSession = null;
    });
  }

  async handleSessionInit (session: IExtendedMediaSession): Promise<void> {
    await super.handleSessionInit(session);

    /* if we started a persistent connection */
    // TODO: need to know what happens if we have an active PC and a new session is started
    if (session.isPersistentConnection) {
      this.setPersistentConnection(session);
    }

    if (this.sdk._config.autoConnectSessions) {
      return this.acceptSession(session, { conversationId: session.conversationId });
    }
  }

  async acceptSession (session: IExtendedMediaSession, params: IAcceptSessionRequest): Promise<any> {
    if (this.hasActivePersistentConnect()) {
      const participant = await this.getParticipantForSession(session);
      this.log('debug', '`acceptSession` called with an active persistent connection. accepting via HTTP request', { session });

      const patchPromise = requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}/participants/${participant.id}`, {
        method: 'patch',
        data: JSON.stringify({ state: 'connected' })
      });

      return patchPromise;
    }

    let stream = params.mediaStream || this.sdk._config.defaults.audioStream;
    if (!stream) {
      this.log('info', 'No mediaStream provided, starting media', { conversationId: session.conversationId, sessionId: session.id });
      stream = await this.sdk.media.startMedia({
        audio: this.sdk.media.getValidSdkMediaRequestDeviceId(params.audioDeviceId),
        session
      });
      this.log('debug', 'Media started', { conversationId: session.conversationId });
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
          this.log('debug', 'session ended and was using a unique audio element. removing from DOM', { sessionId: session.id, conversationId: session.conversationId });
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

    await super.acceptSession(session, params);
    logDeviceChange(this.sdk, session, 'sessionStarted');
  }

  async proceedWithSession (session: IPendingSession) {
    if (this.persistentConnectionSession?.active) {
      this.log('info', 'proceeding with proposed session via persistent connection', {
        conversationId: session.conversationId,
        sessionId: session.id,
        persistentConversationId: this.persistentConnectionSession.persistentConversationId
      });



    } else {
      return super.proceedWithSession(session);
    }
  }

  async endSession (session: IExtendedMediaSession): Promise<void> {
    try {
      const participant = await this.getParticipantForSession(session);

      const patchPromise = requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}/participants/${participant.id}`, {
        method: 'patch',
        data: JSON.stringify({ state: 'disconnected' })
      });

      const terminatedPromise = new Promise<JingleReason>((resolve) => {
        const listener = (endedSession: IExtendedMediaSession, reason: JingleReason) => {
          // TODO: make sure the PC is actually ended
          if (endedSession.id === session.id && endedSession.conversationId === session.conversationId) {
            this.log('debug', 'received "sessionEnded" event from session requested by `sdk.endSession()`', {
              endedSession,
              session
            }, true);
            this.sdk.off('sessionEnded', listener);
            return resolve(reason);
          } else {
            this.log('debug', 'received "sessionEnded" event from session that was not requested by `sdk.endSession()`', {
              endedSession,
              session
            }, true);
          }
        }

        this.sdk.on('sessionEnded', listener);
        // session.once('terminated', (reason) => {
        //   return resolve(reason);
        // });
      });

      await Promise.all([patchPromise, terminatedPromise]);
    } catch (err) {
      this.log('error', 'Failed to end session gracefully', { conversationId: session.conversationId, error: err });
      return this.endSessionFallback(session);
    }
  }

  async endSessionFallback (session: IExtendedMediaSession): Promise<void> {
    this.log('info', 'Attempting to end session directly', { sessionId: session.id, conversationId: session.conversationId });
    try {
      await super.endSession(session);
    } catch (err) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Failed to end session directly', { conversationId: session.conversationId, error: err });
    }
  }

  async getParticipantForSession (session: IExtendedMediaSession): Promise<IConversationParticipant> {
    if (!session.pcParticipant) {
      const { body } = await requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}`);
      const participants: IConversationParticipant[] = body.participants.map((p: any) => {
        const participant: IConversationParticipant = pick(p, ['id', 'address', 'purpose', 'state', 'direction', 'muted', 'confined']);
        participant.userId = p.user && p.user.id;
        return participant;
      });

      // it's possible for a userId to be associated with multiple participants
      let participantsForUser = participants.filter((p) => p.userId === this.sdk._personDetails.id);
      let participant: IConversationParticipant;

      if (participantsForUser.length === 1) {
        participant = participantsForUser[0];
      } else if (participantsForUser.length > 1) {
        participantsForUser = participantsForUser.filter(p => p.state === 'connected');

        // this shouldn't ever happen, but just in case
        if (participantsForUser.length !== 1) {
          throw createAndEmitSdkError.call(
            this.sdk,
            SdkErrorTypes.generic,
            'Failed to find a connected participant for user on conversation',
            {
              conversationId: session.conversationId,
              sessionId: session.id,
              sessionType: this.sessionType,
              userId: this.sdk._personDetails.id
            });
        }

        participant = participantsForUser[0];
      }

      if (!participant) {
        throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to find a participant for session', { conversationId: session.conversationId, sessionId: session.id, sessionType: this.sessionType });
      }

      session.pcParticipant = participant;
    }

    return session.pcParticipant;
  }

  async setAudioMute (session: IExtendedMediaSession, params: ISessionMuteRequest) {
    try {
      this.log('info', 'Muting audio', { conversationId: session.conversationId });
      const participant = await this.getParticipantForSession(session);

      await requestApi.call(this.sdk, `/conversations/calls/${session.conversationId}/participants/${participant.id}`, {
        method: 'patch',
        data: JSON.stringify({ muted: params.mute })
      });
    } catch (err) {
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.generic, 'Failed to set audioMute', { conversationId: session.conversationId, params, err });
    }
  }

  // since softphone sessions will *never* have video, we set the videoDeviceId to undefined so we don't spin up the camera
  async updateOutgoingMedia (session: IExtendedMediaSession, options: IUpdateOutgoingMedia): Promise<any> {
    const newOptions: IUpdateOutgoingMedia = { ...options, videoDeviceId: undefined };
    return super.updateOutgoingMedia(session, newOptions);
  }

  async startSession (params: IStartSoftphoneSessionParams): Promise<{ id: string, selfUri: string }> {
    this.log('info', 'Creating softphone call from SDK', { conversationIds: params.conversationIds });
    let response = await requestApi.call(this.sdk, `/conversations/calls`, {
      method: 'post',
      data: JSON.stringify(params)
    });
    return { id: response.body.id, selfUri: response.body.selfUri };
  }
}
