import { useState } from "react";
import { useSelector } from 'react-redux';
import Card from "./Card";
import { GuxTable } from 'genesys-spark-components-react';

export default function StationDetails() {
  const sdk = useSelector(state => state.sdk.sdk);
  const [stationDetails] = useState(sdk.station);


  return (
    <>
      <Card className="station-details-container">
        <h3>Station Details</h3>
        <GuxTable>
          <table className="station-details-table" slot="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Status</th>
                <th>Type</th>
                <th>Line Appearance</th>
                <th>Persistent Connection</th>
                <th>FORCE TURN</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{stationDetails?.name}</td>
                <td>{stationDetails?.id}</td>
                <td>{stationDetails?.status}</td>
                <td>{stationDetails?.type}</td>
                <td>{stationDetails?.webRtcCallAppearances?.toString()}</td>
                <td>{stationDetails?.webRtcPersistentEnabled?.toString()}</td>
                <td>{stationDetails?.webRtcForceTurn?.toString()}</td>
              </tr>
            </tbody>
          </table>
        </GuxTable>
      </Card>
    </>
  );
}
