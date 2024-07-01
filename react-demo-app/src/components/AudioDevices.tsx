import { useState } from 'react';
import './AudioDevices.css';
import Card from './Card';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';

export default function AudioDevices() {
  const { updateDefaultDevices, updateAudioVolume } = useSdk();
  const deviceState = useSelector((state) => state.devices.currentState);
  const [audioVolume, setAudioVolume] = useState(
    window['webrtcSdk']._config.defaults.audioVolume
  );

  function updateVolume(volume: string) {
    updateAudioVolume(volume);
    setAudioVolume(volume);
  }

  return (
    <>
      <Card className={'audio-devices-container'}>
        <h4>Audio Devices</h4>
        {deviceState.audioDevices.length ? (
          <>
            <div className="audio-device-list">
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
            </div>
            <div className="audio-device-volume">
              <label htmlFor="audio-volume">Audio Volume</label>
              <input
                name="audio-volume"
                type="range"
                min="0"
                max="100"
                value={audioVolume}
                onChange={(e) => updateVolume(e.target.value)}
              />
              <span className="audio-volume-tooltip">{audioVolume}%</span>
            </div>
          </>
        ) : (
          <p>No audio devices.</p>
        )}
      </Card>
    </>
  );
}
