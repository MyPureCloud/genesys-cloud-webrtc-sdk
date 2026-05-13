import GenesysCloudWebrtcSdk from '../client';
import { IAudioProcessor } from "./interface";

export class SdkAudioProcessor {
  private audioProcessor?: IAudioProcessor | undefined;

  constructor(protected sdk: GenesysCloudWebrtcSdk) {}

  public async init(): Promise<void> {
    this.audioProcessor = this.sdk._config.defaults.audioProcessor;
    if (!this.audioProcessor) {
      console.error('Audio processor is required to initialize audio contexts.');
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
      console.error('Audio processor is required for enhanced noise suppression. Returning unprocessed audio stream.');
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
