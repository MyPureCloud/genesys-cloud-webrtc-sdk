import { GuxDropdown, GuxListbox, GuxOption } from 'genesys-spark-components-react';
import useSdk from '../hooks/useSdk';
import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';
import { useEffect, useState } from "react";

export default function VideoDevices() {
  const { updateDefaultDevices } = useSdk();
  const deviceState = useSelector((state: RootState) => state.devices.currentState);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    const id = localStorage.getItem('videoDeviceId');
    if (id) {
      setDeviceId(id);
      updateDefaultDevices({ videoDeviceId: id });
    } else {
      const videoDeviceId = deviceState.videoDevices[0].deviceId;
      setDeviceId(videoDeviceId);
      updateDefaultDevices({ videoDeviceId });
      localStorage.setItem('videoDeviceId', videoDeviceId);
    }
  }, []);

  function updateDevice(id: string) {
    setDeviceId(id);
    updateDefaultDevices({ videoDeviceId: id });
    localStorage.setItem('videoDeviceId', id);
  }

  function generateVideoDevices() {
    if (deviceState.videoDevices.length) {
      return (
        <GuxDropdown
          value={deviceId}
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
