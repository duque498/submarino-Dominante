import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Escotilha } from './ui/Escotilha'
import { ligarCapturaDeFalhas } from './ui/falhas'
import './estilos.css'

// Antes de montar: erro em laço de animação ou em promessa não passa pelo
// error boundary, e sem isto some sem deixar rastro.
ligarCapturaDeFalhas()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Escotilha>
      <App />
    </Escotilha>
  </StrictMode>,
)
