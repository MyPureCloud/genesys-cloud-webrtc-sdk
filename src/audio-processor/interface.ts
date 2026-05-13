export interface IAudioProcessor {
  readonly name: string; // name of the audio processor
  readonly id: string; // id of the audio processor
  init: () => Promise<void>;
  process: (audioStream: MediaStream) => Promise<MediaStream>;
  destroy: () => Promise<void>;
  setAudioProcessor: (audioProcessor: IAudioProcessor) => Promise<void>;
}
