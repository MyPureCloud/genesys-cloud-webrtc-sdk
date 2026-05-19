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

  public setAudioProcessor(audioProcessor: IAudioProcessor): void {
    if (!audioProcessor) {
      this.sdk.logger.error('Audio processor is required to set audio processor for enhanced noise suppression.');
      return;
    }
    this.sdk.logger.info('Setting audio processor for enhanced noise suppression.', audioProcessor.name);
    this.audioProcessor = audioProcessor
    this.init();
  }

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

  public async destroy(): Promise<void> {
    if (!this.audioProcessor) {
      return;
    }

    this.sdk.logger.info('Destroying audio processor.', this.audioProcessor.name);
    await this.audioProcessor.destroy();
    this.audioProcessor = undefined;
  }
}
