import { useEffect, useRef } from 'react'

/** Subsistemas fictícios. Na Fase 2 este painel é o que mostra a pane. */
const SUBSISTEMAS = [
  { nome: 'SONAR', base: 98 },
  { nome: 'NAVEGAÇÃO', base: 96 },
  { nome: 'COMUNICAÇÃO', base: 92 },
  { nome: 'CASCO', base: 99 },
  { nome: 'PROPULSÃO', base: 74 },
  { nome: 'OXIGÊNIO', base: 88 },
]

/** Intervalo lento de propósito: o painel é enfeite, não merece um rAF. */
const MS_ATUALIZACAO = 220

export type Queda = { nome: string; estado: string }

type Props = {
  /** Subsistemas fora do ar, com o estado a exibir. Usado pela pane. */
  quedas?: Queda[]
  /** Congela os valores: durante a pane o painel para junto com o resto. */
  congelado?: boolean
}

export function PainelStatus({ quedas = [], congelado = false }: Props) {
  const refValores = useRef<Array<HTMLSpanElement | null>>([])
  const refBarras = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    if (congelado) return
    const atuais = SUBSISTEMAS.map((s) => s.base)
    const timer = setInterval(() => {
      SUBSISTEMAS.forEach((sub, i) => {
        if (quedas.some((q) => q.nome === sub.nome)) return
        atuais[i] += (sub.base + (Math.random() - 0.5) * 6 - atuais[i]) * 0.35
        const valor = Math.max(0, Math.min(100, atuais[i]))
        const span = refValores.current[i]
        const barra = refBarras.current[i]
        if (span) span.textContent = `${valor.toFixed(0)} %`
        if (barra) barra.style.width = `${valor}%`
      })
    }, MS_ATUALIZACAO)
    return () => clearInterval(timer)
  }, [congelado, quedas])

  const quedaDe = (nome: string) => quedas.find((q) => q.nome === nome)

  return (
    <ul className="painel__status">
      {SUBSISTEMAS.map((sub, i) => {
        const queda = quedaDe(sub.nome)
        return (
          <li
            key={sub.nome}
            className={queda ? 'painel__status-item painel__status-item--caido' : 'painel__status-item'}
          >
            <span className="painel__status-nome">{sub.nome}</span>
            <span className="painel__status-trilho">
              <span
                className="painel__status-barra"
                ref={(el) => {
                  refBarras.current[i] = el
                }}
                style={queda ? { width: '0%' } : undefined}
              />
            </span>
            <span
              className="painel__status-valor"
              ref={(el) => {
                refValores.current[i] = el
              }}
            >
              {queda ? '--' : '—'}
            </span>
            <span className="painel__status-estado">{queda ? queda.estado : 'online'}</span>
          </li>
        )
      })}
    </ul>
  )
}
