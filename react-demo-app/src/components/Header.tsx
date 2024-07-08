import Card from './Card';
import './Header.css';
import { GuxIcon } from 'genesys-spark-components-react';

export default function Header() {
  return (
    <div className='header-container'>
      <Card className='header-card'>
        <div className='header-content'>
          <GuxIcon className='header-logo' iconName='custom/genesys' size='large' decorative={true}></GuxIcon>
          <h1 className='gux-heading-lg-bold'>WebRTC SDK</h1>
        </div>
      </Card>
    </div>
  )
}
