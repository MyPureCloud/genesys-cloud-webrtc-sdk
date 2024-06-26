import { useSelector } from 'react-redux';
import './Devices.css';
import Card from './Card';
import useSdk from '../hooks/useSdk';

export default function Devices() {
  const deviceState = useSelector((state) => state.devices);
  const { updateDefaultDevices } = useSdk();
  const noDevices: JSX.Element = (
    <p>No devices found.</p>
  )

  function renderAudioDevices() {
    if (!deviceState.audioDevices.length) {
      return noDevices;
    }
    const audioDeviceDropdown = (
      <select
        onChange={(e) =>
          updateDefaultDevices({ audioDeviceId: e.target.value })
        }
      >
        {deviceState.audioDevices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
    );

    return (
      <Card className={undefined}>
        <h3>Microphone Devices</h3>
        { audioDeviceDropdown }
      </Card>
    );
  }

  function renderOutputDevices() {
    if (!deviceState.outputDevices.length) {
      return noDevices;
    }
    return (
      <Card className={undefined}>
        <h3>Output Devices</h3>
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
      </Card>
    );
  }

  function renderVideoDevices() {
    if (!deviceState.videoDevices.length) {
      return noDevices;
    }
    return (
      <Card className={undefined}>
        <h3>Video Devices</h3>
        <select
          onChange={(e) =>
            updateDefaultDevices({ videoDeviceId: e.target.value })
          }
        >
          {deviceState.videoDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </Card>
    );
  }
  return (
    <>
      <h1>Devices</h1>
      <div className="devices-container">
        <Card className={undefined}>
          <h3>Audio Devices</h3>
          {renderAudioDevices()}
        </Card>
        <Card className={undefined}>
          <h3>Output Devices</h3>
          {renderOutputDevices()}
        </Card>
        <Card className={undefined}>
          <h3>Video Devices</h3>
          {renderVideoDevices()}
        </Card>
      </div>
    </>
  );
}
