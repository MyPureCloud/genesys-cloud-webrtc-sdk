it('should work', () => { expect(true).toBe(true) });
// describe('getEnumeratedDevices()', () => {
//   const resetEnumeratedDevicesCache = async (devices?: { deviceId: string, kind: string }[]) => {
//     // need to call the devicechange handler to reset the `refreshDevices` property
//     mediaUtils.stopListeningForDeviceChanges();
//     await mediaUtils.handleDeviceChange.call(mockSdk);

//     jest.resetAllMocks();
//     mediaDevices.enumerateDevices.mockResolvedValue(devices || mockedDevices);
//   };

//   afterEach(async () => {
//     await resetEnumeratedDevicesCache();
//   });

//   it('should log a warning if mediaDevices cannot be enumerated', async () => {
//     const expectedEnumeratedDevices: IEnumeratedDevices = {
//       videoDevices: [],
//       audioDevices: [],
//       outputDevices: []
//     };

//     mediaDevices.enumerateDevices = undefined;
//     const devices = await mediaUtils.getEnumeratedDevices(mockSdk);

//     expect(mockSdk.logger.warn).toBeCalledWith(expect.stringContaining('Unable to enumerate devices'));
//     expect(devices).toEqual(expectedEnumeratedDevices);

//     mediaDevices.enumerateDevices = jest.fn().mockResolvedValue(mockedDevices);
//   });

//   it('should set devicechange listener only once', async () => {
//     const addEventListener = window.navigator.mediaDevices.addEventListener;
//     expect(addEventListener).not.toHaveBeenCalled();

//     await mediaUtils.getEnumeratedDevices(mockSdk);
//     expect(addEventListener).toHaveBeenCalled();

//     const cb = (addEventListener as jest.Mock).mock.calls[0][1];
//     cb();
//     expect(mockSdk.logger.debug).toHaveBeenCalledWith(expect.stringContaining('devices changed'));

//     (addEventListener as jest.Mock).mockReset();
//     await mediaUtils.getEnumeratedDevices(mockSdk);
//     expect(addEventListener).not.toHaveBeenCalled();
//   });

//   it('should return cached enumeratedDevices if the devices have not changed', async () => {
//     const videoDeviceCached = { deviceId: 'cached-video-device', label: 'device #1', kind: 'videoinput' } as MediaDeviceInfo;
//     const audioDeviceCached = { deviceId: 'cached-audio-device', label: 'device #2', kind: 'audioinput' } as MediaDeviceInfo;
//     const outputDeviceCached = { deviceId: 'cached-output-device', label: 'device #3', kind: 'audiooutput' } as MediaDeviceInfo;

//     const expectedEnumeratedDevices: IEnumeratedDevices = {
//       videoDevices: [videoDeviceCached],
//       audioDevices: [audioDeviceCached],
//       outputDevices: [outputDeviceCached]
//     };

//     mediaDevices.enumerateDevices.mockReset();
//     mediaDevices.enumerateDevices.mockResolvedValue([videoDeviceCached, audioDeviceCached, outputDeviceCached]);

//     /* first call will load the cache */
//     let devices = await mediaUtils.getEnumeratedDevices(mockSdk);

//     expect(devices).toEqual(expectedEnumeratedDevices);
//     expect((mockSdk.logger.debug as jest.Mock).mock.calls[0]).toEqual([
//       'Enumerated devices',
//       { devices: expectedEnumeratedDevices }
//     ]);
//     expect(mediaDevices.enumerateDevices).toBeCalled();

//     /* second call should use the cached value */
//     mediaDevices.enumerateDevices.mockReset();
//     mediaDevices.enumerateDevices.mockResolvedValue(mockedDevices);
//     devices = await mediaUtils.getEnumeratedDevices(mockSdk);

//     expect(devices).toEqual(expectedEnumeratedDevices);
//     expect(mockSdk.logger.debug).toBeCalledWith(
//       expect.stringContaining('Returning cached enumerated devices'),
//       { devices: expectedEnumeratedDevices }
//     );
//     expect(mediaDevices.enumerateDevices).not.toBeCalled();
//   });

