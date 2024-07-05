import useSdk from '../hooks/useSdk';
import './ActiveConversationsTable.css';
import { GuxButton, GuxTable } from 'genesys-spark-components-react';
import { useSelector } from 'react-redux';
import Card from './Card';


export default function ActiveConversationsTable() {
  const conversations = useSelector(
    (state) => state.conversations.activeConversations
  );
  const { endSession, toggleAudioMute, toggleHoldState } = useSdk();

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
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((convo) => (
                <tr key={convo.conversationId}>
                  <td>{convo.conversationId}</td>
                  <td>{convo.session.id}</td>
                  <td>{convo.session.state}</td>
                  <td>{convo.session.sessionType}</td>
                  <td>{convo.mostRecentCallState.direction}</td>
                  <td>{convo.session.connectionState}</td>
                  <td><GuxButton accent='secondary' onClick={() => toggleHoldState(!convo.mostRecentCallState.held, convo.conversationId)}>{convo.mostRecentCallState.held ? 'Unhold' : 'Hold'}</GuxButton></td>
                  <td><GuxButton accent='secondary' onClick={() => toggleAudioMute(!convo.mostRecentCallState.muted, convo.conversationId)}>{convo.mostRecentCallState.muted ? 'Unmute' : 'Mute'}</GuxButton></td>
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
      <Card className={undefined}>
        <h3>Active Sessions</h3>
        {generateActiveConversationsTable()}
      </Card>
    </>
  )
}
