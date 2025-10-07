import './App.css';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import { useSelector } from 'react-redux';
import { IAuthState } from './features/authSlice';

function App() {
  const isAuthenticated = useSelector((state: IAuthState) => state.auth.isAuthenticated);

  function renderDashboard() {
    if (isAuthenticated) {
      return <Dashboard></Dashboard>;
    }
    return <Auth></Auth>;
  }
  return <div className="app-wrapper">
    {renderDashboard()}
  </div>;
}

export default App;
