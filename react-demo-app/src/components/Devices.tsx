import './Devices.css';
import AudioDevices from './AudioDevices';
import OutputDevices from './OutputDevices';
import VideoDevices from './VideoDevices';
import MediaControls from './MediaControls';
import MediaStateCounts from './MediaStateCounts';
import Card from './Card';

export default function Devices() {
  return (
    <>
      <Card className='devices-card'>
        <h2 className='gux-heading-lg-semibold'>Devices</h2>
        <div className='devices-container'>
          <MediaControls></MediaControls>
          <AudioDevices></AudioDevices>
          <OutputDevices></OutputDevices>
          <VideoDevices></VideoDevices>
          <MediaStateCounts></MediaStateCounts>
        </div>
      </Card>
    </>
  );
}
