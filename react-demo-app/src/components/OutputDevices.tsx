import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';

export default function OutputDevices() {
  const { updateDefaultDevices } = useSdk();
  const deviceState = useSelector((state) => state.devices.currentState);

  return (
    <>
      <Card className="output-devices-container">
        <h4>Output Devices</h4>
        {deviceState.outputDevices.length ? (
          <GuxDropdown
            value={deviceState.outputDevices[0].deviceId}
            onInput={(e) =>
              updateDefaultDevices({ outputDeviceId: e.target.value })
            }
          >
            <GuxListbox>
              {deviceState.outputDevices.map((device) => (
                <GuxOption key={device.deviceId} value={device.deviceId}>
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
