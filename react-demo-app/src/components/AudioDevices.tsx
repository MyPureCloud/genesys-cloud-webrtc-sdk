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
  const [audioVolume, setAudioVolume] = useState(getDefaultDevices()?.audioVolume);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    const id = localStorage.getItem('inputDeviceId');
    if (id) {
      setDeviceId(id);
      updateDefaultDevices({ audioDeviceId: id });
    } else {
      const audioDeviceId =
        deviceState.audioDevices.find(d => d.label.toLowerCase().includes('default'))?.deviceId || deviceState.audioDevices[0].deviceId;
      setDeviceId(audioDeviceId);
      updateDefaultDevices({ audioDeviceId });
      localStorage.setItem('inputDeviceId', audioDeviceId);
    }
  }, []);

  function updateDevice(id: string) {
    setDeviceId(id);
    updateDefaultDevices({ audioDeviceId: id });
    localStorage.setItem('inputDeviceId', id);
  }

  function updateVolume(volume: string) {
    updateAudioVolume(volume);
    setAudioVolume(parseInt(volume));
  }

  function displayAudioDevices() {
    if (deviceState.audioDevices.length) {
      return <>
        <div className="audio-device-list">
          <GuxDropdown
            value={deviceId}
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
