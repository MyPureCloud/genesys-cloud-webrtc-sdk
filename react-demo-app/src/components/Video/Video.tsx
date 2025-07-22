import Card from "../Card.tsx";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { GuxButton } from "genesys-spark-components-react";
import { SessionEvents } from 'genesys-cloud-streaming-client';
import { MemberStatusMessage } from 'genesys-cloud-webrtc-sdk';
import './Video.css';

import { IExtendedMediaSession, VideoMediaSession } from "../../../../src";
import {
  addVideoConversationToActive,
  addParticipantUpdateToVideoConversation,
  removeVideoConversationFromActive,
  updateConversationMediaStreams, setActiveParticipants, setUsersTalking,
} from "../../features/videoConversationsSlice.ts";
import ActiveVideoConversationsTable from "./ActiveVideoConversationsTable.tsx";
import useSdk from "../../hooks/useSdk.ts";
import VideoElements from "./VideoElements.tsx";

export default function Video() {
  const [roomJid, setRoomJid] = useState("2@conference.com");
  const roomJidRef = useRef(roomJid);
  roomJidRef.current = roomJid;
  const memberStatusUpdateRef = useRef<{
    roomJid: string,
    memberStatusMessage: MemberStatusMessage
  }>();
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
  const [error, setError] = useState();

  useEffect(() => {
    const callback = async (session: VideoMediaSession) => {
      if (session.sessionType === 'collaborateVideo') {
        setupSessionLogging(session);

        const localMediaStream = await startMedia({video: true, audio: true});

        if (audioRef.current && videoRef.current) {
          acceptSession({
            conversationId: session.conversationId,
            audioElement: audioRef.current, // where the remote audio will play
            videoElement: videoRef.current, // where the remote video will show (for everybody)
            mediaStream: localMediaStream // our stream (audio and video)
          });
        }

        // Save the conversation in the Store
        dispatch(addVideoConversationToActive({
          session: session,
          conversationId: session.conversationId,
        }));

        // Setup Vanity Video
        if (session?._outboundStream) {
          dispatch(updateConversationMediaStreams({
            conversationId: session.conversationId,
            outboundStream: session._outboundStream,
          }));
        }

        setupSessionListenersForVideo(session);
      }
    }
    sessionStarted(callback);
    return () => {
      removeSessionStarted();
    }
  }, []);

  function setupSessionLogging(session: IExtendedMediaSession) {
    const sessionEventsToLog: Array<keyof SessionEvents> = ['participantsUpdate', 'activeVideoParticipantsUpdate', 'speakersUpdate'];
    sessionEventsToLog.forEach((eventName) => {
      session.on(eventName, (e) => console.info(eventName, e));
    });
  }

  function setupSessionListenersForVideo(session: VideoMediaSession) {
    // Save the incoming media stream to allow switching between conversations
    session.on('incomingMedia', () => {
      if (session.pc.getReceivers) {
        const receivers = session.pc.getReceivers();
        const inboundTracks = receivers
          .map(receiver => receiver.track)
          .filter(track => track);
        if (inboundTracks.length > 0) {
          const inboundStream = new MediaStream(inboundTracks);
          dispatch(updateConversationMediaStreams({
            conversationId: session.conversationId,
            inboundStream: inboundStream,
          }));
        }
      }
    });

    // Used for mute/unmute, screen share
    session.on('participantsUpdate', partsUpdate => {
      dispatch(addParticipantUpdateToVideoConversation(partsUpdate));
    });

    // Remove conversation from store
    session.on('terminated', reason => {
      dispatch(removeVideoConversationFromActive({conversationId: session.conversationId, reason: reason}));
    });

    session.on('memberStatusUpdate', (memberStatusMessage: MemberStatusMessage) => updateStuff(roomJidRef.current, memberStatusMessage, session.conversationId, session.fromUserId));
  }

  const updateStuff = (currentRoomJid: string, memberStatusMessage: MemberStatusMessage, convId: string, userId: string) => {
    const lastUpdateParams = memberStatusUpdateRef.current?.memberStatusMessage?.params || {};
    const mergedUpdateParams = {...lastUpdateParams, ...memberStatusMessage.params}
    const mergedUpdate = {...memberStatusMessage, params: mergedUpdateParams}

    if (memberStatusMessage?.params?.incomingStreams) {
      const userIds = memberStatusMessage.params.incomingStreams.map(stream => {
        const appId = stream.appId || stream.appid;
        return {userId: appId?.sourceUserId}
      });
      dispatch(setActiveParticipants({
        conversationId: convId,
        activeParticipants: userIds
      }));
    }

    if (memberStatusMessage?.params?.speakers) {
      const usersTalking = memberStatusMessage.params.speakers.reduce((acc, current) => {
        return {...acc, [current.appId.sourceUserId]: current.activity === 'speaking'}
      }, {});
      console.table(usersTalking)
      dispatch(setUsersTalking({
        conversationId: convId,
        usersTalking
      }));
    }

    memberStatusUpdateRef.current = {
      roomJid: currentRoomJid,
      memberStatusMessage: mergedUpdate
    };
  };

  async function startConv(callback: (arg0: string) => Promise<{conversationId: string}>) {
    try {
      await callback(roomJid);
      setError(undefined);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <Card className="video-container">
      <h2 className="gux-heading-lg-semibold">Video</h2>
      <div className="first-row">
        <Card className="video-call-card">
          <h3>Place Video Call</h3>
          <div className="join-video-inputs">
            <form>
              <input
                value={roomJid}
                onChange={(e) => setRoomJid(e.target.value)}
              />
            </form>
            <GuxButton
              accent="primary"
              className="video-call-btn"
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