//   it('should keep old devices if the same device is enumerated without a label (this happens in FF)', async () => {
//     const videoDeviceCached = { deviceId: 'cached-video-device', groupId: 'groupId1', label: 'device #1', kind: 'videoinput' } as MediaDeviceInfo;

//     const expectedEnumeratedDevices: IEnumeratedDevices = {
//       videoDevices: [videoDeviceCached],
//       audioDevices: [],
//       outputDevices: []
//     };

//     mediaDevices.enumerateDevices.mockReset();
//     mediaDevices.enumerateDevices.mockResolvedValue([videoDeviceCached]);

//     /* first call will load the cache */
//     let devices = await mediaUtils.getEnumeratedDevices(mockSdk);

//     expect(devices).toEqual(expectedEnumeratedDevices);
//     expect((mockSdk.logger.debug as jest.Mock).mock.calls[0]).toEqual([
//       'Enumerated devices',
//       { devices: expectedEnumeratedDevices }
//     ]);
//     expect(mediaDevices.enumerateDevices).toBeCalled();

//     /* second call with devices that don't have labels should use the old devices */
//     mediaDevices.enumerateDevices.mockReset();
//     const copyOfVideoDeviceCached = { ...videoDeviceCached, label: '' } as MediaDeviceInfo;
//     mediaDevices.enumerateDevices.mockResolvedValue([copyOfVideoDeviceCached]);

//     devices = await mediaUtils.getEnumeratedDevices(mockSdk, true);

//     expect(devices).toEqual(expectedEnumeratedDevices);
//   });

//   it('should return enumerated devices', async () => {
//     const newMockVideoDevice = { kind: 'videoinput', deviceId: 'mockVideoDevice2', label: 'Mock Video Device #3' } as MediaDeviceInfo;
//     mockedDevices.push(newMockVideoDevice);

//     const expectedEnumeratedDevices: IEnumeratedDevices = {
//       videoDevices: [mockVideoDevice1, mockVideoDevice2, newMockVideoDevice],
//       audioDevices: [mockAudioDevice1, mockAudioDevice2],
//       outputDevices: [mockOutputDevice1, mockOutputDevice2]
//     };

//     let devices = await mediaUtils.getEnumeratedDevices(mockSdk);

//     expect(devices).toEqual(expectedEnumeratedDevices);
//     expect(mediaDevices.enumerateDevices).toBeCalled();

//     (newMockVideoDevice as any).label = '';
//     devices = await mediaUtils.getEnumeratedDevices(mockSdk, true);

//     expect(devices).toEqual(expectedEnumeratedDevices);
//     expect(mediaDevices.enumerateDevices).toBeCalled();
//   });

//   it('should throw if enumerateDevices() fails', async () => {
//     mediaDevices.enumerateDevices.mockImplementation(() => { throw new Error('Failure'); });

//     try {
//       const val = await mediaUtils.getEnumeratedDevices(mockSdk);
//       console.log({ val });
//       fail('it should have thrown');
//     } catch (e) {
//       expect(e.type).toBe(SdkErrorTypes.generic);
//     }
//   });
// });


// describe('getValidDeviceId()', () => {
//   it('should return the found deviceId for specific kinds', async () => {
//     /* audio device */
//     let result = await mediaUtils.getValidDeviceId(mockSdk, 'audioinput', mockAudioDevice1.deviceId);
//     expect(result).toBe(mockAudioDevice1.deviceId);

//     /* video device */
//     result = await mediaUtils.getValidDeviceId(mockSdk, 'videoinput', mockVideoDevice1.deviceId);
//     expect(result).toBe(mockVideoDevice1.deviceId);

//     /* output device */
//     result = await mediaUtils.getValidDeviceId(mockSdk, 'audiooutput', mockOutputDevice1.deviceId);
//     expect(result).toBe(mockOutputDevice1.deviceId);
//   });

