import type { CenaVF } from '../roteiros/tipos'
import { Timer } from '../ui/Timer'
import type { FaseDinamica } from './Quiz'

type Props = {
  cena: CenaVF
  fase: FaseDinamica
  /** true = marcou verdadeiro, false = falso, null = tempo esgotado. */
  escolhida: boolean | null
  aoResponder: (resposta: boolean) => void
  aoZerar: () => void
  aoPing: () => void
}

const OPCOES: Array<{ valor: boolean; tecla: string; rotulo: string }> = [
  { valor: true, tecla: 'V', rotulo: 'verdadeiro' },
  { valor: false, tecla: 'F', rotulo: 'falso' },
]

export function VF({ cena, fase, escolhida, aoResponder, aoZerar, aoPing }: Props) {
  const respondido = fase === 'feedback'

  return (
    <div className="painel dinamica">
      <div className="painel__moldura">
        <header className="painel__cabecalho">
          <span className="painel__nome">verificação de dados</span>
          <span className="painel__fechar">
            {respondido ? 'seta direita pra seguir' : 'verdadeiro ou falso'}
          </span>
        </header>
        <div className="painel__corpo dinamica__corpo">
          <div className="dinamica__topo">
            <h3 className="dinamica__pergunta">{cena.afirmacao}</h3>
            <div className="dinamica__timer">
              <Timer
                tempo={cena.tempo}
                rodando={fase === 'respondendo'}
                aoZerar={aoZerar}
                aoPing={aoPing}
              />
            </div>
          </div>

          <ul className="dinamica__cards dinamica__cards--vf">
            {OPCOES.map((opcao) => (
              <li key={opcao.tecla}>
                <button
                  type="button"
                  className={classeDoCard(opcao.valor, cena.resposta, escolhida, respondido)}
                  onClick={() => fase === 'respondendo' && aoResponder(opcao.valor)}
                >
                  <span className="dinamica__numero">{opcao.tecla}</span>
                  <span className="dinamica__texto">{opcao.rotulo}</span>
                </button>
              </li>
            ))}
          </ul>

          {cena.restaura && respondido && escolhida === cena.resposta && (
            <p className="dinamica__restaura">subsistema restaurado: {cena.restaura}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function classeDoCard(
  valor: boolean,
  correta: boolean,
  escolhida: boolean | null,
  respondido: boolean,
): string {
  const classes = ['dinamica__card']
  if (respondido) {
    if (valor === correta) classes.push('dinamica__card--certo')
    else if (valor === escolhida) classes.push('dinamica__card--errado')
    else classes.push('dinamica__card--apagado')
  }
  return classes.join(' ')
}
