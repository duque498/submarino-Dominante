import { PainelCamera } from './PainelCamera'
import { PainelEspectro } from './PainelEspectro'
import { PainelFicha } from './PainelFicha'
import { PainelMapa } from './PainelMapa'
import { PainelSonar } from './PainelSonar'
import { PainelStatus, type Queda } from './PainelStatus'
import { PainelTraco } from './PainelTraco'

export {
  fichaExiste,
  NOMES_FICHAS,
  NOMES_PAINEIS,
  PAINEIS,
  painelCapturaTeclado,
  resolverPainel,
} from './nomes'

export type PainelAberto = {
  nome: string
  argumento?: string
  /** Só pro painel de status durante a pane. */
  quedas?: Queda[]
  congelado?: boolean
  /** Substitui o "esc pra fechar" do cabeçalho. */
  dica?: string
}

const TITULOS: Record<string, string> = {
  sonar: 'varredura de sonar',
  status: 'status dos subsistemas',
  ficha: 'ficha de catálogo',
  mapa: 'rota da expedição',
  camera: 'câmera externa',
  traco: 'leitura de traço',
  espectro: 'absorção da luz na água',
}

type Props = {
  painel: PainelAberto
  /** Painel de traço: entrega o desenho pronto pro Player amostrar. */
  aoInterpretarTraco?: (canvas: HTMLCanvasElement) => void
  aoFechar?: () => void
  /** Profundidade da cena, ponto de partida do painel de espectro. */
  profundidade?: number
  /** A IA está processando: os controles do traço travam. */
  travado?: boolean
}

/**
 * Overlay que se materializa sobre a área central. Só um por vez; abrir outro
 * substitui, e trocar de cena fecha (quem controla isso é o Player).
 */
export function Painel({
  painel,
  aoInterpretarTraco,
  aoFechar,
  profundidade,
  travado,
}: Props) {
  return (
    <div
      className={`painel painel--${painel.nome}`}
      key={`${painel.nome}:${painel.argumento ?? ''}`}
    >
      <div className="painel__moldura">
        <header className="painel__cabecalho">
          <span className="painel__nome">{TITULOS[painel.nome] ?? painel.nome}</span>
          <span className="painel__fechar">{painel.dica ?? 'esc pra fechar'}</span>
        </header>
        <div className="painel__corpo">
          {corpoDoPainel(painel, { aoInterpretarTraco, aoFechar, profundidade, travado })}
        </div>
      </div>
    </div>
  )
}

type Extras = {
  aoInterpretarTraco?: (canvas: HTMLCanvasElement) => void
  aoFechar?: () => void
  profundidade?: number
  travado?: boolean
}

function corpoDoPainel(
  { nome, argumento, quedas, congelado }: PainelAberto,
  extras: Extras,
) {
  switch (nome) {
    case 'sonar':
      return <PainelSonar />
    case 'status':
      return <PainelStatus quedas={quedas} congelado={congelado} />
    case 'ficha':
      return <PainelFicha argumento={argumento} />
    case 'mapa':
      return <PainelMapa />
    case 'camera':
      return <PainelCamera argumento={argumento} />
    case 'traco':
      return (
        <PainelTraco
          aoInterpretar={extras.aoInterpretarTraco ?? (() => {})}
          aoFechar={extras.aoFechar ?? (() => {})}
          travado={extras.travado}
        />
      )
    case 'espectro':
      return (
        <PainelEspectro
          profundidadeInicial={extras.profundidade}
          aoFechar={extras.aoFechar}
        />
      )
    default:
      return <p className="painel__vazio">painel "{nome}" não existe.</p>
  }
}
