import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'normalize.css'; // CSS reset
import { store } from './store.ts';
import { Provider } from 'react-redux';
import { registerElements } from 'genesys-spark-components';


registerElements();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <App />
  </Provider>
)
