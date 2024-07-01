import Card from './Card';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';

export default function OutputDevices() {
  const { updateDefaultDevices } = useSdk();
  const deviceState = useSelector((state) => state.devices.currentState);

  return (
    <>
      <Card className="output-devices-container">
        <h4>Output Devices</h4>
        {deviceState.outputDevices.length ? (
          <select
            onChange={(e) =>
              updateDefaultDevices({ outputDeviceId: e.target.value })
            }
          >
            {deviceState.outputDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        ) : (
          <p>No output devices.</p>
        )}
      </Card>
    </>
  );
}
