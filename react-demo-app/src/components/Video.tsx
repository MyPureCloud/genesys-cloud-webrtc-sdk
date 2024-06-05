import { useState, useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setElements } from "../features/videoSlice";
import "./Video.css";
import { GuxButton, GuxCard } from "genesys-spark-components-react";
import useEventListners from "../hooks/useEventListeners";

export default function Video() {
  const sdk = (window as any).sdk;
  const [roomJid, setRoomJid] = useState("");
  const [userJid, setUserJid] = useState("");
  const videoRef = useRef(null);
  const localVideoRef = useRef(null);
  const audioRef = useRef(null);
  const dispatch = useDispatch();
  const activeSession = useSelector(
    (state) => state.video.activeSession
  );
  useEventListners();


  useEffect(() => {
    dispatch(setElements({ audio: audioRef.current, video: videoRef.current, localVideo: localVideoRef.current }));
  }, [dispatch]);

  function startOrJoinVideoConference(): void {
    console.warn("test", roomJid, userJid);
    if (!roomJid) {
      alert("Enter a roomjid or userjid start a video conference.");
    }

    sdk.startVideoConference(roomJid);
  }

  function endConference(): void {
    if (!activeSession) {
      alert("No active conference to end.");
    }
    const conversationId = activeSession.conversationId;
    sdk.endSession({ conversationId });
  }
  return (
    <div className="video-panel-wrapper">
      <GuxCard>
        <div className="video-card">
          <label className="gux-body-md-bold">Room Jid:</label>
          <input
            className="video-jid-input"
            type="text"
            onChange={(e) => setRoomJid(e.target.value)}
          />
        </div>
        <div className="video-card">
          <label className="gux-body-md-bold">User Jid:</label>
          <input
            className="video-jid-input"
            type="text"
            onChange={(e) => setUserJid(e.target.value)}
          />
        </div>
        <GuxButton accent="primary" onClick={startOrJoinVideoConference}>
          Start
        </GuxButton>
        <GuxButton accent="danger" onClick={endConference}>
          End
        </GuxButton>
      </GuxCard>
      <div className="video-player">
        <GuxCard>
          <div className="video-card">
            <h4>Local View</h4>
            <video ref={localVideoRef} id="self-view"></video>
          </div>
        </GuxCard>
        <GuxCard>
          <div className="video-card">
            <h4>Conference</h4>
            <audio ref={audioRef} id="conference-audio"></audio>
            <video ref={videoRef} id="conference-view"></video>
          </div>
        </GuxCard>
      </div>
    </div>
  );
}