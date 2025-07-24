import Card from "../Card.tsx";
import { RefObject, useEffect } from "react";
import {
  IVideoConversationsState
} from "../../features/videoConversationsSlice.ts";
import { useSelector } from "react-redux";
import { RootState } from "../../store.ts";
import './VideoElements.css'
import VideoElement from "./VideoElement.tsx";

export default function VideoElements({
                                        audioRef,
                                        videoRef,
                                        vanityVideoRef,
                                      }: {
  audioRef: RefObject<HTMLAudioElement>,
  videoRef: RefObject<HTMLVideoElement>,
  vanityVideoRef: RefObject<HTMLVideoElement>,
}) {
  const videoConversations: IVideoConversationsState = useSelector(
    (state: RootState) => state.videoConversations
  );

  const activeVideoConvs = videoConversations.activeVideoConversations;
  const activeVideoConv = activeVideoConvs
      .find(conv => conv.conversationId === videoConversations.currentlyDisplayedConversationId)
    || activeVideoConvs[activeVideoConvs.length - 1];

  const localUserId = activeVideoConv?.session?.fromUserId;
  const activeParts = activeVideoConv?.participantsUpdate?.activeParticipants;
  const localParticipant = activeParts?.find(p => p.userId === localUserId);

  useEffect(() => {
    if (!activeVideoConv) return;

    const inboundChanged = activeVideoConv.inboundStream !== videoRef.current?.srcObject;
    if (inboundChanged && videoRef.current && activeVideoConv.inboundStream) {
      videoRef.current.srcObject = activeVideoConv.inboundStream;
    }

    if (vanityVideoRef.current) {
      const isScreenSharing = localParticipant?.sharingScreen;
      const targetStream = isScreenSharing
        ? activeVideoConv.screenOutboundStream
        : activeVideoConv.outboundStream;

      const outboundChanged = targetStream !== vanityVideoRef.current?.srcObject;
      if (outboundChanged && targetStream) {
        vanityVideoRef.current.srcObject = targetStream;
      }
    }
  }, [
    activeVideoConv?.inboundStream, activeVideoConv?.outboundStream, activeVideoConv?.screenOutboundStream,
    localParticipant?.sharingScreen, videoRef, vanityVideoRef]);

  const participantIdOnScreen = activeVideoConv?.activeParticipants?.[0];

  if (activeVideoConv) {
    const inboundChanged = activeVideoConv.inboundStream !== videoRef.current?.srcObject;
    if (inboundChanged && videoRef.current && activeVideoConv.inboundStream) {
      videoRef.current.srcObject = activeVideoConv.inboundStream;
    }
    if (vanityVideoRef.current) {
      const screenSharedChanged = activeVideoConv.screenOutboundStream !== vanityVideoRef.current?.srcObject;
      const outboundChanged = activeVideoConv.outboundStream !== vanityVideoRef.current?.srcObject;
      if (screenSharedChanged && activeVideoConv.screenOutboundStream && localParticipant?.sharingScreen) {
        vanityVideoRef.current.srcObject = activeVideoConv.screenOutboundStream;
      }
      if (outboundChanged && activeVideoConv.outboundStream && !localParticipant?.sharingScreen) {
        vanityVideoRef.current.srcObject = activeVideoConv.outboundStream;
      }
    }
  }

  return (
    <Card className="video-elements-card">
      <audio ref={audioRef} autoPlay/>
      <div className="video-sections-container">
        <VideoElement videoRef={videoRef} userId={participantIdOnScreen}/>
        <VideoElement videoRef={vanityVideoRef} userId={localUserId}/>
      </div>
    </Card>
  );
}
