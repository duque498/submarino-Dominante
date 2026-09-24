import { useEffect, useRef } from 'react'
import { acharMarcador, caixaDaCosta, COSTA, MARCADORES, type Marcador } from './mapa'

/**
 * Rota da expedição.
 *
 * O mapa tem uma entrada em três tempos, e ela existe por um motivo de palco:
 * um mapa que simplesmente aparece pronto é um slide. Desenhando a costa na
 * frente da plateia, ele vira um instrumento ligando.
 *
 *  1. a costa se desenha, de norte a sul (~500 ms);
 *  2. a câmera fecha no marcador pedido (~800 ms);
 *  3. o marcador pulsa.
 *
 * Marcador novo na mesma cena é PAN, não corte: a suavização exponencial do
 * enquadramento dá isso de graça, e o olho acompanha a viagem em vez de se
 * perder num salto.
 */

type Props = {
  /** Chave do marcador em foco. Sem ela, mostra a costa inteira. */
  marcador?: string
}

/** ~500 ms desenhando a costa. */
const MS_TRACO = 500
/** Quanto o enquadramento se aproxima por quadro. Dá ~800 ms de zoom. */
const SUAVIZACAO = 0.055
/** Meia-largura do enquadramento, em graus, quando fechado num marcador. */
const GRAUS_FECHADO = 7

type Enquadre = { lon: number; lat: number; graus: number }

export function PainelMapa({ marcador }: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const refMarcador = useRef(marcador)
  refMarcador.current = marcador

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let largura = 0
    let altura = 0
    const ajustar = () => {
      const caixa = canvas.getBoundingClientRect()
      largura = Math.max(1, Math.round(caixa.width))
      altura = Math.max(1, Math.round(caixa.height))
      canvas.width = largura
      canvas.height = altura
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(canvas)

    const caixa = caixaDaCosta()
    const inteiro: Enquadre = {
      lon: (caixa.minLon + caixa.maxLon) / 2,
      lat: (caixa.minLat + caixa.maxLat) / 2,
      graus: Math.max(caixa.maxLon - caixa.minLon, caixa.maxLat - caixa.minLat) / 2 + 1.5,
    }
    // Começa aberto e fecha: o zoom conta a história de "estamos aqui".
    const atual: Enquadre = { ...inteiro }

    const nascimento = performance.now()
    let quadro = 0

    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(desenhar)
      const alvoMarcador = acharMarcador(refMarcador.current)
      const alvo: Enquadre = alvoMarcador
        ? { lon: alvoMarcador.lon, lat: alvoMarcador.lat, graus: GRAUS_FECHADO }
        : inteiro

      atual.lon += (alvo.lon - atual.lon) * SUAVIZACAO
      atual.lat += (alvo.lat - atual.lat) * SUAVIZACAO
      atual.graus += (alvo.graus - atual.graus) * SUAVIZACAO

      const escala = Math.min(largura, altura) / (atual.graus * 2)
      const proj = (lon: number, lat: number): [number, number] => [
        largura / 2 + (lon - atual.lon) * escala,
        altura / 2 - (lat - atual.lat) * escala,
      ]

      ctx.clearRect(0, 0, largura, altura)

      // 1) costa, desenhada progressivamente
      const traco = Math.min(1, (agora - nascimento) / MS_TRACO)
      const ate = Math.max(1, Math.floor(traco * (COSTA.length - 1)))
      ctx.beginPath()
      for (let i = 0; i <= ate; i++) {
        const [x, y] = proj(COSTA[i][0], COSTA[i][1])
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      // A ponta que ainda está sendo desenhada anda entre dois vértices.
      if (ate < COSTA.length - 1) {
        const fracao = traco * (COSTA.length - 1) - ate
        const [ax, ay] = COSTA[ate]
        const [bx, by] = COSTA[ate + 1]
        const [x, y] = proj(ax + (bx - ax) * fracao, ay + (by - ay) * fracao)
        ctx.lineTo(x, y)
      }
      ctx.strokeStyle = 'rgba(56, 232, 255, 0.75)'
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.stroke()

      if (traco < 1) return

      // 2) marcadores. O em foco pulsa e mostra a nota; os outros ficam
      //    discretos, só pra o mapa não parecer vazio.
      const fonte = Math.max(9, Math.min(largura, altura) * 0.035)
      ctx.font = `${fonte}px ui-monospace, monospace`
      const pulso = (Math.sin(agora / 320) + 1) / 2

      const pintar = (m: Marcador, emFoco: boolean) => {
        const [x, y] = proj(m.lon, m.lat)
        if (x < -80 || x > largura + 80 || y < -40 || y > altura + 40) return
        const r = emFoco ? 3 + pulso * 5 : 2.5
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = emFoco
          ? `rgba(255, 194, 77, ${0.35 + pulso * 0.6})`
          : 'rgba(56, 232, 255, 0.45)'
        ctx.fill()
        if (!emFoco) return
        // Anel de mira, pra o marcador em foco não competir com os outros.
        ctx.beginPath()
        ctx.arc(x, y, 10 + pulso * 4, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 194, 77, ${0.5 - pulso * 0.25})`
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = 'rgba(255, 194, 77, 0.95)'
        ctx.fillText(m.rotulo, x + 14, y + 4)
        if (m.nota) {
          ctx.fillStyle = 'rgba(189, 255, 240, 0.6)'
          ctx.font = `${fonte * 0.78}px ui-monospace, monospace`
          ctx.fillText(m.nota, x + 14, y + 4 + fonte)
          ctx.font = `${fonte}px ui-monospace, monospace`
        }
      }

      for (const m of MARCADORES) pintar(m, m.chave === alvoMarcador?.chave)
    }

    quadro = requestAnimationFrame(desenhar)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [])

  return (
    <div className="painel__mapa">
      <canvas ref={refCanvas} className="painel__mapa-canvas" />
      <p className="painel__legenda">rota da expedição</p>
    </div>
  )
}
