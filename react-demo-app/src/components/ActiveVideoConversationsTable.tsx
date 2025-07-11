import { useDispatch, useSelector } from "react-redux";
import { GuxButton, GuxRadialLoading, GuxTable } from "genesys-spark-components-react";
import useSdk from "../hooks/useSdk.ts";
import {
  IActiveVideoConversationsState,
  toggleAudioMute,
  toggleVideoMute
} from "../features/conversationsSlice.ts";
import Card from "./Card.tsx";

export default function ActiveVideoConversationsTable() {
  const videoConversations: IActiveVideoConversationsState[] = useSelector(
    (state: any) => state.conversations.activeVideoConversations
  );
  const dispatch = useDispatch();
  const {endSession} = useSdk();

  function getParticipantUsingDemoApp(index: number) {
    return videoConversations[index].participantsUpdate?.activeParticipants.find(
      participant => videoConversations[index].session.fromUserId === participant.userId
    );
  }

  function handleVideoMuteToggle(index: number) {
    const participant = getParticipantUsingDemoApp(index);
    if (participant) {
      // @ts-ignore
      dispatch(toggleVideoMute({
        mute: !participant.videoMuted,
        conversationId: videoConversations[index].conversationId,
        userId: participant.userId
      }));
    }
  }

  function handleAudioMuteToggle(index: number) {
    const participant = getParticipantUsingDemoApp(index);
    if (participant) {
      // @ts-ignore
      dispatch(toggleAudioMute({
        mute: !participant.audioMuted,
        conversationId: videoConversations[index].conversationId,
        userId: participant.userId
      }));
    }
  }

  function generateActiveVideoConversationsTable() {
    if (!videoConversations.length) {
      return (<p>No active sessions.</p>);
    }
    return (
      <>
        <GuxTable>
          <table slot='data' className='active-convo-table'>
            <thead>
            <tr>
              <th>Conversation ID</th>
              <th>Room JID/Meeting ID</th>
              <th>Connection State</th>
              <th>Session State</th>
              <th>Audio Mute</th>
              <th>Video Mute</th>
              <th>End</th>
            </tr>
            </thead>
            <tbody>
            {videoConversations.map((convo, index: number) => (
              <tr key={`${convo.conversationId}${convo.session.id}`}>
                <td>{convo.conversationId}</td>
                <td>{convo.session.originalRoomJid}</td>
                <td>{convo.session.connectionState}</td>
                <td>{convo.session.state}</td>
                <td>
                  <GuxButton onClick={() => handleAudioMuteToggle(index)}>
                    {videoConversations?.[index].loadingAudio ?
                      <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading> :
                      getParticipantUsingDemoApp(index)?.audioMuted ? 'Unmute' : 'Mute'}
                  </GuxButton>
                </td>
                <td>
                  <GuxButton onClick={() => handleVideoMuteToggle(index)}>
                    {videoConversations?.[index].loadingVideo ?
                      <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading> :
                      getParticipantUsingDemoApp(index)?.videoMuted ? 'Unmute' : 'Mute'}
                  </GuxButton>
                </td>
                <td>
                  <GuxButton onClick={() => endSession(convo.conversationId)} accent='danger'>
                    End
                  </GuxButton>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </GuxTable>
      </>
    );
  }

  return (
    <>
      <Card className='active-conversations-card'>
        <h3>Active Video Sessions</h3>
        {generateActiveVideoConversationsTable()}
      </Card>
    </>
  );
}
