import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../src/features/authSlice';
import conversationsReducer from '../src/features/conversationsSlice';
import devicesReducer from '../src/features/devicesSlice';
import sdkReducer from '../src/features/sdkSlice';
import audioProcessorReducer from '../src/features/audioProcessorSlice';
import sdkSignalsReducer from '../src/features/sdkSignalsSlice';
import { connectSdkEventHandlers, SdkEventSource } from '../src/hooks/sdkEventHandlers';
import InteractionLog from '../src/components/InteractionLog';
import SdkSignals from '../src/components/SdkSignals';

// A class instance, like the SDK's session objects, so the store does not freeze it and the
// persistent-connection case can move it to the next conversation as the SDK does.
class FakeSession {
  constructor (
    public id: string,
    public conversationId: string,
    public sessionType: string = 'softphone',
    public state: string = 'active'
  ) {}
}

class FakeSdk extends EventEmitter {
  media = new EventEmitter();
}

function makeStore () {
  return configureStore({
    reducer: {
      auth: authReducer,
      conversations: conversationsReducer,
      devices: devicesReducer,
      sdk: sdkReducer,
      audioProcessor: audioProcessorReducer,
      sdkSignals: sdkSignalsReducer
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false })
  });
}

function storedConversation (conversationId: string, session: FakeSession | undefined, callState: string) {
  return {
    conversationId,
    conversationUpdate: {},
    session,
    mostRecentCallState: { id: `participant-${conversationId}`, state: callState, muted: false, held: false }
  };
}

let sdk: FakeSdk;
let store: ReturnType<typeof makeStore>;

function emit (event: string, ...args: unknown[]) {
  act(() => {
    sdk.emit(event, ...args);
  });
}

function emitUpdate (update: { current?: unknown[]; added?: unknown[]; removed?: unknown[] }) {
  emit('conversationUpdate', { activeConversationId: '', current: [], added: [], removed: [], ...update });
}

// The softphone handler's per-call end: `sessionEnded` with `success`, then, in the same call,
// `conversationUpdate` with the conversation in `removed`.
function endCall (session: FakeSession, conversationId: string, callState = 'disconnected') {
  session.conversationId = conversationId;
  emit('sessionEnded', session, { condition: 'success' });
  emitUpdate({ removed: [storedConversation(conversationId, session, callState)] });
}

function entries () {
  return screen.queryAllByTestId('interaction-log-entry');
}

function entryFields (entry: HTMLElement) {
  return {
    conversationId: within(entry).getByTestId('interaction-log-conversation-id').textContent,
    endReason: within(entry).getByTestId('interaction-log-end-reason').textContent,
    finalState: within(entry).getByTestId('interaction-log-final-state').textContent
  };
}

