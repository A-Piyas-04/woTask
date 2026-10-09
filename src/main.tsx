import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { FONT_STACK } from './contracts/tokens';
import './ui/ui.css';

document.documentElement.style.setProperty('--font-stack', FONT_STACK);

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

// No StrictMode: drei <Html> creates nested React roots, and StrictMode's double-mount
// unmounts one of them mid-render, losing a card label.
createRoot(root).render(<App />);
