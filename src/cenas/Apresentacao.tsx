import type { CenaApresentacao } from '../roteiros/tipos'

type Props = { cena: CenaApresentacao }

/** Tela parada: fica no projetor o tempo todo em que os alunos apresentam. */
export function Apresentacao({ cena }: Props) {
  return (
    <>
      <h1 className="titulo">{cena.tela.titulo}</h1>
      <p className="status">{cena.tela.status}</p>
    </>
  )
}
