import { useEffect, useRef } from 'react'

/**
 * Costa brasileira em traço grosso — aproximação cartográfica suficiente pra
 * leitura a 15 metros, não um mapa de navegação. Pares [longitude, latitude].
 */
const COSTA: Array<[number, number]> = [
  [-51.0, 4.3],
  [-50.0, 1.0],
  [-48.5, -0.8],
  [-46.5, -1.0],
  [-44.3, -2.5],
  [-42.8, -2.7],
  [-41.0, -2.9],
  [-38.5, -3.7],
  [-37.0, -4.9],
  [-35.2, -5.8],
  [-34.8, -7.1],
  [-35.0, -8.1],
  [-36.0, -9.7],
  [-37.1, -11.0],
  [-38.5, -12.9],
  [-39.0, -14.8],
  [-39.0, -16.4],
  [-39.7, -18.0],
  [-40.8, -19.6],
  [-41.8, -21.2],
  [-43.2, -22.9],
  [-45.0, -23.7],
  [-47.0, -24.7],
  [-48.5, -26.0],
  [-48.6, -27.6],
  [-50.0, -29.3],
  [-51.2, -31.0],
  [-52.3, -32.2],
  [-53.4, -33.7],
]

/** Pontos que piscam no mapa. */
const MARCADORES = [
  { nome: 'ABROLHOS', lon: -38.7, lat: -17.9 },
  { nome: 'MANGUEZAIS', lon: -48.5, lat: -0.9 },
]

export function PainelMapa() {
  const refCanvas = useRef<HTMLCanvasElement>(null)

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

    const lons = COSTA.map((p) => p[0])
    const lats = COSTA.map((p) => p[1])
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)

    let quadro = 0
    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(desenhar)
      const margem = Math.min(largura, altura) * 0.12
      const escala = Math.min(
        (largura - margem * 2) / (maxLon - minLon),
        (altura - margem * 2) / (maxLat - minLat),
      )
      const offX = (largura - (maxLon - minLon) * escala) / 2
      const offY = (altura - (maxLat - minLat) * escala) / 2
      const proj = (lon: number, lat: number): [number, number] => [
        offX + (lon - minLon) * escala,
        offY + (maxLat - lat) * escala,
      ]

      ctx.clearRect(0, 0, largura, altura)

      ctx.beginPath()
      COSTA.forEach(([lon, lat], i) => {
        const [x, y] = proj(lon, lat)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = 'rgba(56, 232, 255, 0.75)'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.font = `${Math.max(9, altura * 0.035)}px ui-monospace, monospace`
      for (const marcador of MARCADORES) {
        const [x, y] = proj(marcador.lon, marcador.lat)
        const pulso = (Math.sin(agora / 320) + 1) / 2
        ctx.beginPath()
        ctx.arc(x, y, 3 + pulso * 4, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 194, 77, ${0.3 + pulso * 0.6})`
        ctx.fill()
        ctx.fillStyle = 'rgba(255, 194, 77, 0.9)'
        ctx.fillText(marcador.nome, x + 10, y + 4)
      }
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
