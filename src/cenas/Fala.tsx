import type { CenaFala } from '../roteiros/tipos'
import { Legenda } from '../ui/Legenda'

type Props = {
  cena: CenaFala
  duracaoMs: number | null
  ativa: boolean
  falando: boolean
  lerNivel: () => number
}

export function Fala({ cena, duracaoMs, ativa, falando, lerNivel }: Props) {
  return (
    <>
      {cena.tela.titulo && <p className="palco__rotulo">{cena.tela.titulo}</p>}
      <Legenda
        linhas={cena.tela.linhas}
        duracaoTotalMs={duracaoMs}
        ativa={ativa}
        falando={falando}
        lerNivel={lerNivel}
        cena={cena.id}
      />
      {cena.tela.status && <p className="palco__status">{cena.tela.status}</p>}
    </>
  )
}
