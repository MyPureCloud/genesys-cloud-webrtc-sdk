import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'normalize.css'; // CSS reset
import { store } from './store.ts';
import { Provider } from 'react-redux';
import { registerElements } from 'genesys-spark-components';


registerElements();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
)
