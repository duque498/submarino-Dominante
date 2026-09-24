/**
 * As três luzes do modo reduzido.
 *
 * Fica no canto durante `g3`, `g4` e o hidrofone — cenas inteiras em que os
 * alunos estão falando e a IA está calada. É a única coisa na tela dizendo que
 * o submarino continua avariado, e é por isso que ela NÃO é um painel do
 * Diretor: painel tem prazo e fecha com `Esc`, e a avaria não tem prazo.
 *
 * Vermelho → âmbar → verde, e não vermelho → verde: o passo intermediário é o
 * que faz a plateia ver o sistema RELIGANDO em vez de ver uma luz trocar de
 * cor.
 */

export type EstadoLuz = 'caido' | 'religando' | 'online'

type Props = {
  subsistemas: string[]
  /** Estado de cada subsistema, na mesma ordem. */
  estados: EstadoLuz[]
  /** Encerramento: as três piscam juntas antes de a moldura voltar ao ciano. */
  encerrando?: boolean
}

export function LuzesEmergencia({ subsistemas, estados, encerrando = false }: Props) {
  return (
    <aside className={'luzes' + (encerrando ? ' luzes--encerrando' : '')}>
      <p className="luzes__rotulo">
        {encerrando ? 'sistemas' : 'modo reduzido'}
      </p>
      <ul className="luzes__lista">
        {subsistemas.map((nome, i) => (
          <li key={nome} className={`luzes__item luzes__item--${estados[i] ?? 'caido'}`}>
            <span className="luzes__led" />
            <span className="luzes__nome">{nome}</span>
            <span className="luzes__estado">
              {estados[i] === 'online'
                ? 'online'
                : estados[i] === 'religando'
                  ? 'religando'
                  : 'offline'}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