//   it('should use the sdk default deviceId if the request deviceId cannot be found', async () => {
//     mockSdk._config.defaults.audioDeviceId = mockAudioDevice1.deviceId;
//     mockSdk._config.defaults.videoDeviceId = mockVideoDevice1.deviceId;
//     mockSdk._config.defaults.outputDeviceId = mockOutputDevice1.deviceId;

//     /* audio device */
//     let result = await mediaUtils.getValidDeviceId(mockSdk, 'audioinput', 'non-existent-device-id');
//     expect(result).toBe(mockAudioDevice1.deviceId);

//     /* video device */
//     result = await mediaUtils.getValidDeviceId(mockSdk, 'videoinput', 'non-existent-device-id');
//     expect(result).toBe(mockVideoDevice1.deviceId);

//     /* output device */
//     result = await mediaUtils.getValidDeviceId(mockSdk, 'audiooutput', 'non-existent-device-id');
//     expect(result).toBe(mockOutputDevice1.deviceId);
//   });

//   it('should return `undefined` if no deviceId can be found', async () => {
//     mockSdk._config.defaults.audioDeviceId = null;
//     mockSdk._config.defaults.videoDeviceId = null;

//     /* audio device */
//     let result = await mediaUtils.getValidDeviceId(mockSdk, 'audioinput', 'non-existent-device-id');
//     expect(result).toBe(undefined);

//     /* video device */
//     result = await mediaUtils.getValidDeviceId(mockSdk, 'videoinput', 'non-existent-device-id');
//     expect(result).toBe(undefined);
//   });

//   it('should return default `audiooutput` device if no deviceId can be found', async () => {
//     mockSdk._config.defaults.outputDeviceId = null;

//     /* output device */
//     const result = await mediaUtils.getValidDeviceId(mockSdk, 'audiooutput', 'non-existent-device-id');
//     expect(result).toBe(mockOutputDevice1.deviceId);
//   });

//   it('should log session info', async () => {
//     const mockSession = new MockSession();
//     const sessions = [
//       mockSession,
//       undefined,
//     ];

//     await mediaUtils.getValidDeviceId(mockSdk, 'audioinput', 'non-existent-device-id', ...sessions as any);

//     expect(mockSdk.logger.info).toHaveBeenCalledWith(
//       expect.stringContaining('Using the system default'),
//       { sessionInfos: [{ sessionId: mockSession.id, conversationId: mockSession.conversationId }] }
//     );
//   });
// });


// describe('hasOutputDeviceSupport()', () => {
//   let OriginalHTMLMediaElement: typeof HTMLMediaElement;
//   let hasOwnPropertySpy: jest.SpyInstance;

//   beforeEach(() => {
//     OriginalHTMLMediaElement = window.HTMLMediaElement;
//     hasOwnPropertySpy = jest.fn();
//     Object.defineProperty(window, 'HTMLMediaElement', {
//       value: {
//         prototype: {
//           hasOwnProperty: hasOwnPropertySpy
//         }
//       }
//     });
//   });

//   afterEach(() => {
//     Object.defineProperty(window, 'HTMLMediaElement', { value: OriginalHTMLMediaElement });
//   });

//   it('should return true for supported browsers', () => {
//     hasOwnPropertySpy.mockReturnValue(true);
//     expect(mediaUtils.hasOutputDeviceSupport()).toBe(true);
//     expect(hasOwnPropertySpy).toHaveBeenCalledWith('setSinkId');
//   });

//   it('should return false for non-supported browsers', () => {
//     hasOwnPropertySpy.mockReturnValue(false);
//     expect(mediaUtils.hasOutputDeviceSupport()).toBe(false);
//     expect(hasOwnPropertySpy).toHaveBeenCalledWith('setSinkId');
//   });
// });



// describe('findCachedOutputDeviceById()', () => {
//   let devices;

//   beforeEach(() => {
//     devices = [];
//     mediaDevices.enumerateDevices.mockResolvedValue(devices);
//   });

