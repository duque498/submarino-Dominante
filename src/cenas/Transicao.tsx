import type { CenaTransicao } from '../roteiros/tipos'
import { Digitacao } from '../ui/Digitacao'

type Props = { cena: CenaTransicao; duracaoMs: number | null; completo: boolean }

export function Transicao({ cena, duracaoMs, completo }: Props) {
  return (
    <>
      <Digitacao linhas={cena.tela.linhas} duracaoMs={duracaoMs} completo={completo} />
      <p className="transicao__destino">destino: {cena.destino}</p>
      <div className="transicao__trilho" />
    </>
  )
}
