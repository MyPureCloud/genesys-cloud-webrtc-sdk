import { SimpleMockSdk, MockStream, flushPromises } from '../../test-utils';
import { GenesysCloudWebrtcSdk } from '../../../src/client';
import { SdkAudioProcessor } from '../../../src/audio-processor/audio-processor';
import { IAudioProcessor } from '../../../src/audio-processor/interface';

const makeProcessor = (overrides: Partial<IAudioProcessor> = {}): IAudioProcessor => ({
  name: 'fake-processor',
  id: 'fake-id',
  init: jest.fn().mockResolvedValue(undefined),
  process: jest.fn().mockImplementation((s: MediaStream) => Promise.resolve(s)),
  destroy: jest.fn().mockResolvedValue(undefined),
  ...overrides
});

let mockSdk: GenesysCloudWebrtcSdk;

beforeEach(() => {
  jest.clearAllMocks();
  mockSdk = (new SimpleMockSdk() as any);
});

describe('SdkAudioProcessor', () => {
  describe('constructor', () => {
    it('should not log or set a processor when none is provided', () => {
      const wrapper = new SdkAudioProcessor(mockSdk);

      expect(mockSdk.logger.info).not.toHaveBeenCalledWith('Audio processor provided in SDK config.');
      expect(wrapper['audioProcessor']).toBeUndefined();
    });

    it('should set the provided processor and log that it was provided', async () => {
      const processor = makeProcessor();

      const wrapper = new SdkAudioProcessor(mockSdk, processor);
      await flushPromises();

      expect(mockSdk.logger.info).toHaveBeenCalledWith('Audio processor provided in SDK config.');
      expect(wrapper['audioProcessor']).toBe(processor);
      /* setAudioProcessor() also kicks off init() */
      expect(processor.init).toHaveBeenCalled();
    });
  });

  describe('setAudioProcessor()', () => {
    it('should log an error and not assign if called with a falsy processor', () => {
      const wrapper = new SdkAudioProcessor(mockSdk);

      wrapper.setAudioProcessor(undefined as any);

      expect(mockSdk.logger.error).toHaveBeenCalledWith(
        'Audio processor is required to set audio processor for enhanced noise suppression.'
      );
      expect(wrapper['audioProcessor']).toBeUndefined();
    });

    it('should assign the processor, log info with its name, and trigger init()', async () => {
      const processor = makeProcessor({ name: 'my-processor' });
      const wrapper = new SdkAudioProcessor(mockSdk);

      wrapper.setAudioProcessor(processor);
      await flushPromises();

      expect(mockSdk.logger.info).toHaveBeenCalledWith(
        'Setting audio processor for enhanced noise suppression.',
        'my-processor'
      );
      expect(wrapper['audioProcessor']).toBe(processor);
      expect(processor.init).toHaveBeenCalled();
    });
  });

  describe('init()', () => {
    it('should log an error and return early if no processor is set', async () => {
      const wrapper = new SdkAudioProcessor(mockSdk);

      await wrapper.init();

      expect(mockSdk.logger.error).toHaveBeenCalledWith(
        'Audio processor is required to initialize audio contexts.'
      );
    });

    it('should call init on the processor and log info', async () => {
      const processor = makeProcessor();
      const wrapper = new SdkAudioProcessor(mockSdk, processor);
      (processor.init as jest.Mock).mockClear();
      (mockSdk.logger.info as jest.Mock).mockClear();

      await wrapper.init();

      expect(mockSdk.logger.info).toHaveBeenCalledWith(
        'Initializing audio contexts for enhanced noise suppression.'
      );
      expect(processor.init).toHaveBeenCalled();
    });

    it('should catch and log errors from the processor init', async () => {
      const initError = new Error('boom');
      const processor = makeProcessor({ init: jest.fn().mockRejectedValue(initError) });
      const wrapper = new SdkAudioProcessor(mockSdk);

      wrapper['audioProcessor'] = processor;

      await expect(wrapper.init()).resolves.toBeUndefined();

      expect(mockSdk.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error initializing audio contexts'),
        initError
      );
    });
  });

  describe('process()', () => {
    it('should return the original stream and log an error when no processor is set', async () => {
      const wrapper = new SdkAudioProcessor(mockSdk);
      const stream = new MockStream({ audio: true }) as unknown as MediaStream;

      const result = await wrapper.process(stream);

      expect(result).toBe(stream);
      expect(mockSdk.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Audio processor is required for enhanced noise suppression')
      );
    });

    it('should return the processed stream from the processor', async () => {
      const inputStream = new MockStream({ audio: true }) as unknown as MediaStream;
      const processedStream = new MockStream({ audio: true }) as unknown as MediaStream;
      const processor = makeProcessor({
        process: jest.fn().mockResolvedValue(processedStream)
      });
      const wrapper = new SdkAudioProcessor(mockSdk, processor);

      const result = await wrapper.process(inputStream);

      expect(processor.process).toHaveBeenCalledWith(inputStream);
      expect(result).toBe(processedStream);
    });

    it('should return the original stream when the processor throws', async () => {
      const inputStream = new MockStream({ audio: true }) as unknown as MediaStream;
      const processError = new Error('process-fail');
      const processor = makeProcessor({
        process: jest.fn().mockRejectedValue(processError)
      });
      const wrapper = new SdkAudioProcessor(mockSdk, processor);

      const result = await wrapper.process(inputStream);

      expect(result).toBe(inputStream);
      expect(mockSdk.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing audio stream'),
        processError
      );
    });
  });

  describe('destroy()', () => {
    it('should return early without logging if no processor is set', async () => {
      const wrapper = new SdkAudioProcessor(mockSdk);
      (mockSdk.logger.info as jest.Mock).mockClear();

      await wrapper.destroy();

      expect(mockSdk.logger.info).not.toHaveBeenCalled();
    });

    it('should call destroy on the processor, log info, and clear the reference', async () => {
      const processor = makeProcessor({ name: 'my-processor' });
      const wrapper = new SdkAudioProcessor(mockSdk, processor);
      await flushPromises();
      (mockSdk.logger.info as jest.Mock).mockClear();

      await wrapper.destroy();

      expect(mockSdk.logger.info).toHaveBeenCalledWith(
        'Destroying audio processor.',
        'my-processor'
      );
      expect(processor.destroy).toHaveBeenCalled();
      expect(wrapper['audioProcessor']).toBeUndefined();
    });
  });
});
