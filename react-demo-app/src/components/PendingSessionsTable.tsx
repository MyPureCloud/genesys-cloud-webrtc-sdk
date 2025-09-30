import './PendingSessionsTable.css';
import { GuxTable, GuxButton } from 'genesys-spark-components-react';
import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';
import { IPendingSession } from 'genesys-cloud-webrtc-sdk';

export default function PendingSessionsTable() {
  const conversations = useSelector(
    (state: RootState) => state.conversations.pendingSessions
  );
  const sdk = useSelector((state: RootState) => state.sdk.sdk);


  function handlePendingSession(accept: boolean, conversationId: string): void {
    if (!sdk) return;
    if (accept) {
      sdk.acceptPendingSession({ conversationId });
    } else {
     sdk.rejectPendingSession({ conversationId });
    }
  }

  function generatePendingSessionsTable() {
    if (!conversations.length) {
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
                <th>Session Type</th>
                <th>From JID</th>
                <th>To JID</th>
                <th>Auto Answer</th>
                <th>Answer</th>
                <th>Decline</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((convo: IPendingSession) => (
                <tr key={convo.conversationId}>
                  <td>{convo.conversationId}</td>
                  <td>{convo.sessionId}</td>
                  <td>{convo.sessionType}</td>
                  <td>{convo.fromJid}</td>
                  <td>{convo.toJid}</td>
                  <td>{convo.autoAnswer.toString()}</td>
                  <td><GuxButton accent='primary' onClick={() => handlePendingSession(true, convo.conversationId)}>Answer</GuxButton></td>
                  <td><GuxButton accent='danger' onClick={() => handlePendingSession(false, convo.conversationId)}>Decline</GuxButton></td>
                </tr>
              ))}
            </tbody>
          </table>
       </GuxTable>
      </>
    );
  }

  return <>
    <Card className='pending-table-container'>
      <h3>Pending Sessions</h3>
      {generatePendingSessionsTable()}
    </Card>
  </>;
}
