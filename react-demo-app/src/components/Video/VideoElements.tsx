import Card from "../Card.tsx";
import { RefObject, useEffect } from "react";
import {
  IVideoConversationsState
} from "../../features/videoConversationsSlice.ts";
import { useSelector } from "react-redux";
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
    (state: unknown) => state.videoConversations
  );

  const activeVideoConvs = videoConversations.activeVideoConversations;
  const activeVideoConv = activeVideoConvs
      .find(conv => conv.conversationId === videoConversations.currentlyDisplayedConversationId)
    || activeVideoConvs[activeVideoConvs.length - 1];

  const localUserId = activeVideoConv?.session?.fromUserId;
  const activeParts = activeVideoConv?.participantsUpdate?.activeParticipants;
  const localParticipant = activeParts?.find(p => p.userId === localUserId);
  const remoteParticipants = activeParts?.filter(p => p.userId !== localUserId);
  const localVideoVisible = localParticipant && !localParticipant?.videoMuted || localParticipant?.sharingScreen;


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
    activeVideoConv?.inboundStream,
    activeVideoConv?.outboundStream,
    activeVideoConv?.screenOutboundStream,
    localParticipant?.sharingScreen,
    videoRef,
    vanityVideoRef
  ]);

  const participantIdOnScreen = activeVideoConv?.activeParticipants?.[0];

  function shouldShowLogo() {
    const participantOnScreenId = participantIdOnScreen;
    if (!participantOnScreenId) return false;
    return !!remoteParticipants
      ?.find(p => p.userId === participantOnScreenId)?.videoMuted;
  }

  function isRemoteUserOnScreenTalking(): boolean {
    return !!participantIdOnScreen && isUserTalking(participantIdOnScreen);
  }

  function isLocalUserTalking(): boolean {
    return isUserTalking(localUserId);
  }

  function isUserTalking(userId: string): boolean {
    return !!activeVideoConv?.usersTalking?.[userId];
  }

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

  const hideVideoElement = activeVideoConv?.session?.connectionState === 'connected' && activeVideoConv?.session?.state === 'active';

  return (
    <Card className="video-elements-card">
      <audio ref={audioRef} autoPlay/>
      <div className="video-sections-container">
        <VideoElement showSvg={shouldShowLogo()} showWaitingForOthers={!remoteParticipants?.length && !!activeVideoConv}
                      talking={isRemoteUserOnScreenTalking()} videoRef={videoRef}
                      videoVisible={hideVideoElement} userId={participantIdOnScreen}/>
        <VideoElement showSvg={!localVideoVisible} showWaitingForOthers={false} talking={isLocalUserTalking()}
                      userId={localUserId}
                      videoRef={vanityVideoRef}
                      videoVisible={hideVideoElement}/>
      </div>
    </Card>
  );
}
