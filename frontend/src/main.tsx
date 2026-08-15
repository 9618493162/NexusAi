import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { useThemeStore } from './store/theme.store'

// Apply the persisted theme to <html> BEFORE the first render so the whole
// document (including <body>) resolves the dark CSS variables correctly.
// Without this, <body> stays in light-mode colors and inherited text color
// becomes near-black on dark backgrounds (invisible input text).
document.documentElement.classList.toggle('dark', useThemeStore.getState().isDark)

// BASE_URL is "/" at the root and "/NexusAi/" on GitHub Pages (set via
// VITE_BASE). React Router wants the basename without a trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
