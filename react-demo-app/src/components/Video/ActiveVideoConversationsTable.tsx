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
        {amISharingScreen[index] ? 'Stop' : 'Start'}
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
      <GuxButton onClick={() => handleVideoMuteToggle(index)} disabled={amISharingScreen[index]}>
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
            <th style={{width: '20%'}}>Conversation ID</th>
            <th style={{width: '24%'}}>Room JID/Meeting ID</th>
            <th style={{width: '9%'}}>Connection</th>
            <th style={{width: '7%'}}>Session</th>
            <th style={{width: '9%'}}>Select</th>
            <th style={{width: '7%'}}>Screen</th>
            <th style={{width: '9%'}}>Audio Mute</th>
            <th style={{width: '9%'}}>Video Mute</th>
            <th style={{width: '6%'}}>End</th>
          </tr>
          </thead>
          <tbody>
          {videoConversations.map((convo: IActiveVideoConversationsState, index: number) => (
            <tr key={`${convo.conversationId}${convo.session.id}`}>
              <td className="td-overflow">{convo.conversationId}</td>
              <td className="td-overflow">{convo.session.originalRoomJid}</td>
              <td>{convo.session.connectionState}</td>
              <td>{convo.session.state}</td>
              <td>{selectConvButton(convo)}</td>
              <td>{screenShareButton(index)}</td>
              <td>{audioMuteButton(index)}</td>
              <td>{videoMuteButton(index)}</td>
              <td>{endCallButton(convo.conversationId)}</td>
            </tr>
          ))}
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
