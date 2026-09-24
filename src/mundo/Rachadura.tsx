import { useEffect, useRef } from 'react'

/**
 * Rachadura no visor externo.
 *
 * Vidro não racha devagar: racha num quadro. Por isso aqui não há animação de
 * crescimento nenhuma — o desenho é feito UMA vez, quando o componente entra,
 * e fica parado. O que dá o susto é o `casco` + `vidro` tocando junto com o
 * aparecimento, não o desenho se movendo.
 *
 * Fica num canvas por cima do feed, e não dentro do desenho do mundo, por dois
 * motivos: ela precisa aparecer também por cima da ESTÁTICA (com o visor
 * quebrado não há imagem, mas o vidro continua rachado na frente da lente), e
 * ela não muda a 60 fps — desenhar de novo a cada quadro seria pagar caro por
 * uma imagem congelada.
 */

type Props = {
  /**
   * Semente. Cada câmera tem a sua rachadura, mas a mesma câmera tem sempre a
   * mesma — reembaralhar a cada render faria o vidro "re-rachar" sozinho.
   */
  semente: number
  /** `parcial` clareia um pouco: o conserto de emergência selou as bordas. */
  estado: 'rachado' | 'parcial'
}

/** Gerador determinístico: mesma semente, mesma rachadura, sempre. */
function aleatorio(semente: number) {
  let s = semente >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

/** Ponto de impacto e as fraturas saindo dele. */
function desenhar(
  ctx: CanvasRenderingContext2D,
  L: number,
  A: number,
  semente: number,
  forca: number,
) {
  const r = aleatorio(semente)
  ctx.clearRect(0, 0, L, A)

  // Impacto fora do centro: no centro pareceria alvo, não acidente.
  const ix = L * (0.28 + r() * 0.44)
  const iy = A * (0.22 + r() * 0.4)
  const alcance = Math.hypot(L, A)

  const claro = `rgba(214, 246, 252, ${0.78 * forca})`
  const brilho = `rgba(120, 232, 255, ${0.55 * forca})`

  /** Uma fratura: anda em linha quase reta, afinando, e se ramifica. */
  const fratura = (
    x: number,
    y: number,
    angulo: number,
    comprimento: number,
    largura: number,
    profundidade: number,
  ) => {
    if (comprimento < 6 || largura < 0.22) return
    const passos = 3 + Math.floor(r() * 3)
    const pedaco = comprimento / passos
    let px = x
    let py = y
    ctx.beginPath()
    ctx.moveTo(px, py)
    const pontos: Array<[number, number, number]> = []
    for (let i = 0; i < passos; i++) {
      // Vidro quebra em linha reta com desvios bruscos, não em curva suave.
      angulo += (r() - 0.5) * 0.55
      px += Math.cos(angulo) * pedaco
      py += Math.sin(angulo) * pedaco
      ctx.lineTo(px, py)
      pontos.push([px, py, angulo])
    }
    ctx.strokeStyle = claro
    ctx.lineWidth = largura
    ctx.lineCap = 'round'
    ctx.stroke()

    // Brilho ciano só nas fraturas grossas: em todas viraria neon.
    if (largura > grossura * 0.9) {
      ctx.strokeStyle = brilho
      ctx.lineWidth = largura * 2.6
      ctx.globalAlpha = 0.16
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    if (profundidade <= 0) return
    for (const [bx, by, ba] of pontos) {
      if (r() > 0.32) continue
      fratura(
        bx,
        by,
        ba + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7),
        comprimento * (0.3 + r() * 0.3),
        largura * 0.55,
        profundidade - 1,
      )
    }
  }

  // Fraturas radiais principais. A largura acompanha o tamanho do canvas: no
  // mini-feed (290 px de diagonal) um traço de 2,7 px come a imagem inteira, e
  // o ponto da subida é justamente ver a imagem voltando POR TRÁS do vidro.
  const radiais = 6 + Math.floor(r() * 3)
  const grossura = Math.max(0.7, alcance * 0.0028)
  const base = r() * Math.PI * 2
  for (let i = 0; i < radiais; i++) {
    const angulo = base + (i / radiais) * Math.PI * 2 + (r() - 0.5) * 0.4
    fratura(ix, iy, angulo, alcance * (0.3 + r() * 0.55), grossura * (1 + r() * 0.8), 2)
  }

  // Anéis concêntricos irregulares: é o que faz o olho ler "impacto" e não
  // "arranhão". Vértices nas radiais, com raio sorteado por vértice.
  for (const raioBase of [0.07, 0.15, 0.26]) {
    const raio = alcance * raioBase
    ctx.beginPath()
    for (let i = 0; i <= radiais; i++) {
      const angulo = base + (i / radiais) * Math.PI * 2
      const rr = raio * (0.75 + r() * 0.5)
      const x = ix + Math.cos(angulo) * rr
      const y = iy + Math.sin(angulo) * rr
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.strokeStyle = claro
    ctx.lineWidth = 0.9
    ctx.stroke()
  }

  // O ponto de impacto: vidro pulverizado, quase opaco.
  const nucleo = ctx.createRadialGradient(ix, iy, 0, ix, iy, alcance * 0.06)
  nucleo.addColorStop(0, `rgba(226, 250, 255, ${0.75 * forca})`)
  nucleo.addColorStop(0.45, `rgba(150, 226, 240, ${0.22 * forca})`)
  nucleo.addColorStop(1, 'rgba(150, 226, 240, 0)')
  ctx.fillStyle = nucleo
  ctx.beginPath()
  ctx.arc(ix, iy, alcance * 0.06, 0, Math.PI * 2)
  ctx.fill()
}

export function Rachadura({ semente, estado }: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pintar = () => {
      const caixa = canvas.getBoundingClientRect()
      const L = Math.max(1, Math.round(caixa.width))
      const A = Math.max(1, Math.round(caixa.height))
      if (canvas.width === L && canvas.height === A) return
      canvas.width = L
      canvas.height = A
      desenhar(ctx, L, A, semente, estado === 'parcial' ? 0.62 : 1)
    }
    pintar()
    const observador = new ResizeObserver(pintar)
    observador.observe(canvas)
    return () => observador.disconnect()
  }, [semente, estado])

  return (
    <canvas
      className={`rachadura${estado === 'parcial' ? ' rachadura--parcial' : ''}`}
      ref={refCanvas}
      aria-hidden="true"
    />
  )
}
