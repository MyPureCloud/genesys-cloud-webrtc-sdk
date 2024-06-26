import { useSelector } from 'react-redux';
import './Devices.css';
import Card from './Card';
import useSdk from '../hooks/useSdk';

export default function Devices() {
  const deviceState = useSelector((state) => state.devices);
  const { updateDefaultDevices } = useSdk();

  return (
    <>
      <h1>Devices</h1>
      <div className="devices-container">
        <Card className={undefined}>
          <h3>Microphone Devices</h3>
          <select
            name="audio-devices"
            onChange={(e) =>
              updateDefaultDevices({ audioDeviceId: e.target.value })
            }
          >
            {deviceState.audioDevices.map((device) => (
              <option value={device.deviceId}>{device.label}</option>
            ))}
          </select>
        </Card>
        <Card className={undefined}>
          <h3>Output Devices</h3>
          <select
            name="output-devices"
            onChange={(e) =>
              updateDefaultDevices({ outputDeviceId: e.target.value })
            }
          >
            {deviceState.outputDevices.map((device) => (
              <option value={device.deviceId}>{device.label}</option>
            ))}
          </select>
        </Card>
        <Card className={undefined}>
          <h3>Video Devices</h3>
          <select
            name="video-devices"
            onChange={(e) =>
              updateDefaultDevices({ videoDeviceId: e.target.value })
            }
          >
            {deviceState.videoDevices.map((device) => (
              <option value={device.deviceId}>{device.label}</option>
            ))}
          </select>
        </Card>
      </div>
    </>
  );
}
