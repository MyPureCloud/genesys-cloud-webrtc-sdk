import { SdkMedia } from "..";
import HeadsetService from 'softphone-vendor-headsets';

export class SdkHeadset {
    private media: SdkMedia;
    private headsetLibrary: HeadsetService;

    constructor() {
        this.headsetLibrary = HeadsetService.getInstance({});
    }

    getAudioDevice(newMicId) {
        const completeDeviceInfo = this.media.getDeviceByIdAndType(newMicId, 'audioinput');
        this.headsetLibrary._handleActiveMicChange(completeDeviceInfo.label.toLowerCase());
    }
}