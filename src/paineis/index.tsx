import { useEffect, useRef, useState } from 'react'
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
  /**
   * Quem abriu. O Diretor só fecha o que ele mesmo abriu — painel do operador
   * sai por Esc, por comando ou pelo fim da cena, nunca por prazo.
   */
  origem?: 'operador' | 'diretor'
  /** Só pro sonar aberto por fala: rótulo do contato que a IA acabou de citar. */
  contato?: string
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

/** Quanto o painel que está saindo fica na tela antes de sumir. */
const MS_SAIDA = 200

type Props = {
  painel: PainelAberto | null
  /** Painel de traço: entrega o desenho pronto pro Player amostrar. */
  aoInterpretarTraco?: (canvas: HTMLCanvasElement) => void
  aoFechar?: () => void
  /** Profundidade da cena, ponto de partida do painel de espectro. */
  profundidade?: number
  /** A IA está processando: os controles do traço travam. */
  travado?: boolean
  /** Painel de sonar: toca o ping a cada volta da varredura. */
  aoPing?: () => void
}

/**
 * Overlay que se materializa sobre a área central. Só um por vez; abrir outro
 * substitui, e trocar de cena fecha (quem controla isso é o Player).
 */
/**
 * Overlay que se materializa sobre a área central.
 *
 * Aceita `null` de propósito: quando o painel fecha, ele fica mais ~200 ms na
 * tela saindo. Sem isso, painel trocado pelo Diretor é um corte seco, e a troca
 * (um sai, o outro entra) é justamente o que faz a coisa parecer dirigida.
 *
 * Painel aberto pela FALA vai pra faixa de cima: a legenda continua na de
 * baixo, inteira. A regra é essa e não tem exceção — se o painel não couber na
 * faixa, ele encolhe; a legenda nunca some.
 */
export function Painel({
  painel,
  aoInterpretarTraco,
  aoFechar,
  profundidade,
  travado,
  aoPing,
}: Props) {
  const [saindo, setSaindo] = useState<PainelAberto | null>(null)
  const refAnterior = useRef<PainelAberto | null>(null)

  useEffect(() => {
    const anterior = refAnterior.current
    refAnterior.current = painel
    if (painel || !anterior) return
    setSaindo(anterior)
    const timer = setTimeout(() => setSaindo(null), MS_SAIDA)
    return () => clearTimeout(timer)
  }, [painel])

  const visivel = painel ?? saindo
  if (!visivel) return null
  return (
    <div
      className={
        `painel painel--${visivel.nome}` +
        (visivel.origem === 'diretor' ? ' painel--faixa' : '') +
        (painel ? '' : ' painel--saindo')
      }
      key={`${visivel.nome}:${visivel.argumento ?? ''}`}
    >
      <div className="painel__moldura">
        <header className="painel__cabecalho">
          <span className="painel__nome">{TITULOS[visivel.nome] ?? visivel.nome}</span>
          <span className="painel__fechar">{visivel.dica ?? 'esc pra fechar'}</span>
        </header>
        <div className="painel__corpo">
          {corpoDoPainel(visivel, {
            aoInterpretarTraco,
            aoFechar,
            profundidade,
            travado,
            aoPing,
            contato: visivel.contato,
            // Painel que o Diretor abriu é painel aberto pela fala.
            daFala: visivel.origem === 'diretor',
          })}
        </div>
      </div>
    </div>
  )
}

type Extras = {
  contato?: string
  daFala?: boolean
  aoInterpretarTraco?: (canvas: HTMLCanvasElement) => void
  aoFechar?: () => void
  profundidade?: number
  travado?: boolean
  aoPing?: () => void
}

function corpoDoPainel(
  { nome, argumento, quedas, congelado }: PainelAberto,
  extras: Extras,
) {
  switch (nome) {
    case 'sonar':
      return (
        <PainelSonar
          aoPing={extras.aoPing}
          contato={extras.contato}
          daFala={extras.daFala}
        />
      )
    case 'status':
      return <PainelStatus quedas={quedas} congelado={congelado} />
    case 'ficha':
      return <PainelFicha argumento={argumento} />
    case 'mapa':
      return <PainelMapa marcador={argumento} />
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
