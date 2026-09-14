import type { ReactNode } from 'react'

type Props = {
  /** Texto do canto esquerdo da barra superior (ex.: "SETOR: BIOLOGIA"). */
  rota: string
  /** Profundidade fictícia, só cenário — sobe conforme a expedição avança. */
  profundidade: number
  sonar?: string
  /** Rodapé discreto: turma e posição no roteiro. */
  rodapeEsquerda?: string
  rodapeDireita?: string
  children: ReactNode
}

/** Moldura fixa da apresentação: barra de status, scanlines e cantos de mira. */
export function Hud({
  rota,
  profundidade,
  sonar = 'ATIVO',
  rodapeEsquerda,
  rodapeDireita,
  children,
}: Props) {
  return (
    <div className="hud">
      <div className="hud__moldura">
        <span className="hud__canto hud__canto--no" />
        <span className="hud__canto hud__canto--ne" />
        <span className="hud__canto hud__canto--so" />
        <span className="hud__canto hud__canto--se" />

        <div className="hud__barra">
          <span className="hud__campo">
            prof. <strong>{profundidade} m</strong>
          </span>
          <span className="hud__campo">
            sonar <strong>{sonar}</strong>
          </span>
          <span className="hud__campo">
            rota <strong>{rota}</strong>
          </span>
        </div>

        <div className="hud__corpo">{children}</div>

        <div className="hud__barra hud__barra--rodape">
          <span className="hud__campo">{rodapeEsquerda}</span>
          <span className="hud__campo">{rodapeDireita}</span>
        </div>
      </div>
    </div>
  )
}
