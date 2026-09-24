import type { CenaApresentacao } from '../roteiros/tipos'

type Props = { cena: CenaApresentacao; palco: boolean }

/** Tela parada: fica no projetor o tempo todo em que os alunos apresentam. */
export function Apresentacao({ cena, palco }: Props) {
  // Em modo palco quem ocupa a tela é o orbe morfando; o texto vira rótulo.
  if (palco) {
    return (
      <>
        <p className="palco__rotulo">{cena.tela.titulo}</p>
        <p className="palco__status">{cena.tela.status}</p>
      </>
    )
  }

  return (
    <>
      <h1 className="titulo">{cena.tela.titulo}</h1>
      <p className="status">{cena.tela.status}</p>
    </>
  )
}
