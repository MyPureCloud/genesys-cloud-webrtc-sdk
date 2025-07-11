import { useDispatch, useSelector } from "react-redux";
import { useState } from "react";
import { GuxButton, GuxRadialLoading, GuxTable } from "genesys-spark-components-react";
import useSdk from "../hooks/useSdk.ts";
import { IActiveVideoConversationsState, toggleAudioMute2, toggleVideoMute2 } from "../features/conversationsSlice.ts";
import Card from "./Card.tsx";

export default function ActiveVideoConversationsTable() {
  const videoConversations: IActiveVideoConversationsState[] = useSelector(
    (state) => state.conversations.activeVideoConversations
  );
  const dispatch = useDispatch();
  const {toggleAudioMute, toggleVideoMute, endSession} = useSdk();
  const [audioMuteLabels, setAudioMuteLabels] = useState<Array<string | JSX.Element>>([]);
  const [videoMuteLabels, setVideoMuteLabels] = useState<Array<string | JSX.Element>>([]);

  function getParticipantUsingDemoApp(index: number) {
    return videoConversations[index].participantsUpdate?.activeParticipants.find(
      participant => videoConversations[index].session.fromUserId === participant.userId
    );
  }

  async function toggleVideoConversationAudioMute(index: number): Promise<void> {
    const updatedAudioMute = [...audioMuteLabels];
    updatedAudioMute[index] = <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading>;
    setAudioMuteLabels(updatedAudioMute);
    try {
      const participant = getParticipantUsingDemoApp(index);
      await toggleAudioMute(!participant?.audioMuted, videoConversations[index].conversationId);
      updatedAudioMute[index] = participant?.audioMuted ? 'Unmute' : 'Mute';
      setAudioMuteLabels(updatedAudioMute);
    } catch (err) {
      console.error('Error toggling audio for video', err);
    }
  }

  async function toggleVideoConversationVideoMute(index: number): Promise<void> {
    const updatedVideoMute = [...videoMuteLabels];
    updatedVideoMute[index] = <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading>;
    setVideoMuteLabels(updatedVideoMute);
    try {
      const participant = getParticipantUsingDemoApp(index);
      await toggleVideoMute(!participant?.videoMuted, videoConversations[index].conversationId);
      updatedVideoMute[index] = participant?.videoMuted ? 'Unmute' : 'Mute';
      setVideoMuteLabels(updatedVideoMute);
    } catch (err) {
      console.error('Error toggling video for video', err);
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
                  <GuxButton onClick={() => {
                    const participant = getParticipantUsingDemoApp(index);
                    // @ts-ignore
                    dispatch(toggleAudioMute2(
                      {
                        mute: !participant?.audioMuted,
                        conversationId: videoConversations[index].conversationId,
                        userId: participant!.userId
                      }
                    ))
                  }}>
                    {videoConversations?.[index].loadingAudio ?
                      <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading> :
                      getParticipantUsingDemoApp(index)?.audioMuted ? 'Unmute' : 'Mute'}
                  </GuxButton>
                </td>
                <td>
                  <GuxButton onClick={() => {
                    const participant = getParticipantUsingDemoApp(index);
                    // @ts-ignore
                    dispatch(toggleVideoMute2(
                      {
                        mute: !participant?.videoMuted,
                        conversationId: videoConversations[index].conversationId,
                        userId: participant!.userId
                      }
                    ));
                  }}>
                    {videoConversations?.[index].loadingVideo ? <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading> :
                      getParticipantUsingDemoApp(index)?.videoMuted ? 'Unmute' : 'Mute'}
                  </GuxButton>
                </td>
                <td>
                  <GuxButton onClick={() => endSession(convo.conversationId)}
                             accent='danger'
                  >
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
