import type { CenaFala } from '../roteiros/tipos'
import { Digitacao } from '../ui/Digitacao'

type Props = { cena: CenaFala; duracaoMs: number | null; completo: boolean }

export function Fala({ cena, duracaoMs, completo }: Props) {
  return (
    <>
      {cena.tela.titulo && <h1 className="titulo">{cena.tela.titulo}</h1>}
      <Digitacao linhas={cena.tela.linhas} duracaoMs={duracaoMs} completo={completo} />
      {cena.tela.status && <p className="status">{cena.tela.status}</p>}
    </>
  )
}
