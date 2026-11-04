import { FormEvent, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { IExtendedMediaSession } from 'genesys-cloud-webrtc-sdk';
import Card from './Card';
import { RootState } from '../types/store';
import './VideoSession.css';

export default function VideoSession() {
  const sdk = useSelector((state: RootState) => state.sdk.sdk);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [roomJid, setRoomJid] = useState('');
  // Every started video session not yet ended or failed; the view is active while any remains.
  const [activeSessionIds, setActiveSessionIds] = useState<string[]>([]);

  useEffect(() => {
    if (!sdk) return;

    function handleSessionStarted(session: IExtendedMediaSession) {
      if (!sdk || String(session.sessionType) !== 'collaborateVideo') return;
      setActiveSessionIds(current => (current.includes(session.id) ? current : [...current, session.id]));
      sdk.acceptSession({
        conversationId: session.conversationId,
        audioElement: audioRef.current ?? undefined,
        videoElement: videoRef.current ?? undefined
      }).catch(err => {
        console.error(err);
        removeSession(session.id);
      });
    }

    function handleSessionEnded(session: IExtendedMediaSession) {
      removeSession(session.id);
    }

    function removeSession(sessionId: string) {
      setActiveSessionIds(current => current.filter(id => id !== sessionId));
    }

    sdk.on('sessionStarted', handleSessionStarted);
    sdk.on('sessionEnded', handleSessionEnded);
    return () => {
      sdk.off('sessionStarted', handleSessionStarted);
      sdk.off('sessionEnded', handleSessionEnded);
    };
  }, [sdk]);

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sdk || !roomJid) return;
    sdk.startVideoConference(roomJid).catch(err => console.error(err));
  }

  const state = activeSessionIds.length ? 'active' : 'none';

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
          <button type="submit" data-testid="video-join" disabled={!roomJid}>
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
