/**
 * Test stub for `@hp-inc/call-control-sdk`.
 *
 * The real package is a WASM-backed, pure-ESM hardware SDK that uses
 * `import.meta.url` at module load. It cannot be resolved by Jest's default
 * (CommonJS) resolver (it exposes only `module`/`browser` entry points, no
 * `main`) and cannot execute under jsdom. It is pulled in transitively by
 * `softphone-vendor-headsets` via its HP vendor implementation.
 *
 * This stub is wired in through `moduleNameMapper` in jest.config.js so any
 * `import`/`require` of `@hp-inc/call-control-sdk` during tests resolves here.
 *
 * The shape mirrors the real module's public exports so that the headset
 * library can be imported (and the HP service constructed) without touching
 * real hardware:
 *   - default export: the CallControlSdk class
 *   - `SdkEvent`   enum (numeric, so `SdkEvent[sdkEvent]` reverse-lookups work)
 *   - `CallState`  enum
 */

export enum CallState {
  IDLE = 0,
  INCOMING = 1,
  OUTGOING = 2,
  ACTIVE = 3,
  ACTIVE_AND_INCOMING = 4,
  ACTIVE_AND_HELD = 5,
  HELD = 6
}

export enum SdkEvent {
  ANSWER = 0,
  TERMINATE = 1,
  REJECT = 2,
  HOLD = 3,
  RESUME = 4,
  REDIAL = 5,
  FLASH = 6,
  MUTE = 7,
  UNMUTE = 8,
  DISCONNECT = 9,
  CONNECT_SUCCESS = 10,
  CONNECT_FAILED = 11
}

export class CallControlSdk {
  static setWasmUrl (_wasmUrl: string): void {}

  connectHeadset (_headset?: unknown): Promise<boolean> {
    return Promise.resolve(true);
  }

  connectBtHeadset (_headset?: unknown): Promise<boolean> {
    return Promise.resolve(true);
  }

  disconnectHeadset (): Promise<boolean> {
    return Promise.resolve(true);
  }

  registerEventHandler (_handler: (sdkEvent: number) => void): Promise<boolean> {
    return Promise.resolve(true);
  }

  setCallState (_callState: CallState): Promise<boolean> {
    return Promise.resolve(true);
  }

  setMuteState (_muteState: boolean): Promise<boolean> {
    return Promise.resolve(true);
  }
}

export default CallControlSdk;
