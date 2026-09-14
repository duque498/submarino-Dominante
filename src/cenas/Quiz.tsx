import type { CenaQuiz } from '../roteiros/tipos'
import { Timer } from '../ui/Timer'

export type FaseDinamica = 'pergunta' | 'respondendo' | 'feedback'

type Props = {
  cena: CenaQuiz
  fase: FaseDinamica
  /** Índice marcado pelo operador; -1 quando o tempo acabou sem resposta. */
  escolhida: number | null
  aoResponder: (indice: number) => void
  aoZerar: () => void
  aoPing: () => void
}

/** Mesma janela dos painéis: a dinâmica se materializa sobre a área central. */
export function Quiz({ cena, fase, escolhida, aoResponder, aoZerar, aoPing }: Props) {
  const respondido = fase === 'feedback'

  return (
    <div className="painel dinamica">
      <div className="painel__moldura">
        <header className="painel__cabecalho">
          <span className="painel__nome">calibração do sonar</span>
          <span className="painel__fechar">
            {respondido ? 'seta direita pra seguir' : 'responda em voz alta'}
          </span>
        </header>
        <div className="painel__corpo dinamica__corpo">
          <div className="dinamica__topo">
            <h3 className="dinamica__pergunta">{cena.pergunta}</h3>
            <div className="dinamica__timer">
              <Timer
                tempo={cena.tempo}
                rodando={fase === 'respondendo'}
                aoZerar={aoZerar}
                aoPing={aoPing}
              />
            </div>
          </div>

          <ul className="dinamica__cards">
            {cena.alternativas.map((alternativa, indice) => (
              <li key={alternativa}>
                <button
                  type="button"
                  className={classeDoCard(indice, cena.correta, escolhida, respondido)}
                  onClick={() => fase === 'respondendo' && aoResponder(indice)}
                >
                  <span className="dinamica__numero">{indice + 1}</span>
                  <span className="dinamica__texto">{alternativa}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function classeDoCard(
  indice: number,
  correta: number,
  escolhida: number | null,
  respondido: boolean,
): string {
  const classes = ['dinamica__card']
  if (respondido) {
    if (indice === correta) classes.push('dinamica__card--certo')
    else if (indice === escolhida) classes.push('dinamica__card--errado')
    else classes.push('dinamica__card--apagado')
  }
  return classes.join(' ')
}
