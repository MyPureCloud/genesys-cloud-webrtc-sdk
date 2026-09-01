import { randomUUID } from 'crypto';
import 'whatwg-fetch';

Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID }
});

// The real @hp/call-control-sdk (pulled in transitively by softphone-vendor-headsets)
// is a WASM-backed ESM hardware SDK that uses `import.meta` and cannot run under
// Jest/jsdom. Stub it so unrelated suites can import the SDK entrypoint.
jest.mock('@hp/call-control-sdk', () => ({
  __esModule: true,
  default: class CallControlSdk {
    connect () {}
    disconnect () {}
    answerCall () {}
    rejectCall () {}
    terminateCall () {}
    holdCall () {}
    resumeCall () {}
    setMute () {}
    addEventListener () {}
    removeEventListener () {}
  },
  SdkEvent: new Proxy({}, { get: (_target, prop) => prop })
}), { virtual: true });