import React from 'react'
import './Dashboard.css';
import Card from './Card';
import Softphone from './Softphone';


export default function Dashboard() {
  return (
    <>
      <Card children={<Softphone></Softphone>} className={'card-1'} />
      <Card children={<h1>Video</h1>} className={undefined} />
      <Card children={<h1>Devices</h1>} className={undefined} />
    </>
  )
}
