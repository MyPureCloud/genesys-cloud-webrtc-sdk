import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { IExtendedMediaSession, MemberStatusMessage, VideoMediaSession } from 'genesys-cloud-webrtc-sdk';
import useSdk from "./useSdk";
import { SessionEvents } from "genesys-cloud-streaming-client";
import {
  addParticipantUpdateToVideoConversation,
  addVideoConversationToActive,
  removeVideoConversationFromActive,
  setActiveParticipants,
  setUsersTalking,
  updateConversationMediaStreams
} from "../features/videoConversationsSlice";

interface UseVideoSessionProps {
  audioRef: React.RefObject<HTMLAudioElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  roomJid: string;
}

export default function useVideoSession({ audioRef, videoRef, roomJid }: UseVideoSessionProps) {
  const dispatch = useDispatch();
  const { startMedia, acceptSession, sessionStarted, removeSessionStarted } = useSdk();

  const roomJidRef = useRef(roomJid);
  roomJidRef.current = roomJid;

  const memberStatusUpdateRef = useRef<{ roomJid: string, memberStatusMessage: MemberStatusMessage }>();

  const setupSessionLogging = (session: IExtendedMediaSession) => {
    const sessionEventsToLog: Array<keyof SessionEvents> = ['participantsUpdate', 'activeVideoParticipantsUpdate', 'speakersUpdate'];
    sessionEventsToLog.forEach((eventName) => {
      session.on(eventName, (e) => console.info(eventName, e));
    })
  }

  const updateMemberStatus = (currentRoomJid: string, memberStatusMessage: MemberStatusMessage, convId: string) => {
    const lastUpdateParams = memberStatusUpdateRef.current?.memberStatusMessage?.params || {};
    const mergedUpdateParams = { ...lastUpdateParams, ...memberStatusMessage.params }
    const mergedUpdate = { ...memberStatusMessage, params: mergedUpdateParams }

    if (memberStatusMessage?.params?.incomingStreams) {
      const userIds = memberStatusMessage.params.incomingStreams.map(stream => {
        const appId = stream.appId || stream.appid;
        return { userId: appId?.sourceUserId }
      });
      dispatch(setActiveParticipants({
        conversationId: convId,
        activeParticipants: userIds
      }));
    }

    if (memberStatusMessage?.params?.speakers) {
      const usersTalking = memberStatusMessage.params.speakers.reduce((acc, current) => {
        return { ...acc, [current.appId.sourceUserId]: current.activity === 'speaking' }
      }, {});
      dispatch(setUsersTalking({
        conversationId: convId,
        usersTalking
      }));
    }

    memberStatusUpdateRef.current = {
      roomJid: currentRoomJid,
      memberStatusMessage: mergedUpdate
    };
  }

  const setupSessionListeners = (session: VideoMediaSession) => {
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
      dispatch(removeVideoConversationFromActive({ conversationId: session.conversationId, reason: reason }));
    });

    session.on('memberStatusUpdate', (memberStatusMessage: MemberStatusMessage) => updateMemberStatus(roomJidRef.current, memberStatusMessage, session.conversationId));
  }

  useEffect(() => {
    const handleSessionStart = async (session: VideoMediaSession) => {
      if (session.sessionType === 'collaborateVideo') {
        setupSessionLogging(session);

        const localMediaStream = await startMedia({ video: true, audio: true });

        if (audioRef.current && videoRef.current) {
          acceptSession({
            conversationId: session.conversationId,
            audioElement: audioRef.current,
            videoElement: videoRef.current,
            mediaStream: localMediaStream
          })
        }

        dispatch(addVideoConversationToActive({
          session: session,
          conversationId: session.conversationId,
        }));

        if (session?._outboundStream) {
          dispatch(updateConversationMediaStreams({
            conversationId: session.conversationId,
            outboundStream: session._outboundStream,
          }));
        }

        setupSessionListeners(session);
      }
    }

    sessionStarted(handleSessionStart);
    return () => removeSessionStarted();
  }, [audioRef, videoRef, startMedia, acceptSession, sessionStarted, removeSessionStarted, dispatch]);
}
