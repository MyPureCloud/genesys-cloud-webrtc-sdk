import './Dashboard.css';
import Card from './Card';
import Softphone from './Softphone';
import Devices from './Devices';


export default function Dashboard() {
  return (
    <div className='dashboard-container'>
      <Card children={<Softphone></Softphone>} className='dashboard-card' />
      <Card children={<Devices></Devices>} className='dashboard-card' />
    </div>
  )
}