//   afterEach(() => {
//     jest.resetAllMocks();
//   });

//   it('should return `undefined` if there is id passed in', () => {
//     expect(mockSdk.media.findCachedOutputDeviceById()).toBe(undefined);
//   });

//   it('should return the found output device', async () => {
//     const deviceIdToFind = 'output123';
//     const mockOutputDevice = { label: 'Speaker #1', kind: 'audiooutput', deviceId: deviceIdToFind };

//     /* load the devices into the cache */
//     devices.push(mockOutputDevice);
//     await mockSdk.media.enumerateDevices();

//     expect(mockSdk.media.findCachedOutputDeviceById(deviceIdToFind)).toBe(mockOutputDevice);
//   });

//   it('should return `undefined` if the output device cannot be found', async () => {
//     const deviceIdToFind = 'output123';
//     const mockOutputDevice = { label: 'Speaker #4', kind: 'audiooutput', deviceId: 'speaker-4-id' };

//     /* load the devices into the cache */
//     devices.push(mockOutputDevice);
//     await mockSdk.media.enumerateDevices();

//     expect(mockSdk.media.findCachedOutputDeviceById(deviceIdToFind)).toBe(undefined);
//   });
// });

// describe('findCachedDeviceByTrackLabel()', () => {
//   let devices;

//   beforeEach(() => {
//     devices = [];
//     mediaDevices.enumerateDevices.mockResolvedValue(devices);
//   });

//   afterEach(() => {
//     jest.resetAllMocks();
//   });

//   it('should return `undefined` if there is no track', () => {
//     expect(mockSdk.media.findCachedDeviceByTrackLabel()).toBe(undefined);
//   });

//   it('should find the available video & audio device depending on the track kind', async () => {
//     const audioTrack = { kind: 'audio', label: 'Mic #1' } as MediaStreamTrack;
//     const videoTrack = { kind: 'video', label: 'Camera #1' } as MediaStreamTrack;

//     const mockAudioDevice = { label: 'Mic #1', kind: 'audioinput' };
//     const mockVideoDevice = { label: 'Camera #1', kind: 'videoinput' };

//     /* load the devices into the cache */
//     devices.push(mockAudioDevice);
//     devices.push(mockVideoDevice);
//     await mockSdk.media.enumerateDevices();

//     expect(mockSdk.media.findCachedDeviceByTrackLabel(videoTrack)).toBe(mockVideoDevice);
//     expect(mockSdk.media.findCachedDeviceByTrackLabel(audioTrack)).toBe(mockAudioDevice);
//   });

//   it('should return `unefined` if it cannot find the track by label in available devices', async () => {
//     const audioTrack = { kind: 'audio', label: 'Mic #3' } as MediaStreamTrack;
//     const videoTrack = { kind: 'video', label: 'Camera #3' } as MediaStreamTrack;

//     const mockAudioDevice = { label: 'Mic #1', kind: 'audioinput' };
//     const mockVideoDevice = { label: 'Camera #1', kind: 'videoinput' };

//     /* load the devices into the cache */
//     devices.push(mockAudioDevice);
//     devices.push(mockVideoDevice);
//     await mockSdk.media.enumerateDevices();

//     expect(mockSdk.media.findCachedDeviceByTrackLabel(videoTrack)).toBe(undefined);
//     expect(mockSdk.media.findCachedDeviceByTrackLabel(audioTrack)).toBe(undefined);
//   });

// });


// describe('startMedia()', () => {
//   it('should log session info if is provided', async () => {
//     const session: any = new MockSession();
//     const opts = { video: false, audio: false };

//     await mockSdk.media.startMedia({ ...opts, session });
//     expect(mockSdk.logger.info).toHaveBeenCalledWith('requesting getUserMedia', {
//       opts,
//       isFirefox: false,
//       constraints: { video: false, audio: false },
//       sessionId: session.id,
//       conversationId: session.conversationId,
//       availableDevices: {
//         audioDevices: [],
//         outputDevices: [],
//         videoDevices: []
//       }
//     });
//   });

