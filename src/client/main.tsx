import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

if (typeof window !== 'undefined' && localStorage.getItem('store_ops_theme') === 'dark') {
  document.documentElement.dataset.theme = 'dark';
}
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
