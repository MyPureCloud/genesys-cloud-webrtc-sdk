import { useState } from 'react';
import './AudioDevices.css';
import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';

export default function AudioDevices() {
  const { updateDefaultDevices, updateAudioVolume } = useSdk();
  const deviceState = useSelector((state) => state.devices.currentState);
  const sdk = useSelector(state => state.sdk.sdk);
  const [audioVolume, setAudioVolume] = useState(
    sdk._config.defaults.audioVolume
  );

  function updateVolume(volume: string) {
    updateAudioVolume(volume);
    setAudioVolume(volume);
  }

  function displayAudioDevices() {
    if (deviceState.audioDevices.length) {
      return <>
        <div className="audio-device-list">
          <GuxDropdown
            value={deviceState.audioDevices[0].deviceId}
            onInput={(e) =>
              updateDefaultDevices({ audioDeviceId: e.target.value })
            }
          >
            <GuxListbox>
              {deviceState.audioDevices.map((device) => (
                <GuxOption key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </GuxOption>
              ))}
            </GuxListbox>
          </GuxDropdown>
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
    } else {
      return <p>No audio devices.</p>
    }
  }

  return (
    <>
      <Card className='audio-devices-container'>
        <h4>Audio Devices</h4>
        {displayAudioDevices()}
      </Card>
    </>
  );
}
