import './MediaControls.css';
import useSdk from '../hooks/useSdk';
import { GuxButton } from 'genesys-spark-components-react'
import Card from './Card';

export default function MediaControls() {
  const {enumerateDevices, requestDevicePermissions} = useSdk();
  return (
    <>
      <Card className='media-controls-container'>
          <h4>Media Controls</h4>
          <GuxButton accent='secondary' className="device-enum-btn" onClick={() => enumerateDevices()}>
            Enumerate Devices
          </GuxButton>
          <GuxButton
            accent='secondary'
            className="device-permissions-btn"
            onClick={() => requestDevicePermissions('audio')}
          >
            Request Audio Permissions
          </GuxButton>
          <GuxButton
            accent='secondary'
            className="device-permissions-btn"
            onClick={() => requestDevicePermissions('video')}
          >
            Request Video Permissions
          </GuxButton>
      </Card>
    </>
  );
}
