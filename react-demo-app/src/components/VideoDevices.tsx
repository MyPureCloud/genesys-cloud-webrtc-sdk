import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from "../store.ts";

export default function VideoDevices() {
  const { updateDefaultDevices } = useSdk();
  const deviceState = useSelector((state: RootState) => state.devices.currentState);
  const sdk = useSelector((state: RootState) => state.sdk.sdk);

  // We have to do this to set Device defaults on boot
  // because we are not using directory service
  const selectedDeviceId = sdk._config.defaults?.videoDeviceId || deviceState.videoDevices[0]?.deviceId;
  if (sdk && deviceState.videoDevices.length && !sdk._config.defaults?.videoDeviceId) {
    updateDefaultDevices({ videoDeviceId: selectedDeviceId });
  }

  function generateVideoDevices() {
    if (deviceState.videoDevices.length) {
      return (
        <GuxDropdown
          value={selectedDeviceId}
          onInput={(e) =>
            updateDefaultDevices({ videoDeviceId: e.currentTarget.value })
          }
        >
          <GuxListbox>
            {deviceState.videoDevices.map((device) => (
              <GuxOption key={device.deviceId} value={device.deviceId}>
                {device.label}
              </GuxOption>
            ))}
          </GuxListbox>
        </GuxDropdown>);
    } else {
      return <p>No video devices.</p>;
    }
  }
  return (
    <>
      <Card className="video-devices-container">
        <h4>Video Devices</h4>
        {generateVideoDevices()}
      </Card>
    </>
  );
}
