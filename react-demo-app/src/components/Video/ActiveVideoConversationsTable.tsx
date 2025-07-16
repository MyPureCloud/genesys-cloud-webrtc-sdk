import { useDispatch, useSelector } from "react-redux";
import { GuxButton, GuxRadialLoading, GuxTable } from "genesys-spark-components-react";
import useSdk from "../../hooks/useSdk.ts";
import {
  IActiveVideoConversationsState, setCurrentlyDisplayedConversation,
  toggleAudioMute,
  toggleVideoMute, updateConversationMediaStreams
} from "../../features/videoConversationsSlice.ts";
import Card from "../Card.tsx";
import './Video.css'
import { VideoMediaSession } from "genesys-cloud-webrtc-sdk";

export default function ActiveVideoConversationsTable() {
  const videoConversations: IActiveVideoConversationsState[] = useSelector(
    (state: unknown) => state.videoConversations.activeVideoConversations
  );
  const dispatch = useDispatch();
  const {endSession} = useSdk();
  const currentlyDisplayedConversationId = useSelector(
    (state: unknown) => state.videoConversations.currentlyDisplayedConversationId
  );

  function getParticipantUsingDemoApp(index: number) {
    return videoConversations[index].participantsUpdate?.activeParticipants.find(
      participant => videoConversations[index].session.fromUserId === participant.userId
    );
  }

  function handleVideoMuteToggle(index: number) {
    const participant = getParticipantUsingDemoApp(index);

    if (participant?.sharingScreen) {
      return;
    }

    if (participant) {
      // @ts-expect-error
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
      // @ts-expect-error
      dispatch(toggleAudioMute({
        mute: !participant.audioMuted,
        conversationId: videoConversations[index].conversationId,
        userId: participant.userId
      }));
    }
  }

  const handleConversationSwitch = (conversationId: string) => {
    dispatch(setCurrentlyDisplayedConversation({conversationId}));
  };

  const amISharingScreen: boolean[] = videoConversations.map(vc => {
    const localPart = vc?.participantsUpdate?.activeParticipants?.find(p => p.userId === vc.session.fromUserId);
    return !!localPart?.sharingScreen;
  });

  function handleScreenShare(index: number) {
    const session = videoConversations[index].session;

    if (amISharingScreen[index] && session) {
      stopScreenShare(session);
    } else {
      startScreenShare(session);
    }
  }

  async function startScreenShare(session: VideoMediaSession) {
    session.startScreenShare && await session.startScreenShare();
    dispatch(updateConversationMediaStreams({
      conversationId: session.conversationId,
      screenOutboundStream: session._screenShareStream,
    }));
  }

  function stopScreenShare(session: VideoMediaSession) {
    session.stopScreenShare && session.stopScreenShare();
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
              <th>Connection</th>
              <th>Session</th>
              <th>Select</th>
              <th>Screen</th>
              <th>Audio Mute</th>
              <th>Video Mute</th>
              <th>End</th>
            </tr>
            </thead>
            <tbody>
            {videoConversations.map((convo: IActiveVideoConversationsState, index: number) => (
              <tr key={`${convo.conversationId}${convo.session.id}`}>
                <td>{convo.conversationId}</td>
                <td>{convo.session.originalRoomJid}</td>
                <td>{convo.session.connectionState}</td>
                <td>{convo.session.state}</td>
                <td>
                  <GuxButton onClick={() => handleConversationSwitch(convo.conversationId)}
                             disabled={currentlyDisplayedConversationId === convo.conversationId}>
                    {currentlyDisplayedConversationId === convo.conversationId ? 'Selected' : 'Select'}
                  </GuxButton>
                </td>
                <td>
                  <GuxButton onClick={() => handleScreenShare(index)}>
                    {amISharingScreen[index] ? 'Stop' : 'Start'}
                  </GuxButton>
                </td>
                <td>
                  <GuxButton onClick={() => handleAudioMuteToggle(index)}>
                    {videoConversations?.[index].loadingAudio ?
                      <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading> :
                      getParticipantUsingDemoApp(index)?.audioMuted ? 'Unmute' : 'Mute'}
                  </GuxButton>
                </td>
                <td>
                  <GuxButton onClick={() => handleVideoMuteToggle(index)} disabled={amISharingScreen[index]}>
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
      <Card className='active-video-table-container'>
        <h3>Active Video Sessions</h3>
        {generateActiveVideoConversationsTable()}
      </Card>
    </>
  );
}
