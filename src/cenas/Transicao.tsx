import type { CenaTransicao } from '../roteiros/tipos'
import { Legenda } from '../ui/Legenda'

type Props = {
  cena: CenaTransicao
  duracaoMs: number | null
  ativa: boolean
  falando: boolean
  lerNivel: () => number
}

export function Transicao({ cena, duracaoMs, ativa, falando, lerNivel }: Props) {
  return (
    <>
      <Legenda
        linhas={cena.tela.linhas}
        duracaoTotalMs={duracaoMs}
        ativa={ativa}
        falando={falando}
        lerNivel={lerNivel}
        cena={cena.id}
      />
      <p className="transicao__destino">destino: {cena.destino}</p>
      <div className="transicao__trilho" />
    </>
  )
}