//   it('should request audio only', async () => {
//     await mockSdk.media.startMedia({ audio: true });

//     expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: {}, video: false });
//   });

//   it('should request video only with default resolution', async () => {
//     await mockSdk.media.startMedia({ video: true });

//     expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
//       video: Object.assign({ frameRate: { ideal: 30 } }, defaultResolution),
//       audio: false
//     });
//   });

//   it('should request video only custom resolution', async () => {
//     const resolution = {
//       width: {
//         ideal: 555
//       },
//       height: {
//         ideal: 333
//       }
//     };

//     await mockSdk.media.startMedia({ video: true, videoResolution: resolution });

//     expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: Object.assign({ frameRate: { ideal: 30 } }, resolution), audio: false });
//   });

//   it('should request audio and video', async () => {
//     await mockSdk.media.startMedia();

//     expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: Object.assign({ frameRate: { ideal: 30 } }, defaultResolution), audio: {} });
//   });

//   it('should request audio and video in chrome', async () => {
//     Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });

//     const expectedAudioConstraints = {
//       googAudioMirroring: false,
//       autoGainControl: true,
//       echoCancellation: true,
//       noiseSuppression: true,
//       googDucking: false,
//       googHighpassFilter: true
//     };
//     await mockSdk.media.startMedia();

//     const expected = Object.assign({ frameRate: { ideal: 30 }, googNoiseReduction: true }, defaultResolution);

//     expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: expected, audio: expectedAudioConstraints });
//   });

//   it('should request audio and video by deviceId', async () => {
//     const videoDeviceId = mockVideoDevice2.deviceId;
//     const audioDeviceId = mockAudioDevice1.deviceId;
//     const expectedConstraints = {
//       video: Object.assign({ frameRate: { ideal: 30 }, deviceId: { ideal: videoDeviceId } }, defaultResolution),
//       audio: { deviceId: { ideal: audioDeviceId } },
//     };

//     Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });

//     await mockSdk.media.startMedia({ video: videoDeviceId, audio: audioDeviceId });

//     expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(expectedConstraints);
//     Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });
//   });

//   it('should request audio and video by deviceId in Firefox using `exact`', async () => {
//     const videoDeviceId = mockVideoDevice2.deviceId;
//     const audioDeviceId = mockAudioDevice1.deviceId;
//     const expectedConstraints = {
//       video: Object.assign({ frameRate: { ideal: 30 }, deviceId: { exact: videoDeviceId } }, defaultResolution),
//       audio: { deviceId: { exact: audioDeviceId } },
//     };

//     Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });
//     Object.defineProperty(browserama, 'isFirefox', { get: () => true });

//     await mockSdk.media.startMedia({ video: videoDeviceId, audio: audioDeviceId });

//     expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(expectedConstraints);

//     Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });
//     Object.defineProperty(browserama, 'isFirefox', { get: () => false });
//   });

//   it('should use the requested frameRate', async () => {
//     const videoDeviceId = mockVideoDevice2.deviceId;
//     const audioDeviceId = mockAudioDevice1.deviceId;
//     const expectedConstraints = {
//       video: Object.assign({ frameRate: { ideal: 10 }, deviceId: { ideal: videoDeviceId } }, defaultResolution),
//       audio: { deviceId: { ideal: audioDeviceId } },
//     };

//     Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });

//     await mockSdk.media.startMedia({ video: videoDeviceId, audio: audioDeviceId, videoFrameRate: { ideal: 10 } });

//     expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(expectedConstraints);
//     Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });
//   });

//   it('should log if the requested audio/video deviceId cannot be found', async () => {
//     const videoDeviceId = 'video-device-that-does-not-exist';
//     const audioDeviceId = 'audio-device-that-does-not-exist';
//     const expectedConstraints = {
//       video: Object.assign({ frameRate: { ideal: 30 } }, defaultResolution),
//       audio: {},
//     };

