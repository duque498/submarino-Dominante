import type { CenaTransicao } from '../roteiros/tipos'
import { Legenda } from '../ui/Legenda'

type Props = { cena: CenaTransicao; duracaoMs: number | null; ativa: boolean }

export function Transicao({ cena, duracaoMs, ativa }: Props) {
  return (
    <>
      <Legenda linhas={cena.tela.linhas} duracaoTotalMs={duracaoMs} ativa={ativa} />
      <p className="transicao__destino">destino: {cena.destino}</p>
      <div className="transicao__trilho" />
    </>
  )
}
