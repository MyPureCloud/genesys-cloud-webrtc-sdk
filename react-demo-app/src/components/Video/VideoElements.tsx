import Card from "../Card.tsx";
import { RefObject } from "react";
import {
  IActiveVideoConversationsState
} from "../../features/videoConversationsSlice.ts";
import { useSelector } from "react-redux";
import './VideoElements.css'

export default function VideoElements({
                                        audioRef,
                                        videoRef,
                                        vanityVideoRef,
                                        speakers
                                      }: {
  audioRef: RefObject<HTMLAudioElement>,
  videoRef: RefObject<HTMLVideoElement>,
  vanityVideoRef: RefObject<HTMLVideoElement>,
  speakers: any[]
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
  const remoteParticipants = activeParts?.filter(p => p.userId !== localUserId);
  const localVideoVisible = localParticipant && !localParticipant?.videoMuted || localParticipant?.sharingScreen;

  function shouldShowLogo() {
    const id = speakers?.[0]
    if (!id) return true;
    const activeParticipantHasCameraOn = !remoteParticipants?.find(p => p.userId === id?.userId)?.videoMuted;
    return activeParticipantHasCameraOn ? false : true;
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

  const defaultPersonSvg = <img src={`https://dhqbrvplips7x.cloudfront.net/volt/1.12.1-178/assets/default-person.svg`}/>

  return (
    <Card className="video-elements-card">
      <audio ref={audioRef} autoPlay/>
      <div className="video-sections-container">
        <div className="video-section">
          <h4>Remote Video</h4>
          <div className="video-element-container">
            <div style={{
              visibility: activeVideoConv?.session?.connectionState === 'connected' &&
              activeVideoConv?.session?.state === 'active' ? 'visible' : 'hidden'
            }}>
              <video ref={videoRef} autoPlay playsInline controls={true}
              />
              {shouldShowLogo() &&
                  <div className="logo-container">
                    {defaultPersonSvg}
                  </div>}
            </div>
          </div>
        </div>
        <div className="video-section">
          <h4>Local Video</h4>
          <div className="video-element-container">
            <div style={{
              visibility: activeVideoConv?.session?.connectionState === 'connected' &&
              activeVideoConv?.session?.state === 'active' ? 'visible' : 'hidden'
            }}>
              <video ref={vanityVideoRef} autoPlay playsInline muted={true} controls={true}/>
              {activeVideoConv && !localVideoVisible &&
                  <div className="logo-container">
                    {defaultPersonSvg}
                  </div>}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
