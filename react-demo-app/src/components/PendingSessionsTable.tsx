import './PendingSessionsTable.css';
import Card from './Card';
import { useSelector } from 'react-redux';

export default function PendingSessionsTable() {
  const conversations = useSelector(
    (state) => state.conversations.pendingSessions
  );

  function generatePendingSessionsTable() {
    if (!conversations.length) {
      return;
    }
    return (
      <>
        <Card className={undefined}>
          <h3>Pending Sessions</h3>
          <table className="pending-table">
            <thead>
              <tr>
                <th>Conversation ID</th>
                <th>Session ID</th>
                <th>Session Type</th>
                <th>From JID</th>
                <th>To JID</th>
                <th>Auto Answer</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((convo) => (
                <tr key={convo.conversationId}>
                  <td>{convo.conversationId}</td>
                  <td>{convo.sessionId}</td>
                  <td>{convo.sessionType}</td>
                  <td>{convo.fromJid}</td>
                  <td>{convo.toJid}</td>
                  <td>{convo.autoAnswer.toString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </>
    );
  }

  return <>{generatePendingSessionsTable()}</>;
}
