import GenesysCloudWebrtcSdk from "../client";
import { ConversationUpdate } from './conversation-update';
import { LogLevels } from '../types/enums';
import { IStoredConversationState, IExtendedMediaSession } from '../types/interfaces';

export class ConversationManager {
  conversations: { [convesationId: string]: IStoredConversationState } = {};

  constructor (private sdk: GenesysCloudWebrtcSdk) { }

  setConversationUpdate (update: ConversationUpdate, session?: IExtendedMediaSession) {
    let conversationInfo = this.getConversation(update.id);

    if (!conversationInfo) {
      conversationInfo =  this.conversations[update.id] = {
        conversationUpdate: update,
        conversationId: update.id,
        session,
        mostRecentCallState: undefined,
        mostRecentUserParticipant: undefined
      };
    } else {
      // this.conversations[update.id].mostRecentCallState = callState;
      // this.conversations[update.id].mostRecentUserParticipant = participant;
    }
    return conversationInfo;
  }

  getConversation (conversationId: string): IStoredConversationState | undefined {
    return this.conversations[conversationId];
  }

  getConversations (): IStoredConversationState[] {
    return Object.values(this.conversations);
  }

  getActiveConversation (): IStoredConversationState {
    return
  }

  removeConversation (conversationId: string): void {
    delete this.conversations[conversationId];
  }

  removeAllConversationsForSession (session: IExtendedMediaSession): void {

  }

  private log (level: LogLevels, message: any, details?: any, skipServer?: boolean): void {
    this.sdk.logger[level].call(this.sdk.logger, message, details, skipServer);
  }
}