import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'normalize.css'; // CSS reset
import { store } from './store.ts';
import { Provider } from 'react-redux';
import { registerElements } from 'genesys-spark-components';

// Proxy API requests through Vite dev server when not on localhost (avoids CORS)
if (window.location.hostname !== 'localhost') {
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...args: any[]) {
    const urlStr = url.toString();
    if (urlStr.includes('://api.inindca.com/api/')) {
      url = urlStr.replace('https://api.inindca.com/api/', '/proxy-api/');
    }
    return origOpen.call(this, method, url, ...args);
  } as typeof origOpen;
}


registerElements();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
)
