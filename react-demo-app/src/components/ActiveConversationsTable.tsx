import useSdk from '../hooks/useSdk';
import './ActiveConversationsTable.css';
import Card from './Card';
import { useSelector } from 'react-redux';


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
        <table className="active-convo-table">
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
                <td><button onClick={() => toggleHoldState(!convo.mostRecentCallState.held, convo.conversationId)}>{convo.mostRecentCallState.held ? 'Unhold' : 'Hold'}</button></td>
                <td><button onClick={() => toggleAudioMute(!convo.mostRecentCallState.muted, convo.conversationId)}>{convo.mostRecentCallState.muted ? 'Unmute' : 'Mute'}</button></td>
                <td><button className='end-call-btn' onClick={() => endSession(convo.conversationId)}>End</button></td>
              </tr>
            ))}
          </tbody>
        </table>
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
