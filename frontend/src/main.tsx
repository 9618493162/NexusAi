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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
