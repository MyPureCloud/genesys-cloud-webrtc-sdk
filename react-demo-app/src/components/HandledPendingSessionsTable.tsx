import Card from './Card';
import { useSelector } from 'react-redux';

export default function HandledPendingSessionsTable() {
  const handledPendingSessions = useSelector(
    (state) => state.conversations.handledPendingSessions
  );

  function generateHandledPendingSessionsTable() {
    console.warn('the handled', handledPendingSessions);
    if (!handledPendingSessions.length) {
      return (<p>No pending sessions.</p>);
    }
    return (
      <>
        <table className="pending-table">
          <thead>
            <tr>
              <th>Conversation ID</th>
              <th>Session ID</th>
            </tr>
          </thead>
          <tbody>
            {handledPendingSessions.map((convo) => (
              <tr key={convo.conversationId}>
                <td>{convo.conversationId}</td>
                <td>{convo.sessionId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  return <>
    <Card className={undefined}>
      <h3>Handled Pending Sessions</h3>
      {generateHandledPendingSessionsTable()}
    </Card>
  </>;
}
