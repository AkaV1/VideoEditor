import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initAutosave } from './lib/projects.js';
import { initFonts } from './lib/fonts.js';

initAutosave();
initFonts();
createRoot(document.getElementById('root')).render(<App />);
