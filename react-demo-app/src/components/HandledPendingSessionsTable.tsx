import { GuxTable } from 'genesys-spark-components-react';
import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';
import { IPendingSession } from 'genesys-cloud-webrtc-sdk';

export default function HandledPendingSessionsTable() {
  const handledPendingSessions = useSelector(
    (state: RootState) => state.conversations.handledPendingSessions
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
              {handledPendingSessions.map((convo: IPendingSession) => (
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
