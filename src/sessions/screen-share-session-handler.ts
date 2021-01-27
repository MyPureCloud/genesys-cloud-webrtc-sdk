import BaseSessionHandler from './base-session-handler';
import { IPendingSession, IStartSessionParams, IExtendedMediaSession, IUpdateOutgoingMedia } from '../types/interfaces';
import { SessionTypes, SdkErrorTypes } from '../types/enums';
import { checkAllTracksHaveEnded } from '../media/media-utils';
import { createAndEmitSdkError, parseJwt, isAcdJid } from '../utils';

export default class ScreenShareSessionHandler extends BaseSessionHandler {
  private _screenStreamPromise: Promise<MediaStream>;
  sessionType = SessionTypes.acdScreenShare;

  shouldHandleSessionByJid (jid: string): boolean {
    return isAcdJid(jid);
  }

  async startSession (startParams: IStartSessionParams): Promise<MediaStream> {
    const { jwt, conversation, sourceCommunicationId } = this.sdk._customerData;

    const jid = parseJwt(jwt).data.jid;
    const opts = {
      jid,
      conversationId: conversation.id,
      sourceCommunicationId: sourceCommunicationId,
      mediaPurpose: SessionTypes.acdScreenShare
    };

    this.log('info', 'starting acd screen share session', opts);

    /* if we had existing media, clean it up */
    try {
      this.endTracks(await this._screenStreamPromise);
    } catch (error) {
      /* no-op: it just means the last promise had rejected, we don't care about that error now */
    }
    this._screenStreamPromise = null;

    /* request the display now, but handle it on session-init */
    this._screenStreamPromise = this.sdk.media.startDisplayMedia();

    await this.sdk._streamingConnection.webrtcSessions.initiateRtcSession(opts);

    return this._screenStreamPromise;
  }

  async handlePropose (pendingSession: IPendingSession): Promise<void> {
    await super.handlePropose(pendingSession);
    await this.proceedWithSession(pendingSession);
  }

  onTrackEnd (session: IExtendedMediaSession) {
    this.log('debug', 'Track ended');
    if (checkAllTracksHaveEnded(session._screenShareStream)) {
      return this.endSession(session);
    }
  }

  endTracks (mediaStream?: MediaStream): void {
    mediaStream?.getTracks().forEach(t => t.stop());
  }

  async handleSessionInit (session: IExtendedMediaSession): Promise<void> {
    try {
      await super.handleSessionInit(session);

      session.on('terminated', () => {
        /* just in case our session termintated, but didn't set _screenShareStream */
        this.endTracks(session._screenShareStream);
        /* cleanup our local state */
        this._screenStreamPromise = null;
      });

      if (!this.sdk.isGuest) {
        throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'Screen share sessions not supported for authenticated users');
      }
      const sessionInfo = { sessionId: session.id, conversationId: session.conversationId };
      if (!this.sdk._config.autoConnectSessions) {
        // if autoConnectSessions is 'false' and we have a guest, throw an error
        //  guests should auto accept screen share session
        const errMsg = '`autoConnectSession` must be set to "true" for guests';
        throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, errMsg, sessionInfo);
      }

      if (!this._screenStreamPromise) {
        const errMsg = 'No pending or active screen share media promise';
        throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, errMsg, sessionInfo);
      }

      const stream = await this._screenStreamPromise;

      session._screenShareStream = stream;

      stream.getTracks().forEach((track: MediaStreamTrack) => {
        track.addEventListener('ended', this.onTrackEnd.bind(this, session));
      });

      this.log('debug', 'Adding stream to the session and setting it to _screenShareStream', sessionInfo);

      await this.addMediaToSession(session, stream);
      await this.acceptSession(session, { sessionId: session.id });
    } catch (err) {
      await super.endSession(session);

      /* attempt to clean up any streams that may have been created */
      try {
        this.endTracks(await this._screenStreamPromise);
      } catch (error) {
        /* no-op: if the promise rejected, we don't care at this point */
      }
      this._screenStreamPromise = null;
      throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.session, 'Screen share session init failed', err);
    }
  }

  public updateOutgoingMedia (session: IExtendedMediaSession, options: IUpdateOutgoingMedia): never {
    this.log('warn', 'Cannot update outgoing media for acd screen share sessions', { sessionId: session.id, sessionType: session.sessionType });
    throw createAndEmitSdkError.call(this.sdk, SdkErrorTypes.not_supported, 'Cannot update outgoing media for acd screen share sessions');
  }
}
