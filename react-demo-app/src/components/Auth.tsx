import { FormEvent, useState } from 'react';
import './Auth.css';
import useAuth from '../hooks/useAuth';
import { GuxButton } from 'genesys-spark-components-react';
import Header from './Header';
import Card from './Card';

export default function Auth() {
  const { checkAuthToken, authenticateImplicitly } = useAuth();
  const [token, setToken] = useState('');
  const [env, setEnv] = useState('dca');

  function authenticate(event: FormEvent): void {
    event.preventDefault();
    const auth = {
      token,
      env
    }
    checkAuthToken(auth);
  }

  function handleImplicitAuth(): void {
    authenticateImplicitly(env);
  }

  return (
    <div className='auth-container'>
      <Header></Header>
      <Card className={undefined}>
        <div className="auth-content">
          <form onSubmit={authenticate}>
            <div>
              <label htmlFor="environments">Env:</label>
              <select name="environments" id="env-selector" onChange={(e) => setEnv(e.target.value)}>
                <option value="dca">DCA</option>
                <option value="pca-us">Prod</option>
              </select>
            </div>
          <div>
            <label htmlFor="auth-input">Manual Token: </label>
            <input type="text" id="auth-input" name="auth-input" onChange={(e) => setToken(e.target.value)}/>
          </div>
          <div className="auth-buttons">
            <GuxButton type="submit" onClick={authenticate}>Authenticate</GuxButton>
            <GuxButton type="button" onClick={handleImplicitAuth}>Use Implicit Auth</GuxButton>
          </div>
          </form>
        </div>
      </Card>

    </div>
  )
}
