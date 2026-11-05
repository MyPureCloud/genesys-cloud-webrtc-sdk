import './Dashboard.css';
import Softphone from './Softphone';
import Devices from './Devices';
import Header from './Header';
import NoiseTester from './NoiseTester';
import VideoSession from './VideoSession';
import InteractionLog from './InteractionLog';


export default function Dashboard() {
  return (
    <div className='dashboard-container'>
      <Header></Header>
      <Devices></Devices>
      <Softphone></Softphone>
      <NoiseTester></NoiseTester>
      <VideoSession></VideoSession>
      <InteractionLog></InteractionLog>
    </div>
  )
}
