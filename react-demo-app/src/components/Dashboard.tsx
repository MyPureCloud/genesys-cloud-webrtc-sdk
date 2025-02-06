import './Dashboard.css';
import Softphone from './Softphone';
import Devices from './Devices';
import Header from './Header';
import Video from './Video';


export default function Dashboard() {
  return (
    <div className='dashboard-container'>
      <Header></Header>
      <Video></Video>
      <Devices></Devices>
      <Softphone></Softphone>
    </div>
  )
}
