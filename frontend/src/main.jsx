import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ToastProvider } from './hooks/useToast.jsx';
import './theme/tokens.css';
import './theme/base.css';
import './theme/components.css';
import './theme/layout.css';
import './theme/pages.css';

document.documentElement.setAttribute('data-theme', localStorage.getItem('portal_theme') || 'dark');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
