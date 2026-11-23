import { FormEvent, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { IExtendedMediaSession } from 'genesys-cloud-webrtc-sdk';
import Card from './Card';
import { RootState } from '../types/store';
import './VideoSession.css';

// How long Join stays disabled waiting for the video session after startVideoConference. Without a bound, a request
// that never produces a sessionStarted event would leave Join disabled until the page reloads.
export const JOIN_TIMEOUT_MS = 30000;

export default function VideoSession() {
  const sdk = useSelector((state: RootState) => state.sdk.sdk);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [roomJid, setRoomJid] = useState('');
  // The view's one video session, which owns the customer-video and audio elements. A ref mirrors it for the SDK
  // listeners, which are registered once per SDK instance.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  const [joining, setJoining] = useState(false);
  const joinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function endJoin() {
    if (joinTimerRef.current) clearTimeout(joinTimerRef.current);
    joinTimerRef.current = null;
    setJoining(false);
  }

  function setActive(sessionId: string | null) {
    activeSessionRef.current = sessionId;
    setActiveSessionId(sessionId);
  }

  useEffect(() => {
    if (!sdk) return;

    function handleSessionStarted(session: IExtendedMediaSession) {
      if (!sdk || String(session.sessionType) !== 'collaborateVideo') return;
      endJoin();
      if (activeSessionRef.current && activeSessionRef.current !== session.id) {
        // One session per view: accepting another onto the same elements would replace the displayed media.
        console.warn('Ignoring a second video session while one is active', session.id);
        return;
      }
      setActive(session.id);
      sdk.acceptSession({
        conversationId: session.conversationId,
        audioElement: audioRef.current ?? undefined,
        videoElement: videoRef.current ?? undefined
      }).catch(err => {
        console.error(err);
        if (activeSessionRef.current === session.id) setActive(null);
      });
    }

    function handleSessionEnded(session: IExtendedMediaSession) {
      if (activeSessionRef.current === session.id) setActive(null);
    }

    sdk.on('sessionStarted', handleSessionStarted);
    sdk.on('sessionEnded', handleSessionEnded);
    return () => {
      sdk.off('sessionStarted', handleSessionStarted);
      sdk.off('sessionEnded', handleSessionEnded);
      if (joinTimerRef.current) clearTimeout(joinTimerRef.current);
      joinTimerRef.current = null;
    };
  }, [sdk]);

  const state = activeSessionId ? 'active' : 'none';

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sdk || !roomJid || joining || state === 'active') return;
    setJoining(true);
    joinTimerRef.current = setTimeout(() => {
      console.warn(`No video session started within ${JOIN_TIMEOUT_MS} ms of joining`, roomJid);
      endJoin();
    }, JOIN_TIMEOUT_MS);
    sdk.startVideoConference(roomJid).catch(err => {
      console.error(err);
      endJoin();
    });
  }

  return (
    <Card className="video-session-card">
      <h3>Video</h3>
      <div data-testid="video-session" data-state={state}>
        <form onSubmit={joinRoom}>
          <input
            type="text"
            data-testid="video-room-jid"
            placeholder="room@conference.example.com"
            value={roomJid}
            onChange={e => setRoomJid(e.target.value)}
          />
          <button type="submit" data-testid="video-join" disabled={!roomJid || joining || state === 'active'}>
            Join
          </button>
        </form>
        <video
          className="video-session-customer"
          data-testid="customer-video"
          ref={videoRef}
          autoPlay
          playsInline
          hidden={state === 'none'}
        ></video>
        <audio ref={audioRef} autoPlay></audio>
      </div>
    </Card>
  );
}
