import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Apply theme before render to prevent FOUC
const stored = localStorage.getItem('sitescope-theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme = stored === 'light' || stored === 'dark' ? stored : (prefersDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', theme);
document.documentElement.style.visibility = '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
