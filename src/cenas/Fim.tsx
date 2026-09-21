import type { CenaFim } from '../roteiros/tipos'

/**
 * Tela final. É onde a apresentação termina e FICA.
 *
 * Sem avanço automático, sem próxima cena, sem nada piscando: a plateia está
 * aplaudindo e a turma está se despedindo, e a tela não pode roubar atenção
 * disso. O orbe volta pra esfera lenta, o log vai parando e as câmeras mostram
 * a superfície — quem faz isso é o Player; aqui é só o letreiro.
 */
export function Fim({ cena }: { cena: CenaFim }) {
  return (
    <div className="fim">
      <h1 className="fim__titulo">{cena.tela.titulo}</h1>
      <p className="fim__subtitulo">{cena.tela.subtitulo}</p>
      {cena.tela.nota && <p className="fim__nota">{cena.tela.nota}</p>}
    </div>
  )
}
