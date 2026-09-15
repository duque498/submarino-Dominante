import { useMemo } from 'react'
import { textoDaLinha, type CenaTransicao } from '../roteiros/tipos'
import { Legenda } from '../ui/Legenda'
import type { TemposReais } from '../ui/ritmoLegenda'

type Props = {
  cena: CenaTransicao
  duracaoMs: number | null
  ativa: boolean
  falando: boolean
  lerNivel: () => number
  tempos?: TemposReais | null
  linhaGuiada?: number | null
}

export function Transicao({ cena, duracaoMs, ativa, falando, lerNivel, tempos, linhaGuiada }: Props) {
  // Ver o comentário em Fala.tsx: identidade de array nova a cada render faz a
  // legenda recomeçar da primeira linha.
  const linhas = useMemo(() => cena.tela.linhas.map(textoDaLinha), [cena])
  return (
    <>
      <Legenda
        linhas={linhas}
        duracaoTotalMs={duracaoMs}
        ativa={ativa}
        falando={falando}
        lerNivel={lerNivel}
        cena={cena.id}
        tempos={tempos}
        linhaGuiada={linhaGuiada}
      />
      <p className="transicao__destino">destino: {cena.destino}</p>
      <div className="transicao__trilho" />
    </>
  )
}
