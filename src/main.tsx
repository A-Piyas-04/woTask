import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { FONT_STACK } from './contracts/tokens';
import './ui/ui.css';

document.documentElement.style.setProperty('--font-stack', FONT_STACK);

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
