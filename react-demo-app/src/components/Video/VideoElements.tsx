import Card from "../Card.tsx";
import { RefObject, useEffect } from "react";
import {
  IActiveVideoConversationsState} from "../../features/videoConversationsSlice.ts";
import { useSelector } from "react-redux";
import './VideoElements.css'

export default function VideoElements({
                                        audioRef,
                                        videoRef,
                                        vanityVideoRef,
                                      }: {
  audioRef: RefObject<HTMLAudioElement>,
  videoRef: RefObject<HTMLVideoElement>,
  vanityVideoRef: RefObject<HTMLVideoElement>
}) {
  const videoConversations: IActiveVideoConversationsState[] = useSelector(
    (state: unknown) => state.videoConversations.activeVideoConversations
  );
  const currentlyDisplayedConversationId = useSelector(
    (state: unknown) => state.videoConversations.currentlyDisplayedConversationId
  );
  const activeVideoConv = videoConversations
    .find(conv => conv.conversationId === currentlyDisplayedConversationId)
    || videoConversations[videoConversations.length - 1];

  const localUserId = activeVideoConv?.session?.fromUserId;
  const activeParts = activeVideoConv?.participantsUpdate?.activeParticipants;
  const localParticipant = activeParts?.find(p => p.userId === localUserId);
  const remoteParticipant = activeParts?.find(p => p.userId !== localUserId);
  const localVideoVisible = localParticipant && !localParticipant?.videoMuted || localParticipant?.sharingScreen;
  const remoteVideoVisible = remoteParticipant && !remoteParticipant?.videoMuted;

  useEffect(() => {
    if (activeVideoConv) {
      if (videoRef.current && activeVideoConv.inboundStream && videoRef.current.srcObject !== activeVideoConv.inboundStream) {
        videoRef.current.srcObject = activeVideoConv.inboundStream;
      }
      if (vanityVideoRef.current && activeVideoConv.screenOutboundStream && localParticipant?.sharingScreen && vanityVideoRef.current.srcObject !== activeVideoConv.screenOutboundStream) {
        vanityVideoRef.current.srcObject = activeVideoConv.screenOutboundStream;
      }
      if (vanityVideoRef.current && !localParticipant?.sharingScreen &&  activeVideoConv.outboundStream && vanityVideoRef.current.srcObject !== activeVideoConv.outboundStream) {
        vanityVideoRef.current.srcObject = activeVideoConv.outboundStream;
      }
    }
  }, [activeVideoConv, videoRef, vanityVideoRef]);

  return (
    <Card className="video-elements-card">
      <audio ref={audioRef} autoPlay/>
      <div className="video-sections-container">
        <div className="video-section">
          <h4>Remote Video</h4>
          <div className="video-element-container">
            <video ref={videoRef} autoPlay playsInline
                   style={{visibility: remoteVideoVisible ? 'visible' : 'hidden'}}
            />
          </div>
        </div>
        <div className="video-section">
          <h4>Local Video</h4>
          <div className="video-element-container">
            <video ref={vanityVideoRef} autoPlay playsInline muted={true}
                   style={{visibility: localVideoVisible ? 'visible' : 'hidden'}}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
