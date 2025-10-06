import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';
import { useEffect } from "react";

export default function OutputDevices() {
  const { updateDefaultDevices, getDefaultDevices } = useSdk();
  const deviceState = useSelector((state: RootState) => state.devices.currentState);

  useEffect(() => {
    const id = localStorage.getItem('outputDeviceId');
    if (id) {
      updateDefaultDevices({ outputDeviceId: id });
    } else {
      const defaultDeviceId = getDefaultDevices()?.outputDeviceId || deviceState.outputDevices[0].deviceId;
      updateDefaultDevices({ outputDeviceId: defaultDeviceId });
      localStorage.setItem('outputDeviceId', defaultDeviceId);
    }
  }, []);

  function updateDevice(id: string) {
    updateDefaultDevices({ outputDeviceId: id });
    localStorage.setItem('outputDeviceId', id);
  }

  return (
    <>
      <Card className="output-devices-container">
        <h4>Output Devices</h4>
        {deviceState.outputDevices.length ? (
          <GuxDropdown
            value={getDefaultDevices()?.outputDeviceId}
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
