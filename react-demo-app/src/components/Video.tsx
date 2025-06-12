import Card from "./Card.tsx";
import {useEffect, useRef, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import {GuxButton} from "genesys-spark-components-react";
import {SessionEvents} from 'genesys-cloud-streaming-client';

import {IExtendedMediaSession, VideoMediaSession} from "../../../src";
import {
  addConvToActive,
  addOwnParticipantData,
  updateActiveConv
} from "../features/conversationsSlice.ts";

export default function Video() {
  const [roomJid, setRoomJid] = useState("2@conference.com");
  const [stream, setStream] = useState();
  const [sessionState, setSessionState] = useState<VideoMediaSession>();
  const sdk = useSelector(state => state.sdk.sdk);
  const dispatch = useDispatch();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const vanityVideoRef = useRef<HTMLVideoElement>(null);

  function startVideoConf() {
    sdk.startVideoConference(roomJid);
  }

  function startVideoMeeting() {
    sdk.startVideoMeeting(roomJid);
  }

  function startScreenShare() {
    if (!sessionState?.startScreenShare) {
      return;
    }
    sessionState.startScreenShare();
  }

  async function startMedia() {
    return await sdk.media.startMedia({video: true});
  }

  async function startMediaVideo() {
    const stream = await startMedia();

    setStream(stream);

    if (vanityVideoRef.current) {
      vanityVideoRef.current.srcObject = stream;
    }
  }

  function logRelevantSessionEvents(session: IExtendedMediaSession) {
    const sessionEventsToLog: Array<keyof SessionEvents> = ['participantsUpdate', 'activeVideoParticipantsUpdate', 'speakersUpdate'];
    sessionEventsToLog.forEach((eventName) => {
      session.on(eventName, (e) => console.info(eventName, e));
    });
  }

  useEffect(() => {
    sdk.on('sessionStarted', async (session: VideoMediaSession) => {
      if (session.sessionType === 'collaborateVideo') {
        setSessionState(session);
        logRelevantSessionEvents(session);
        sdk.acceptSession({
          conversationId: session.conversationId,
          audioElement: audioRef.current,
          videoElement: videoRef.current,
        });

        dispatch(addConvToActive(session));

        session.on('incomingMedia', () => {
          if (vanityVideoRef.current && session?._outboundStream) {
            vanityVideoRef.current.srcObject = session._outboundStream;
          }
        });

        session.on('sessionState', seshState => {
          session.state = seshState;
          dispatch(updateActiveConv(session));
        });

        session.on('connectionState', connState => {
          session.connectionState = connState;
          dispatch(updateActiveConv(session));
        });

        session.on('participantsUpdate', partsUpdate => {
          dispatch(addOwnParticipantData(partsUpdate));
        });
      }
    });
  }, []);

  return (
    <>
      <Card className="video-card">
        <h2>Video</h2>
        <div>
          <input
            value={roomJid}
            onChange={(e) => setRoomJid(e.target.value)}
          />
          <GuxButton
            accent="primary"
            className="video-btn"
            type="submit"
            onClick={startVideoConf}
          >
            Place Conference
          </GuxButton>
          <GuxButton
            accent="primary"
            className="video-btn"
            type="submit"
            onClick={startVideoMeeting}
          >
            Place Meeting
          </GuxButton>
          <GuxButton
            onClick={startScreenShare}
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
