import type { CenaEmergencia } from '../roteiros/tipos'

/**
 * A quebra do 2B, em duas telas.
 *
 * Primeiro a tela de falha — o quadro trava, e ficar travado é a informação.
 * Depois ela some e sobra o modo reduzido, que não é uma tela: é um estado que
 * atravessa as cenas seguintes (ver `LuzesEmergencia`).
 *
 * É diferente da pane global de propósito. A pane congela tudo e espera o
 * operador reiniciar; aqui a apresentação continua com o submarino avariado,
 * porque quem conserta são os alunos falando, não uma tecla.
 */

export type FaseEmergencia = 'caindo' | 'travado' | 'retorno'

export type EstadoEmergencia = {
  fase: FaseEmergencia
  /** Quantas linhas da tela de falha já apareceram. */
  linhas: number
}

type Props = {
  cena: CenaEmergencia
  estado: EstadoEmergencia
}

export function Emergencia({ cena, estado }: Props) {
  // Só na fase travada. Durante a queda a IA ainda está falando normalmente —
  // "processando informações..." —, e é a naturalidade dessa fala que faz a
  // quebra funcionar. Pôr a tela de falha já na primeira linha entregaria o
  // susto antes de ele acontecer.
  if (estado.fase !== 'travado') return null

  return (
    <div className="emerg" data-fase={estado.fase}>
      <p className="emerg__titulo">{cena.tela.linhas[0]}</p>
      <ul className="emerg__lista">
        {cena.tela.linhas.slice(1).map((linha, i) => (
          <li
            key={linha}
            className={
              i < estado.linhas ? 'emerg__item emerg__item--visivel' : 'emerg__item'
            }
          >
            {linha}
          </li>
        ))}
      </ul>
    </div>
  )
}
