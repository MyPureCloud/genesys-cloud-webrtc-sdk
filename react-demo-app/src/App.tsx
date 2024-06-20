import './App.css'
import Auth from './components/Auth';
import { Routes, Route } from 'react-router-dom';

function App() {

  return (
    <div className='app-wrapper'>
      <Routes>
        <Route path ='/' element={<Auth/>} />
      </Routes>
    </div>
  )
}

export default App
