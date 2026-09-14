import { useEffect, useRef } from 'react'

type Props = {
  /** Segundos totais. */
  tempo: number
  /** Pausa a contagem (durante o feedback, por exemplo). */
  rodando: boolean
  aoZerar: () => void
  /** Chamado a cada ping do sonar, que acelera no fim. */
  aoPing?: () => void
}

/** A partir daqui os pings aceleram e o anel fica âmbar. */
const SEGUNDOS_URGENCIA = 5

/** Intervalo entre pings, em ms, conforme o tempo restante. */
function intervaloPing(restante: number): number {
  if (restante > SEGUNDOS_URGENCIA) return 1000
  // 5 s -> 800 ms, 1 s -> 200 ms
  return Math.max(180, 200 + (restante - 1) * 150)
}

/** Anel que se esvazia, com número no meio e ping de sonar acelerando. */
export function Timer({ tempo, rodando, aoZerar, aoPing }: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const refRodando = useRef(rodando)
  const refZerar = useRef(aoZerar)
  const refPing = useRef(aoPing)
  refRodando.current = rodando
  refZerar.current = aoZerar
  refPing.current = aoPing

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

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

    let restanteMs = tempo * 1000
    let anterior = performance.now()
    let proximoPing = 0
    let ultimoPingEm = performance.now()
    let zerou = false
    let quadro = 0

    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(desenhar)
      const dt = agora - anterior
      anterior = agora

      if (refRodando.current && !zerou) {
        restanteMs = Math.max(0, restanteMs - dt)
        const restanteS = restanteMs / 1000

        if (agora - ultimoPingEm >= intervaloPing(restanteS)) {
          ultimoPingEm = agora
          proximoPing = agora
          refPing.current?.()
        }

        if (restanteMs === 0) {
          zerou = true
          refZerar.current()
        }
      }

      const c = lado / 2
      const raio = c * 0.78
      const fracao = restanteMs / (tempo * 1000)
      const urgente = restanteMs / 1000 <= SEGUNDOS_URGENCIA
      const cor = urgente ? '255, 194, 77' : '56, 232, 255'

      ctx.clearRect(0, 0, lado, lado)

      // trilho
      ctx.beginPath()
      ctx.arc(c, c, raio, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(27, 106, 120, 0.55)'
      ctx.lineWidth = Math.max(3, lado * 0.055)
      ctx.stroke()

      // onda do ping: anel que se expande e some
      const idadePing = agora - proximoPing
      if (idadePing < 600) {
        const t = idadePing / 600
        ctx.beginPath()
        ctx.arc(c, c, raio * (0.6 + t * 0.55), 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${cor}, ${(1 - t) * 0.5})`
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // anel que se esvazia, começando das 12 h
      ctx.beginPath()
      ctx.arc(c, c, raio, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fracao)
      ctx.strokeStyle = `rgba(${cor}, 0.95)`
      ctx.lineWidth = Math.max(3, lado * 0.055)
      ctx.lineCap = 'round'
      ctx.stroke()

      // número
      ctx.fillStyle = `rgba(${cor}, 1)`
      ctx.font = `bold ${lado * 0.38}px ui-monospace, "DejaVu Sans Mono", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(Math.ceil(restanteMs / 1000)), c, c + lado * 0.02)
    }

    quadro = requestAnimationFrame(desenhar)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [tempo])

  return <canvas className="timer" ref={refCanvas} aria-hidden="true" />
}
