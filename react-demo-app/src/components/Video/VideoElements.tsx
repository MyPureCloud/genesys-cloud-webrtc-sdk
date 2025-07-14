import { GuxButton } from "genesys-spark-components-react";
import Card from "../Card.tsx";
import useSdk from "../../hooks/useSdk.ts";
import { useState } from "react";
import { IActiveVideoConversationsState } from "../../features/conversationsSlice.ts";
import { useSelector } from "react-redux";

export default function VideoElements({
                                        audioRef,
                                        videoRef,
                                        incomingStreamIsActive,
                                        vanityVideoRef,
                                        outgoingStreamIsActive
                                      }) {
   const videoConversations: IActiveVideoConversationsState[] = useSelector(
    (state: unknown) => state.conversations.activeVideoConversations
  );

  return (<>
      <Card>
        <div>
          <audio ref={audioRef} autoPlay/>
          <div>
            <p>Remote Video</p>
            <Card>
              <div className="video-container">
                <video ref={videoRef} autoPlay playsInline
                       style={{visibility: incomingStreamIsActive ? 'visible' : 'hidden'}}
                />
              </div>
            </Card>
          </div>
          <div>
            <p>Local Video</p>
            <Card>
              <div className='video-container'>
                <video ref={vanityVideoRef} autoPlay playsInline
                       style={{
                         visibility: outgoingStreamIsActive && !(
                           videoConversations.find(v => v.loadingVideo)
                         ) ? 'visible' : 'hidden'
                       }}
                />
              </div>
            </Card>
          </div>
        </div>
      </Card>
    </>
  );
}
