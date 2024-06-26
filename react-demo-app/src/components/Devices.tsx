import { useSelector } from 'react-redux';
import './Devices.css';
import Card from './Card';
import useSdk from '../hooks/useSdk';

export default function Devices() {
  const deviceState = useSelector((state) => state.devices);
  const { updateDefaultDevices, enumerateDevices, requestDevicePermissions } =
    useSdk();
  const noDevices: JSX.Element = <p>No devices found.</p>;

  function renderAudioDevices() {
    if (!deviceState.audioDevices.length) {
      return noDevices;
    }

    return (
      <>
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
      </>
    );
  }

  function renderOutputDevices() {
    if (!deviceState.outputDevices.length) {
      return noDevices;
    }
    return (
      <>
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
      </>
    );
  }

  function renderVideoDevices() {
    if (!deviceState.videoDevices.length) {
      return noDevices;
    }
    return (
      <>
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
      </>
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
        <Card className={'device-controls'}>
          <h3>Media Controls</h3>
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
      </div>
    </>
  );
}
