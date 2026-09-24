import { useEffect, useRef } from 'react'
import { perfilDe, rgba } from '../mundo/perfil'
import { motor } from '../mundo/motor'
import { quadroSeguro } from '../ui/falhas'

/**
 * Coluna d'água em tamanho de painel: as cinco zonas do oceano.
 *
 * É a versão parada da régua que aparece no mergulho, feita pro grupo 2 poder
 * apontar enquanto fala. Duas diferenças que importam:
 *
 *  - **Cinco zonas, não quatro.** A régua do mergulho para na abissal porque o
 *    submarino para lá; aqui entra a HADAL, que é a que tem a Fossa das
 *    Marianas e é a que a plateia quer ver.
 *  - **As palavras são deles.** O texto de cada faixa é o que os alunos
 *    escreveram no trabalho. O painel não acrescenta fato nenhum — se algo
 *    aqui não está na fala deles, está errado e tem que sair.
 *
 * Cada zona ocupa a mesma altura, e não a fatia proporcional. Proporcional, a
 * epipelágica — onde está 90% da vida — teria 2% da coluna.
 */

type Zona = {
  nome: string
  de: number
  ate: number
  /** Palavras-chave do trabalho dos alunos. Nada além delas. */
  notas: string[]
}

const ZONAS_OCEANO: Zona[] = [
  { nome: 'EPIPELÁGICA', de: 0, ate: 200, notas: ['luz do sol', '90% da vida marinha'] },
  { nome: 'MESOPELÁGICA', de: 200, ate: 1000, notas: ['penumbra', 'bioluminescência'] },
  { nome: 'BATIPELÁGICA', de: 1000, ate: 4000, notas: ['escuridão total', 'tamboril'] },
  { nome: 'ABISSOPELÁGICA', de: 4000, ate: 6000, notas: ['frio', 'corpos gelatinosos'] },
  { nome: 'HADAL', de: 6000, ate: 11000, notas: ['fossas oceânicas', 'Fossa das Marianas'] },
]

const FATIA = 1 / ZONAS_OCEANO.length

/** Metros → fração vertical do painel. Mesma régua "infográfico" do mergulho. */
function fracaoDe(metros: number): number {
  for (let i = 0; i < ZONAS_OCEANO.length; i++) {
    const { de, ate } = ZONAS_OCEANO[i]
    if (metros <= ate) return (i + (metros - de) / (ate - de)) * FATIA
  }
  return 1
}

export function PainelZonas() {
  const refCanvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let L = 0
    let A = 0
    // Declarado ANTES do `ajustar`, que o zera: `ajustar()` roda na montagem, e
    // com o `let` mais abaixo isso era um ReferenceError de zona morta temporal
    // — o painel abria e o canvas ficava em branco.
    let fundoPronto = ''
    const ajustar = () => {
      const caixa = canvas.getBoundingClientRect()
      L = Math.max(1, Math.round(caixa.width))
      A = Math.max(1, Math.round(caixa.height))
      canvas.width = L
      canvas.height = A
      fundoPronto = ''
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(canvas)

    // As faixas não mudam: pintadas uma vez num canvas de apoio e copiadas. Só
    // o ícone do submarino e o pulso se redesenham por quadro.
    const apoio = document.createElement('canvas')
    const apoioCtx = apoio.getContext('2d')!

    const margem = () => ({ topo: A * 0.04, base: A * 0.96 })

    const pintarFaixas = () => {
      const { topo, base } = margem()
      const altura = base - topo
      apoio.width = L
      apoio.height = A
      const c = apoioCtx
      c.clearRect(0, 0, L, A)

      ZONAS_OCEANO.forEach((zona, i) => {
        const y0 = topo + i * FATIA * altura
        const y1 = topo + (i + 1) * FATIA * altura
        const perfil = perfilDe((zona.de + Math.min(zona.ate, 6500)) / 2)
        const g = c.createLinearGradient(0, y0, 0, y1)
        g.addColorStop(0, rgba(perfil.fundoTopo, 0.95))
        g.addColorStop(1, rgba(perfil.fundoBaixo, 0.95))
        c.fillStyle = g
        c.fillRect(0, y0, L, y1 - y0)

        c.strokeStyle = 'rgba(27, 106, 120, 0.8)'
        c.lineWidth = 1
        c.beginPath()
        c.moveTo(0, y1)
        c.lineTo(L, y1)
        c.stroke()

        const esquerda = L * 0.035
        c.textAlign = 'left'
        c.fillStyle = 'rgba(189, 255, 240, 0.95)'
        c.font = `600 ${Math.max(11, Math.min(17, L * 0.026))}px ui-monospace, monospace`
        c.fillText(zona.nome, esquerda, y0 + (y1 - y0) * 0.36)

        c.fillStyle = 'rgba(56, 232, 255, 0.72)'
        c.font = `${Math.max(9, Math.min(13, L * 0.019))}px ui-monospace, monospace`
        const faixa = zona.ate >= 11000 ? `${zona.de} – 11000 m` : `${zona.de} – ${zona.ate} m`
        c.fillText(faixa, esquerda, y0 + (y1 - y0) * 0.62)

        // As palavras dos alunos, à direita, pra não competir com o nome.
        c.textAlign = 'right'
        c.fillStyle = 'rgba(214, 240, 245, 0.72)'
        c.font = `${Math.max(9, Math.min(14, L * 0.02))}px ui-monospace, monospace`
        zona.notas.forEach((nota, k) => {
          const alturaLinha = Math.max(12, Math.min(18, L * 0.024))
          const meio = (y0 + y1) / 2
          const desloca = (k - (zona.notas.length - 1) / 2) * alturaLinha
          c.fillText(nota, L - esquerda, meio + desloca + alturaLinha * 0.32)
        })
        c.textAlign = 'left'
      })
    }

    let quadro = 0
    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(protegido)
      if (fundoPronto !== `${L}x${A}`) {
        fundoPronto = `${L}x${A}`
        pintarFaixas()
      }
      ctx.clearRect(0, 0, L, A)
      ctx.drawImage(apoio, 0, 0)

      const { topo, base } = margem()
      const prof = motor.profundidade()
      const y = topo + fracaoDe(prof) * (base - topo)
      const x = L * 0.5

      // linha de nível, atravessando o painel
      ctx.strokeStyle = 'rgba(77, 255, 166, 0.35)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 5])
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(L, y)
      ctx.stroke()
      ctx.setLineDash([])

      // o submarino
      const pulso = (Math.sin(agora / 420) + 1) / 2
      ctx.beginPath()
      ctx.arc(x, y, 15 + pulso * 5, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(77, 255, 166, ${0.4 - pulso * 0.22})`
      ctx.stroke()
      ctx.fillStyle = 'rgba(77, 255, 166, 0.95)'
      ctx.beginPath()
      ctx.ellipse(x, y, 13, 5.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(x - 2.5, y - 9, 5, 5)

      ctx.fillStyle = 'rgba(77, 255, 166, 0.95)'
      ctx.font = 'bold 13px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(prof)} M`, x, y - 16)
      ctx.textAlign = 'left'
    }

    const protegido = quadroSeguro('painel de zonas', desenhar)
    quadro = requestAnimationFrame(protegido)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [])

  return (
    <div className="painel__zonas">
      <canvas ref={refCanvas} className="painel__zonas-canvas" />
      <p className="painel__legenda">zonas da coluna d'água · o submarino está na linha verde</p>
    </div>
  )
}
