/**
 * Entry for the public interface demo (getinhouse.org/demo): the real App
 * with a simulated, in-page assistant. No service worker — the demo should
 * never install or cache like the real PWA.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DemoClient } from './demo/client';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App client={new DemoClient()} demo />
  </React.StrictMode>
);
