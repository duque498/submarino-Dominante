import { useEffect, useRef } from 'react'
import { obterForma } from '../formas'
import { NOMES_FICHAS } from './nomes'
import fichas from '../roteiros/fichas.json'

type Ficha = { titulo: string; dados: Record<string, string> }

const FICHAS = fichas as Record<string, Ficha>

type Props = { argumento?: string }

/**
 * Ficha de espécie. Os dados vêm de src/roteiros/fichas.json e são reais —
 * é conteúdo de Biologia, não cenografia.
 */
export function PainelFicha({ argumento }: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const nome = argumento ?? ''
  const ficha = FICHAS[nome]

  // Miniatura da silhueta, se a forma já tiver sido amostrada.
  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const pontos = obterForma(nome)
    if (!ctx || !pontos) return

    const caixa = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(caixa.width))
    canvas.height = Math.max(1, Math.round(caixa.height))
    const c = canvas.width / 2
    const m = canvas.height / 2
    const raio = Math.min(c, m) * 0.9

    ctx.fillStyle = 'rgba(77, 255, 166, 0.75)'
    for (const ponto of pontos) {
      ctx.fillRect(c + ponto.x * raio - 0.5, m + ponto.y * raio - 0.5, 1.2, 1.2)
    }
  }, [nome])

  if (!ficha) {
    return (
      <p className="painel__vazio">
        sem ficha catalogada para "{nome || '—'}". disponíveis: {NOMES_FICHAS.join(', ')}
      </p>
    )
  }

  // Enquanto a silhueta correspondente não existir, a miniatura some em vez de
  // deixar um buraco na grade.
  const temSilhueta = obterForma(nome) !== null

  return (
    <div className={temSilhueta ? 'painel__ficha' : 'painel__ficha painel__ficha--sem-silhueta'}>
      <div className="painel__ficha-dados">
        <h3 className="painel__ficha-titulo">{ficha.titulo}</h3>
        <dl className="painel__ficha-lista">
          {Object.entries(ficha.dados).map(([rotulo, valor]) => (
            <div className="painel__ficha-item" key={rotulo}>
              <dt>{rotulo}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
      </div>
      {temSilhueta && <canvas className="painel__ficha-silhueta" ref={refCanvas} />}
    </div>
  )
}
