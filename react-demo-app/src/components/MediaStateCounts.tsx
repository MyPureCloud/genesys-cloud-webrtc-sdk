import { useSelector } from 'react-redux';
import Card from './Card';

export default function MediaStateCounts() {
  const gumRequests = useSelector((state) => state.devices.gumRequests);
  const mediaStateChanges = useSelector((state) => state.devices.stateChanges);

  return (
    <Card className='media-state-counts'>
      <h4>Media Requests</h4>
      <p>Media State Changes: {mediaStateChanges}</p>
      <p>gUM Requests: {gumRequests}</p>
    </Card>
  )
}
