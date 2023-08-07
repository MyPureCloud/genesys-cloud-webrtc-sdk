// Hopefully this file is just temporary. Windows 11 currently has an issue where ice stop responding on the first
// webrtc session after a system reboot. The purpose of this file is to force a webrtc connection upon bootstrap
// in order to work around the windows 11 issue.
export const isWindows11 = async (): Promise<boolean | undefined> => {
  if (!(navigator as any).userAgentData) {
    console.warn('unable to determine if windows11');
    return;
  }

  if ((navigator as any).userAgentData.platform === "Windows") {
    const userAgentData = await (navigator as any).userAgentData.getHighEntropyValues(["platformVersion"]);

    // in the genesys cloud desktop app, platformVersion is just an empty string
    if (!userAgentData.platformVersion) {
      return;
    }

    const majorPlatformVersion = parseInt(userAgentData.platformVersion.split('.')[0]);

    if (majorPlatformVersion >= 13) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

export const doBasicWebrtcSession = async (iceServers: any[]): Promise<void> => {
  console.info('running windows11 webrtc hack')
  const pc1 = new RTCPeerConnection({ iceServers });
  const pc2 = new RTCPeerConnection({ iceServers });

  pc1.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
    pc2.addIceCandidate((ev as any).candidate);
  };
  pc2.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
    pc1.addIceCandidate((ev as any).candidate);
  };

  pc1.onconnectionstatechange = () => {
    const state = pc1.connectionState;

    if (['connected', 'disconnected', 'failed', 'closed'].includes(state)) {
      pc1.close();
      pc2.close();
    }
  }
  
  pc1.addTransceiver('audio');
  const offer = await pc1.createOffer();
  pc1.setLocalDescription(offer);
  pc2.setRemoteDescription(offer);

  const answer = await pc2.createAnswer();
  pc2.setLocalDescription(answer);
  pc1.setRemoteDescription(answer);
}

export async function setupWebrtcForWindows11 (iceServers: any[]) {
  const isWindows11Value = await isWindows11();

  // assume windows11 if indeterminate
  if (isWindows11Value === true || typeof isWindows11Value === 'undefined') {
    await doBasicWebrtcSession(iceServers);
  }
}
