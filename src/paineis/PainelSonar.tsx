import { useEffect, useRef } from 'react'

const ANEIS = [200, 400, 600, 800]
const MAX_BLIPS = 7
/** Velocidade da varredura, em rad/s. Uma volta leva ~4,8 s. */
const VELOCIDADE = 1.3
/** Topo do mostrador: no canvas o y cresce pra baixo, então 12h é 3π/2. */
const TOPO = (Math.PI * 3) / 2

type Blip = { angulo: number; distancia: number; nascimento: number; vida: number }

type Props = {
  /**
   * Toca o ping. Uma vez por volta, quando a varredura passa pelo topo — que é
   * a referência que todo mundo reconhece num mostrador de sonar. Mais que isso
   * vira barulho: o painel pode ficar minutos aberto na frente da plateia.
   */
  aoPing?: () => void
}

/** Varredura de sonar. Puramente animada — nenhum dado real por trás. */
export function PainelSonar({ aoPing }: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  // Numa ref pra não religar a animação quando o Player recria o callback.
  const refPing = useRef(aoPing)
  refPing.current = aoPing

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const blips: Blip[] = []
    let lado = 0
    const ajustar = () => {
      const caixa = canvas.getBoundingClientRect()
      lado = Math.max(1, Math.round(Math.min(caixa.width, caixa.height)))
      canvas.width = lado
      canvas.height = lado
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(canvas)

    let quadro = 0
    // Começa logo antes do topo pra o primeiro ping sair quase junto com a
    // abertura do painel, em vez de o operador esperar uma volta inteira.
    let angulo = TOPO - 0.25
    let anterior = performance.now()

    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(desenhar)
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora
      const anguloAnterior = angulo
      angulo = (angulo + dt * VELOCIDADE) % (Math.PI * 2)
      // A volta zera o ângulo, então só conta cruzamento sem dar a volta.
      if (anguloAnterior < TOPO && angulo >= TOPO) refPing.current?.()

      const c = lado / 2
      const raio = c * 0.92
      ctx.clearRect(0, 0, lado, lado)

      // anéis de distância
      ctx.strokeStyle = 'rgba(56, 232, 255, 0.28)'
      ctx.lineWidth = 1
      ctx.font = `${Math.max(8, lado * 0.032)}px ui-monospace, monospace`
      ctx.fillStyle = 'rgba(56, 232, 255, 0.5)'
      ANEIS.forEach((metros, i) => {
        const r = (raio * (i + 1)) / ANEIS.length
        ctx.beginPath()
        ctx.arc(c, c, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillText(`${metros} m`, c + 4, c - r + 12)
      })

      // cruz central
      ctx.beginPath()
      ctx.moveTo(c - raio, c)
      ctx.lineTo(c + raio, c)
      ctx.moveTo(c, c - raio)
      ctx.lineTo(c, c + raio)
      ctx.strokeStyle = 'rgba(56, 232, 255, 0.16)'
      ctx.stroke()

      // rastro da varredura
      const rastro = ctx.createConicGradient?.(angulo - 0.9, c, c)
      if (rastro) {
        rastro.addColorStop(0, 'rgba(77, 255, 166, 0)')
        rastro.addColorStop(0.22, 'rgba(77, 255, 166, 0.22)')
        rastro.addColorStop(0.25, 'rgba(77, 255, 166, 0)')
        ctx.fillStyle = rastro
        ctx.beginPath()
        ctx.arc(c, c, raio, 0, Math.PI * 2)
        ctx.fill()
      }

      // linha da varredura
      ctx.beginPath()
      ctx.moveTo(c, c)
      ctx.lineTo(c + Math.cos(angulo) * raio, c + Math.sin(angulo) * raio)
      ctx.strokeStyle = 'rgba(77, 255, 166, 0.9)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // contatos: nascem sob a varredura e desbotam
      if (blips.length < MAX_BLIPS && Math.random() < 0.02) {
        blips.push({
          angulo: angulo + (Math.random() - 0.5) * 0.2,
          distancia: 0.2 + Math.random() * 0.75,
          nascimento: agora,
          vida: 2500 + Math.random() * 3500,
        })
      }
      for (let i = blips.length - 1; i >= 0; i--) {
        const blip = blips[i]
        const idade = (agora - blip.nascimento) / blip.vida
        if (idade >= 1) {
          blips.splice(i, 1)
          continue
        }
        const bx = c + Math.cos(blip.angulo) * raio * blip.distancia
        const by = c + Math.sin(blip.angulo) * raio * blip.distancia
        ctx.beginPath()
        ctx.arc(bx, by, 2.5 + (1 - idade) * 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 194, 77, ${(1 - idade) * 0.9})`
        ctx.fill()
      }
    }

    quadro = requestAnimationFrame(desenhar)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [])

  return (
    <div className="painel__sonar">
      <canvas ref={refCanvas} className="painel__sonar-canvas" />
      <p className="painel__legenda">sonar ativo · 360°</p>
    </div>
  )
}
