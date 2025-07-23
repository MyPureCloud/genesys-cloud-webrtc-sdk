import Card from "../Card.tsx";
import { useRef } from "react";
import { GuxButton } from "genesys-spark-components-react";
import './Video.css';

import ActiveVideoConversationsTable from "./ActiveVideoConversationsTable.tsx";
import useSdk from "../../hooks/useSdk.ts";
import VideoElements from "./VideoElements.tsx";
import useVideoForm from "../../hooks/useVideoForm.ts";
import useVideoSession from "../../hooks/useVideoSession.ts";

export default function Video() {
  const { startVideoConference, startVideoMeeting } = useSdk();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const vanityVideoRef = useRef<HTMLVideoElement>(null);

  const { roomJid, setRoomJid, error, startConv } = useVideoForm();

  useVideoSession({ audioRef, videoRef, roomJid });

  return (
    <Card className="video-container">
      <h2 className="gux-heading-lg-semibold">Video</h2>
      <div className="first-row">
        <Card className="video-call-card">
          <h3>Place Video Call</h3>
          <div className="join-video-inputs">
            <form onSubmit={(e) => startConv(startVideoConference, e)}>
              <input
                type="text"
                slot="input"
                value={roomJid}
                onChange={(e) => setRoomJid(e.target.value)}
              />
            </form>
            <GuxButton
              accent="primary"
              className="video-call-btn"
              type="submit"
              onClick={() => startConv(startVideoConference)}
            >
              Join with roomJid
            </GuxButton>
            <GuxButton
              accent="primary"
              className="video-call-btn"
              onClick={() => startConv(startVideoMeeting)}
            >
              Join with conferenceId
            </GuxButton>
          </div>
        </Card>
        <ActiveVideoConversationsTable/>
      </div>
      {!!error && <h3 className="error-message">Error: {error}</h3>}
      <VideoElements audioRef={audioRef} videoRef={videoRef} vanityVideoRef={vanityVideoRef}/>
    </Card>
  );
}
