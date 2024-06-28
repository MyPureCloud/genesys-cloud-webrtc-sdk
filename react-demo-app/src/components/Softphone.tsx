import { useState } from 'react';
import Card from './Card';
import './Softphone.css';
import useSdk from '../hooks/useSdk';
import PendingSessionsTable from './PendingSessionsTable';
import ActiveConversationsTable from './ActiveConversationsTable';
import UserDetails from './UserDetails';

export default function Softphone() {
  const [phoneNumber, setPhoneNumber] = useState('*86');
  const { startSoftphoneSession } = useSdk();

  function placeCall(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startSoftphoneSession(phoneNumber);
  }
  return (
    <>
      <h1>Softphone</h1>
      <div className="softphone-container">
        <Card className={undefined}>
          <form onSubmit={placeCall}>
            <h3>Place Call</h3>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
            <button className="softphone-call-btn" type="submit">Place Call</button>
          </form>
        </Card>
        {/* <UserDetails></UserDetails> */}
        <PendingSessionsTable></PendingSessionsTable>
        <ActiveConversationsTable></ActiveConversationsTable>
      </div>
    </>
  );
}