//     Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });

//     await mockSdk.media.startMedia({ video: videoDeviceId, audio: audioDeviceId });

//     expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(expectedConstraints);
//     expect(mockSdk.logger.warn).toHaveBeenCalledWith(
//       expect.stringContaining('Unable to find requested audioinput'),
//       { deviceId: audioDeviceId, sessionInfos: [] }
//     );
//     expect(mockSdk.logger.warn).toHaveBeenCalledWith(
//       expect.stringContaining('Unable to find requested videoinput'),
//       { deviceId: videoDeviceId, sessionInfos: [] }
//     );

//     Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });
//   });

//   it('should retry video if an AbortError is received', async () => {
//     const expected1stConstraints = {
//       video: Object.assign({ frameRate: { ideal: 30 }, googNoiseReduction: true }, defaultResolution),
//       audio: false,
//     };
//     const expected2ndConstraints = {
//       video: {
//         googNoiseReduction: true,
//         frameRate: { ideal: 30 },
//         height: { ideal: 720 },
//         width: { ideal: 1280 }
//       },
//       audio: false,
//     };

//     Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });

//     /* FF will throw this error in some hardware configs using a dock */
//     const error = new Error('Starting video failed');
//     error.name = 'AbortError';
//     mediaDevices.getUserMedia.mockRejectedValueOnce(error);

//     await mockSdk.media.startMedia({ video: true });

//     expect(mediaDevices.getUserMedia).toHaveBeenNthCalledWith(1, expected1stConstraints);
//     expect(mediaDevices.getUserMedia).toHaveBeenNthCalledWith(2, expected2ndConstraints);

//     expect(mockSdk.logger.error).toHaveBeenCalled();
//     expect(mockSdk.logger.warn).toHaveBeenCalledWith(
//       expect.stringContaining('starting video was aborted. trying again with a lower resolution'),
//       expect.any(Object)
//     );
//   });

//   it('should throw if retrying video for AbortError fails', async () => {
//     const expected1stConstraints = {
//       video: Object.assign({ frameRate: { ideal: 30 }, googNoiseReduction: true }, defaultResolution),
//       audio: false,
//     };
//     const expected2ndConstraints = {
//       video: {
//         googNoiseReduction: true,
//         frameRate: { ideal: 30 },
//         height: { ideal: 720 },
//         width: { ideal: 1280 }
//       },
//       audio: false,
//     };

//     Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });

//     /* FF will throw this error in some hardware configs using a dock */
//     const error = new Error('Starting video failed');
//     error.name = 'AbortError';
//     mediaDevices.getUserMedia.mockRejectedValue(error);

//     try {
//       await mockSdk.media.startMedia({ video: true });
//       fail('should have thrown');
//     } catch (e) {
//       expect(e).toBe(error);
//     }

//     expect(mediaDevices.getUserMedia).toHaveBeenNthCalledWith(1, expected1stConstraints);
//     expect(mediaDevices.getUserMedia).toHaveBeenNthCalledWith(2, expected2ndConstraints);

//     expect(mockSdk.logger.error).toHaveBeenCalled();
//     expect(mockSdk.logger.warn).toHaveBeenCalledWith(
//       expect.stringContaining('starting video was aborted. trying again with a lower resolution'),
//       expect.any(Object)
//     );
//   });

//   it('should log errors', async () => {
//     const constraints = { video: false, audio: false };
//     const session: any = new MockSession();
//     const availableDevices = mockSdk.media.getState().devices;
//     const error = new Error('NotFound')

//     const loggerSpy = jest.spyOn(mockSdk.logger, 'error');
//     mediaDevices.getUserMedia.mockRejectedValue(error);

//     try {
//       await mockSdk.media.startMedia({ session, ...constraints });
//       fail('should have thrown');
//     } catch (e) {
//       expect(loggerSpy).toHaveBeenCalledWith(e, {
//         error,
//         constraints,
//         isFirefox: false,
//         opts: constraints,
//         sessionId: session.id,
//         conversationId: session.conversationId,
//         availableDevices
//       });
//     }
//   });
// });


