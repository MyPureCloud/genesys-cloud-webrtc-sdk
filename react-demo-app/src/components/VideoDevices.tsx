import Card from './Card';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';

export default function OutputDevices() {
  const { updateDefaultDevices } = useSdk();
  const deviceState = useSelector((state) => state.devices.currentState);

  return (
    <>
      <Card className="video-devices-container">
        <h4>Video Devices</h4>
        {deviceState.videoDevices.length ? (
          <select
            onChange={(e) =>
              updateDefaultDevices({ outputDeviceId: e.target.value })
            }
          >
            {deviceState.videoDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        ) : (
          <p>No video devices.</p>
        )}
      </Card>
    </>
  );
}
