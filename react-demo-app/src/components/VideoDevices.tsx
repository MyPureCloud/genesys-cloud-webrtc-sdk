import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';

export default function OutputDevices() {
  const { updateDefaultDevices } = useSdk();
  const deviceState = useSelector((state) => state.devices.currentState);

  return (
    <>
      <Card className="video-devices-contaner">
        <h4>Video Devices</h4>
        {deviceState.videoDevices.length ? (
          <GuxDropdown
            value={deviceState.videoDevices[0].deviceId}
            onInput={(e) =>
              updateDefaultDevices({ videoDeviceId: e.target.value })
            }
          >
            <GuxListbox>
              {deviceState.videoDevices.map((device) => (
                <GuxOption key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </GuxOption>
              ))}
            </GuxListbox>
          </GuxDropdown>
        ) : (
          <p>No video devices.</p>
        )}
      </Card>
    </>
  );
}