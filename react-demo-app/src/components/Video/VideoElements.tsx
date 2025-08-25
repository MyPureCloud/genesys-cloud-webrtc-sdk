import Card from "../Card.tsx";
import { RefObject, useEffect } from "react";
import {
  IVideoConversationsState
} from "../../features/videoConversationsSlice.ts";
import { useSelector } from "react-redux";
import { RootState } from "../../store.ts";
import './VideoElements.css'
import VideoElement from "./VideoElement.tsx";
import useSdk from "../../hooks/useSdk.ts";

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
  const { getSession } = useSdk();

  const activeVideoConvs = videoConversations.activeVideoConversations;
  const activeVideoConv = activeVideoConvs
    .find(conv => conv.conversationId === videoConversations.currentlyDisplayedConversationId);

  const session = activeVideoConv?.conversationId ? getSession(activeVideoConv.conversationId) : undefined;
  const localUserId = session?.fromUserId;
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
  }, [activeVideoConv?.inboundStream, activeVideoConv?.outboundStream, activeVideoConv?.screenOutboundStream,
    localParticipant?.sharingScreen, videoRef, vanityVideoRef]);

  // const participantIdOnScreen = activeVideoConv?.activeParticipants?.[0];
  const participantIdOnScreen = activeVideoConv?.participantsUpdate?.activeParticipants?.[0]?.userId;

  const userId = (id: string | undefined) => {
    if (!id) return;
    if (session?.state !== 'active' ||
      session?.connectionState !== 'connected') return;
    return (
      <h4>User id: {id}</h4>
    );
  }

  return (
    <Card className="video-elements-card">
      <audio ref={audioRef} autoPlay/>
      <div className="video-sections-container">
        <div className={"video-section"}>
          <h4>Remote Video</h4>
          <VideoElement videoRef={videoRef} userId={participantIdOnScreen}/>
          {userId(participantIdOnScreen)}
        </div>
        <div className={"video-section"}>
          <h4>Local Video</h4>
          <VideoElement videoRef={vanityVideoRef} userId={localUserId}/>
          {userId(localUserId)}
        </div>
      </div>
    </Card>
  );
}
