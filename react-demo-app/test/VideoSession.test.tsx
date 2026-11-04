import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import sdkReducer, { setSdk } from '../src/features/sdkSlice';
import VideoSession from '../src/components/VideoSession';
import { MinimalSdk } from '../src/types/sdk';

class FakeVideoSdk extends EventEmitter {
  startVideoConference = vi.fn(async () => ({ conversationId: 'video-conv-1' }));
  acceptSession = vi.fn(async () => {});
}

let sdk: FakeVideoSdk;

function emit (event: string, ...args: unknown[]) {
  act(() => {
    sdk.emit(event, ...args);
  });
}

beforeEach(() => {
  sdk = new FakeVideoSdk();
  const store = configureStore({
    reducer: { sdk: sdkReducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false })
  });
  store.dispatch(setSdk(sdk as unknown as MinimalSdk));
  render(
    <Provider store={store}>
      <VideoSession />
    </Provider>
  );
});

afterEach(() => {
  cleanup();
});

describe('video session view', () => {
  it('shows no remote video without a session', () => {
    expect(screen.getByTestId('video-session').getAttribute('data-state')).toBe('none');
    expect((screen.getByTestId('customer-video') as HTMLVideoElement).hidden).toBe(true);
  });

  it('joins the entered room through startVideoConference', () => {
    fireEvent.change(screen.getByTestId('video-room-jid'), { target: { value: 'room1@conference.example.com' } });
    fireEvent.click(screen.getByTestId('video-join'));

    expect(sdk.startVideoConference).toHaveBeenCalledWith('room1@conference.example.com');
  });

  it('accepts a video session onto the customer-video element and returns to none when it ends', () => {
    const session = { id: 'video-session-1', conversationId: 'video-conv-1', sessionType: 'collaborateVideo' };
    emit('sessionStarted', session);

    expect(sdk.acceptSession).toHaveBeenCalledTimes(1);
    const params = sdk.acceptSession.mock.calls[0][0] as unknown as { conversationId: string; videoElement: HTMLVideoElement; audioElement: HTMLAudioElement };
    expect(params.conversationId).toBe('video-conv-1');
    expect(params.videoElement).toBe(screen.getByTestId('customer-video'));
    expect(params.audioElement).toBeInstanceOf(HTMLAudioElement);
    expect(screen.getByTestId('video-session').getAttribute('data-state')).toBe('active');
    expect((screen.getByTestId('customer-video') as HTMLVideoElement).hidden).toBe(false);

    emit('sessionEnded', session, { condition: 'success' });

    expect(screen.getByTestId('video-session').getAttribute('data-state')).toBe('none');
    expect((screen.getByTestId('customer-video') as HTMLVideoElement).hidden).toBe(true);
  });

  it('does not accept a softphone session', () => {
    emit('sessionStarted', { id: 'softphone-1', conversationId: 'conv-1', sessionType: 'softphone' });

    expect(sdk.acceptSession).not.toHaveBeenCalled();
    expect(screen.getByTestId('video-session').getAttribute('data-state')).toBe('none');
  });
});
