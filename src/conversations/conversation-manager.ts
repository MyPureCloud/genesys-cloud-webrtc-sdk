import GenesysCloudWebrtcSdk from "../client";
import { ConversationUpdate } from './conversation-update';
import { LogLevels } from '../types/enums';
import { IConversationInfo, IExtendedMediaSession } from '../types/interfaces';

export class ConversationManager {
  conversations: { [convesationId: string]: IConversationInfo } = {};

  constructor (private sdk: GenesysCloudWebrtcSdk) { }

  setConversationUpdate(update: ConversationUpdate) {

  }

  removeAllConversationsForSession(session: IExtendedMediaSession): void {

  }

  private log (level: LogLevels, message: any, details?: any, skipServer?: boolean): void {
    this.sdk.logger[level].call(this.sdk.logger, message, details, skipServer);
  }
}