import { useState } from 'react';
import Card from './Card';
import './Softphone.css';
import useSdk from '../hooks/useSdk';
import PendingSessionsTable from './PendingSessionsTable';
import ActiveConversationsTable from './ActiveConversationsTable';
import HandledPendingSessionsTable from './HandledPendingSessionsTable';

export default function Softphone() {
  const [phoneNumber, setPhoneNumber] = useState('*86');
  const [onQueueStatus, setOnQueueStatus] = useState(false);
  const { startSoftphoneSession, updateOnQueueStatus } = useSdk();

  function placeCall(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startSoftphoneSession(phoneNumber);
  }
  function toggleQueueStatus() {
    updateOnQueueStatus(!onQueueStatus);
    setOnQueueStatus(!onQueueStatus)
  }
  return (
    <>
      <h1>Softphone</h1>
      <div className="softphone-container">
        <Card className='softphone-call-card'>
          <form onSubmit={placeCall}>
            <h3>Place Call</h3>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
            <button className="softphone-call-btn" type="submit">Place Call</button>
          </form>
          <button className='softphone-queue-btn' onClick={() => toggleQueueStatus()}>{onQueueStatus ? 'On Queue' : 'Off Queue'}</button>
        </Card>
        <HandledPendingSessionsTable></HandledPendingSessionsTable>
        <PendingSessionsTable></PendingSessionsTable>
        <ActiveConversationsTable></ActiveConversationsTable>
      </div>
    </>
  );
}
