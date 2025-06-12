import Card from "./Card.tsx";
import {useEffect, useRef, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import {GuxButton} from "genesys-spark-components-react";
import {SessionEvents} from 'genesys-cloud-streaming-client';
import './Video.css';

import {IExtendedMediaSession, VideoMediaSession} from "../../../src";
import {
  addVideoConversationToActive,
  addParticipantUpdateToVideoConversation,
  reasignToTriggerRepaint,
  removeVideoConversationFromActive,
} from "../features/conversationsSlice.ts";
import ActiveVideoConversationsTable from "./ActiveVideoConversationsTable.tsx";

export default function Video() {
  const [roomJid, setRoomJid] = useState("2@conference.com");
  const [sessionState, setSessionState] = useState<VideoMediaSession>();
  const sdk = useSelector(state => state.sdk.sdk);
  const dispatch = useDispatch();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const vanityVideoRef = useRef<HTMLVideoElement>(null);
  const [incomingStreamIsActive, setIsIncomingStreamActive] = useState(false);
  const [outgoingStreamIsActive, setIsOutgoingStreamActive] = useState(false);

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

  function logRelevantSessionEvents(session: IExtendedMediaSession) {
    const sessionEventsToLog: Array<keyof SessionEvents> = ['participantsUpdate', 'activeVideoParticipantsUpdate', 'speakersUpdate'];
    sessionEventsToLog.forEach((eventName) => {
      session.on(eventName, (e) => console.info(eventName, e));
    });
  }

  function setupSessionListenersForVideo(session: VideoMediaSession) {
    session.on('incomingMedia', () => {
      setIsIncomingStreamActive(true);
      if (vanityVideoRef.current && session?._outboundStream) {
        vanityVideoRef.current.srcObject = session._outboundStream;
      }
    });

    session.on('sessionState', () => {
      dispatch(reasignToTriggerRepaint());
    });

    session.on('connectionState', () => {
      dispatch(reasignToTriggerRepaint());
    });

    session.on('participantsUpdate', partsUpdate => {
      console.log('1participantsUpdate', partsUpdate);
      dispatch(addParticipantUpdateToVideoConversation(partsUpdate));
      setIsIncomingStreamActive(partsUpdate.activeParticipants.length < 2 ? false :
        !partsUpdate.activeParticipants.find(part => session.fromUserId !== part.userId)?.videoMuted);
      setIsOutgoingStreamActive(
        !partsUpdate.activeParticipants.find(part => session.fromUserId === part.userId)?.videoMuted);
    });

    session.on('terminated', reason => {
      setIsIncomingStreamActive(false);
      setIsOutgoingStreamActive(false);
      dispatch(removeVideoConversationFromActive({conversationId: session.conversationId, reason: reason}));
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

        dispatch(addVideoConversationToActive({
          session: session, conversationId: session.conversationId
        }));

        setupSessionListenersForVideo(session);
      }
    });
  }, []);

  return (
    <>
      <Card className="video-card">
        <h2>Video</h2>
        <div className="buttons-and-video-container">
          <input
            value={roomJid}
            onChange={(e) => setRoomJid(e.target.value)}
            className="conference-input"
          />
          <div className="place-conference">
            <GuxButton
              accent="primary"
              onClick={startVideoConf}
            >
              Place Conference
            </GuxButton>
            <GuxButton
              accent="primary"
              onClick={startVideoMeeting}
            >
              Place Meeting
            </GuxButton>
            <GuxButton
              onClick={startScreenShare}
            >
              Screen Share
            </GuxButton>
          </div>
          <div className="video-container-container">
            <audio ref={audioRef} autoPlay/>
            <div>
              <p>Theirs</p>
              <div className="video-container">
                <video ref={videoRef} autoPlay playsInline
                       style={{visibility: incomingStreamIsActive ? 'visible' : 'hidden'}}
                />
              </div>
            </div>
            <div>
              <p>Yours</p>
              <div className='video-container'>
                <video ref={vanityVideoRef} autoPlay playsInline
                       style={{visibility: outgoingStreamIsActive ? 'visible' : 'hidden'}}
                />
              </div>
            </div>
          </div>
        </div>
        <ActiveVideoConversationsTable></ActiveVideoConversationsTable>
      </Card>
    </>
  );
}
