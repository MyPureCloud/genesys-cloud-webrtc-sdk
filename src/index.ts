export * from './client';
export * from './media/media';
export * from './types/interfaces';
export * from './types/enums';
export * from './conversations/conversation-update';
export * from 'softphone-vendor-headsets';
export * from './sessions/softphone-session-handler';
export * from './sessions/video-session-handler';
export * from './sessions/screen-recording-session-handler';
export * from './sessions/screen-share-session-handler';
export * from './sessions/live-monitoring-session-handler';
export { ExpandedDeviceConnectionStatus } from './headsets/headset-types';

import * as utils from './utils';
import * as mediaUtils from './media/media-utils';
import { JingleReason, JingleInfo } from 'stanza/protocol';
import { Constants } from 'stanza';

const JingleReasonCondition = Constants.JingleReasonCondition;

export { utils, mediaUtils, JingleReason, JingleReasonCondition, JingleInfo };
export { SdkError } from './utils';

/* make sure to export the default */
import GenesysCloudWebrtSdk from './client';

export default GenesysCloudWebrtSdk;
