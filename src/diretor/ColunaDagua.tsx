import { useEffect, useRef } from 'react'
import { perfilDe, rgba } from '../mundo/perfil'
import { ZONAS } from './mergulho'

/**
 * Coluna d'água: a régua vertical que aparece na borda esquerda durante o
 * mergulho.
 *
 * Ela responde a uma pergunta que o número do HUD não responde: *fundo em
 * relação a quê?*. 900 M não diz nada pra quem tem quinze anos; 900 M logo
 * abaixo da faixa onde a luz acaba, com três faixas ainda por baixo, diz.
 *
 * Cada zona ocupa um QUARTO da altura, e não a fatia proporcional que teria
 * numa régua linear. Proporcional, a zona eufótica — onde a apresentação
 * inteira acontece — teria 3% da coluna e seria ilegível. Aqui a régua é um
 * infográfico, não um instrumento de medida.
 */

type Props = {
  /**
   * Lê a profundidade agora. É função, não número, de propósito: ela muda a
   * cada quadro, e como prop forçaria um render do Player inteiro por quadro.
   */
  lerProfundidade: () => number
  /** Pra onde vai — a marca do alvo na régua. */
  alvo: number
}

/** Altura de cada faixa de zona, em fração da coluna. */
const FATIA = 1 / ZONAS.length

/** Converte metros em fração vertical da coluna (0 no topo, 1 no fundo). */
function fracaoDe(metros: number): number {
  let base = 0
  for (let i = 0; i < ZONAS.length; i++) {
    const topo = i === 0 ? 0 : ZONAS[i - 1].ate
    const fundo = ZONAS[i].ate
    if (metros <= fundo) {
      return base + ((metros - topo) / (fundo - topo)) * FATIA
    }
    base += FATIA
  }
  return 1
}

type Bolha = { x: number; y: number; r: number; v: number }

/** Pinta as quatro faixas de zona. Roda uma vez por tamanho, não por quadro. */
function pintarFaixas(
  ctx: CanvasRenderingContext2D,
  L: number,
  yDe: (fracao: number) => number,
) {
  ZONAS.forEach((zona, i) => {
    const y0 = yDe(i * FATIA)
    const y1 = yDe((i + 1) * FATIA)
    const meio = i === 0 ? zona.ate / 2 : (ZONAS[i - 1].ate + zona.ate) / 2
    const perfil = perfilDe(meio)
    const g = ctx.createLinearGradient(0, y0, 0, y1)
    g.addColorStop(0, rgba(perfil.fundoTopo, 0.92))
    g.addColorStop(1, rgba(perfil.fundoBaixo, 0.92))
    ctx.fillStyle = g
    ctx.fillRect(0, y0, L, y1 - y0)

    ctx.strokeStyle = 'rgba(27, 106, 120, 0.7)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, y1)
    ctx.lineTo(L, y1)
    ctx.stroke()

    // Nome na vertical: a coluna tem 90 px e o nome não cabe deitado.
    ctx.save()
    ctx.translate(L * 0.3, (y0 + y1) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = 'rgba(189, 255, 240, 0.72)'
    ctx.font = '9px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(zona.nome, 0, 0)
    ctx.restore()

    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(27, 106, 120, 0.95)'
    ctx.font = '8px ui-monospace, monospace'
    ctx.fillText(`${zona.ate} m`, L - 3, y1 - 3)
    ctx.textAlign = 'left'
  })
}

export function ColunaDagua({ lerProfundidade, alvo }: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const refLer = useRef(lerProfundidade)
  const refAlvo = useRef(alvo)
  refLer.current = lerProfundidade
  refAlvo.current = alvo

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

    const bolhas: Bolha[] = Array.from({ length: 22 }, () => ({
      x: 0,
      y: Math.random(),
      r: 0.6 + Math.random() * 1.6,
      v: 0.1 + Math.random() * 0.25,
    }))

    // Canvas de apoio pras faixas fixas.
    const apoio = document.createElement('canvas')
    const apoioCtx = apoio.getContext('2d')!
    let fundoPronto = ''

    let quadro = 0
    let anterior = performance.now()

    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(desenhar)
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora
      ctx.clearRect(0, 0, L, A)

      const topo = A * 0.06
      const fundo = A * 0.94
      const alturaColuna = fundo - topo
      const yDe = (fracao: number) => topo + fracao * alturaColuna

      // 1) faixas das zonas. Elas NÃO mudam: são pintadas uma vez num canvas
      //    de apoio e depois só copiadas. Redesenhar quatro gradientes e
      //    quatro textos girados a cada quadro custava fps no meio da única
      //    hora em que a tela não pode engasgar.
      if (fundoPronto !== `${L}x${A}`) {
        fundoPronto = `${L}x${A}`
        apoio.width = L
        apoio.height = A
        pintarFaixas(apoioCtx, L, yDe)
      }
      ctx.drawImage(apoio, 0, 0)

      const prof = refLer.current()
      const yAtual = yDe(fracaoDe(prof))
      const yAlvo = yDe(fracaoDe(refAlvo.current))

      // 2) rastro de bolhas subindo ao longo da coluna
      ctx.fillStyle = 'rgba(200, 245, 255, 0.35)'
      for (const b of bolhas) {
        b.y -= b.v * dt
        if (b.y < 0) {
          b.y = 1
          b.x = Math.random()
        }
        ctx.beginPath()
        ctx.arc(L * (0.55 + b.x * 0.3), topo + b.y * alturaColuna, b.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // 3) marca do alvo
      ctx.strokeStyle = 'rgba(255, 194, 77, 0.8)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(0, yAlvo)
      ctx.lineTo(L, yAlvo)
      ctx.stroke()
      ctx.setLineDash([])

      // 4) o submarino, descendo
      const cx = L * 0.62
      ctx.fillStyle = 'rgba(77, 255, 166, 0.95)'
      ctx.beginPath()
      ctx.ellipse(cx, yAtual, 9, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(cx - 2, yAtual - 7, 4, 4)
      // halo, pra o ícone não sumir nas faixas escuras
      ctx.beginPath()
      ctx.arc(cx, yAtual, 14, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(77, 255, 166, 0.3)'
      ctx.stroke()

      // 5) o número, colado no ícone
      ctx.fillStyle = 'rgba(77, 255, 166, 0.95)'
      ctx.font = 'bold 11px ui-monospace, monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${Math.round(prof)}`, 2, yAtual - 10)
    }

    quadro = requestAnimationFrame(desenhar)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [])

  return (
    <div className="coluna">
      <canvas ref={refCanvas} className="coluna__canvas" />
    </div>
  )
}
