import './App.css'
import Auth from './components/Auth';
import { Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';

function App() {
  return (
    <div className='app-wrapper'>
      <Routes>
        <Route path ='/' element={<Auth/>} />
        <Route path ='/dashboard' element={<Dashboard />} />
      </Routes>
    </div>
  )
}

export default App
