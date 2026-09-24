import { useEffect, useRef, useState } from 'react'
import { PainelCamera } from './PainelCamera'
import { PainelDossie } from './PainelDossie'
import { PainelEco } from './PainelEco'
import { PainelEspectro } from './PainelEspectro'
import { PainelFicha } from './PainelFicha'
import { PainelMapa } from './PainelMapa'
import { PainelCache, type EstadoCache } from './PainelCache'
import { PainelCronometro } from './PainelCronometro'
import { PainelEnigma } from './PainelEnigma'
import { PainelSonar } from './PainelSonar'
import { PainelStatus, type Queda } from './PainelStatus'
import { PainelTraco } from './PainelTraco'
import { PainelZonas } from './PainelZonas'

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
  /**
   * O Diretor decidiu encerrar e está se despedindo.
   *
   * Não é o mesmo que fechar: o painel ainda está na tela. É o instante em que
   * o log escreve "Encerrando ..." e o sonar dá o ping final. Quem tem algo a
   * dizer na saída diz aqui; quem não tem, só sai um pouco mais devagar.
   */
  despedindo?: boolean
}

const TITULOS: Record<string, string> = {
  sonar: 'varredura de sonar',
  status: 'status dos subsistemas',
  ficha: 'ficha de catálogo',
  mapa: 'rota da expedição',
  camera: 'câmera externa',
  traco: 'leitura de traço',
  espectro: 'absorção da luz na água',
  zonas: 'zonas da coluna d\u0027água',
  eco: 'medição por eco',
  dossie: 'dossiê · contato não catalogado',
  cache: 'cache de espécies',
  cronometro: 'cronômetro',
  enigma: 'protocolo de descontaminação',
}

/** Quanto o painel que está saindo fica na tela antes de sumir. */
const MS_SAIDA = 200
/**
 * Saída de um painel que o Diretor ENCERROU de propósito.
 *
 * Mais que o dobro do corte normal, e é a diferença entre "acabou" e
 * "quebrou": o painel que é substituído por outro pode sair rápido, porque o
 * que entra explica a saída. O que encerra sozinho precisa do tempo de ser
 * visto saindo, senão a plateia lê como falha.
 */
const MS_SAIDA_ENCERRANDO = 520

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
  aoPingGrave?: (altura: number) => void
  /** Segundos da aproximação do contato, só na cena que a pede. */
  aproximacao?: number
  /** Leitura do cache, só na expedição de identificação. */
  cache?: EstadoCache
  /** Estado do visor: a câmera em painel também racha. */
  visor?: 'ok' | 'rachado' | 'parcial'
  /** Painel que captura o teclado e precisa devolver o `H` pro operador. */
  aoAjuda?: () => void
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
  aoPingGrave,
  aproximacao,
  cache,
  visor = 'ok',
  aoAjuda,
}: Props) {
  const [saindo, setSaindo] = useState<PainelAberto | null>(null)
  const refAnterior = useRef<PainelAberto | null>(null)

  useEffect(() => {
    const anterior = refAnterior.current
    refAnterior.current = painel
    if (painel || !anterior) return
    setSaindo(anterior)
    const timer = setTimeout(
      () => setSaindo(null),
      anterior.despedindo ? MS_SAIDA_ENCERRANDO : MS_SAIDA,
    )
    return () => clearTimeout(timer)
  }, [painel])

  const visivel = painel ?? saindo
  if (!visivel) return null
  return (
    <div
      className={
        `painel painel--${visivel.nome}` +
        (visivel.origem === 'diretor' ? ' painel--faixa' : '') +
        (painel ? '' : ' painel--saindo') +
        (visivel.despedindo ? ' painel--encerrando' : '')
      }
      // MODIFICADORES depois do `+` não entram na chave: eles mudam o ESTADO
      // do painel, não o que ele mostra. A revelação em dois tempos do dossiê
      // (`megalodonte+escuro` -> `megalodonte`) precisa do mesmo elemento nos
      // dois momentos: remontando, o navegador decodifica a imagem de novo e a
      // transição de 800 ms nem chega a começar.
      key={`${visivel.nome}:${(visivel.argumento ?? '').split('+')[0]}`}
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
            aoPingGrave,
            aproximacao,
            cache,
            visor,
            aoAjuda,
            contato: visivel.contato,
            despedindo: visivel.despedindo,
            // Painel que o Diretor abriu é painel aberto pela fala.
            daFala: visivel.origem === 'diretor',
          })}
        </div>
      </div>
    </div>
  )
}

type Extras = {
  aoAjuda?: () => void
  visor?: 'ok' | 'rachado' | 'parcial'
  aoPingGrave?: (altura: number) => void
  aproximacao?: number
  contato?: string
  despedindo?: boolean
  daFala?: boolean
  aoInterpretarTraco?: (canvas: HTMLCanvasElement) => void
  aoFechar?: () => void
  profundidade?: number
  travado?: boolean
  aoPing?: () => void
  cache?: EstadoCache
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
          aoPingGrave={extras.aoPingGrave}
          aproximacao={extras.aproximacao}
          contato={extras.contato}
          daFala={extras.daFala}
          despedindo={extras.despedindo}
        />
      )
    case 'status':
      return <PainelStatus quedas={quedas} congelado={congelado} />
    case 'ficha':
      return <PainelFicha argumento={argumento} />
    case 'dossie':
      return <PainelDossie argumento={argumento} />
    case 'mapa':
      return <PainelMapa marcador={argumento} />
    case 'camera':
      return <PainelCamera argumento={argumento} visor={extras.visor} />
    case 'zonas':
      return <PainelZonas />
    case 'cache':
      return extras.cache ? (
        <PainelCache estado={extras.cache} />
      ) : (
        <p className="painel__vazio">cache sem leitura.</p>
      )
    case 'eco':
      return <PainelEco aoFechar={extras.aoFechar} aoPing={extras.aoPing} />
    case 'cronometro': {
      // Argumento invalido nao vira painel quebrado: vira vinte segundos, que
      // e o que o roteiro da EF pede no aquecimento.
      const pedido = Number((argumento ?? '').replace(/[^0-9]/g, ''))
      const segundos = Number.isFinite(pedido) && pedido > 0 ? Math.min(600, pedido) : 20
      return (
        <PainelCronometro
          segundos={segundos}
          aoPing={extras.aoPing}
          aoFechar={extras.aoFechar}
        />
      )
    }
    case 'enigma':
      return (
        <PainelEnigma
          aoPing={extras.aoPing}
          aoFechar={extras.aoFechar}
          aoAjuda={extras.aoAjuda}
        />
      )
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
