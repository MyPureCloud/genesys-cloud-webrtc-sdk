import './App.css';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import { useSelector } from 'react-redux';
import { RootState } from "./store.ts";

function App() {
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

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
