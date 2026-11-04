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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!sdk) return;

    function handleSessionStarted(session: IExtendedMediaSession) {
      if (!sdk || String(session.sessionType) !== 'collaborateVideo') return;
      setActiveSessionId(session.id);
      sdk.acceptSession({
        conversationId: session.conversationId,
        audioElement: audioRef.current ?? undefined,
        videoElement: videoRef.current ?? undefined
      }).catch(err => console.error(err));
    }

    function handleSessionEnded(session: IExtendedMediaSession) {
      setActiveSessionId(current => (current === session.id ? null : current));
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

  const state = activeSessionId ? 'active' : 'none';

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
