import { useState } from 'react';
import './AudioDevices.css';
import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';
import { RootState } from "../store.ts";

export default function AudioDevices() {
  const { updateDefaultDevices, updateAudioVolume } = useSdk();
  const deviceState = useSelector((state: RootState) => state.devices.currentState);
  const sdk = useSelector((state: RootState) => state.sdk.sdk);
  const [audioVolume, setAudioVolume] = useState(
    sdk?._config?.defaults?.audioVolume || 50
  );

  function updateVolume(volume: number) {
    updateAudioVolume(volume);
    setAudioVolume(volume);
  }

  // We have to do this because we are not using directory service
  const selectedDeviceId = sdk._config.defaults?.audioDeviceId || deviceState.audioDevices[0]?.deviceId;
  if (sdk && deviceState.audioDevices.length && !sdk._config.defaults?.audioDeviceId) {
    updateDefaultDevices({ audioDeviceId: selectedDeviceId });
  }

  function displayAudioDevices() {
    if (deviceState.audioDevices.length) {
      return <>
        <div className="audio-device-list">
          <GuxDropdown
            value={selectedDeviceId}
            onInput={(e) =>
              updateDefaultDevices({ audioDeviceId: e.currentTarget.value })
            }
          >
            <GuxListbox>
              {deviceState.audioDevices.map((device: MediaDeviceInfo) => (
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
            onChange={(e) => updateVolume(+e.target.value)}
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
