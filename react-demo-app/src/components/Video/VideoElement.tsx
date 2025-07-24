import { RefObject } from "react";
import { IActiveVideoConversationsState, IVideoConversationsState } from "../../features/videoConversationsSlice.ts";
import { useSelector } from "react-redux";
import './VideoElement.css'
import { RootState } from "../../store.ts";

export default function VideoElement({ videoRef, userId }: {
  videoRef: RefObject<HTMLVideoElement>,
  userId: string | undefined
}) {
  const SVG_LINK = "https://dhqbrvplips7x.cloudfront.net/volt/1.12.1-178/assets/default-person.svg"
  const videoConversations: IVideoConversationsState = useSelector((state: RootState) => state.videoConversations);

  const activeVideoConv: IActiveVideoConversationsState = videoConversations.activeVideoConversations.find(
    conv => conv.conversationId === videoConversations.currentlyDisplayedConversationId)
    || videoConversations.activeVideoConversations[videoConversations.activeVideoConversations.length - 1];
  const videoVisible = activeVideoConv?.session?.connectionState === 'connected' && activeVideoConv?.session?.state === 'active';

  function isUserTalking(userId: string): boolean {
    return !!activeVideoConv?.usersTalking?.[userId];
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

  return (
    <div className={"video-section"}>
      <h4>Title here</h4>
      <div className={isUserTalking(userId || '') ? "border active-border" : "border inactive-border"}>
        <div className="video-element-container">
          <div style={{ visibility: videoVisible ? 'visible' : 'hidden' }}>
            <video ref={videoRef} autoPlay playsInline/>
            {showSvg() && <div className="logo-container">
              <img src={SVG_LINK}/>
            </div>}
            {showWaitingForOthers() && <div className="logo-container waiting-for-others">
              <h3>Waiting for others to connect...</h3>
            </div>}
          </div>
        </div>
      </div>
      {videoVisible && userId && <h4>User id: {userId}</h4>}
    </div>
  );
}
