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

export function PainelStatus() {
  const refValores = useRef<Array<HTMLSpanElement | null>>([])
  const refBarras = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    const atuais = SUBSISTEMAS.map((s) => s.base)
    const timer = setInterval(() => {
      SUBSISTEMAS.forEach((sub, i) => {
        atuais[i] += (sub.base + (Math.random() - 0.5) * 6 - atuais[i]) * 0.35
        const valor = Math.max(0, Math.min(100, atuais[i]))
        const span = refValores.current[i]
        const barra = refBarras.current[i]
        if (span) span.textContent = `${valor.toFixed(0)} %`
        if (barra) barra.style.width = `${valor}%`
      })
    }, MS_ATUALIZACAO)
    return () => clearInterval(timer)
  }, [])

  return (
    <ul className="painel__status">
      {SUBSISTEMAS.map((sub, i) => (
        <li key={sub.nome} className="painel__status-item">
          <span className="painel__status-nome">{sub.nome}</span>
          <span className="painel__status-trilho">
            <span
              className="painel__status-barra"
              ref={(el) => {
                refBarras.current[i] = el
              }}
            />
          </span>
          <span
            className="painel__status-valor"
            ref={(el) => {
              refValores.current[i] = el
            }}
          >
            —
          </span>
          <span className="painel__status-estado">online</span>
        </li>
      ))}
    </ul>
  )
}