beforeEach(() => {
  sdk = new FakeSdk();
  store = makeStore();
  connectSdkEventHandlers(sdk as unknown as SdkEventSource, store.dispatch);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  render(
    <Provider store={store}>
      <SdkSignals />
      <InteractionLog />
    </Provider>
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('interaction log', () => {
  it('has no entry for an active call', () => {
    const session = new FakeSession('session-1', 'conv-1');
    emit('sessionStarted', session);
    const call = storedConversation('conv-1', session, 'connected');
    emitUpdate({ added: [call], current: [call] });

    expect(screen.getByTestId('interaction-log').getAttribute('data-count')).toBe('0');
    expect(entries()).toHaveLength(0);
  });

  it('logs one entry when a non-persistent call ends', () => {
    const session = new FakeSession('session-1', 'conv-1');
    emit('sessionStarted', session);
    const call = storedConversation('conv-1', session, 'connected');
    emitUpdate({ added: [call], current: [call] });

    endCall(session, 'conv-1');

    expect(entries()).toHaveLength(1);
    expect(entryFields(entries()[0])).toEqual({ conversationId: 'conv-1', endReason: 'success', finalState: 'disconnected' });
    expect(entries()[0].getAttribute('data-conversation-id')).toBe('conv-1');
    expect(screen.getByTestId('interaction-log').getAttribute('data-count')).toBe('1');
  });

  it('logs one entry per call on a persistent connection session', () => {
    const session = new FakeSession('persistent-1', 'conv-1');
    emit('sessionStarted', session);
    emitUpdate({ added: [storedConversation('conv-1', session, 'connected')] });
    endCall(session, 'conv-1');

    expect(entries()).toHaveLength(1);

    emitUpdate({ added: [storedConversation('conv-2', session, 'connected')] });
    endCall(session, 'conv-2', 'terminated');

    expect(entries().map(entryFields)).toEqual([
      { conversationId: 'conv-1', endReason: 'success', finalState: 'disconnected' },
      { conversationId: 'conv-2', endReason: 'success', finalState: 'terminated' }
    ]);
  });

  it('logs a removed call with no preceding sessionEnded, with reason unknown', () => {
    const session = new FakeSession('session-1', 'conv-1');
    emitUpdate({ added: [storedConversation('conv-1', session, 'connected')] });
    emitUpdate({ removed: [storedConversation('conv-1', session, 'disconnected')] });

    expect(entries().map(entryFields)).toEqual([
      { conversationId: 'conv-1', endReason: 'unknown', finalState: 'disconnected' }
    ]);
  });

  it('logs nothing when an eager persistent transport ends without a call', () => {
    const eager = new FakeSession('persistent-1', 'conv-eager');
    emit('sessionStarted', eager);
    emit('sessionEnded', eager, { condition: 'success' });

    const other = new FakeSession('persistent-2', 'conv-never-seen');
    emit('sessionStarted', other);
    emit('sessionEnded', other, { condition: 'connectivity-error' });

    expect(entries()).toHaveLength(0);
  });

  it('ignores a transport replacement during a call and uses the per-call end reason', () => {
    const oldSession = new FakeSession('session-old', 'conv-1');
    const newSession = new FakeSession('session-new', 'conv-1');
    emit('sessionStarted', oldSession);
    emitUpdate({ added: [storedConversation('conv-1', oldSession, 'connected')] });

    emit('sessionStarted', newSession);
    emit('sessionEnded', oldSession, { condition: 'alternative-session' });
    emitUpdate({ current: [storedConversation('conv-1', newSession, 'connected')] });

    expect(entries()).toHaveLength(0);

    endCall(newSession, 'conv-1');

    expect(entries().map(entryFields)).toEqual([
      { conversationId: 'conv-1', endReason: 'success', finalState: 'disconnected' }
    ]);
  });

  it('does not take the replaced transport\'s reason when the call is removed without a per-call end', () => {
    const oldSession = new FakeSession('session-old', 'conv-1');
    const newSession = new FakeSession('session-new', 'conv-1');
    emitUpdate({ added: [storedConversation('conv-1', oldSession, 'connected')] });
    emit('sessionEnded', oldSession, { condition: 'alternative-session' });
    emitUpdate({ removed: [storedConversation('conv-1', newSession, 'disconnected')] });

    expect(entries().map(entryFields)).toEqual([
      { conversationId: 'conv-1', endReason: 'unknown', finalState: 'disconnected' }
    ]);
  });

  it('keeps one entry with its reason when a stale or duplicate sessionEnded follows a logged call', () => {
    const session = new FakeSession('persistent-1', 'conv-1');
    emitUpdate({ added: [storedConversation('conv-1', session, 'connected')] });
    endCall(session, 'conv-1');

    emit('sessionEnded', session, { condition: 'connectivity-error' });
    emit('sessionEnded', session, { condition: 'success' });
    emitUpdate({ removed: [storedConversation('conv-1', session, 'terminated')] });

    expect(entries().map(entryFields)).toEqual([
      { conversationId: 'conv-1', endReason: 'success', finalState: 'terminated' }
    ]);
    expect(store.getState().sdkSignals.softphoneEndings).toEqual({});
  });

  it('logs one entry for an ended video session', () => {
    const video = new FakeSession('video-1', 'video-conv-1', 'collaborateVideo');
    emit('sessionStarted', video);

    expect(entries()).toHaveLength(0);

    video.state = 'ended';
    emit('sessionEnded', video, { condition: 'success' });
    emit('sessionEnded', video, { condition: 'success' });

    expect(entries().map(entryFields)).toEqual([
      { conversationId: 'video-conv-1', endReason: 'success', finalState: 'ended' }
    ]);
  });
});

describe('last SDK error', () => {
  it('shows no error before any sdkError', () => {
    expect(screen.getByTestId('sdk-error').getAttribute('data-state')).toBe('none');
    expect(screen.getByTestId('sdk-error-type').textContent).toBe('');
    expect(screen.getByTestId('sdk-error-message').textContent).toBe('');
  });

  it('shows the latest error, replacing an earlier one', () => {
    emit('sdkError', Object.assign(new Error('first failure'), { type: 'media' }));

    expect(screen.getByTestId('sdk-error').getAttribute('data-state')).toBe('error');
    expect(screen.getByTestId('sdk-error-type').textContent).toBe('media');
    expect(screen.getByTestId('sdk-error-message').textContent).toBe('first failure');

    emit('sdkError', Object.assign(new Error('second failure'), { type: 'session' }));

    expect(screen.getByTestId('sdk-error-type').textContent).toBe('session');
    expect(screen.getByTestId('sdk-error-message').textContent).toBe('second failure');
  });
});

describe('connection state', () => {
  it('follows connected and disconnected events', () => {
    const state = () => screen.getByTestId('connection-state');
    expect(state().textContent).toBe('not connected');
    expect(state().getAttribute('data-connected')).toBe('false');

    emit('connected', { reconnect: false });
    expect(state().textContent).toBe('connected');
    expect(state().getAttribute('data-connected')).toBe('true');

    emit('disconnected', 'Streaming API connection disconnected', { reconnecting: true });
    expect(state().textContent).toBe('not connected');
    expect(state().getAttribute('data-connected')).toBe('false');
  });
});
