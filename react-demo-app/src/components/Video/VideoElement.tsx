import { RefObject } from "react";
import { IActiveVideoConversationsState, IVideoConversationsState } from "../../features/videoConversationsSlice.ts";
import { useSelector } from "react-redux";
import './VideoElement.css'
import { RootState } from "../../store.ts";
import { GuxIcon } from "genesys-spark-components-react";

export default function VideoElement({ videoRef, userId }: {
  videoRef: RefObject<HTMLVideoElement>,
  userId: string | undefined
}) {
  const videoConversations: IVideoConversationsState = useSelector((state: RootState) => state.videoConversations);

  const activeVideoConv: IActiveVideoConversationsState | undefined = videoConversations.activeVideoConversations.find(
    conv => conv.conversationId === videoConversations.currentlyDisplayedConversationId);
  const activeVideoCall = activeVideoConv?.session.connectionState === 'connected' && activeVideoConv?.session.state === 'active';

  function isUserTalking(userId: string | undefined): boolean {
    return !!userId && !!activeVideoConv?.usersTalking?.[userId];
  }

  function showSvg() {
    if (userId === activeVideoConv?.session.fromUserId) {
      const localUser = activeVideoConv?.participantsUpdate?.activeParticipants
        ?.find(p => p.userId === activeVideoConv?.session.fromUserId);
      return localUser?.videoMuted && !localUser?.sharingScreen;
    } else {
      const participantIdOnScreen = activeVideoConv?.activeParticipants?.[0];
      const participant = activeVideoConv?.participantsUpdate?.activeParticipants
        ?.find(p => p.userId === participantIdOnScreen);
      return participant?.videoMuted && !participant?.sharingScreen;
    }
  }

  function showWaitingForOthers() {
    if (userId === activeVideoConv?.session.fromUserId) return false;

    const remoteParticipants = activeVideoConv?.participantsUpdate?.activeParticipants
      ?.filter(p => p.userId !== activeVideoConv?.session.fromUserId);

    return !remoteParticipants?.length && !!activeVideoConv
  }

  const cameraOffElement = () => {
    return showSvg() && (<div className="logo-container">
      <GuxIcon decorative iconName="fa/user-solid" size="large" className="gux-icon"/>
    </div>)
  }

  const waitingForOthersElement = () => {
    return showWaitingForOthers() && (
      <div className="logo-container waiting-for-others">
        <h3>Waiting for others to connect...</h3>
      </div>
    );
  }

  return activeVideoCall ? (
    <div className={`border ${isUserTalking(userId) ? 'active-border' : 'inactive-border'}`}>
      <div className="video-element-container">
        <video ref={videoRef} autoPlay playsInline/>
        {cameraOffElement()}
        {waitingForOthersElement()}
      </div>
    </div>
  ) : (<div className="border inactive-border">
    <div className=" video-element-container"/>
  </div>);
}
