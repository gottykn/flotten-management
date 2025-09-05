import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'  // ← .tsx Extension
import './index.css'

// CSS-Debug
console.log('🎨 CSS loaded from main.tsx');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

