import { useEffect, useRef, useState } from 'react'
import { quadroSeguro } from '../ui/falhas'

/**
 * Como o sonar mede distância.
 *
 * Ilustração da fala do grupo 1, não uma aula nova: eles explicam o princípio,
 * este painel mostra a conta acontecendo. Dispara um ping, a onda sai do
 * submarino, bate no obstáculo e volta; o cronômetro conta o tempo real e o
 * painel escreve `t = 2d / 1500`.
 *
 * O tempo aqui é REAL, não acelerado: a 900 m o eco leva 1,20 s e a barra
 * demora 1,20 s pra fechar. Acelerar mostraria um número que não é o que a
 * plateia vê acontecer, e aí a conta vira enfeite.
 */

/** Velocidade do som na água salgada, em m/s. O número que o grupo 1 usa. */
const VELOCIDADE = 1500
const DIST_MIN = 100
const DIST_MAX = 3000
const PASSO = 100

type Props = {
  /** Esc fecha, como em todo painel que captura o teclado. */
  aoFechar?: () => void
  /** Toca o ping de sonar: o mesmo efeito do painel de varredura. */
  aoPing?: () => void
}

type Onda = { inicio: number; distancia: number; ecoOuvido: boolean }

export function PainelEco({ aoFechar, aoPing }: Props) {
  const [distancia, setDistancia] = useState(900)
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const refDistancia = useRef(distancia)
  refDistancia.current = distancia
  const refOnda = useRef<Onda | null>(null)
  const refPing = useRef(aoPing)
  refPing.current = aoPing
  const refCrono = useRef<HTMLSpanElement>(null)

  const disparar = () => {
    refOnda.current = { inicio: performance.now(), distancia: refDistancia.current, ecoOuvido: false }
    refPing.current?.()
  }
  const refDisparar = useRef(disparar)
  refDisparar.current = disparar

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        aoFechar?.()
        return
      }
      if (evento.key === 'ArrowUp' || evento.key === 'ArrowDown') {
        evento.preventDefault()
        const sinal = evento.key === 'ArrowUp' ? 1 : -1
        const passo = evento.shiftKey ? PASSO * 5 : PASSO
        setDistancia((d) => Math.max(DIST_MIN, Math.min(DIST_MAX, d + sinal * passo)))
        return
      }
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault()
        refDisparar.current()
      }
    }
    window.addEventListener('keydown', aoTeclar, true)
    return () => window.removeEventListener('keydown', aoTeclar, true)
  }, [aoFechar])

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let L = 0
    let A = 0
    const ajustar = () => {
      const caixa = canvas.getBoundingClientRect()
      L = Math.max(1, Math.round(caixa.width))
      A = Math.max(1, Math.round(caixa.height))
      canvas.width = L
      canvas.height = A
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(canvas)

    let quadro = 0
    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(protegido)
      ctx.clearRect(0, 0, L, A)

      const margem = L * 0.1
      const y = A * 0.52
      const xSub = margem
      const xObs = L - margem
      const trilho = xObs - xSub

      // trilho: a água entre o submarino e o obstáculo
      ctx.strokeStyle = 'rgba(56, 232, 255, 0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(xSub, y)
      ctx.lineTo(xObs, y)
      ctx.stroke()

      // régua de distância
      ctx.fillStyle = 'rgba(56, 232, 255, 0.45)'
      ctx.font = `${Math.max(9, L * 0.015)}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      for (let k = 0; k <= 4; k++) {
        const x = xSub + (trilho * k) / 4
        ctx.fillRect(x, y + 10, 1, 6)
        ctx.fillText(`${Math.round((refDistancia.current * k) / 4)} m`, x, y + 30)
      }

      const onda = refOnda.current
      const tempoTotal = (2 * refDistancia.current) / VELOCIDADE

      if (onda) {
        const decorrido = (agora - onda.inicio) / 1000
        const total = (2 * onda.distancia) / VELOCIDADE
        if (decorrido > total + 1.2) {
          refOnda.current = null
        } else {
          // Ida no primeiro metade, volta na segunda. A frente da onda é o que
          // a plateia acompanha; o rastro atrás dela dá a direção.
          const fracao = Math.min(1, decorrido / total)
          const ida = fracao <= 0.5
          const p = ida ? fracao * 2 : (1 - fracao) * 2
          const x = xSub + trilho * p

          ctx.strokeStyle = ida ? 'rgba(77, 255, 166, 0.9)' : 'rgba(255, 194, 77, 0.9)'
          ctx.lineWidth = 2
          for (let k = 0; k < 3; k++) {
            const desloca = (ida ? -1 : 1) * k * L * 0.016
            ctx.globalAlpha = 1 - k * 0.3
            ctx.beginPath()
            ctx.arc(x + desloca, y, A * 0.1 + k * 3, ida ? -0.9 : Math.PI - 0.9, ida ? 0.9 : Math.PI + 0.9)
            ctx.stroke()
          }
          ctx.globalAlpha = 1

          // O eco chegando também toca: é o segundo ping que fecha a conta,
          // e é ele que a plateia liga ao número parando no cronômetro.
          if (decorrido >= total && !onda.ecoOuvido) {
            onda.ecoOuvido = true
            refPing.current?.()
          }
        }
      }

      // obstáculo: um paredão de rocha
      ctx.fillStyle = 'rgba(30, 120, 130, 0.8)'
      ctx.beginPath()
      ctx.moveTo(xObs, y - A * 0.3)
      ctx.lineTo(xObs + L * 0.07, y - A * 0.34)
      ctx.lineTo(xObs + L * 0.07, y + A * 0.34)
      ctx.lineTo(xObs, y + A * 0.3)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(189, 255, 240, 0.6)'
      ctx.font = `${Math.max(9, L * 0.016)}px ui-monospace, monospace`
      ctx.textAlign = 'right'
      ctx.fillText('OBSTÁCULO', xObs - 8, y - A * 0.33)

      // submarino
      ctx.fillStyle = 'rgba(77, 255, 166, 0.95)'
      // Proporções em L nos dois eixos: com a altura em A o ícone virava bola
      // num painel baixo, e submarino redondo não lê como submarino.
      ctx.beginPath()
      ctx.ellipse(xSub, y, L * 0.032, L * 0.012, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(xSub - L * 0.005, y - L * 0.028, L * 0.01, L * 0.02)
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(189, 255, 240, 0.6)'
      ctx.fillText('DOMI', xSub - L * 0.02, y - A * 0.12)

      // cronômetro ao vivo
      if (refCrono.current) {
        const decorrido = onda ? Math.min((agora - onda.inicio) / 1000, tempoTotal) : 0
        refCrono.current.textContent = `${decorrido.toFixed(2).replace('.', ',')} s`
      }
    }

    const protegido = quadroSeguro('painel eco', desenhar)
    quadro = requestAnimationFrame(protegido)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [])

  const tempo = (2 * distancia) / VELOCIDADE

  return (
    <div className="painel__eco">
      <canvas ref={refCanvas} className="painel__eco-canvas" />
      <div className="eco__conta">
        <p className="eco__formula">
          <span className="eco__var">t</span>
          <span className="eco__igual">=</span>
          <span className="eco__fracao">
            <span className="eco__cima">2 × {distancia} m</span>
            <span className="eco__baixo">1500 m/s</span>
          </span>
          <span className="eco__igual">=</span>
          <span className="eco__valor">{tempo.toFixed(2).replace('.', ',')} s</span>
        </p>
        <p className="eco__cronometro">
          decorrido: <span ref={refCrono}>0,00 s</span>
        </p>
      </div>
      <p className="painel__legenda eco__rodape">
        velocidade do som na água ≈ 1500 m/s (cerca de 5× a do ar) ·
        <strong> enter</strong> dispara · <strong>↑ ↓</strong> muda a distância · esc fecha
      </p>
    </div>
  )
}
