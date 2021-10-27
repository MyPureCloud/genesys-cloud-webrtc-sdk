import BaseSessionHandler from './base-session-handler';
import { SessionTypes } from '../types/enums';
import SoftphoneSessionHandler from './softphone-session-handler';

abstract class SoftphoneSubSessionHandler extends BaseSessionHandler {
  sessionType = SessionTypes.softphone;
  shouldHandleSessionByJid: (jid?: string) => boolean;
  parent: SoftphoneSessionHandler;

  constructor (sdk, handler, parent) {
    super(sdk, handler);
    this.parent = parent;
    this.shouldHandleSessionByJid = this.parent.shouldHandleSessionByJid;
  }

}

export class SoftphoneSingleSessionHandler extends SoftphoneSubSessionHandler {

}

export class SoftphoneMultipleSessionHandler extends SoftphoneSubSessionHandler {

}