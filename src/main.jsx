import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initAutosave } from './lib/projects.js';

initAutosave();
createRoot(document.getElementById('root')).render(<App />);
