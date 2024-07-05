import { useState } from "react";
import Card from "./Card";
import { GuxButton } from "genesys-spark-components-react";
import "./Softphone.css";
import useSdk from "../hooks/useSdk";
import PendingSessionsTable from "./PendingSessionsTable";
import ActiveConversationsTable from "./ActiveConversationsTable";
import HandledPendingSessionsTable from "./HandledPendingSessionsTable";

export default function Softphone() {
  const [phoneNumber, setPhoneNumber] = useState("*86");
  const [onQueueStatus, setOnQueueStatus] = useState(false);
  const { startSoftphoneSession, updateOnQueueStatus } = useSdk();

  function placeCall() {
    startSoftphoneSession(phoneNumber);
  }
  function toggleQueueStatus() {
    updateOnQueueStatus(!onQueueStatus);
    setOnQueueStatus(!onQueueStatus);
  }

  // GuxButton's don't support form events currently so a form can't be used.
  return (
    <>
      <Card className='softphone-card'>
        <h2 className='gux-heading-lg-semibold'>Softphone</h2>
        <div className="softphone-container">
          <Card className='softphone-call-card'>
              <h3>Place Call</h3>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
              <GuxButton accent="primary" className='softphone-call-btn' onClick={() => placeCall()}>
                Place Call
              </GuxButton>
              <GuxButton
                className="softphone-queue-btn"
                onClick={() => toggleQueueStatus()}
              >
                {onQueueStatus ? "On Queue" : "Off Queue"}
              </GuxButton>
          </Card>
          <HandledPendingSessionsTable></HandledPendingSessionsTable>
          <PendingSessionsTable></PendingSessionsTable>
          <ActiveConversationsTable></ActiveConversationsTable>
        </div>
      </Card>
    </>
  );
}
