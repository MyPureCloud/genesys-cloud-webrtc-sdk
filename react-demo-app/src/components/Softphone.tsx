import { FormEvent, useState } from "react";
import Card from "./Card";
import { GuxButton, GuxToggle } from "genesys-spark-components-react";
import "./Softphone.css";
import useSdk from "../hooks/useSdk";
import PendingSessionsTable from "./PendingSessionsTable";
import ActiveConversationsTable from "./ActiveConversationsTable";
import HandledPendingSessionsTable from "./HandledPendingSessionsTable";
import StationDetails from "./StationDetails";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from '../types/store';
import { setIrisClient } from "../features/irisSlice";

export default function Softphone() {
  const dispatch = useDispatch();
  const [phoneNumber, setPhoneNumber] = useState("*86");
  const [onQueueStatus, setOnQueueStatus] = useState(false);
  const { startSoftphoneSession, updateOnQueueStatus, disconnectPersistentConnection, initIris } = useSdk();
  const sdk = useSelector((state: RootState) => state.sdk.sdk);
  const irisClient = useSelector((state: RootState) => state.iris.irisClient);
  const [persistentConnectionEnabled] = useState(sdk?.station?.webRtcPersistentEnabled || false);

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

  function destroyIris() {
    if (!irisClient) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispatch(setIrisClient(null as any));
    irisClient.destroy();
  }

  // async function initializeIris() {
  //   const irisClient = new GenesysIrisClient({
  //     company: 'GENESYS_TEST',
  //     key: keyText,
  //     license: licenseText,
  //     team: 'Dev Team',
  //     user: 'Zach'
  //   });
  // }



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
            <GuxButton
              accent="secondary"
              disabled={!persistentConnectionEnabled}
              className="softphone-disconnect-btn"
              onClick={() => disconnectPersistentConnection()}
            >
              Disconnect PC
            </GuxButton>
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
          <div>
            <GuxButton
              accent="secondary"
              className="softphone-disconnect-btn"
              onClick={() => initIris()}
            >
              Init Iris
            </GuxButton>
            <GuxButton
              accent="secondary"
              className="softphone-disconnect-btn"
              onClick={() => destroyIris()}
            >
              Destroy Iris
            </GuxButton>
          </div>
        </div>
      </Card>
    </>
  );
}
