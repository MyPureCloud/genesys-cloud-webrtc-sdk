import { RefObject } from "react";
import { IActiveVideoConversationState, IVideoConversationsState } from "../../features/videoConversationsSlice.ts";
import { useSelector } from "react-redux";
import './VideoElement.css'
import { RootState } from "../../types/store.ts";
import { GuxIcon } from "genesys-spark-components-react";
import useSdk from "../../hooks/useSdk.ts";

export default function VideoElement({ videoRef, userId, videoElementId }: {
  videoRef: RefObject<HTMLVideoElement>,
  userId: string | undefined,
  videoElementId?: string
}) {
  const videoConversations: IVideoConversationsState = useSelector((state: RootState) => state.videoConversations);
  const { getSession } = useSdk();

  const activeVideoConv: IActiveVideoConversationState | undefined = videoConversations.activeVideoConversations.find(
    conv => conv.conversationId === videoConversations.currentlyDisplayedConversationId);
  const session = activeVideoConv ? getSession(activeVideoConv?.conversationId) : undefined;
  const activeVideoCall = session?.connectionState === 'connected' && session?.state === 'active';

  function isUserTalking(): boolean {
    return !!userId && !!activeVideoConv?.usersTalking?.[userId];
  }

  function showSvg() {
    if (userId === session?.fromUserId) {
      const localUser = activeVideoConv?.participantsUpdate?.activeParticipants
        .find(p => p.userId === session?.fromUserId);
      return localUser?.videoMuted && !localUser?.sharingScreen;
    } else {
      const participantIdOnScreen = activeVideoConv?.activeParticipant;
      const participant = activeVideoConv?.participantsUpdate?.activeParticipants
        .find(p => p.userId === participantIdOnScreen);
      return participant?.videoMuted && !participant?.sharingScreen;
    }
  }

  function showWaitingForOthers() {
    if (userId === session?.fromUserId) return false;

    const remoteParticipants = activeVideoConv?.participantsUpdate?.activeParticipants
      .filter(p => p.userId !== session?.fromUserId);

    return !remoteParticipants?.length && !!activeVideoConv
  }

  const cameraOffElement = () => {
    return showSvg() && activeVideoCall && (<div className="logo-container">
      <GuxIcon decorative iconName="fa/user-solid" size="large" className="gux-icon"/>
    </div>)
  }

  const waitingForOthersElement = () => {
    return showWaitingForOthers() && activeVideoCall && (
      <div className="logo-container waiting-for-others">
        <h3>Waiting for others to connect...</h3>
      </div>
    );
  }

  return (
    <div className={`border video-element-container ${isUserTalking() ? 'active-border ' : 'inactive-border'}`}>
      <video style={{ visibility: !activeVideoCall || showWaitingForOthers() || showSvg() ? 'hidden' : 'visible' }} id={videoElementId}
             ref={videoRef} autoPlay playsInline muted={true}/>
      {cameraOffElement()}
      {waitingForOthersElement()}
    </div>
  );
}
