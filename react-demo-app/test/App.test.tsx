import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../src/store';
import App from '../src/App';
import { setAuthStatus } from '../src/features/authSlice';
import { connectSdkEventHandlers, SdkEventSource } from '../src/hooks/sdkEventHandlers';

// The app's own store (shared by these tests, which is why the first runs first) and App component: the SDK's handlers are attached before `initialize()` (useSdk), and a failed
// `initialize()` emits an `initialization` or `invalid_token` sdkError and leaves the app on the sign-in screen.
class FakeSdk extends EventEmitter {
  media = new EventEmitter();
}

let sdk: FakeSdk;

beforeEach(() => {
  store.dispatch(setAuthStatus(false));
  sdk = new FakeSdk();
  connectSdkEventHandlers(sdk as unknown as SdkEventSource, store.dispatch);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <Provider store={store}>
      <App />
    </Provider>
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SDK status in the app', () => {
  it('shows an sdkError from a failed initialize on the sign-in screen', () => {
    expect(screen.getByText('Authenticate')).toBeTruthy();
    expect(screen.getByTestId('sdk-error').getAttribute('data-state')).toBe('none');
    expect(screen.getByTestId('connection-state').textContent).toBe('not connected');

    act(() => {
      sdk.emit('sdkError', Object.assign(new Error('Failed to initialize'), { type: 'initialization' }));
    });

    expect(screen.getByText('Authenticate')).toBeTruthy();
    expect(screen.getByTestId('sdk-error').getAttribute('data-state')).toBe('error');
    expect(screen.getByTestId('sdk-error-type').textContent).toBe('initialization');
    expect(screen.getByTestId('sdk-error-message').textContent).toBe('Failed to initialize');
  });

  it('keeps one SDK status after sign-in, with the error still shown', () => {
    act(() => {
      sdk.emit('sdkError', Object.assign(new Error('Token is invalid'), { type: 'invalid_token' }));
      sdk.emit('connected', { reconnect: false });
      store.dispatch(setAuthStatus(true));
    });

    expect(screen.queryByText('Authenticate')).toBeNull();
    expect(screen.getByTestId('interaction-log')).toBeTruthy();
    expect(screen.getAllByTestId('sdk-error')).toHaveLength(1);
    expect(screen.getAllByTestId('connection-state')).toHaveLength(1);
    expect(screen.getByTestId('connection-state').textContent).toBe('connected');
    expect(screen.getByTestId('sdk-error-type').textContent).toBe('invalid_token');
  });
});
