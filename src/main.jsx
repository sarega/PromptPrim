// src/main.jsx

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './js/react-components/App.jsx'

// หา "บ้าน" ของ React ที่เราสร้างไว้ใน index.html
const reactRootElement = document.getElementById('react-root');
if (reactRootElement) {
  // สร้าง React root และ render App ของเราลงไป
  ReactDOM.createRoot(reactRootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}