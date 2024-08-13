import { FormEvent, useState } from "react";
import Card from "./Card";
import { GuxButton, GuxToggle } from "genesys-spark-components-react";
import "./Softphone.css";
import useSdk from "../hooks/useSdk";
import PendingSessionsTable from "./PendingSessionsTable";
import ActiveConversationsTable from "./ActiveConversationsTable";
import HandledPendingSessionsTable from "./HandledPendingSessionsTable";
import StationDetails from "./StationDetails";

export default function Softphone() {
  const [phoneNumber, setPhoneNumber] = useState("*86");
  const [onQueueStatus, setOnQueueStatus] = useState(false);
  const { startSoftphoneSession, updateOnQueueStatus } = useSdk();

  function placeCall(event?: FormEvent<HTMLFormElement>) {
    if (event) {
      event.preventDefault()
    }
    startSoftphoneSession(phoneNumber);
  }
  function toggleQueueStatus() {
    updateOnQueueStatus(!onQueueStatus);
    setOnQueueStatus(!onQueueStatus);
  }

  // GuxButton's don't support form events currently but we want a form for keyboard navigation.
  return (
    <>
      <Card className="softphone-card">
        <h2 className="gux-heading-lg-semibold">Softphone</h2>
        <div className="softphone-container">
          <Card className="softphone-call-card">
            <h3>Place Call</h3>
            <form onSubmit={(e) => placeCall(e)}>
                <input
                  type="text"
                  slot="input"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              <GuxButton
                accent="primary"
                className="softphone-call-btn"
                type="submit"
                onClick={() => placeCall()}
              >
                Place Call
              </GuxButton>
            </form>
            <GuxToggle
              className="softphone-queue-toggle"
              labelPosition="left"
              onClick={() => toggleQueueStatus()}
              checkedLabel="On Queue"
              uncheckedLabel="Off Queue"
            ></GuxToggle>
          </Card>
          <StationDetails></StationDetails>
          <HandledPendingSessionsTable></HandledPendingSessionsTable>
          <PendingSessionsTable></PendingSessionsTable>
          <ActiveConversationsTable></ActiveConversationsTable>
        </div>
      </Card>
    </>
  );
}
