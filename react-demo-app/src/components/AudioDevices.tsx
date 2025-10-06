import { useEffect, useState } from 'react';
import './AudioDevices.css';
import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';

export default function AudioDevices() {
  const { updateDefaultDevices, updateAudioVolume, getDefaultDevices } = useSdk();
  const deviceState = useSelector((state: RootState) => state.devices.currentState);
  const [audioVolume, setAudioVolume] = useState(
    getDefaultDevices()?.audioVolume
  );

  useEffect(() => {
    const id = localStorage.getItem('inputDeviceId');
    if (id) {
      updateDefaultDevices({ audioDeviceId: id });
    } else {
      const defaultDeviceId = getDefaultDevices()?.audioDeviceId || deviceState.audioDevices[0].deviceId;
      updateDefaultDevices({ audioDeviceId: defaultDeviceId });
      localStorage.setItem('inputDeviceId', defaultDeviceId);
    }
  }, []);

  function updateDevice(id: string) {
    updateDefaultDevices({ audioDeviceId: id });
    localStorage.setItem('inputDeviceId', id);
  }

  function updateVolume(volume: number) {
    updateAudioVolume(volume);
    setAudioVolume(volume);
  }

  function displayAudioDevices() {
    if (deviceState.audioDevices.length) {
      return <>
        <div className="audio-device-list">
          <GuxDropdown
            value={getDefaultDevices()?.audioDeviceId}
            onInput={(e) =>
              updateDevice(e.currentTarget.value)
            }
          >
            <GuxListbox>
              {deviceState.audioDevices.map((device: MediaDeviceInfo) => (
                <GuxOption key={`${device.deviceId}${device.label}`} value={device.deviceId}>
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
