import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';

export default function MediaStateCounts() {
  const gumRequests = useSelector((state: RootState) => state.devices.gumRequests);
  const mediaStateChanges = useSelector((state: RootState) => state.devices.stateChanges);

  return (
    <Card className='media-state-counts'>
      <h4>Media Requests</h4>
      <p>Media State Changes: {mediaStateChanges}</p>
      <p>gUM Requests: {gumRequests}</p>
    </Card>
  )
}
