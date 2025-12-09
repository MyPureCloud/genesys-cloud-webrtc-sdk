import './Dashboard.css';
import Softphone from './Softphone';
import Devices from './Devices';
import Header from './Header';
import Video from "./Video/Video.tsx";


export default function Dashboard() {
  return (
    <div className='dashboard-container'>
      <Header></Header>
      <Devices></Devices>
      <Softphone></Softphone>
      <Video></Video>
    </div>
  )
}
