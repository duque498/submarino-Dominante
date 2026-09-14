import type { CenaFala } from '../roteiros/tipos'
import { Legenda } from '../ui/Legenda'

type Props = { cena: CenaFala; duracaoMs: number | null; ativa: boolean }

export function Fala({ cena, duracaoMs, ativa }: Props) {
  return (
    <>
      {cena.tela.titulo && <p className="palco__rotulo">{cena.tela.titulo}</p>}
      <Legenda linhas={cena.tela.linhas} duracaoTotalMs={duracaoMs} ativa={ativa} />
      {cena.tela.status && <p className="palco__status">{cena.tela.status}</p>}
    </>
  )
}
