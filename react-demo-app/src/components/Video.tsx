import Card from "./Card.tsx";
import {useEffect, useRef, useState} from "react";
import {useSelector} from "react-redux";
import {GuxButton} from "genesys-spark-components-react";
import {SessionEvents} from 'genesys-cloud-streaming-client';

import {VideoMediaSession} from "../../../src";

export default function Video() {
  const [roomJid, setRoomJid] = useState("123test@conference.com");
  const [stream, setStream] = useState();
  const sdk = useSelector(state => state.sdk.sdk);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [session, setSession] = useState<VideoMediaSession>();
  const vanityVideoRef = useRef<HTMLVideoElement>(null);

  function startVideoConf() {
    sdk.startVideoConference(roomJid);
  }

  async function startMedia() {
    return await sdk.media.startMedia({video: true});
    // Is this for displaying locally and then we essentially copy it and stream it?
  }

  async function startMediaVideo() {
    const stream = await startMedia();

    setStream(stream);

    if (vanityVideoRef.current) {
      vanityVideoRef.current.srcObject = stream;
    }
  }

  function logRelevantSessionEvents(session: VideoMediaSession) {
    const sessionEventsToLog: Array<keyof SessionEvents> = ['participantsUpdate', 'activeVideoParticipantsUpdate', 'speakersUpdate'];
    sessionEventsToLog.forEach((eventName) => {
      session.on(eventName, (e) => console.info(eventName, e));
    });
  }

  useEffect(() => {
    sdk.on('sessionStarted', async (session: VideoMediaSession) => {
      if (session.sessionType === 'collaborateVideo') {
        setSession(session);
        logRelevantSessionEvents(session);
        sdk.acceptSession({
          conversationId: session.conversationId,
          audioElement: audioRef.current,
          videoElement: videoRef.current,
          // mediaStream: stream,
        });
      }
    });
  }, []);

  const placeCall = () => {
    if (!stream) {
      return;
    }
    return (
      <>
        <GuxButton
          accent="primary"
          className="video-btn"
          type="submit"
          onClick={startVideoConf}
        >
          Place call
        </GuxButton>
      </>
    );
  }

  return (
    <>
      <Card className="video-card">
        <h2>Video</h2>
        <div>
          <input
            value={roomJid}
            onChange={(e) => setRoomJid(e.target.value)}
          />
          {placeCall()}
          <GuxButton
            onClick={startMediaVideo}
          >
            Start Your Media
          </GuxButton>
          <GuxButton
            onClick={() => {
              if (!session?.conversationId) {
                return;
              }
              sdk.setVideoMute({conversationId: session.conversationId, mute: !isVideoMuted});
              setIsVideoMuted(prev => !prev);
            }}
          >
            🎥 {isVideoMuted ? 'Unmute' : 'Mute'} video
          </GuxButton>
          <GuxButton
            onClick={() => {
              if (!session?.conversationId) {
                return;
              }
              sdk.setAudioMute({conversationId: session.conversationId, mute: !isAudioMuted});
              setIsAudioMuted(prev => !prev);
            }}
          >
            🔉 {isAudioMuted ? 'Unmute' : 'Mute'} audio
          </GuxButton>
          <GuxButton
            onClick={() => {
              sdk.updateDefaultResolution({width: 1920, height: 1080}, true);
            }}
          >
            Update res
          </GuxButton>
          <GuxButton
            onClick={() => {
              if (!session?.conversationId) {
                return;
              }
              sdk.endSession({conversationId: session.conversationId});
            }}
          >
            End
          </GuxButton>
          <GuxButton
            onClick={() => {
              if (!session?.startScreenShare) {
                return;
              }
              session.startScreenShare();
            }}
          >
            Screen Share
          </GuxButton>
          <div style={{display: "flex", textAlign: 'center'}}>
            <audio ref={audioRef} autoPlay/>
            <div>
              <p>Theirs</p>
              <video ref={videoRef} autoPlay playsInline
                     style={{
                       width: '200px',
                       height: '150px',
                       border: '1px solid black',
                       borderStyle: 'dashed'
                     }}
              />
            </div>
            <div>
              <p>Yours</p>
              <video ref={vanityVideoRef} autoPlay playsInline
                     style={{
                       width: '200px',
                       height: '150px',
                       border: '1px solid black',
                       borderStyle: 'dashed'
                     }}
              />
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
