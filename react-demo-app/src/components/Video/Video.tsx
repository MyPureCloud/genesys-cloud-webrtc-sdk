import Card from "../Card.tsx";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { GuxButton } from "genesys-spark-components-react";
import { SessionEvents } from 'genesys-cloud-streaming-client';
import './Video.css';

import { IExtendedMediaSession, VideoMediaSession } from "../../../../src";
import {
  addVideoConversationToActive,
  addParticipantUpdateToVideoConversation,
  forceVideoConversationUpdate,
  removeVideoConversationFromActive,
  IActiveVideoConversationsState,
  updateConversationMediaStreams,
} from "../../features/conversationsSlice.ts";
import ActiveVideoConversationsTable from "./ActiveVideoConversationsTable.tsx";
import useSdk from "../../hooks/useSdk.ts";
import VideoElements from "./VideoElements.tsx";

export default function Video() {
  const [roomJid, setRoomJid] = useState("2@conference.com");
  const [sessionState, setSessionState] = useState<VideoMediaSession>();
  const {
    startVideoConference,
    startVideoMeeting,
    startMedia,
    acceptSession,
    sessionStarted,
    removeSessionStarted
  } = useSdk();
  const dispatch = useDispatch();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const vanityVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const callback = async (session: VideoMediaSession) => {
      if (session.sessionType === 'collaborateVideo') {
        setSessionState(session);
        logRelevantSessionEvents(session);

        const mediaStream = await startMedia({video: true, audio: false});

        if (audioRef.current && videoRef.current) {
          acceptSession({
            conversationId: session.conversationId,
            audioElement: audioRef.current,
            videoElement: videoRef.current,
            mediaStream
          });
        }

        dispatch(addVideoConversationToActive({
          session: session,
          conversationId: session.conversationId,
        }));

        setupSessionListenersForVideo(session);
      }
    }
    sessionStarted(callback);
    return () => {
      removeSessionStarted();
    }
  }, []);

  function startScreenShare() {
    if (!sessionState?.startScreenShare) {
      return;
    }
    sessionState.startScreenShare();
  }

  function logRelevantSessionEvents(session: IExtendedMediaSession) {
    const sessionEventsToLog: Array<keyof SessionEvents> = ['participantsUpdate', 'activeVideoParticipantsUpdate', 'speakersUpdate'];
    sessionEventsToLog.forEach((eventName) => {
      session.on(eventName, (e) => console.info(eventName, e));
    });
  }

  function setupSessionListenersForVideo(session: VideoMediaSession) {

    session.on('incomingMedia', () => {
      if (session.pc && session.pc.getReceivers) {
        const receivers = session.pc.getReceivers();
        const inboundTracks = receivers.map(receiver => receiver.track).filter(track => track);
        if (inboundTracks.length > 0) {
          const inboundStream = new MediaStream(inboundTracks);
          dispatch(updateConversationMediaStreams({
            conversationId: session.conversationId,
            inboundStream: inboundStream,
          }));
        }
      }

      if (session?._outboundStream) {
        dispatch(updateConversationMediaStreams({
          conversationId: session.conversationId,
          outboundStream: session._outboundStream,
        }));
      }
    });

    session.on('participantsUpdate', partsUpdate => {
      dispatch(addParticipantUpdateToVideoConversation(partsUpdate));
    });

    session.on('terminated', reason => {
      dispatch(removeVideoConversationFromActive({conversationId: session.conversationId, reason: reason}));
    });
  }

  return (
    <>
      <Card className="video-card">
        <h2 className="gux-heading-lg-semibold">Video</h2>
        <div className="video-container">
          <Card className="softphone-call-card">
            <h3>Place Video Call</h3>
            <form>
              <input
                value={roomJid}
                onChange={(e) => setRoomJid(e.target.value)}
                className="conference-input"
              />
            </form>
            <GuxButton
              accent="primary"
              onClick={() => startVideoConference(roomJid)}
            >
              Join with roomJid
            </GuxButton>
            <GuxButton
              accent="primary"
              onClick={() => startVideoMeeting(roomJid)}
            >
              Join with conferenceId
            </GuxButton>
            <GuxButton
              onClick={startScreenShare}
            >
              Screen Share
            </GuxButton>
          </Card>
          <VideoElements audioRef={audioRef} videoRef={videoRef}
                         vanityVideoRef={vanityVideoRef}
          ></VideoElements>
          <ActiveVideoConversationsTable></ActiveVideoConversationsTable>
        </div>
      </Card>
    </>
  );
}
