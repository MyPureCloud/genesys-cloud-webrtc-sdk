import GenesysCloudWebrtcSdk from '../client';
import { IAudioProcessor } from "./interface";

export class SdkAudioProcessor {
  private audioProcessor?: IAudioProcessor | undefined;

  constructor(protected sdk: GenesysCloudWebrtcSdk, audioProcessor?: IAudioProcessor) {
    // If an audio processor is provided in the SDK's config, set it here.
    if (audioProcessor) {
      this.sdk.logger.info('Audio processor provided in SDK config.');
      this.setAudioProcessor(audioProcessor);
    }
  }

  /**
   * Set the audio processor for enhanced noise suppression. This can be called
   * as part of SDK initialization based on configuration or after SDK initialization.
   * @param audioProcessor
   * @returns void
   */
  public setAudioProcessor(audioProcessor: IAudioProcessor): void {
    if (!audioProcessor) {
      this.sdk.logger.error('Audio processor is required to set audio processor for enhanced noise suppression.');
      return;
    }
    this.sdk.logger.info('Setting audio processor for enhanced noise suppression.', audioProcessor.name);
    this.audioProcessor = audioProcessor
    this.init();
  }

  /**
   * Initialize the audio processor for enhanced noise suppression. This will
   * initialize the audio processor and start the audio context.
   * @returns void
   */
  public async init(): Promise<void> {
    if (!this.audioProcessor) {
      this.sdk.logger.error('Audio processor is required to initialize audio contexts.');
      return;
    }

    try {
      this.sdk.logger.info('Initializing audio contexts for enhanced noise suppression.');
      await this.audioProcessor.init();
    } catch (error) {
      this.sdk.logger.error('Error initializing audio contexts for enhanced noise suppression. Enhanced noise suppression will be unavailable.', error);
      return;
    }
  }

  /**
   * Begin processing the audio stream for enhanced noise suppression. This will
   * pass the audio stream into the audio processor. Unfiltered audio will never leave the user's machine.
   * @param audioStream - the audio stream to process.
   * @returns the processed audio stream.
   */
  public async process(audioStream: MediaStream): Promise<MediaStream> {
    if (!this.audioProcessor) {
      this.sdk.logger.error('Audio processor is required for enhanced noise suppression. Returning unprocessed audio stream.');
      return audioStream;
    }

    try {
      const processedAudioStream = await this.audioProcessor.process(audioStream);
      return processedAudioStream;
    } catch (error) {
      this.sdk.logger.error('Error processing audio stream for enhanced noise suppression. Returning unprocessed audio stream.', error);
      return audioStream;
    }
  }

  /**
   * Destroy the audio processor for enhanced noise suppression. This will
   * stop the audio context and clean up the audio processor.
   * @returns void
   */
  public async destroy(): Promise<void> {
    if (!this.audioProcessor) {
      return;
    }

    this.sdk.logger.info('Destroying audio processor.', this.audioProcessor.name);
    await this.audioProcessor.destroy();
    this.audioProcessor = undefined;
  }
}
