import { useEffect, useRef, type ReactNode } from 'react'
import { motor } from '../mundo/motor'

type Props = {
  /** Texto do canto esquerdo da barra superior (ex.: "SETOR: BIOLOGIA"). */
  rota: string
  sonar?: string
  /** Rodapé discreto: turma e posição no roteiro. */
  rodapeEsquerda?: string
  rodapeDireita?: string
  /**
   * Estado do controle pelo celular, como um ponto de 6 px no rodapé.
   *
   * Verde ligado, âmbar reconectando, cinza desligado. É a única pista visível
   * de que existe um remoto, e é pequena de propósito: serve pro operador
   * conferir num relance e não pra plateia reparar.
   */
  remoto?: 'ligado' | 'reconectando' | 'desligado'
  /** Inclina a moldura inteira 1,5° durante a fase de inclinação do mergulho. */
  inclinado?: boolean
  /** Mergulho em curso: promove a camada da moldura antes do giro começar. */
  mergulhando?: boolean
  /** Impacto no casco durante o combate: treme a tela e pisca a borda. */
  impacto?: boolean
  /** A energia acabou de voltar: o HUD se firma com glitch. */
  voltandoDoApagao?: boolean
  /**
   * Modo reduzido do 2B: a moldura pulsa vermelho, devagar e fraco.
   *
   * Lento e de baixa opacidade de proposito. A avaria dura tres cenas de
   * apresentacao, e um alarme piscando forte por dez minutos atras de alunos
   * falando deixa de ser cenario e vira incomodo.
   */
  emergencia?: boolean
  /**
   * Leitura de temperatura da agua, quando a cena tem sementes.
   *
   * Recebe a REF, nao o numero: quem escreve e o Player, direto no DOM, a
   * cada quadro. Como prop numerica seria um render do HUD por tique.
   */
  agua?: React.RefObject<HTMLElement | null>
  children: ReactNode
}

/** Moldura fixa da apresentação: barra de status, scanlines e cantos de mira. */
export function Hud({
  rota,
  sonar = 'ATIVO',
  rodapeEsquerda,
  rodapeDireita,
  remoto,
  inclinado = false,
  mergulhando = false,
  impacto = false,
  voltandoDoApagao = false,
  emergencia = false,
  agua,
  children,
}: Props) {
  const refMetros = useRef<HTMLElement>(null)

  // O número é escrito direto no DOM: durante a descida ele muda várias vezes
  // por segundo, e virar estado do React seria um render por tique.
  useEffect(() => {
    if (refMetros.current) refMetros.current.textContent = '—'
    motor.observarProfundidade((metros) => {
      if (refMetros.current) refMetros.current.textContent = `${metros} m`
    })
    return () => motor.observarProfundidade(null)
  }, [])

  return (
    <div
      className={
        'hud' +
        (mergulhando ? ' hud--mergulhando' : '') +
        (inclinado ? ' hud--inclinado' : '') +
        (impacto ? ' hud--impacto' : '') +
        (voltandoDoApagao ? ' hud--religando' : '') +
        (emergencia ? ' hud--emergencia' : '')
      }
    >
      <div className="hud__moldura">
        <span className="hud__canto hud__canto--no" />
        <span className="hud__canto hud__canto--ne" />
        <span className="hud__canto hud__canto--so" />
        <span className="hud__canto hud__canto--se" />

        <div className="hud__barra">
          <span className="hud__campo">
            prof. <strong ref={refMetros} />
          </span>
          {agua && (
            <span className="hud__campo hud__campo--agua">
              água <strong ref={agua as React.RefObject<HTMLElement>} />
            </span>
          )}
          <span className="hud__campo">
            sonar <strong>{sonar}</strong>
          </span>
          <span className="hud__campo">
            rota <strong>{rota}</strong>
          </span>
        </div>

        <div className="hud__corpo">{children}</div>

        <div className="hud__barra hud__barra--rodape">
          <span className="hud__campo">
            {rodapeEsquerda}
            {remoto && (
              <span
                className={`hud__remoto hud__remoto--${remoto}`}
                title={`controle pelo celular: ${remoto}`}
              />
            )}
          </span>
          <span className="hud__campo">{rodapeDireita}</span>
        </div>
      </div>
    </div>
  )
}
