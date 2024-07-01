import './Devices.css';
import AudioDevices from './AudioDevices';
import OutputDevices from './OutputDevices';
import VideoDevices from './VideoDevices';
import MediaControls from './MediaControls';

export default function Devices() {
  return (
    <>
      <h1>Devices</h1>
      <div className='devices-container'>
        <MediaControls></MediaControls>
        <AudioDevices></AudioDevices>
        <OutputDevices></OutputDevices>
        <VideoDevices></VideoDevices>
      </div>
    </>
  );
}
