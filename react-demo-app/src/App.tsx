import './App.css';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import SdkSignals from './components/SdkSignals';
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
  // SDK status renders outside the sign-in gate, so an `initialization` or `invalid_token` sdkError from a failed
  // `initialize()` (which keeps the app on the sign-in screen) is visible too.
  return <div className="app-wrapper">
    {renderDashboard()}
    <SdkSignals></SdkSignals>
  </div>;
}

export default App;
