import { useMemo } from 'react'
import { textoDaLinha, type CenaFala } from '../roteiros/tipos'
import { Legenda } from '../ui/Legenda'
import type { TemposReais } from '../ui/ritmoLegenda'

type Props = {
  cena: CenaFala
  duracaoMs: number | null
  ativa: boolean
  falando: boolean
  lerNivel: () => number
  tempos?: TemposReais | null
  linhaGuiada?: number | null
}

export function Fala({ cena, duracaoMs, ativa, falando, lerNivel, tempos, linhaGuiada }: Props) {
  // Memorizado por CENA, não por render. A legenda planeja o ritmo a partir
  // desta lista e reinicia quando ela muda de identidade — um `.map()` solto
  // no JSX faria a legenda recomeçar da primeira linha a cada render.
  const linhas = useMemo(() => cena.tela.linhas.map(textoDaLinha), [cena])
  return (
    <>
      {cena.tela.titulo && <p className="palco__rotulo">{cena.tela.titulo}</p>}
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
      {cena.tela.status && <p className="palco__status">{cena.tela.status}</p>}
    </>
  )
}
