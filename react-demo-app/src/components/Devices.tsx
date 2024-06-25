import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import Card from './Card';

export default function Devices() {
  const deviceState = useSelector(
    (state) => state.devices
  );

  return (
    <>
      <h1>Devices</h1>
      <Card className={undefined}>
        <h3>Microphone Devices</h3>
        <select name="audio-devices">
          {deviceState.audioDevices.map((device) => (
            <option>{device.label}</option>
          ))}
        </select>
      </Card>
      <Card className={undefined}>
        <h3>Output Devices</h3>
        <select name="output-devices">
          {deviceState.outputDevices.map((device) => (
            <option>{device.label}</option>
          ))}
        </select>
      </Card>
      <Card className={undefined}>
        <h3>Video Devices</h3>
        <select name="video-devices">
          {deviceState.videoDevices.map((device) => (
            <option>{device.label}</option>
          ))}
        </select>
      </Card>
    </>
  );
}
