import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';
import { useEffect, useState } from "react";

export default function OutputDevices() {
  const { updateDefaultDevices } = useSdk();
  const deviceState = useSelector((state: RootState) => state.devices.currentState);
  const [deviceId, setDeviceId] = useState('');

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

  return (
    <>
      <Card className="output-devices-container">
        <h4>Output Devices</h4>
        {deviceState.outputDevices.length ? (
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
        ) : (
          <p>No output devices.</p>
        )}
      </Card>
    </>
  );
}
