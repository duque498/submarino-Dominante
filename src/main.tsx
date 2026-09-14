import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Escotilha } from './ui/Escotilha'
import './estilos.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Escotilha>
      <App />
    </Escotilha>
  </StrictMode>,
)
