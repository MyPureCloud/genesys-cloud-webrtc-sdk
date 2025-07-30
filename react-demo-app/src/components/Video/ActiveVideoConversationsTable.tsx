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
import './ActiveVideoConversationsTable.css'
import { VideoMediaSession } from "genesys-cloud-webrtc-sdk";
import { AppDispatch, RootState } from "../../store.ts";

export default function ActiveVideoConversationsTable() {
  const videoConversations: IActiveVideoConversationsState[] = useSelector(
    (state: RootState) => state.videoConversations.activeVideoConversations
  );
  const dispatch = useDispatch<AppDispatch>();
  const { endSession, getSession } = useSdk();
  const currentlyDisplayedConversationId = useSelector(
    (state: RootState) => state.videoConversations.currentlyDisplayedConversationId
  );

  function getParticipantUsingDemoApp(index: number) {
    const session = getSession(videoConversations[index].conversationId);
    return videoConversations[index].participantsUpdate?.activeParticipants.find(
      participant => session.fromUserId === participant.userId
    );
  }

  function handleVideoMuteToggle(index: number) {
    const participant = getParticipantUsingDemoApp(index);
    if (participant && !participant.sharingScreen) {
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
      dispatch(toggleAudioMute({
        mute: !participant.audioMuted,
        conversationId: videoConversations[index].conversationId,
        userId: participant.userId
      }));
    }
  }

  const handleConversationSwitch = (conversationId: string) => {
    dispatch(setCurrentlyDisplayedConversation({ conversationId }));
  };

  const isLocalPartSharingScreen: boolean[] =
    videoConversations.map(vc => {
      const localPart = vc.participantsUpdate?.activeParticipants
        ?.find(p => p.userId === getSession(vc.conversationId).fromUserId);
      return !!localPart?.sharingScreen;
    });

  function handleScreenShare(index: number) {
    const session = getSession(videoConversations[index].conversationId);
    if (isLocalPartSharingScreen[index]) {
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

  const selectConvButton = (convo: IActiveVideoConversationsState) => {
    return (
      <GuxButton onClick={() => handleConversationSwitch(convo.conversationId)}
                 disabled={currentlyDisplayedConversationId === convo.conversationId}>
        {currentlyDisplayedConversationId === convo.conversationId ? 'Selected' : 'Select'}
      </GuxButton>
    );
  }

  const screenShareButton = (index: number) => {
    return (
      <GuxButton onClick={() => handleScreenShare(index)}>
        {isLocalPartSharingScreen[index] ? 'Stop' : 'Start'}
      </GuxButton>
    );
  }

  const audioMuteButton = (index: number) => {
    return (
      <GuxButton onClick={() => handleAudioMuteToggle(index)}>
        {videoConversations?.[index].loadingAudio ?
          <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading> :
          getParticipantUsingDemoApp(index)?.audioMuted ? 'Unmute' : 'Mute'}
      </GuxButton>
    );
  }

  const videoMuteButton = (index: number) => {
    return (
      <GuxButton onClick={() => handleVideoMuteToggle(index)} disabled={isLocalPartSharingScreen[index]}>
        {videoConversations?.[index].loadingVideo ?
          <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading> :
          getParticipantUsingDemoApp(index)?.videoMuted ? 'Unmute' : 'Mute'}
      </GuxButton>
    );
  }

  const endCallButton = (conversationId: string) => {
    return (
      <GuxButton onClick={() => endSession(conversationId)} accent='danger'>
        End
      </GuxButton>
    );
  }

  const activeVideoConversationsTable = () => {
    if (!videoConversations.length) {
      return (<p>No active sessions.</p>);
    }
    return (
      <GuxTable>
        <table slot='data' className='active-convo-table'>
          <thead>
          <tr>
            <th style={{ width: '20%' }}>Conversation ID</th>
            <th style={{ width: '24%' }}>Room JID/Meeting ID</th>
            <th style={{ width: '9%' }}>Connection</th>
            <th style={{ width: '7%' }}>Session</th>
            <th style={{ width: '9%' }}>Select</th>
            <th style={{ width: '7%' }}>Screen</th>
            <th style={{ width: '9%' }}>Audio Mute</th>
            <th style={{ width: '9%' }}>Video Mute</th>
            <th style={{ width: '6%' }}>End</th>
          </tr>
          </thead>
          <tbody>
          {videoConversations.map((convo: IActiveVideoConversationsState, index: number) => {
            const session = getSession(convo.conversationId)
            return (
              <tr key={`${convo.conversationId}${session.id}`}>
                <td className="td-overflow">{convo.conversationId}</td>
                <td className="td-overflow">{session.originalRoomJid}</td>
                <td>{session.connectionState}</td>
                <td>{session.state}</td>
                <td>{selectConvButton(convo)}</td>
                <td>{screenShareButton(index)}</td>
                <td>{audioMuteButton(index)}</td>
                <td>{videoMuteButton(index)}</td>
                <td>{endCallButton(convo.conversationId)}</td>
              </tr>
            );
          })
          }
          </tbody>
        </table>
      </GuxTable>
    );
  }

  return (
    <Card>
      <h3>Active Video Sessions</h3>
      {activeVideoConversationsTable()}
    </Card>
  );
}
