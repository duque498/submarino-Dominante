import { PainelFicha } from './PainelFicha'
import { PainelMapa } from './PainelMapa'
import { PainelSonar } from './PainelSonar'
import { PainelStatus } from './PainelStatus'

export { fichaExiste, NOMES_FICHAS, NOMES_PAINEIS, PAINEIS, resolverPainel } from './nomes'

export type PainelAberto = { nome: string; argumento?: string }

const TITULOS: Record<string, string> = {
  sonar: 'varredura de sonar',
  status: 'status dos subsistemas',
  ficha: 'ficha de catálogo',
  mapa: 'rota da expedição',
}

type Props = { painel: PainelAberto }

/**
 * Overlay que se materializa sobre a área central. Só um por vez; abrir outro
 * substitui, e trocar de cena fecha (quem controla isso é o Player).
 */
export function Painel({ painel }: Props) {
  return (
    <div className="painel" key={`${painel.nome}:${painel.argumento ?? ''}`}>
      <div className="painel__moldura">
        <header className="painel__cabecalho">
          <span className="painel__nome">{TITULOS[painel.nome] ?? painel.nome}</span>
          <span className="painel__fechar">esc pra fechar</span>
        </header>
        <div className="painel__corpo">{corpoDoPainel(painel)}</div>
      </div>
    </div>
  )
}

function corpoDoPainel({ nome, argumento }: PainelAberto) {
  switch (nome) {
    case 'sonar':
      return <PainelSonar />
    case 'status':
      return <PainelStatus />
    case 'ficha':
      return <PainelFicha argumento={argumento} />
    case 'mapa':
      return <PainelMapa />
    default:
      return <p className="painel__vazio">painel "{nome}" não existe.</p>
  }
}
