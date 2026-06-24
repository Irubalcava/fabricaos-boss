import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'

// Registrar Service Worker para PWA + push notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw-boss.js', { scope: '/' })
      .then(reg => {
        // Forzar actualización si hay nueva versión
        reg.onupdatefound = () => {
          const newSW = reg.installing
          if (newSW) {
            newSW.onstatechange = () => {
              if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                newSW.postMessage({ type: 'SKIP_WAITING' })
              }
            }
          }
        }
      })
      .catch(err => console.warn('SW no registrado:', err))
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
