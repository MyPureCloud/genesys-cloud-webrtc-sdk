import { useState, useEffect } from 'react';
import useSdk from '../hooks/useSdk';
import './ActiveConversationsTable.css';
import { GuxButton, GuxTable, GuxRadialLoading } from 'genesys-spark-components-react';
import { useSelector } from 'react-redux';
import Card from './Card';
import {SessionTypes} from "genesys-cloud-webrtc-sdk";


export default function ActiveConversationsTable() {
  const conversations = useSelector(
    (state) => state.conversations.activeConversations
  );
  const { endSession, toggleAudioMute, toggleVideoMute, toggleHoldState } = useSdk();
  const [holdLabels, setHoldLabels ] = useState<Array<string | JSX.Element>>([]);
  const [muteLabels, setMuteLabels ] = useState<Array<string | JSX.Element>>([]);
  const [videoMutesLabels, setVideoMuteLabels ] = useState<Array<string | JSX.Element>>([]);

  useEffect(() => {
    if (conversations.length) {
      setHoldLabels(conversations.map(convo =>
        convo.session.sessionType === SessionTypes.softphone && convo.mostRecentCallState?.held ? 'Unhold' : 'Hold'
      ));
      setMuteLabels(conversations.map(convo =>
        convo.session.sessionType === SessionTypes.softphone ?
          convo.mostRecentCallState?.muted ? 'Unmute' : 'Mute' :
          convo.ownCallState?.audioMuted ? 'Unmute' : 'Mute'
      ));
      setVideoMuteLabels(conversations.map(convo =>
        convo.session.sessionType === SessionTypes.collaborateVideo && convo?.ownCallState?.videoMuted ? 'Unmute' : 'Mute'
      ));
    }
  }, [conversations]);

  async function toggleConversationHold(index: number): Promise<void> {
    console.log('printing the conversation in toggleConversationHold', conversations[index]);
    const updatedHoldLabels = [...holdLabels];
    updatedHoldLabels[index] = <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading>;
    setHoldLabels(updatedHoldLabels);
    try {
      await toggleHoldState(!conversations[index].mostRecentCallState?.held, conversations[index].conversationId)
      updatedHoldLabels[index] = conversations[index].mostRecentCallState?.held ? 'Unhold' : 'Hold';
      setHoldLabels(updatedHoldLabels);
    } catch(err) {
      console.error(err);
    }
  }

  async function toggleConversationMute(index: number): Promise<void> {
    const updatedMuteLabels = [...muteLabels];
    updatedMuteLabels[index] = <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading>;
    setMuteLabels(updatedMuteLabels);
    try {
      await toggleAudioMute(!conversations[index].mostRecentCallState.muted, conversations[index].conversationId)
      updatedMuteLabels[index] = conversations[index].mostRecentCallState.muted ? 'Unmute' : 'Mute';
      setMuteLabels(updatedMuteLabels);
    } catch(err) {
      console.error(err);
    }
  }

  async function toggleConversationVideoMute(index: number): Promise<void> {
    const updatedVideoMuteLabels = [...videoMutesLabels];
    updatedVideoMuteLabels[index] = <GuxRadialLoading context='input' screenreaderText='Loading...'></GuxRadialLoading>;
    setMuteLabels(updatedVideoMuteLabels);
    try {
      await toggleVideoMute(!conversations[index].mostRecentCallState.muted, conversations[index].conversationId);
      updatedVideoMuteLabels[index] = conversations[index].mostRecentCallState.muted ? 'Unmute' : 'Mute';
      setVideoMuteLabels(updatedVideoMuteLabels);
    } catch (err) {
      console.error(err);
    }
  }

  function generateActiveConversationsTable() {
    if (!conversations.length) {
      return (<p>No active sessions.</p>);
    }
    return (
      <>
        <GuxTable>
          <table slot='data' className="active-convo-table">
            <thead>
              <tr>
                <th>Conversation ID</th>
                <th>Session ID</th>
                <th>Session State</th>
                <th>Session Type</th>
                <th>Direction</th>
                <th>Call State</th>
                <th>Hold</th>
                <th>Mute</th>
                <th>Mute Video</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((convo, index: number) => (
                <tr key={`${convo.conversationId}${convo.session.id}`}>
                  <td>{convo.conversationId}</td>
                  <td>{convo.session.id}</td>
                  <td>{convo.session.state}</td>
                  <td>{convo.session.sessionType}</td>
                  <td>{convo.mostRecentCallState?.direction || 'N/A'}</td>
                  <td>{convo.session.connectionState}</td>
                  <td>{convo.session.sessionType === SessionTypes.softphone ?
                    <GuxButton accent='secondary' onClick={async () => await toggleConversationHold(index)}>{holdLabels[index]}</GuxButton> : 'N/A'}</td>
                  <td><GuxButton accent='secondary' onClick={async () => await toggleConversationMute(index)}>{muteLabels[index]}</GuxButton></td>
                  <td>{convo.session.sessionType === SessionTypes.collaborateVideo ?
                    <GuxButton accent='secondary' onClick={async () => await toggleConversationVideoMute(index)}>{videoMutesLabels[index]}</GuxButton> : 'N/A'}</td>
                  <td><GuxButton accent='danger' onClick={() => endSession(convo.conversationId)}>End</GuxButton></td>
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
        <h3>Active Sessions</h3>
        {generateActiveConversationsTable()}
      </Card>
    </>
  )
}
