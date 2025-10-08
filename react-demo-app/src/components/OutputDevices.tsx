import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';
import { useEffect, useState } from "react";

export default function OutputDevices() {
  const { updateDefaultDevices, getDefaultDevices, updateAudioVolume } = useSdk();
  const deviceState = useSelector((state: RootState) => state.devices.currentState);
  const [deviceId, setDeviceId] = useState('');
  const [audioVolume, setAudioVolume] = useState(getDefaultDevices()?.audioVolume);

  useEffect(() => {
    const id = localStorage.getItem('outputDeviceId');
    if (id) {
      setDeviceId(id);
      updateDefaultDevices({ outputDeviceId: id });
    } else {
      const outputDeviceId =
        deviceState.outputDevices.find(d => d.label.toLowerCase().includes('default'))?.deviceId || deviceState.outputDevices[0].deviceId;
      setDeviceId(outputDeviceId);
      updateDefaultDevices({ outputDeviceId });
      localStorage.setItem('outputDeviceId', outputDeviceId);
    }
  }, []);

  function updateDevice(id: string) {
    setDeviceId(id);
    updateDefaultDevices({ outputDeviceId: id });
    localStorage.setItem('outputDeviceId', id);
  }

  function updateVolume(volume: string) {
    updateAudioVolume(volume);
    setAudioVolume(parseInt(volume));
  }

  return (
    <>
      <Card className="output-devices-container">
        <h4>Output Devices</h4>
        {deviceState.outputDevices.length ? (
          <div>
            <GuxDropdown
              value={deviceId}
              onInput={(e) =>
                updateDevice(e.currentTarget.value)
              }
            >
              <GuxListbox>
                {deviceState.outputDevices.map((device: MediaDeviceInfo) => (
                  <GuxOption key={`${device.deviceId}${device.label}`} value={device.deviceId}>
                    {device.label}
                  </GuxOption>
                ))}
              </GuxListbox>
            </GuxDropdown>
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
          </div>
        ) : (
          <p>No output devices.</p>
        )}
      </Card>
    </>
  );
}
