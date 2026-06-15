# Genesys Cloud WebRTC SDK Audio Processing

The Genesys Cloud WebRTC SDK supports bring-your-own audio processing. This is a pluggable interface that allows consumers of this SDK to utilize third party noise suppression or other audio processing functionality.

It is the consuming application's responsibility to instantiate an audio processor that matches the contract provided by this SDK (the [`IAudioProcessor`](#iaudioprocessor) interface). Once provided, the SDK will route outgoing softphone audio through the processor before it is sent to the remote peer.

> *Note: Unfiltered audio never leaves the user's machine. The processor runs locally in the browser and the SDK only sends the processed stream.*

## WebRTC SDK Audio Processing Index

This documentation expands upon the [GenesysCloudWebrtcSdk] documentation but is specific to audio processing.

- [IAudioProcessor](#iaudioprocessor)
- [Providing an audio processor](#providing-an-audio-processor)
  - [SDK config](#via-sdk-config)
  - [Runtime](#at-runtime)
- [`sdk.audioProcessor`](#sdkaudioprocessor)
  - [`setAudioProcessor()`](#setaudioprocessor)
  - [`init()`](#init)
  - [`process()`](#process)
  - [`destroy()`](#destroy)
- [Error handling](#error-handling)

## `IAudioProcessor`

Any audio processor provided to the SDK must implement the `IAudioProcessor` interface. This interface is exported from the SDK:

```ts
import { IAudioProcessor } from 'genesys-cloud-webrtc-sdk';

interface IAudioProcessor {
  /** name of the audio processor */
  readonly name: string;
  /** id of the audio processor */
  readonly id: string;
  /** initialize the processor and start any required audio context(s) */
  init: () => Promise<void>;
  /** process an audio stream and return the processed stream */
  process: (audioStream: MediaStream) => Promise<MediaStream>;
  /** stop the audio context(s) and clean up the processor */
  destroy: () => Promise<void>;
}
```

- `name: string` – human readable name of the processor. Used by the SDK for logging.
- `id: string` – unique id of the processor.
- `init(): Promise<void>` – called by the SDK when the processor is set. Use this to initialize the processor and start any audio contexts.
- `process(audioStream: MediaStream): Promise<MediaStream>` – called by the SDK for outgoing softphone audio. The provided stream should be processed and the processed stream returned.
- `destroy(): Promise<void>` – called to tear down the processor and release resources.

## Providing an audio processor

There are two ways to provide an audio processor to the SDK, via SDK configuration or after SDK initialization/at runtime:

### SDK config

Pass the processor in the SDK constructor under `defaults.audioProcessor`. When provided this way, the SDK will set and initialize the processor automatically during construction.

```ts
import { GenesysCloudWebrtcSdk, IAudioProcessor } from 'genesys-cloud-webrtc-sdk';

// your implementation of IAudioProcessor
const audioProcessor: IAudioProcessor = new MyAudioProcessor();

const sdk = new GenesysCloudWebrtcSdk({
  accessToken: 'your-access-token',
  defaults: {
    audioProcessor
  }
});

await sdk.initialize();
```

See [`defaults.audioProcessor`](index.md#defaults) in the main documentation for the config option.

### At runtime

The processor can also be set (or replaced) after the SDK has been constructed by calling [`setAudioProcessor()`](#setaudioprocessor) on the `sdk.audioProcessor` instance. This is useful when the processor is constructed lazily or toggled on/off by the user.

```ts
const audioProcessor: IAudioProcessor = new MyAudioProcessor();

// set (and automatically init) the processor
sdk.audioProcessor.setAudioProcessor(audioProcessor);
```

> *Note: changing the processor only affects audio requested after the change. Audio already flowing on an active session is not re-processed.*

## `sdk.audioProcessor`

The SDK exposes an `SdkAudioProcessor` instance at `sdk.audioProcessor`. It manages the lifecycle of the underlying `IAudioProcessor` and is what the SDK calls into when processing outgoing softphone media.

### `setAudioProcessor()`

Set the audio processor to use. This stores the processor and immediately calls its `init()`.

Declaration:

```ts
setAudioProcessor(audioProcessor: IAudioProcessor): void;
```

Params:

- `audioProcessor: IAudioProcessor` Required: the processor implementation to use.

Returns: `void`

### `init()`

Initialize the currently set audio processor. This is called automatically by [`setAudioProcessor()`](#setaudioprocessor) and when a processor is provided via SDK config, so it generally does not need to be called directly. If no processor has been set, this logs an error and returns.

Declaration:

```ts
init(): Promise<void>;
```

Returns: a promise that resolves once the processor has been initialized.

### `process()`

Process an outgoing audio stream. The SDK calls this internally when starting/updating outgoing softphone media; it generally does not need to be called directly. If no processor has been set, the original (unprocessed) stream is returned.

Declaration:

```ts
process(audioStream: MediaStream): Promise<MediaStream>;
```

Params:

- `audioStream: MediaStream` Required: the audio stream to process.

Returns: a promise that resolves with the processed `MediaStream` (or the original stream if processing is unavailable).

### `destroy()`

Destroy the currently set audio processor. This calls the processor's `destroy()` and clears it from the SDK so that subsequent audio is no longer processed.

Declaration:

```ts
destroy(): Promise<void>;
```

Returns: a promise that resolves once the processor has been destroyed.

## Error handling

The SDK is designed to degrade gracefully so that audio processing issues never break a call:

- If [`init()`](#init) throws, the error is logged and enhanced audio processing is unavailable. Calls continue using unprocessed audio.
- If [`process()`](#process) throws, the error is logged and the original, unprocessed audio stream is returned.
- Calling [`setAudioProcessor()`](#setaudioprocessor), [`init()`](#init), or [`process()`](#process) without a processor set logs an error (and, for `process()`, returns the unprocessed stream).

[GenesysCloudWebrtcSdk]: index.md#genesyscloudwebrtcsdk
