import { GuxTable } from 'genesys-spark-components-react';
import { useSelector } from 'react-redux';
import Card from './Card';

export default function HandledPendingSessionsTable() {
  const handledPendingSessions = useSelector(
    (state) => state.conversations.handledPendingSessions
  );

  function generateHandledPendingSessionsTable() {
    if (!handledPendingSessions.length) {
      return (<p>No pending sessions.</p>);
    }
    return (
      <>
        <GuxTable>
          <table slot='data' className="pending-table">
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
        </GuxTable>
      </>
    );
  }

  return <>
    <Card className='handled-pending-container'>
      <h3>Handled Pending Sessions</h3>
      {generateHandledPendingSessionsTable()}
    </Card>
  </>;
}
