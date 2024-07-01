import Card from './Card';
import useSdk from '../hooks/useSdk';

export default function MediaControls() {
  const {enumerateDevices, requestDevicePermissions} = useSdk();
  return (
    <>
      <Card className="media-controls">
        <h4>Media Controls</h4>
        <button className="device-enum-btn" onClick={() => enumerateDevices()}>
          Enumerate Devices
        </button>
        <button
          className="device-permissions-btn"
          onClick={() => requestDevicePermissions('audio')}
        >
          Request Audio Permissions
        </button>
        <button
          className="device-permissions-btn"
          onClick={() => requestDevicePermissions('video')}
        >
          Request Video Permissions
        </button>
      </Card>
    </>
  );
}
