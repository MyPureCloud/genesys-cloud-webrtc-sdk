import { useState } from 'react';
import Card from './Card';
import './Softphone.css';
import useSdk from '../hooks/useSdk';
import PendingSessionsTable from './PendingSessionsTable';

export default function Softphone() {
  const [phoneNumber, setPhoneNumber] = useState('');
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
            <button type="submit">Place Call</button>
          </form>
        </Card>
        <PendingSessionsTable></PendingSessionsTable>
      </div>
    </>
  );
}
