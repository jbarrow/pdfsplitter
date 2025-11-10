import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const modalName = 'username';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App modalName={modalName} />
  </StrictMode>,
)
