import { GuxButton } from "genesys-spark-components-react";
import Card from "../Card.tsx";
import useSdk from "../../hooks/useSdk.ts";
import { useState } from "react";
import { IActiveVideoConversationsState } from "../../features/conversationsSlice.ts";
import { useSelector } from "react-redux";

export default function VideoElements({
                                        audioRef,
                                        videoRef,
                                        vanityVideoRef,
                                      }) {
  const videoConversations: IActiveVideoConversationsState[] = useSelector(
    (state: unknown) => state.conversations.activeVideoConversations
  );

  const activeVideoConv = videoConversations[videoConversations.length - 1];
  const localUserId = activeVideoConv?.session?.fromUserId;

  const localParticipant = activeVideoConv?.participantsUpdate?.activeParticipants.find(p => p.userId === localUserId)
  const remoteParticipant = activeVideoConv?.participantsUpdate?.activeParticipants.find(p => p.userId !== localUserId)
  const localVideoVisible = localParticipant && !localParticipant?.videoMuted;
  const remoteVideoVisible = remoteParticipant && !remoteParticipant?.videoMuted;

  return (<>
      <Card>
        <div>
          <audio ref={audioRef} autoPlay/>
          <div>
            <p>Remote Video</p>
            <Card>
              <div className="video-container">
                <video ref={videoRef} autoPlay playsInline
                       style={{visibility: remoteVideoVisible ? 'visible' : 'hidden'}}
                />
              </div>
            </Card>
          </div>
          <div>
            <p>Local Video</p>
            <Card>
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
