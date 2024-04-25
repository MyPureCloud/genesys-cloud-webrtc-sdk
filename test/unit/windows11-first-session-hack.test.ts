import * as window11Utils from "../../src/windows11-first-session-hack";

describe("isWindows11", () => {
  let originalUserAgentData: any;
  let userAgentData: any;

  beforeAll(() => {
    originalUserAgentData = (navigator as any).userAgentData;
    Object.defineProperty(navigator, "userAgentData", {
      get: () => {
        return userAgentData;
      },
      configurable: true
    } as any);
  });

  afterAll(() => {
    Object.defineProperty(navigator, "userAgentData", {
      get: originalUserAgentData,
      configurable: true
    } as any);
  });

  it('should return true for windows11 version', async () => {
    userAgentData = {
      platform: "Windows",
      getHighEntropyValues: () => Promise.resolve({ platformVersion: "15.0.0" }),
    };
  
    expect(await window11Utils.isWindows11()).toBeTruthy();
  });

  it('should return false for windows 10 version', async () => {
    userAgentData = {
      platform: "Windows",
      getHighEntropyValues: () => Promise.resolve({ platformVersion: "10.0.0" }),
    };
  
    expect(await window11Utils.isWindows11()).toBeFalsy();
  });

  it('should return false if not windows', async () => {
    userAgentData = {
      platform: "MacOS",
      getHighEntropyValues: () => Promise.resolve({ platformVersion: "15.0.0" }),
    };
  
    expect(await window11Utils.isWindows11()).toBeFalsy();
  });

  it('should return undefined if no userAgentData', async () => {
    userAgentData = undefined;
  
    expect(await window11Utils.isWindows11()).toBeFalsy();
  });

  it('should return undefined if no userAgentData platformVersion', async () => {
    userAgentData = {
      platform: "Windows",
      getHighEntropyValues: () => Promise.resolve({ platformVersion: "" }),
    };
  
    expect(await window11Utils.isWindows11()).toBeUndefined();
  });
});

describe('setupWebrtcForWindows11', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should do nothing if isWindows11 === false', async () => {
    jest.spyOn(window11Utils, 'isWindows11').mockResolvedValue(false);
    const webrtcSpy = jest.spyOn(window11Utils, 'doBasicWebrtcSession').mockResolvedValue();

    await window11Utils.setupWebrtcForWindows11([]);

    expect(webrtcSpy).not.toHaveBeenCalled();
  });
  
  it('should do webrtc is isWindows11', async () => {
    jest.spyOn(window11Utils, 'isWindows11').mockResolvedValue(true);
    const webrtcSpy = jest.spyOn(window11Utils, 'doBasicWebrtcSession').mockResolvedValue();

    await window11Utils.setupWebrtcForWindows11([]);

    expect(webrtcSpy).toHaveBeenCalled();
  });
  
  it('should do webrtc if isWindows11 === undefined', async () => {
    jest.spyOn(window11Utils, 'isWindows11').mockResolvedValue(undefined);
    const webrtcSpy = jest.spyOn(window11Utils, 'doBasicWebrtcSession').mockResolvedValue();

    await window11Utils.setupWebrtcForWindows11([]);

    expect(webrtcSpy).toHaveBeenCalled();
  });
});

describe('doBasicWebrtcSession', () => {
  let originalPeerConnection: any;
  let peerConnectionConstructorSpy: jest.Mock;
  let pc1: any;
  let pc2: any;

  beforeAll(() => {
    originalPeerConnection = (global as any).RTCPeerConnection;
  });

  afterAll(() => {
    (global as any).RTCPeerConnection = originalPeerConnection;
  });

  beforeEach(() => {
    pc1 = {
      close: jest.fn(),
      addIceCandidate: jest.fn(),
      addTransceiver: jest.fn(),
      setLocalDescription: jest.fn(),
      setRemoteDescription: jest.fn(),
      createOffer: jest.fn().mockResolvedValue({}),
      createAnswer: jest.fn().mockResolvedValue({})
    };
    
    pc2 = {
      close: jest.fn(),
      addIceCandidate: jest.fn(),
      addTransceiver: jest.fn(),
      setLocalDescription: jest.fn(),
      setRemoteDescription: jest.fn(),
      createOffer: jest.fn().mockResolvedValue({}),
      createAnswer: jest.fn().mockResolvedValue({})
    };

    peerConnectionConstructorSpy = (global as any).RTCPeerConnection = jest.fn()
      .mockReturnValueOnce(pc1)
      .mockReturnValueOnce(pc2);
  });

  it('happy path', async () => {
    // we will use this to kick off certain actions automatically
    pc1.setRemoteDescription.mockImplementation(() => {
      pc1.onicecandidate({});
      pc2.onicecandidate({});
      pc1.connectionState = 'started';
      pc1.onconnectionstatechange()
      pc1.connectionState = 'disconnected';
      pc1.onconnectionstatechange()

      expect(pc1.close).toHaveBeenCalled();
      expect(pc2.close).toHaveBeenCalled();
    });

    await window11Utils.doBasicWebrtcSession([]);
  });
});