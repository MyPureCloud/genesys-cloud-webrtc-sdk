import {useSelector} from "react-redux";
import {useEffect, useState} from "react";
import {GuxButton, GuxRadialLoading, GuxTable} from "genesys-spark-components-react";
import useSdk from "../hooks/useSdk.ts";
import {IActiveVideoConversationsState} from "../features/conversationsSlice.ts";
import Card from "./Card.tsx";

export default function ActiveVideoConversationsTable() {
  const videoConversations: IActiveVideoConversationsState[] = useSelector(
    (state) => state.conversations.activeVideoConversations
  );
  const {toggleAudioMute, toggleVideoMute, endSession} = useSdk();
  const [audioMuteLabels, setAudioMuteLabels] = useState<Array<string | JSX.Element>>([]);
  const [videoMuteLabels, setVideoMuteLabels] = useState<Array<string | JSX.Element>>([]);

  useEffect(() => {
    if (videoConversations.length) {
      setAudioMuteLabels(videoConversations.map((_convo, index) => {
          const participant = getParticipantUsingDemoApp(index);
          return participant?.audioMuted ? 'Unmute' : 'Mute'
        }
      ));
      setVideoMuteLabels(videoConversations.map((_convo, index) => {
          const participant = getParticipantUsingDemoApp(index);
          return participant?.videoMuted ? 'Unmute' : 'Mute';
        }
      ));
    }
  }, [videoConversations]);

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
                  <GuxButton onClick={async () => await toggleVideoConversationAudioMute(index)}>
                    {audioMuteLabels[index]}
                  </GuxButton>
                </td>
                <td>
                  <GuxButton onClick={async () => await toggleVideoConversationVideoMute(index)}>
                    {videoMuteLabels[index]}
                  </GuxButton>
                </td>
                <td>
                  <GuxButton onClick={async () => await endSession(convo.conversationId)}
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
