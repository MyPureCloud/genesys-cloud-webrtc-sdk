import { GuxButton } from "genesys-spark-components-react";
import Card from "../Card.tsx";
import { RefObject, useEffect } from "react";
import {
  IActiveVideoConversationsState,
  setCurrentlyDisplayedConversation
} from "../../features/conversationsSlice.ts";
import { useSelector, useDispatch } from "react-redux";

export default function VideoElements({
                                        audioRef,
                                        videoRef,
                                        vanityVideoRef,
                                      }: {
  audioRef: RefObject<HTMLAudioElement>,
  videoRef: RefObject<HTMLVideoElement>,
  vanityVideoRef: RefObject<HTMLVideoElement>
}) {
  const dispatch = useDispatch();
  const videoConversations: IActiveVideoConversationsState[] = useSelector(
    (state: unknown) => state.conversations.activeVideoConversations
  );
  const currentlyDisplayedConversationId = useSelector(
    (state: unknown) => state.conversations.currentlyDisplayedConversationId
  );
  const activeVideoConv = videoConversations.find(conv =>
    conv.conversationId === currentlyDisplayedConversationId
  ) || videoConversations[videoConversations.length - 1];

  const localUserId = activeVideoConv?.session?.fromUserId;

  const localParticipant = activeVideoConv?.participantsUpdate?.activeParticipants.find(p => p.userId === localUserId)
  const remoteParticipant = activeVideoConv?.participantsUpdate?.activeParticipants.find(p => p.userId !== localUserId)
  const localVideoVisible = localParticipant && !localParticipant?.videoMuted;
  const remoteVideoVisible = remoteParticipant && !remoteParticipant?.videoMuted;

  useEffect(() => {
    if (activeVideoConv) {
      if (videoRef.current && activeVideoConv.inboundStream) {
        videoRef.current.srcObject = activeVideoConv.inboundStream;
      }
      if (vanityVideoRef.current && activeVideoConv.outboundStream) {
        vanityVideoRef.current.srcObject = activeVideoConv.outboundStream;
      }
    }
  }, [activeVideoConv, videoRef, vanityVideoRef]);

  const handleConversationSwitch = (conversationId: string) => {
    dispatch(setCurrentlyDisplayedConversation({conversationId}));
  };

  return (<>
      <Card className="video-elements-card">
        <div>
          <audio ref={audioRef} autoPlay/>
          <div>
            <p>Remote Video</p>
            <Card className="video-container-card">
              <div className="video-container">
                <video ref={videoRef} autoPlay playsInline
                       style={{visibility: remoteVideoVisible ? 'visible' : 'hidden'}}
                />
              </div>
            </Card>
          </div>
          <div>
            <p>Local Video</p>
            <Card className="video-container-card">
              <div className='video-container'>
                <video ref={vanityVideoRef} autoPlay playsInline
                       style={{visibility: localVideoVisible ? 'visible' : 'hidden'}}
                />
              </div>
            </Card>
          </div>
        </div>
      </Card>
    </>
  );
}
