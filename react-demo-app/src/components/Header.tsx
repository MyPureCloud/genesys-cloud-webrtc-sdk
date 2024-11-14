import { useSelector } from 'react-redux';
import { IAuthState } from '../features/authSlice';
import useAuth from '../hooks/useAuth';
import Card from './Card';
import './Header.css';
import { GuxButton, GuxIcon } from 'genesys-spark-components-react';

export default function Header() {
  const { logout } = useAuth();
  const isAuthenticated = useSelector((state: IAuthState) => state.auth.isAuthenticated);

  const logoutButton = () => {
    if (isAuthenticated) {
      return <GuxButton type="submit" onClick={logout}>Logout</GuxButton>;
    }
  }
  
  return (
    <div className='header-container'>
      <Card className='header-card'>
        <div className='header-content'>
          <GuxIcon className='header-logo' iconName='custom/genesys' size='large' decorative={true}></GuxIcon>
          <h1 className='gux-heading-lg-bold'>Genesys Cloud WebRTC SDK</h1>
        </div>
        <div className='actions-container'>
          {logoutButton()}
        </div>
        
      </Card>
    </div>
  )
}
