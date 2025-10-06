import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';
import { useEffect } from "react";

export default function VideoDevices() {
  const { updateDefaultDevices, getDefaultDevices } = useSdk();
  const deviceState = useSelector((state: RootState) => state.devices.currentState);

  useEffect(() => {
    const id = localStorage.getItem('videoDeviceId');
    if (id) {
      updateDefaultDevices({ videoDeviceId: id });
    } else {
      const defaultDeviceId = getDefaultDevices()?.videoDeviceId || deviceState.videoDevices[0].deviceId;
      updateDefaultDevices({ videoDeviceId: defaultDeviceId });
      localStorage.setItem('videoDeviceId', defaultDeviceId);
    }
  }, []);

  function updateDevice(id: string) {
    updateDefaultDevices({ videoDeviceId: id });
    localStorage.setItem('videoDeviceId', id);
  }

  function generateVideoDevices() {
    if (deviceState.videoDevices.length) {
      return (
        <GuxDropdown
          value={getDefaultDevices()?.videoDeviceId}
          onInput={(e) =>
            updateDevice(e.currentTarget.value)
          }
        >
          <GuxListbox>
            {deviceState.videoDevices.map((device: MediaDeviceInfo) => (
              <GuxOption key={`${device.deviceId}${device.label}`} value={device.deviceId}>
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