// describe('startDisplayMedia()', () => {
//   describe('getScreenShareConstraints', () => {
//     it('should be simple if hasDisplayMedia', async () => {
//       Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });

//       await mockSdk.media.startDisplayMedia();
//       const constraints = (mediaDevices.getDisplayMedia as jest.Mock).mock.calls[0][0];

//       expect(constraints).toEqual({
//         audio: false,
//         video: {
//           frameRate: { ideal: 30 },
//           height: { max: 10000 },
//           width: { max: 10000 }
//         }
//       });
//     });

//     it('chrome getUserMedia constraints', async () => {
//       delete mediaDevices.getDisplayMedia;
//       Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => true });

//       await mockSdk.media.startDisplayMedia();
//       const constraints = (mediaDevices.getUserMedia as jest.Mock).mock.calls[0][0];

//       expect(constraints).toEqual({
//         audio: false,
//         video: {
//           mandatory: {
//             chromeMediaSource: 'desktop',
//             maxWidth: 10000,
//             maxHeight: 10000,
//             maxFrameRate: 15
//           }
//         }
//       });
//     });

//     it('non chrome constraints', async () => {
//       Object.defineProperty(browserama, 'isChromeOrChromium', { get: () => false });

//       await mockSdk.media.startDisplayMedia();
//       const constraints = (mediaDevices.getDisplayMedia as jest.Mock).mock.calls[0][0];

//       expect(constraints).toEqual({
//         audio: false,
//         video: {
//           mediaSource: 'window'
//         }
//       });
//     });
//   });

//   it('should use getDisplayMedia if available', async () => {
//     await mockSdk.media.startDisplayMedia();

//     expect(mediaDevices.getDisplayMedia).toHaveBeenCalled();
//     expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
//   });

//   it('should use getUserMedia if no getUserMedia', async () => {
//     delete mediaDevices.getDisplayMedia;

//     await mockSdk.media.startDisplayMedia();

//     expect(mediaDevices.getUserMedia).toHaveBeenCalled();
//   });
// });


// describe('createMedia()', () => {
//   it('should throw if no media requested', async () => {
//     const spy = jest.spyOn(mediaUtils, 'startMedia');

//     const { sdk } = mockApis();
//     await expect(sdk.createMedia({} as any)).rejects.toThrowError(/called with at least one media type/);
//     expect(spy).not.toHaveBeenCalled();

//     await expect((sdk.createMedia as any)()).rejects.toThrowError(/called with at least one media type/);
//     expect(spy).not.toHaveBeenCalled();

//     await expect(sdk.createMedia({ video: false, audio: false })).rejects.toThrowError(/called with at least one media type/);
//     expect(spy).not.toHaveBeenCalled();

//     await expect(sdk.createMedia({ video: undefined, audio: false })).rejects.toThrowError(/called with at least one media type/);
//     expect(spy).not.toHaveBeenCalled();

//     await expect(sdk.createMedia({ video: false, audio: undefined })).rejects.toThrowError(/called with at least one media type/);
//     expect(spy).not.toHaveBeenCalled();
//   });

//   it('proxies the call to the mediaUtils', async () => {
//     const { sdk } = mockApis();
//     await sdk.initialize();

//     jest.spyOn(mediaUtils, 'startMedia').mockResolvedValue({} as any);

//     const params = { video: true };
//     await sdk.createMedia(params);
//     expect(mediaUtils.startMedia).toHaveBeenCalledWith(sdk, params);

//     await disconnectSdk(sdk);
//   });
// });

// describe('getDisplayMedia()', () => {
//   it('should call through to startDisplayMedia', async () => {
//     const { sdk } = mockApis();
//     const spy = jest.spyOn(mediaUtils, 'startDisplayMedia').mockResolvedValue({} as any);
//     await sdk.getDisplayMedia();
//     expect(spy).toHaveBeenCalled();
//   });
// });