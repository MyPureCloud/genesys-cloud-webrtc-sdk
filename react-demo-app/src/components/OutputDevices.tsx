import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';

export default function OutputDevices() {
  const { updateDefaultDevices } = useSdk();
  const deviceState = useSelector((state: RootState) => state.devices.currentState);
  const sdk = useSelector((state: RootState) => state.sdk.sdk);

  // We have to do this because we are not using directory service
  const selectedDeviceId = sdk?._config.defaults?.outputDeviceId || deviceState.outputDevices[0]?.deviceId;
  if (selectedDeviceId && !sdk?._config.defaults?.outputDeviceId) {
    updateDefaultDevices({ outputDeviceId: selectedDeviceId });
  }

  return (
    <>
      <Card className="output-devices-container">
        <h4>Output Devices</h4>
        {deviceState.outputDevices.length ? (
          <GuxDropdown
            value={selectedDeviceId}
            onInput={(e) =>
              updateDefaultDevices({ outputDeviceId: e.currentTarget.value })
            }
          >
            <GuxListbox>
              {deviceState.outputDevices.map((device: MediaDeviceInfo) => (
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
