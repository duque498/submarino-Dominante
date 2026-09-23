import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConsoleComandos } from '../console/Console'
import { interpretar, vocabulario } from '../console/comandos'
import { audioDaResposta, RESPOSTAS } from '../console/respostas'
import {
  carregarFormas,
  FORMA_PADRAO,
  formaRegistrada,
  limparTracos,
  obterForma,
  prepararGlifo,
  registrarTraco,
} from '../formas'
import { Feed } from '../mundo/Feed'
import { motor } from '../mundo/motor'
import { Painel, painelCapturaTeclado, type PainelAberto } from '../paineis'
import { Diretor, type MotivoFecho, type PainelPedido } from '../diretor/diretor'
import { DepuracaoDiretor } from '../diretor/DepuracaoDiretor'
import { falhasAnteriores, observarFalhas, quadroSeguro } from '../ui/falhas'
import { ColunaDagua } from '../diretor/ColunaDagua'
import {
  logDaFase,
  MINIMO_PARA_MERGULHAR,
  planejarMergulho,
  quadroDe,
  type FaseMergulho,
  type PlanoMergulho,
} from '../diretor/mergulho'
import { planejar } from '../ui/ritmoLegenda'
import type { Queda } from '../paineis/PainelStatus'
import {
  CACHE_TOTAL,
  textoDaLinha,
  type Cena,
  type CenaCombate,
  type CenaPane,
  type Roteiro,
  type Visor,
} from '../roteiros/tipos'
import { Apresentacao } from '../cenas/Apresentacao'
import {
  Combate,
  MS_COOLDOWN,
  type EstadoCombate,
  type FaseCombate,
  type SimulacaoCombate,
} from '../cenas/Combate'
import { Fala } from '../cenas/Fala'
import {
  Identificacao,
  PISO_CALIBRACAO,
  type EstadoIdent,
} from '../cenas/Identificacao'
import { Emergencia, type EstadoEmergencia } from '../cenas/Emergencia'
import { Hidrofone, type EstadoHidro } from '../cenas/Hidrofone'
import { LuzesEmergencia, type EstadoLuz } from '../paineis/LuzesEmergencia'
import { Fim } from '../cenas/Fim'
import { Olho } from '../cenas/Olho'
import type { EstadoCache } from '../paineis/PainelCache'
import { Quiz, type FaseDinamica } from '../cenas/Quiz'
import { Transicao } from '../cenas/Transicao'
import { VF } from '../cenas/VF'
import { Ajuda } from '../ui/Ajuda'
import { Hud } from '../ui/Hud'
import { Legenda } from '../ui/Legenda'
import { LogSistemas, type ModoLog, type RajadaLog } from '../ui/LogSistemas'
import { POOL_COMANDO } from '../ui/logPool'
import { duracaoDaLegenda, type TemposReais } from '../ui/ritmoLegenda'
import { Orbe, QTD_PONTOS, type EstadoOrbe } from '../ui/Orbe'
import type { AudioEngine } from './AudioEngine'
import { useTeclado } from './useTeclado'

/** Limites do ajuste de tamanho do orbe pelo operador ([ e ]). */
const ESCALA_MIN = 0.5
const ESCALA_MAX = 2
const ESCALA_PASSO = 0.1
/** Marca "esfera forçada": o operador apertou O e saiu da lista da cena. */
const SEM_FORMA = -1
/** Quanto tempo a IA "pensa" antes de responder a um comando. */
const MS_PROCESSANDO = [600, 1200] as const
/** Reação do orbe a acerto, erro ou comando desconhecido. */
const MS_REACAO = 600
/** Intervalo entre um subsistema cair (ou voltar) e o próximo. */
const MS_ENTRE_SUBSISTEMAS = 400

/**
 * Como cada painel aparece no LOG quando o Diretor o encerra.
 *
 * Caixa alta e vocabulário de instrumento, igual ao resto do log: quem lê a
 * coluna da direita tem que sentir que foi o sistema que decidiu, não que
 * alguém fechou uma janela.
 */
const TITULOS_LOG: Record<string, string> = {
  sonar: 'VARREDURA DE SONAR',
  status: 'PAINEL DE SUBSISTEMAS',
  mapa: 'CARTA DE ROTA',
  camera: 'CÂMERA EXTERNA',
  espectro: 'LEITURA DE ESPECTRO',
  ficha: 'FICHA DE CATÁLOGO',
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const sorteio = (min: number, max: number) => min + Math.random() * (max - min)

/** Caminho do mp3 principal da cena, quando ela tem um. */
export function audioDaCena(cena: Cena): string | null {
  switch (cena.tipo) {
    case 'fala':
    case 'transicao':
      return cena.audio
    case 'apresentacao':
      return cena.audio ?? null
    case 'quiz':
      return cena.audio.pergunta
    case 'vf':
      return cena.audio.afirmacao
    case 'pane':
      return cena.audio.entrada
    // A emergencia tem DOIS: a queda e o retorno em modo reduzido, com a tela
    // travada entre eles. Quem toca os dois e o laco proprio da cena.
    case 'emergencia':
    // O hidrofone e como a identificacao: cada som tem as falas dele.
    case 'hidrofone':
    // O combate nao tem UM audio: tem um por rodada, tocado pelo laco proprio.
    // A tela final nao fala nada — o encerramento ja falou.
    case 'combate':
    case 'fim':
    // A identificacao tambem nao: cada especie tem as falas dela, e as pistas
    // entram no ritmo do laco, nao no da cena.
    case 'identificacao':
    // A cena do olho é muda de propósito: a IA só volta a falar depois que o
    // visor já quebrou.
    case 'olho':
      return null
  }
}

/** Linhas que a legenda vai mostrar, se a cena tiver legenda. */
function linhasDaLegenda(cena: Cena): string[] | null {
  return cena.tipo === 'fala' || cena.tipo === 'transicao'
    ? cena.tela.linhas.map(textoDaLinha)
    : null
}

/** Linhas só pra estimar duração em cenas que não têm legenda. */
function linhasDeReferencia(cena: Cena): string[] {
  switch (cena.tipo) {
    case 'fala':
    case 'transicao':
      return cena.tela.linhas.map(textoDaLinha)
    case 'apresentacao':
      return [cena.tela.titulo]
    case 'quiz':
      return [cena.pergunta]
    case 'vf':
      return [cena.afirmacao]
    case 'pane':
      return cena.falaEntrada ?? cena.subsistemas
    case 'emergencia':
      return cena.falasQueda
    case 'hidrofone':
      return cena.falas.inicio[0] ?? [cena.sons[0]?.nome ?? 'hidrofone']
    case 'combate':
      return cena.falas.rodada[0] ?? [cena.criatura]
    case 'identificacao':
      return cena.falas.inicio[0] ?? [cena.especies[0]?.nome ?? 'identificacao']
    case 'fim':
      return [cena.tela.titulo]
    case 'olho':
      return [cena.criatura]
  }
}

function rotaDaCena(cena: Cena): string {
  switch (cena.tipo) {
    case 'transicao':
      return cena.destino.toUpperCase()
    case 'combate':
      return 'CONTATO HOSTIL'
    case 'identificacao':
      return 'RECALIBRANDO CATÁLOGO'
    case 'emergencia':
      return 'FALHA DE SISTEMA'
    case 'hidrofone':
      return 'ESCUTA PASSIVA'
    case 'olho':
      return 'CONTATO VISUAL'
    case 'fim':
      return cena.tela.subtitulo.toUpperCase()
    case 'fala':
    case 'apresentacao':
      return (cena.tela.titulo ?? cena.id).toUpperCase()
    default:
      return cena.id.toUpperCase()
  }
}

type Layout = 'central' | 'palco' | 'canto'

function layoutDaCena(cena: Cena): Layout {
  // No combate o orbe fica pequeno no canto: a tela e do mostrador de sonar, e
  // um orbe grande no meio competiria justamente com o que a plateia precisa
  // ler pra responder.
  // No olho a tela é do bicho: o orbe some pro canto e a área central fica
  // inteira pra a câmera.
  // Na identificação a tela também é da câmera: o orbe sai do caminho.
  // No hidrofone a tela e do espectrograma: mesma logica das outras dinamicas
  // em que a plateia precisa LER alguma coisa pra responder.
  if (
    cena.tipo === 'combate' ||
    cena.tipo === 'olho' ||
    cena.tipo === 'identificacao' ||
    cena.tipo === 'hidrofone'
  ) {
    return 'canto'
  }
  if (cena.tipo !== 'apresentacao') return 'central'
  return cena.orbe === 'palco' ? 'palco' : 'canto'
}

/**
 * Velocidade base de uma investida, pra o `tempo` do roteiro VALER.
 *
 * O laço acelera o contato perto do centro (`1 + perto * 0,8`), e com a base
 * ingênua — distância ÷ tempo — esse empurrão era de graça: a investida de
 * 900 m declarada com 10 s chegava ao casco em 7,0 s medidos. O roteiro
 * mentia, e quem pagava era a plateia, que tinha 30% menos tempo do que a
 * professora escreveu.
 *
 * O perfil de velocidade e em DEGRAUS: constante dentro de cada terco do
 * trajeto e 15% mais rapida a cada terco. Integrando,
 *
 *     T = (D/3) * (1/v + 1/(1,15 v) + 1/(1,3225 v)) = (D/v) * 0,8752363
 *
 * entao a base que faz a investida durar exatamente `tempo` e
 *
 *     v = 0,8752363 * D / T
 *
 * A aceleracao dos erros continua entrando por cima: errar o setor ENCURTA o
 * tempo, que e a penalidade.
 */

/**
 * Amplitude da deriva lateral do contato, em fracao do RAIO do mostrador.
 *
 * 3%: some na leitura de trajetoria e aparece na de vida. Acima disso o
 * contato volta a parecer que esta manobrando em vez de vindo.
 */
export const DERIVA_CONTATO = 0.03

/** Quanto dura o empurrao do pulso, da posicao dele ate fora do mostrador. */
const MS_EMPURRAO = 650

/** Quanto a velocidade sobe a cada terco do trajeto. */
export const DEGRAU_VELOCIDADE = 1.15
/**
 * Integral do perfil em degraus, em unidades de D/v. Deriva de
 * (1 + 1/1,15 + 1/1,15^2) / 3 — e o que converte tempo de rodada em
 * velocidade base.
 */
const FATOR_PERFIL = (1 + 1 / DEGRAU_VELOCIDADE + 1 / DEGRAU_VELOCIDADE ** 2) / 3

function velocidadeBase(distancia: number, tempo: number, _alcance: number): number {
  return (FATOR_PERFIL * Math.max(1, distancia)) / Math.max(0.1, tempo)
}

/** Multiplicador do degrau em que o bicho esta, dado quanto do trajeto ja andou. */
export function degrauDoTrajeto(percorrido: number): number {
  const terco = Math.min(2, Math.max(0, Math.floor(percorrido * 3)))
  return DEGRAU_VELOCIDADE ** terco
}

/**
 * Setor da proxima investida, diferente do anterior quando da.
 *
 * Repetir o setor faria a plateia decorar em vez de escutar; com dois setores
 * so, alternar ja e o melhor possivel.
 */
function sortearSetorDiferente(anterior: number, setores: number): number {
  if (setores <= 1) return 0
  let i = Math.floor(Math.random() * setores)
  if (i === anterior) i = (i + 1 + Math.floor(Math.random() * (setores - 1))) % setores
  return i
}

/** Quanto cada impacto tira do casco. */
const DANO_POR_IMPACTO = 0.25
/** Na tela final, quanto o log ainda escreve antes de se calar de vez. */
const MS_LOG_ATE_PARAR = 7000
/** Estatica depois da rachadura, antes de a IA voltar a falar. */
const MS_ESTATICA_APOS_OLHO = 2200
/** Olho, tempo 1: a camera grande abre e o farol oscila. */
const MS_OLHO_CAMERA = 1500
/** Olho, tempo 2: a silhueta cruza o facho de ponta a ponta. */
const MS_OLHO_TRAVESSIA = 3000
/** Emergencia: quanto cada linha da tela de falha demora pra entrar. */
const MS_LINHA_FALHA = 380
/** Emergencia: quanto a tela de falha fica travada antes do modo reduzido. */
const MS_TELA_TRAVADA = 3000
/** Reparo: vermelho -> ambar -> verde. */
const MS_RELIGANDO = 1200
/** Hidrofone: tempo de a sala ouvir o som antes de a IA dar a pista. */
const MS_ATE_PISTA = 4000
/** Hidrofone: quanto a fonte fica na tela depois da fala de resultado. */
const MS_FONTE_NA_TELA = 3000
/**
 * Sementes: quanto a agua leva pra ir do primeiro valor ao segundo.
 *
 * Quatro minutos, que e a ordem de grandeza de uma apresentacao de grupo. Se
 * o grupo falar menos, a agua nao chega no fundo da faixa — e tudo bem: o que
 * a cena precisa e que ela esteja CAINDO, nao que chegue num numero.
 */
const MS_QUEDA_AGUA = 240_000
/** Modo reduzido: espacamento das linhas de erro no log. */
const MS_ENTRE_ERROS = 20_000
/** Sementes: espacamento dos avisos no log. */
const MS_ENTRE_AVISOS = 40_000

/**
 * Identificacao: quanto o bicho nitido ainda fica na tela depois que a IA
 * termina de falar sobre ele.
 *
 * Eram 4 s quando a revelacao era muda. Com a fala sobre a especie por cima,
 * quem segura a cena e ela; isto aqui e so o respiro antes de a agua sujar de
 * novo.
 */
const MS_CONTEMPLACAO = 1600
/** Olho, tempo 3: escuro e silencio antes de ele aparecer. */
const MS_OLHO_ESCURO = 800
/** Apagao depois de um impacto: preto, luz de emergencia, volta com glitch. */
const MS_APAGAO = 400
/** Silencio depois do ultimo acerto, antes do retorno solto. */
const MS_FAKEOUT_SILENCIO = 2000
/** O retorno solto na borda ate a cena virar. */
const MS_FAKEOUT_RETORNO = 1800
/** Despedida da trilha depois do fake-out, antes de a IA voltar a falar. */
const MS_FADE_NEUTRALIZADO = 3000
/** O HUD se firmando depois que a energia volta. */
const MS_GLITCH_VOLTA = 520

/** Os quatro tempos da cena do olho, em ordem. */
type PassoOlho = 'camera' | 'travessia' | 'escuro' | 'olho'

type FasePane = 'caindo' | 'congelado' | 'voltando'
type EstadoPane = { fase: FasePane; quedas: Queda[] }
type Fala = { linhas: string[]; duracaoMs: number | null; chave: number; fixa: boolean }

type Props = { roteiro: Roteiro; engine: AudioEngine }

export function Player({ roteiro, engine }: Props) {
  // A pane fica no mesmo JSON, mas fora da ordem: é disparada pela tecla P a
  // qualquer momento, então some da sequência linear que as setas percorrem.
  const sequencia = useMemo(
    () => roteiro.cenas.filter((cena) => cena.tipo !== 'pane'),
    [roteiro],
  )
  const cenaPane = useMemo(
    () => roteiro.cenas.find((cena): cena is CenaPane => cena.tipo === 'pane'),
    [roteiro],
  )

  const [indice, setIndice] = useState(0)
  /**
   * Em que trecho do roteiro a trilha do combate tem permissão de existir.
   *
   * Ela começa na travessia da cena do olho e morre no fim do combate, mas
   * quem a liga e quem a desliga são efeitos diferentes — e o operador pode
   * atravessar isso com a seta esquerda ou com `cena <id>` no console a
   * qualquer momento. Sem uma guarda, sair da cena do olho pra trás deixava a
   * música tocando por cima de uma apresentação de biologia.
   *
   * Derivado da estrutura, não de ids: do `olho` até a cena logo depois do
   * `combate`, que é onde a IA diz que o contato foi neutralizado.
   */
  /**
   * Até onde o cache continua na tela.
   *
   * Ele vive uma cena ALÉM da identificação: o `ident-fim` é justamente a IA
   * dizendo que o banco fechou, e o contador precisa estar lá pra rolar até o
   * total enquanto ela fala. Passado isso, some.
   */
  const janelaCache = useMemo(() => {
    const i = sequencia.findIndex((c) => c.tipo === 'identificacao')
    return i < 0 ? null : { de: i, ate: i + 1 }
  }, [sequencia])

  /**
   * Até onde o modo reduzido continua ligado.
   *
   * Derivado da estrutura, não de ids, como a janela da trilha: da cena de
   * `emergencia` até a cena logo DEPOIS do `hidrofone` — que é onde a IA diz
   * que a comunicação voltou e as luzes fecham em verde. Sem a guarda, voltar
   * com a seta esquerda deixaria três luzes vermelhas em cima de uma
   * apresentação que ainda não quebrou.
   */
  const janelaEmergencia = useMemo(() => {
    const quebra = sequencia.findIndex((c) => c.tipo === 'emergencia')
    if (quebra < 0) return null
    const hidro = sequencia.findIndex((c) => c.tipo === 'hidrofone')
    return { de: quebra, ate: (hidro >= 0 ? hidro : quebra) + 1 }
  }, [sequencia])

  const janelaTrilha = useMemo(() => {
    const combate = sequencia.findIndex((c) => c.tipo === 'combate')
    if (combate < 0) return null
    const olho = sequencia.findIndex((c) => c.tipo === 'olho')
    return { de: olho >= 0 ? olho : combate, ate: combate + 1 }
  }, [sequencia])
  /** Cronômetro da legenda: só arranca quando o áudio da cena arrancou. */
  const [sinc, setSinc] = useState<{
    duracaoMs: number | null
    ativa: boolean
    tempos: TemposReais | null
  }>({ duracaoMs: null, ativa: false, tempos: null })
  const [falando, setFalando] = useState(false)
  /** Linha que a voz do navegador está dizendo agora; null = manda o relógio. */
  const [linhaGuiada, setLinhaGuiada] = useState<number | null>(null)
  const [indiceForma, setIndiceForma] = useState(SEM_FORMA)
  const [formaForcada, setFormaForcada] = useState<string | null>(null)
  const [escala, setEscala] = useState(1)
  const [ajudaVisivel, setAjudaVisivel] = useState(false)

  const [consoleAberto, setConsoleAberto] = useState(false)
  const [consoleTravado, setConsoleTravado] = useState(false)
  const [autoComando, setAutoComando] = useState<string | null>(null)
  /** Comando já começado no campo quando um atalho abre o console. */
  const [comandoIniciado, setComandoIniciado] = useState<string | null>(null)
  const [painel, setPainel] = useState<PainelAberto | null>(null)
  /**
   * Desenhos feitos no painel de traço nesta cena. Entram no rodízio de M/N
   * junto das formas do roteiro e morrem quando a cena vira.
   */
  const [tracos, setTracos] = useState<string[]>([])
  /** A IA está lendo o desenho: os controles do painel de traço travam. */
  const [tracoTravado, setTracoTravado] = useState(false)
  /** Mergulho em curso: plano + instante em que começou. */
  const [mergulho, setMergulho] = useState<{ plano: PlanoMergulho; inicio: number } | null>(
    null,
  )
  const [faseMergulho, setFaseMergulho] = useState<FaseMergulho | null>(null)
  /**
   * Profundidade do quadro atual do mergulho.
   *
   * Numa REF, não em estado: isto muda 60 vezes por segundo, e como estado
   * forçaria um render do Player inteiro por quadro — HUD, painel, feeds,
   * legenda e log. Medido: 49 fps. A coluna d'água lê daqui dentro do próprio
   * requestAnimationFrame, que é o mesmo padrão do nível de áudio no orbe.
   */
  const refProfMergulho = useRef(0)
  /**
   * Estado do visor, PERSISTENTE entre cenas.
   *
   * Uma cena sem o campo `visor` herda o da anterior, e é isso que faz o vidro
   * rachado atravessar as quatro apresentações do 3A sem ter que ser repetido
   * em cada cena do JSON. Mora aqui e não no Diretor porque quem desenha a
   * rachadura é o React, e quem apaga a imagem é o motor do mundo — os dois
   * precisam do valor, e o Diretor não fala com nenhum dos dois.
   */
  const [visor, setVisor] = useState<Visor>('ok')
  const [combate, setCombate] = useState<EstadoCombate | null>(null)
  /** Estado da expedição de identificação. `null` fora da cena. */
  const [ident, setIdent] = useState<EstadoIdent | null>(null)
  /** Leitura do cache. Mora aqui porque o painel e a cena leem a mesma coisa. */
  const [cache, setCache] = useState<EstadoCache | null>(null)
  /** Calibração viva: muda a 60 fps, então fica fora do estado. */
  const refCalibracao = useRef(1)
  const lerCalibracao = useCallback(() => refCalibracao.current, [])
  const lerEspectro = useCallback(() => engine.espectroDoHidrofone(), [engine])
  const lerOnda = useCallback(() => engine.ondaDoHidrofone(), [engine])
  /** Tremor da tela inteira: o impacto do combate e a quebra do visor. */
  const [impacto, setImpacto] = useState(false)
  /**
   * Em que tempo da cena do olho estamos.
   *
   * Ela tem três, e todos automáticos: a câmera abre grande, a silhueta
   * atravessa o facho inteiro, e só depois do escuro o olho entra. A ordem é
   * o argumento da cena — primeiro a plateia mede o bicho, depois ela o
   * encara. Invertido, o olho seria só um susto.
   */
  const [passoOlho, setPassoOlho] = useState<PassoOlho | null>(null)
  /** O olho está no facho? Falso já no quadro da rachadura. */
  const olhoVisivel = passoOlho === 'olho'
  /** Apagão do combate: a tela cai e a luz de emergência pisca. */
  const [apagao, setApagao] = useState(false)
  /** Logo depois do apagão: o HUD reacende com glitch por um instante. */
  const [voltandoDoApagao, setVoltandoDoApagao] = useState(false)
  /** Preenchido pelo laço da cena do olho; chamado pelo componente. */
  const refQuebrarOlho = useRef<(() => void) | null>(null)
  /**
   * Na tela final o log escreve mais algumas linhas e PARA.
   *
   * Um log rolando pra sempre atrás do letreiro de encerramento transforma o
   * fim da apresentação em tela de espera. Ele termina de dizer o que tinha a
   * dizer e se cala, junto com a turma.
   */
  const [logParado, setLogParado] = useState(false)
  /**
   * Numa ref, e não no estado: o callback do teclado é memorizado e lê isto no
   * momento da tecla. Como estado, cada troca de fase do combate recriaria o
   * callback e religaria o listener.
   */
  const refCombateAtivo = useRef(false)
  /** A identificação está esperando o operador? Lida pelo callback do teclado. */
  const refIdentAtiva = useRef(false)
  /** `true` = a tripulação acertou; `false` = o operador revelou (tecla X). */
  const refRespostaIdent = useRef<((acertou: boolean) => void) | null>(null)
  /** Recebe a marcação do operador no combate. Vive enquanto a cena viver. */
  const refRespostaCombate = useRef<((setor: number | 'forcado' | null) => void) | null>(null)
  /**
   * A simulação do combate mora numa ref, não no estado.
   *
   * Distância, desvio e cooldown mudam a 60 fps. Como estado, cada quadro
   * rerenderizaria o Player inteiro — o painel lê estes números direto, por
   * `lerSim`, e escreve no DOM sem passar pelo React.
   */
  const refSimCombate = useRef<SimulacaoCombate>({
    distancia: 0,
    velocidade: 0,
    desvio: 0,
    prontoEm: 0,
    recusaEm: -Infinity,
    pulso: null,
  })
  /** Fase atual, lida DENTRO do laço sem recriá-lo a cada troca. */
  const refFaseCombate = useRef<FaseCombate>('investida')
  /** Velocidade base da investida corrente (distância ÷ tempo da rodada). */
  const refBaseVel = useRef(0)
  const lerSimCombate = useCallback(() => refSimCombate.current, [])
  /** `?debugDiretor=1`: rodapé com a decisão do Diretor ao vivo. */
  const depurarDiretor = useRef(
    /(^|[?&])debugdiretor=(1|on|true)(&|$)/i.test(window.location.search),
  ).current
  /** `?gatilhos=off` na URL, ou o comando `gatilhos off` no console. */
  const [gatilhosLigados, setGatilhosLigados] = useState(
    () => !/(^|[?&])gatilhos=off(&|$)/i.test(window.location.search),
  )
  /** Fala avulsa da IA: resposta de comando, feedback de quiz ou alerta da pane. */
  const [fala, setFala] = useState<Fala | null>(null)
  const [rajadaLog, setRajadaBruta] = useState<RajadaLog | null>(null)
  /**
   * Mantém a assinatura antiga (`setRajadaLog([...])`) porque ela é chamada de
   * duas dúzias de lugares; o nível é opcional e só o roteiro usa.
   */
  const setRajadaLog = useCallback(
    (linhas: string[], nivel?: 'err' | 'warn' | 'ok') => setRajadaBruta({ linhas, nivel }),
    [],
  )
  /**
   * Ritmo do orbe pedido pelo roteiro. Volta sozinho ao normal: quem conta o
   * tempo é aqui, porque é o roteiro que sabe quanto o momento dura.
   */
  const [ritmoOrbe, setRitmoOrbe] = useState<'normal' | 'parado' | 'lento'>('normal')
  const refRitmoTimer = useRef(0)
  const [orbeForcado, setOrbeForcado] = useState<EstadoOrbe | null>(null)
  const [tremor, setTremor] = useState(false)
  const [pulso, setPulso] = useState(false)

  // --- dinâmicas (quiz e vf) ---
  const [faseDinamica, setFaseDinamica] = useState<FaseDinamica>('pergunta')
  const [escolhidaQuiz, setEscolhidaQuiz] = useState<number | null>(null)
  const [escolhidaVF, setEscolhidaVF] = useState<boolean | null>(null)
  /** Subsistemas que o vf com `restaura` já religou (pronto pro 3A). */
  const [restaurados, setRestaurados] = useState<string[]>([])

  // --- pane ---
  const [pane, setPane] = useState<EstadoPane | null>(null)

  // --- emergência do 2B ---
  /**
   * Modo reduzido: PERSISTENTE entre cenas, como o visor rachado do 3A.
   *
   * Não é um painel nem uma fase de cena: a quebra acontece numa cena e o
   * estado atravessa as três seguintes, porque é isso que o roteiro conta —
   * os grupos 3 e 4 apresentam com o submarino avariado. Só o `hidro-fim`
   * desliga.
   */
  const [emergencia, setEmergencia] = useState<{
    subsistemas: string[]
    estados: EstadoLuz[]
    encerrando: boolean
  } | null>(null)
  const [emerg, setEmerg] = useState<EstadoEmergencia | null>(null)
  /** Estado do hidrofone. `null` fora da cena. */
  const [hidro, setHidro] = useState<EstadoHidro | null>(null)
  /** Teclas de reparo já usadas nesta cena — a segunda vez não faz nada. */
  const refReparosUsados = useRef<Set<string>>(new Set())
  /** Lido pelo callback memorizado do teclado, como o do combate. */
  const refReparos = useRef<((tecla: string) => void) | null>(null)
  const refHidroAtiva = useRef(false)
  const refRespostaHidro = useRef<((acertou: boolean) => void) | null>(null)
  /** Leitura de temperatura da água. Muda devagar, mas fora do estado. */
  const refAgua = useRef<HTMLElement | null>(null)
  const [aguaVisivel, setAguaVisivel] = useState(false)
  /** Última profundidade declarada; cenas sem o campo herdam esta. */
  const refProfundidade = useRef(50)
  /** performance.now() de quando a fala da cena começou a tocar. */
  const refInicioAudio = useRef(0)
  /** O próximo comando executado deve agir sem console e sem resposta? */
  const refDiscreto = useRef(false)
  /** Lido dentro do efeito da cena, que não pode avançar por baixo da pane. */
  const refPaneAtiva = useRef(false)
  const refFimDaFalaPane = useRef(0)
  const proximaChave = useRef(0)

  const cena = sequencia[indice]
  // O que M e N percorrem: as formas do roteiro mais os traços desenhados
  // agora. Os traços NÃO existem pro JSON nem pro autocomplete — só aqui.
  const formasDaCena = useMemo(
    () => [...(cena?.formas ?? []), ...tracos],
    [cena, tracos],
  )
  const formaDaLista =
    indiceForma >= 0 && indiceForma < formasDaCena.length
      ? formasDaCena[indiceForma]
      : FORMA_PADRAO
  const formaAtual = formaForcada ?? formaDaLista

  const avancar = useCallback(() => {
    if (refPaneAtiva.current) return
    // A seta direita corta o mergulho. Quem está no palco não pode ficar
    // refém de uma animação de cinco segundos.
    setMergulho(null)
    setIndice((atual) => Math.min(atual + 1, sequencia.length - 1))
  }, [sequencia.length])

  const voltar = useCallback(() => {
    if (refPaneAtiva.current) return
    setIndice((atual) => Math.max(atual - 1, 0))
  }, [])

  /**
   * Vai direto pra uma cena pelo id. Usado pelo desfecho do combate.
   *
   * Sem isto, o único caminho pra fora do combate era `avancar()`, que cai
   * sempre no `neutralizado` — a cena que diz "ameaça neutralizada". Dizer isso
   * depois de o casco zerar seria a IA mentindo na frente da plateia.
   */
  const pularPara = useCallback(
    (id: string) => {
      const alvo = sequencia.findIndex((c) => c.id === id)
      if (alvo >= 0) setIndice(alvo)
      return alvo >= 0
    },
    [sequencia],
  )

  const lerNivel = useCallback(() => engine.nivel(), [engine])

  /**
   * Começa uma sequência de mergulho — ou não, se a distância for pequena.
   *
   * Abaixo de 100 m não vale a produção inteira: o HUD ticka e pronto. Uma
   * sequência de 5 segundos pra descer 40 m faria a apresentação parecer lenta
   * exatamente onde ela devia ser fluida.
   */
  const iniciarMergulho = useCallback((para: number) => {
    const de = motor.profundidade()
    refProfundidade.current = para
    if (Math.abs(para - de) < MINIMO_PARA_MERGULHAR) {
      motor.definirAlvo(para)
      return
    }
    setMergulho((atual) => {
      // A cena declara a profundidade E a linha pode ter a ação de mergulho.
      // Pedir duas vezes o mesmo destino não recomeça a descida.
      if (atual && atual.plano.para === para) return atual
      return { plano: planejarMergulho(de, para), inicio: performance.now() }
    })
  }, [])

  /** Põe uma fala avulsa na legenda. `fixa` = não sai sozinha (usada na pane). */
  const dizer = useCallback(
    (linhas: string[], duracaoMs: number | null = null, fixa = false) => {
      proximaChave.current += 1
      setFala({ linhas, duracaoMs, chave: proximaChave.current, fixa })
    },
    [],
  )

  /**
   * Toca uma fala avulsa e devolve quanto tempo ela ocupa a tela. Sem mp3, o
   * envelope sintético roda mesmo assim pra o orbe não ficar morto.
   */
  const falarAvulso = useCallback(
    async (url: string, linhas: string[], fixa = false) => {
      const reproducao = engine.vozNavegadorForcada() ? null : await engine.tocar(url)
      const duracaoMs = reproducao?.tocou ? reproducao.duracaoMs : null
      const naTela = duracaoDaLegenda(linhas, duracaoMs)
      dizer(linhas, duracaoMs, fixa)
      if (!reproducao?.tocou) {
        // Sem mp3, quem lê é a voz do navegador. Não espera o fim: a legenda
        // já está na tela e a fala corre junto.
        void engine.falarComNavegador(linhas)
      }
      return naTela
    },
    [engine, dizer],
  )

  /**
   * O operador (ou a plateia, por ele) marcou um setor no combate.
   *
   * Só resolve a espera; quem decide se foi acerto e o que acontece depois é o
   * laço da cena. Duas fontes chamam isto: as teclas 1..9 e o clique nos cards.
   */
  const responderCombate = useCallback((setor: number | 'forcado') => {
    // Não zera a ref: com cooldown, o operador marca várias vezes na mesma
    // investida e quem decide se a tecla vale é o laço, não este callback.
    refRespostaCombate.current?.(setor)
  }, [])

  const reagir = useCallback((acertou: boolean) => {
    if (acertou) setPulso(true)
    else setTremor(true)
    setTimeout(() => {
      setPulso(false)
      setTremor(false)
    }, MS_REACAO)
  }, [])

  // --- dinâmicas -----------------------------------------------------------

  const concluirDinamica = useCallback(
    async (acertou: boolean) => {
      if (!cena) return
      setFaseDinamica('feedback')
      reagir(acertou)
      setOrbeForcado('falando')

      const audio =
        cena.tipo === 'quiz' || cena.tipo === 'vf'
          ? acertou
            ? cena.audio.acerto
            : cena.audio.erro
          : null
      const linhas =
        (cena.tipo === 'quiz' || cena.tipo === 'vf'
          ? acertou
            ? cena.falaAcerto
            : cena.falaErro
          : null) ?? [acertou ? 'Correto.' : 'Incorreto.']

      if (!audio) return
      const naTela = await falarAvulso(audio, linhas)
      setTimeout(() => setOrbeForcado(null), naTela)
    },
    [cena, falarAvulso, reagir],
  )

  const responderQuiz = useCallback(
    (escolha: number) => {
      if (cena?.tipo !== 'quiz' || faseDinamica !== 'respondendo') return
      if (escolha >= cena.alternativas.length) return
      setEscolhidaQuiz(escolha)
      void concluirDinamica(escolha === cena.correta)
    },
    [cena, faseDinamica, concluirDinamica],
  )

  const responderVF = useCallback(
    (escolha: boolean | null) => {
      if (cena?.tipo !== 'vf' || faseDinamica !== 'respondendo') return
      setEscolhidaVF(escolha)
      const acertou = escolha === cena.resposta
      // Cada acerto religa um subsistema: é o que sustenta a pane narrativa do 3A.
      if (acertou && cena.restaura) {
        setRestaurados((atuais) =>
          atuais.includes(cena.restaura!) ? atuais : [...atuais, cena.restaura!],
        )
      }
      void concluirDinamica(acertou)
    },
    [cena, faseDinamica, concluirDinamica],
  )

  /** Timer zerado sem resposta conta como erro. */
  const aoZerarTimer = useCallback(() => {
    if (faseDinamica !== 'respondendo') return
    if (cena?.tipo === 'quiz') {
      setEscolhidaQuiz(-1)
      void concluirDinamica(false)
    } else if (cena?.tipo === 'vf') {
      setEscolhidaVF(null)
      void concluirDinamica(false)
    }
  }, [cena, faseDinamica, concluirDinamica])

  const aoPing = useCallback(() => engine.tocarSfx('sonar'), [engine])
  /** Ping da aproximação: mesmo efeito, altura caindo conforme ele chega. */
  const aoPingGrave = useCallback(
    (altura: number) => engine.tocarSfx('sonar', altura),
    [engine],
  )

  // --- pane ----------------------------------------------------------------

  const dispararPane = useCallback(async () => {
    if (!cenaPane || refPaneAtiva.current) return
    refPaneAtiva.current = true
    // Fecha console e painel antes de tomar a tela.
    setConsoleAberto(false)
    setAutoComando(null)
    setPainel({ nome: 'status' })
    engine.pararVoz()
    engine.tocarSfx(cenaPane.sfx ?? 'alarme')
    setPane({ fase: 'caindo', quedas: [] })

    const linhas = cenaPane.falaEntrada ?? ['ALERTA. FALHA NO SISTEMA DE BORDO.']
    const naTela = await falarAvulso(cenaPane.audio.entrada, linhas, true)
    refFimDaFalaPane.current = performance.now() + naTela
  }, [cenaPane, engine, falarAvulso])

  const reiniciarDaPane = useCallback(async () => {
    // Aceita R em qualquer momento da pane, não só depois de congelar: ao vivo,
    // o operador não pode ficar refém dos ~20 s da fala de alerta.
    if (!cenaPane || !pane || pane.fase === 'voltando') return
    engine.pararVoz()
    engine.tocarSfx('ok')
    setPane({ ...pane, fase: 'voltando' })
    const linhas = cenaPane.falaRetorno ?? ['...sistema reiniciado.']
    await falarAvulso(cenaPane.audio.retorno, linhas, true)
  }, [cenaPane, pane, engine, falarAvulso])

  // Subsistemas caem um a um; quando o último cai e a fala acaba, tudo congela.
  useEffect(() => {
    if (!pane || !cenaPane || pane.fase !== 'caindo') return

    if (pane.quedas.length >= cenaPane.subsistemas.length) {
      const restante = Math.max(0, refFimDaFalaPane.current - performance.now())
      const timer = setTimeout(
        () => setPane((atual) => (atual ? { ...atual, fase: 'congelado' } : null)),
        restante,
      )
      return () => clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      setPane((atual) => {
        if (!atual) return null
        const i = atual.quedas.length
        return {
          ...atual,
          quedas: [
            ...atual.quedas,
            {
              nome: cenaPane.subsistemas[i],
              estado: cenaPane.estados?.[i] ?? 'OFFLINE',
            },
          ],
        }
      })
    }, MS_ENTRE_SUBSISTEMAS)
    return () => clearTimeout(timer)
  }, [pane, cenaPane])

  // Voltando: subsistemas religam um a um, e aí a pane encerra.
  useEffect(() => {
    if (!pane || pane.fase !== 'voltando') return

    if (pane.quedas.length === 0) {
      const timer = setTimeout(() => {
        refPaneAtiva.current = false
        setPane(null)
        setPainel(null)
        setFala(null)
        setOrbeForcado(null)
      }, 1200)
      return () => clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      setPane((atual) => (atual ? { ...atual, quedas: atual.quedas.slice(1) } : null))
    }, MS_ENTRE_SUBSISTEMAS)
    return () => clearTimeout(timer)
  }, [pane])

  // --- console -------------------------------------------------------------

  const prepararForma = useCallback(async (nome: string, argumento?: string) => {
    if (nome === 'glifo') return prepararGlifo(argumento ?? '?', QTD_PONTOS)
    await carregarFormas([nome], QTD_PONTOS)
    return nome
  }, [])

  /**
   * O desenho do aluno vira a silhueta do orbe.
   *
   * A pausa antes de morfar é dramaturgia, não cálculo: amostrar o canvas leva
   * poucos ms, mas quem desenhou precisa VER o sistema lendo o traço. Sem ela a
   * forma trocaria instantaneamente e pareceria que nada foi interpretado.
   */
  const aoInterpretarTraco = useCallback(
    async (canvas: HTMLCanvasElement) => {
      setTracoTravado(true)
      setOrbeForcado('processando')
      setRajadaLog([
        'Digitalizando traço...',
        'Extraindo contorno...',
        `Mapeando para ${QTD_PONTOS} partículas...`,
      ])
      await esperar(sorteio(MS_PROCESSANDO[0], MS_PROCESSANDO[1]))

      const chave = registrarTraco(canvas, QTD_PONTOS)
      // Entra no fim da lista de M/N e já fica selecionado, pra o operador
      // continuar navegando dali em vez de voltar pro começo.
      setIndiceForma((cena?.formas?.length ?? 0) + tracos.length)
      setTracos([...tracos, chave])
      setFormaForcada(null)
      setPainel(null)
      setOrbeForcado(null)
      setTracoTravado(false)
      engine.tocarSfx('ok')
      void falarAvulso(audioDaResposta('tracoInterpretado'), [
        RESPOSTAS.tracoInterpretado,
      ])
    },
    [cena, tracos, engine, falarAvulso],
  )

  /**
   * Falhas fora do render vão pro log de bordo.
   *
   * O operador não vai abrir o console do navegador no meio da feira, e eu não
   * vou estar lá. Se alguma coisa quebrar num laço de animação, a linha
   * aparece na coluna da direita — e é ela que permite consertar depois.
   */
  useEffect(() => {
    const anteriores = falhasAnteriores()
    if (anteriores.length > 0) setRajadaLog(anteriores)
    return observarFalhas((linha) => setRajadaLog([linha]))
  }, [])

  /**
   * O HUD reacendendo depois do apagão.
   *
   * Separado do apagão em si porque é o DEPOIS: a energia volta e a tela leva
   * um instante pra se firmar. Sem esse rastro, o apagão termina como se
   * alguém tivesse religado um interruptor — limpo demais pra um casco que
   * acabou de levar uma pancada.
   */
  useEffect(() => {
    if (apagao) return
    setVoltandoDoApagao(true)
    const id = window.setTimeout(() => setVoltandoDoApagao(false), MS_GLITCH_VOLTA)
    return () => window.clearTimeout(id)
  }, [apagao])

  /**
   * Visor e ameaças seguem a cena — e HERDAM quando o campo não vem.
   *
   * É o que permite escrever `"visor": "rachado"` uma vez, na cena em que o
   * vidro quebra, e não repetir em cada cena seguinte. Voltar uma cena com a
   * seta esquerda reconstrói o estado do zero, varrendo o roteiro até aqui:
   * sem isso, voltar da subida pro combate deixaria o visor "parcial" numa
   * cena em que ele deveria estar rachado.
   */
  useEffect(() => {
    setLogParado(false)
    if (!cena || cena.tipo !== 'fim') return
    const id = window.setTimeout(() => setLogParado(true), MS_LOG_ATE_PARAR)
    return () => window.clearTimeout(id)
  }, [cena])

  useEffect(() => {
    let estadoVisor: Visor = 'ok'
    let ameacas = false
    for (let i = 0; i <= indice && i < sequencia.length; i++) {
      const c = sequencia[i]
      if (c.visor !== undefined) estadoVisor = c.visor
      if (c.ameacas !== undefined) ameacas = c.ameacas
      // A cena do olho QUEBRA o visor, e o estado tem que sobreviver a voltar
      // uma cena com a seta esquerda. A própria cena, porém, começa com o
      // visor inteiro — ela só racha no fim, e é o `aoQuebrar` que avisa.
      if (c.tipo === 'olho' && i < indice) estadoVisor = 'rachado'
    }
    setVisor(estadoVisor)
    motor.definirVisor(estadoVisor)
    motor.ameacas = ameacas
  }, [indice, sequencia])

  /**
   * A água virando antes de o bicho chegar.
   *
   * A cena `contato` liga a agitação do mundo: o farol oscila, o sedimento
   * entra em turbilhão e a imagem treme. No meio dela passa um VULTO cortando
   * o facho — um relance, não uma aparição. É o que faz o olho, dois passos
   * depois, parecer perseguição e não truque.
   */
  useEffect(() => {
    if (!cena || cena.id !== 'contato') {
      motor.agitacao = 0
      return
    }
    let subindo = 0
    const inicio = performance.now()
    const laco = () => {
      subindo = requestAnimationFrame(laco)
      // Sobe ao longo de 6 s e fica no teto: é a mesma janela da aproximação
      // do blip no sonar.
      motor.agitacao = Math.min(1, (performance.now() - inicio) / 6000)
    }
    subindo = requestAnimationFrame(laco)
    const vulto = window.setTimeout(() => motor.invocarVulto('megalodonte'), 3400)
    return () => {
      cancelAnimationFrame(subindo)
      window.clearTimeout(vulto)
      motor.agitacao = 0
    }
  }, [cena])

  // --- o olho ---------------------------------------------------------------

  /**
   * A cena do olho, do escuro à rachadura.
   *
   * Laço próprio, como o combate, porque ela não é feita de falas: é uma
   * duração, um corte e um estado de mundo que muda. A ordem importa e é toda
   * ela dramática — o olho sai, o vidro quebra no mesmo quadro, e só então a
   * estática entra e a IA recupera a voz.
   */
  useEffect(() => {
    if (!cena || cena.tipo !== 'olho') {
      setPassoOlho(null)
      return
    }
    const roteiro = cena
    let cancelado = false
    let saida = 0
    const relogios: number[] = []
    const daqui = (ms: number, fazer: () => void) => {
      relogios.push(
        window.setTimeout(() => {
          if (!cancelado) fazer()
        }, ms),
      )
    }

    // O Diretor não decide nada aqui, e um painel dele aberto por gatilho
    // roubaria a tela do bicho.
    setPainel(null)

    // --- tempo 1: a câmera abre grande ---------------------------------------
    // O maior quadro que cabe sem cobrir o log. Os mini-feeds saem: a partir
    // daqui só existe uma câmera, e é onde a coisa vai acontecer.
    setPassoOlho('camera')
    // Agitação alta faz o farol oscilar e a imagem tremer. É a tensão do
    // sistema, não um efeito: o bicho está perto o bastante pra mexer na água.
    motor.agitacao = 0.8
    engine.tocarSfx('agua', 0.7)
    setRajadaLog(['Farol externo: oscilação de tensão', 'Câmera de proa: sinal instável'])

    // --- tempo 2: a travessia -------------------------------------------------
    daqui(MS_OLHO_CAMERA, () => {
      setPassoOlho('travessia')
      motor.travessia(roteiro.criatura, MS_OLHO_TRAVESSIA / 1000)
      engine.tocarSfx('whoosh', 0.7)
      // A trilha entra AQUI, com o corpo no facho — e não lá no combate. O tema
      // é do bicho, não da mecânica: ele aparece, a música começa, e ela
      // atravessa o dossiê e as instruções até o combate sem reiniciar
      // (`iniciarTrilha` só retoma o volume quando já está tocando).
      engine.iniciarTrilha()
      setRajadaLog([
        'Objeto atravessando o facho',
        'Comprimento estimado: FORA DE ESCALA',
      ])
    })

    // --- tempo 3: o escuro ----------------------------------------------------
    // 0,8 s de nada. É o silêncio que faz o olho valer — sem ele, a aparição
    // seria a continuação da travessia em vez de uma coisa nova.
    daqui(MS_OLHO_CAMERA + MS_OLHO_TRAVESSIA, () => {
      motor.pararTravessia()
      motor.agitacao = 0
      setPassoOlho('escuro')
    })

    daqui(MS_OLHO_CAMERA + MS_OLHO_TRAVESSIA + MS_OLHO_ESCURO, () => {
      setPassoOlho('olho')
      engine.tocarSfx('presenca')
      setRajadaLog(['Objeto no facho do farol', 'Reconhecimento: SEM CORRESPONDÊNCIA'])
    })

    const quebrar = () => {
      if (cancelado) return
      // O corte. Os dois efeitos juntos: o impacto é o susto, o vidro é a
      // informação de o que quebrou.
      engine.tocarSfx('impacto')
      engine.tocarSfx('vidro')
      setImpacto(true)
      window.setTimeout(() => setImpacto(false), 900)
      setVisor('rachado')
      motor.definirVisor('rachado')
      setPassoOlho(null)
      setRajadaLog([
        'ERRO: integridade do visor externo comprometida',
        'ERRO: câmera 01 sem sinal',
        'ERRO: câmera 02 sem sinal',
      ])
      // Um respiro de estática antes de a IA voltar a falar. Sem ele a próxima
      // cena começa por cima do estrondo e o corte não tem para onde assentar.
      saida = window.setTimeout(() => {
        if (!cancelado) avancar()
      }, MS_ESTATICA_APOS_OLHO)
    }
    refQuebrarOlho.current = quebrar

    return () => {
      cancelado = true
      window.clearTimeout(saida)
      relogios.forEach((id) => window.clearTimeout(id))
      refQuebrarOlho.current = null
      motor.pararTravessia()
      motor.agitacao = 0
      setPassoOlho(null)
    }
  }, [cena, engine, avancar])

  // --- combate acústico -----------------------------------------------------

  /**
   * O combate, como simulação.
   *
   * Não é mais pergunta-com-cronômetro: é um bicho vindo, e o relógio é ele.
   * Um `requestAnimationFrame` move o contato; as transições discretas
   * (acertou, bateu, sumiu) passam pelo estado do React. A distância fica
   * numa REF porque muda sessenta vezes por segundo.
   *
   * Duas garantias, e as duas existem porque isto acontece na frente de uma
   * plateia: a cena SEMPRE termina, e qualquer erro no meio avança em vez de
   * travar.
   */
  useEffect(() => {
    if (!cena || cena.tipo !== 'combate') {
      setCombate(null)
      return
    }
    const roteiro: CenaCombate = cena
    const setores = roteiro.setores.length
    const total = roteiro.rodadas.length
    let cancelado = false
    let quadro = 0
    const relogios: number[] = []

    /** Panorâmico do setor: proa no centro, os outros abrindo pros lados. */
    const panDoSetor = (i: number) =>
      setores < 2 ? 0 : Math.round(Math.sin((i / setores) * Math.PI * 2) * 100) / 100

    const esperarSeguro = (ms: number) =>
      new Promise<void>((resolve) => {
        relogios.push(window.setTimeout(resolve, ms))
      })

    const sortear = (falas: string[][] | undefined, audios: string[] | undefined) => {
      if (!falas?.length || !audios?.length) return null
      const i = Math.floor(Math.random() * falas.length)
      return { linhas: falas[i], url: audios[i] ?? audios[0] }
    }

    const dizer = async (grupo: { linhas: string[]; url: string } | null) => {
      if (!grupo) return
      const ms = await falarAvulso(grupo.url, grupo.linhas)
      await esperarSeguro(ms)
    }

    let casco = 1
    let acertos = 0
    let setor = 0
    /** Multiplicador de velocidade: cada setor errado o deixa 20% mais rápido. */
    let aceleracao = 1
    const contatoDe = () => Math.max(0, 1 - acertos / total)

    const sim = refSimCombate.current
    /** De onde a investida corrente saiu. O trajeto e medido a partir dai. */
    let nasceuEm = 0
    const zerarSim = (distancia: number, tempo: number) => {
      sim.distancia = distancia
      nasceuEm = distancia
      refBaseVel.current = velocidadeBase(distancia, tempo, alcance())
      sim.velocidade = refBaseVel.current
      sim.desvio = 0
      sim.pulso = null
    }

    const trocarFase = (fase: FaseCombate, extra: Partial<EstadoCombate> = {}) => {
      // A ref é o que o laço lê; o estado é o que o painel renderiza. Os dois
      // mudam juntos, aqui, pra nunca divergirem.
      refFaseCombate.current = fase
      setCombate({
        fase,
        acertos,
        setor,
        casco,
        contato: contatoDe(),
        revelado: acertos,
        desde: performance.now(),
        ...extra,
      })
    }

    // --- respostas do operador ------------------------------------------------
    refRespostaCombate.current = (marcado) => {
      if (cancelado || typeof marcado !== 'number') return
      const agora = performance.now()
      if (agora < sim.prontoEm) {
        // Recusa seca: a tecla não some em silêncio, ela é NEGADA. Sem isto a
        // pessoa acha que o teclado falhou e aperta mais forte.
        sim.recusaEm = agora
        engine.tocarSfx('estatica', 1.6)
        return
      }
      sim.prontoEm = agora + MS_COOLDOWN
      sim.pulso = { setor: marcado, em: agora }
      engine.tocarSfx('pulso', 1, panDoSetor(marcado))

      if (marcado === setor) {
        acertos += 1
        reagir(true)
        void vencerInvestida()
      } else {
        // Pulso gasto pro lado errado. Nenhuma penalidade além da que já é
        // dura: ele está 20% mais rápido e continua vindo.
        aceleracao *= 1.2
        reagir(false)
      }
    }

    // --- as três situações que encerram uma investida -------------------------
    const vencerInvestida = async () => {
      if (cancelado) return
      trocarFase('perdido', { acertos, contato: contatoDe(), revelado: acertos })
      engine.tocarSfx('whoosh', 0.85, panDoSetor(setor))
      // Empurrado pra fora em LINHA RETA, pelo mesmo rumo por onde veio, e
      // passando da borda: ele não para no anel externo, ele sai do
      // mostrador. Enquanto isso a silhueta se desfaz em pontos (ver
      // `coesao`, em sonar.ts) — juntos, os dois são o "some".
      //
      // 650 ms e quase linear: o empurrão é o pulso acertando, e pulso que
      // acerta não tem aceleração suave.
      const saida = performance.now()
      const de = sim.distancia
      const empurrar = () => {
        if (cancelado) return
        const f = Math.min(1, (performance.now() - saida) / MS_EMPURRAO)
        sim.distancia = de + (alcance() * 1.2 - de) * (0.35 * f + 0.65 * f * f)
        if (f < 1) quadro = requestAnimationFrame(empurrar)
      }
      quadro = requestAnimationFrame(empurrar)

      await dizer(sortear(roteiro.falas.acerto, roteiro.audio.acerto))
      if (cancelado) return

      if (acertos >= total) {
        await encerrar()
        return
      }

      // Sonar vazio: 2 a 3 s em que a plateia procura. A trilha continua, mais
      // baixa — é a única vez na cena em que não há o que fazer, e é ela que
      // faz a próxima aparição valer.
      await dizer(sortear(roteiro.falas.perdido, roteiro.audio.perdido))
      if (cancelado) return
      await esperarSeguro(2000 + Math.random() * 1000)
      if (cancelado) return
      void investir(true)
    }

    const sofrerImpacto = async () => {
      if (cancelado) return
      casco = Math.max(0, casco - DANO_POR_IMPACTO)
      trocarFase('impacto')
      engine.tocarSfx('impacto')
      engine.tocarSfx('casco')
      setImpacto(true)
      relogios.push(window.setTimeout(() => setImpacto(false), 900))
      setApagao(true)
      relogios.push(window.setTimeout(() => setApagao(false), MS_APAGAO))
      reagir(false)

      await dizer(sortear(roteiro.falas.erro, roteiro.audio.erro))
      if (cancelado) return

      if (casco <= 0) {
        // Casco no chão: a IA sobe forçada. Não é derrota — é outro jeito de a
        // cena acabar. Nunca existe estado que trave a apresentação.
        //
        // A trilha corta aqui, como corta no fake-out: o que vem depois é a
        // subida, e subida não tem trilha de combate por cima.
        engine.pararTrilha(true)
        if (roteiro.falas.critico && roteiro.audio.critico) {
          await dizer({ linhas: roteiro.falas.critico, url: roteiro.audio.critico })
        }
        if (cancelado) return
        setCombate((e) => (e ? { ...e, fase: 'fim' } : e))
        // Direto pra SUBIDA, pulando o `neutralizado`: ele diz "ameaça
        // neutralizada", e ninguém neutralizou nada. Dali em diante o
        // encerramento é o mesmo — a apresentação termina igual, com as falas
        // finais da turma.
        if (!pularPara('subida')) avancar()
        return
      }

      // Impacto NÃO pula investida: ele custa casco e o bicho volta.
      await esperarSeguro(1500)
      if (cancelado) return
      void investir(true)
    }

    const encerrar = async () => {
      // Fake-out: o mostrador esvazia e um retorno solto aparece na borda.
      trocarFase('fakeout')
      await esperarSeguro(MS_FAKEOUT_SILENCIO)
      if (cancelado) return
      engine.tocarSfx('sonar', 0.6, panDoSetor((setor + 1) % setores))
      await esperarSeguro(MS_FAKEOUT_RETORNO)
      if (cancelado) return

      // Só agora a trilha se despede, e em 3 s até zero — não em corte. O
      // contato foi neutralizado: a música sai junto com a ameaça, e essa saída
      // é a transição. Cortar aqui seria um susto a mais numa cena que acabou
      // de parar de assustar.
      //
      // A cena só vira DEPOIS que o fade termina, pra a fala do `neutralizado`
      // não começar por cima da música morrendo.
      engine.pararTrilha(false, MS_FADE_NEUTRALIZADO)
      await esperarSeguro(MS_FADE_NEUTRALIZADO)
      if (cancelado) return
      setCombate((e) => (e ? { ...e, fase: 'fim' } : e))
      avancar()
    }

    const alcance = () => Math.max(...roteiro.rodadas.map((r) => r.distancia)) * 1.06

    // --- uma investida --------------------------------------------------------
    const investir = async (retorno: boolean) => {
      if (cancelado) return
      const rodada = roteiro.rodadas[Math.min(acertos, total - 1)]
      // Setor novo a cada investida: repetir o mesmo faria a plateia decorar.
      const anterior = setor
      setor = rodada.setor ?? sortearSetorDiferente(anterior, setores)
      aceleracao = 1
      zerarSim(rodada.distancia, rodada.tempo)
      trocarFase('investida')

      engine.tocarSfx('whoosh', 1, panDoSetor(setor))
      relogios.push(
        window.setTimeout(() => {
          if (!cancelado) engine.tocarSfx('agua', 1, panDoSetor(setor) * 0.6)
        }, 420),
      )

      const fala = retorno
        ? (sortear(roteiro.falas.retorno, roteiro.audio.retorno) ??
          sortear([roteiro.falas.rodada[Math.min(acertos, total - 1)]], [
            roteiro.audio.rodada[Math.min(acertos, total - 1)],
          ]))
        : sortear([roteiro.falas.rodada[0]], [roteiro.audio.rodada[0]])
      await dizer(fala)
    }

    // --- o laço ---------------------------------------------------------------
    let anterior = performance.now()
    let proximoPing = 0
    const passo = quadroSeguro('combate', (agora: number) => {
      quadro = requestAnimationFrame(passo)
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora
      if (cancelado) return

      if (refFaseCombate.current !== 'investida') return

      // Trajeto RETO, em degraus. O bicho nasce num ponto e vem em linha
      // reta até o casco; a velocidade é constante dentro de cada terço e
      // sobe 15% no terço seguinte. Antes ela crescia continuamente com a
      // proximidade e o desvio era uma soma de senoides de amplitude 1 — o
      // contato varria 72° da cunha e lia como PÊNDULO, não como bicho vindo.
      const percorrido = nasceuEm > 0 ? 1 - sim.distancia / nasceuEm : 1
      const perto = 1 - Math.min(1, sim.distancia / alcance())
      const v = refBaseVel.current * aceleracao * degrauDoTrajeto(percorrido)
      sim.distancia = Math.max(0, sim.distancia - v * dt)
      sim.velocidade = v
      // Deriva de nado: UM seno pequeno, perpendicular à direção do movimento
      // (ver sonar.ts), período de 2 s. É o bastante pra ele não parecer um
      // ponto deslizando num trilho, e pouco o bastante pra continuar sendo
      // uma aproximação reta.
      sim.desvio = Math.sin((agora / 1000) * Math.PI) * DERIVA_CONTATO

      // Pings acompanhando a proximidade: mais rápidos e mais graves.
      if (agora >= proximoPing) {
        proximoPing = agora + 1100 - 900 * perto * perto
        engine.tocarSfx('sonar', 1 - perto * 0.5, panDoSetor(setor))
      }

      if (sim.distancia <= 0.5) {
        refFaseCombate.current = 'impacto'
        void sofrerImpacto()
      }
    })

    engine.iniciarTrilha()
    void investir(false).catch(() => {
      if (!cancelado) avancar()
    })
    quadro = requestAnimationFrame(passo)

    return () => {
      cancelado = true
      cancelAnimationFrame(quadro)
      relogios.forEach((id) => window.clearTimeout(id))
      refRespostaCombate.current = null
      engine.pararTrilha(true)
      motor.pararPassagem()
      setApagao(false)
    }
  }, [cena, engine, falarAvulso, reagir, avancar, pularPara])

  /**
   * A guarda: fora da janela, a trilha cala. Corte, e não fade — se a cena não
   * é dela, ela não tem o que dizer enquanto sai.
   */
  useEffect(() => {
    if (!janelaTrilha || indice < janelaTrilha.de || indice > janelaTrilha.ate) {
      engine.pararTrilha(true)
    }
  }, [indice, janelaTrilha, engine])

  useEffect(() => {
    if (!janelaCache || indice < janelaCache.de || indice > janelaCache.ate) setCache(null)
  }, [indice, janelaCache])

  // Fora da janela, nada de luzes. Dentro dela, a última cena é o encerramento:
  // as três acendem juntas enquanto a IA diz que a comunicação voltou.
  useEffect(() => {
    if (!janelaEmergencia || indice < janelaEmergencia.de || indice > janelaEmergencia.ate) {
      setEmergencia(null)
      return
    }
    if (indice === janelaEmergencia.ate) {
      setEmergencia((atual) =>
        atual
          ? { ...atual, estados: atual.subsistemas.map(() => 'online'), encerrando: true }
          : atual,
      )
      setRajadaLog(['CASCO: ONLINE', 'SONAR: ONLINE', 'COMUNICAÇÃO: ONLINE'])
    }
  }, [indice, janelaEmergencia])

  // --- expedicao de identificacao (2A) --------------------------------------

  /**
   * O laço da identificação.
   *
   * Mesma forma do combate e pelo mesmo motivo: a cena não é feita de falas
   * numa lista, é feita de tempo — uma pista a cada sete segundos, uma barra
   * caindo, e uma espera que só termina quando o operador aperta. E, como lá,
   * ela SEMPRE termina: qualquer erro no meio avança em vez de travar.
   */
  useEffect(() => {
    if (!cena || cena.tipo !== 'identificacao') {
      setIdent(null)
      motor.turbidez = 0
      motor.exibirEspecie(null)
      return
    }
    const roteiro = cena
    let cancelado = false
    let quadro = 0
    const relogios: number[] = []
    const daqui = (ms: number) =>
      new Promise<void>((resolve) => {
        relogios.push(window.setTimeout(resolve, ms))
      })

    const sortear = (falas: string[][], audios: string[]) => {
      if (!falas?.length || !audios?.length) return null
      const i = Math.floor(Math.random() * falas.length)
      return { linhas: falas[i], url: audios[i] ?? audios[0] }
    }
    const dizer = async (grupo: { linhas: string[]; url: string } | null) => {
      if (!grupo) return
      const ms = await falarAvulso(grupo.url, grupo.linhas)
      await daqui(ms)
    }

    let acumulado = 0
    const identificadas: string[] = []
    const totalEspecies = roteiro.especies.length

    const publicarCache = (alvo: number, corrompido = false) =>
      setCache({
        alvo,
        total: CACHE_TOTAL,
        identificadas: [...identificadas],
        slots: totalEspecies,
        corrompido,
      })

    const publicar = (estado: EstadoIdent) => setIdent(estado)

    publicarCache(0, true)

    /** Uma espécie, do primeiro contato até a ficha na tela. */
    const rodar = async (indice: number) => {
      if (cancelado) return
      const especie = roteiro.especies[indice]
      motor.tom = especie.ambiente ?? 'aberto'
      motor.turbidez = 0.92
      motor.exibirEspecie(especie.id)
      if (especie.profundidade) motor.definirAlvo(especie.profundidade)
      refCalibracao.current = 1
      let pistas = 0
      publicar({ fase: 'procurando', indice, pistas, calibracao: 1, acertou: false })

      await dizer(sortear(roteiro.falas.inicio, roteiro.audio.inicio))
      if (cancelado) return

      // A barra cai enquanto a sala pensa e estaciona no piso quando a última
      // pista sai: passada a terceira, o tempo já não tira mais nada de ninguém.
      const inicio = performance.now()
      const queda = quadroSeguro('calibração da identificação', () => {
        quadro = requestAnimationFrame(queda)
        if (cancelado) return
        const s = (performance.now() - inicio) / 1000
        const teto = pistas >= especie.pistas.length ? PISO_CALIBRACAO : 1
        const caiu = 1 - (s / (especie.intervaloPistas * especie.pistas.length)) * (1 - PISO_CALIBRACAO)
        refCalibracao.current = Math.max(PISO_CALIBRACAO, Math.min(teto, caiu))
      })
      quadro = requestAnimationFrame(queda)

      /**
       * A espera: as pistas saem sozinhas, o operador corta quando quiser.
       *
       * `procurando` é o que desliga o laço de pistas, e não a presença do
       * resolvedor. Enquanto era o resolvedor, o laço voltava à vida assim que
       * a revelação rearmava a tecla — e a pista seguinte entrava por cima da
       * fala sobre a espécie, cortando-a no meio. Medido: a revelação da
       * tartaruga durava 4 s em vez de 18.
       */
      let procurando = true
      const marcado = await new Promise<boolean>((resolve) => {
        refRespostaIdent.current = (acertou) => {
          refRespostaIdent.current = null
          procurando = false
          resolve(acertou)
        }
        const proximaPista = async () => {
          for (const [n, pista] of especie.pistas.entries()) {
            // A PRIMEIRA sai na hora, junto com o contato. Esperar os 7 s
            // valia quando os bichos eram difíceis; com tartaruga e golfinho a
            // sala responde em três segundos e a dinâmica acabava sem NENHUMA
            // pista ter aparecido na tela. Agora sempre há uma.
            if (n > 0) await daqui(especie.intervaloPistas * 1000)
            if (cancelado || !procurando) return
            pistas += 1
            publicar({
              fase: 'procurando',
              indice,
              pistas,
              calibracao: refCalibracao.current,
              acertou: false,
            })
            const url = especie.audioPistas[pistas - 1]
            if (url) await falarAvulso(url, [pista])
            if (cancelado || !procurando) return
          }
        }
        void proximaPista()
      })
      cancelAnimationFrame(quadro)
      if (cancelado) return

      // --- revelação ---------------------------------------------------------
      // A água limpa em 1,5 s. É a recompensa inteira da dinâmica: o bicho que
      // era um vulto vira um animal, e a sala vê o que acabou de nomear.
      motor.turbidez = 0
      engine.tocarSfx(marcado ? 'ok' : 'sonar')
      // Ganho cheio por acerto, metade quando a revelação foi do operador.
      const ganho = Math.round(especie.incrementoCache * (marcado ? 1 : 0.5))
      acumulado += ganho
      identificadas.push(especie.id)
      publicarCache(acumulado)
      publicar({
        fase: 'revelado',
        indice,
        pistas,
        calibracao: refCalibracao.current,
        acertou: marcado,
      })
      // O orbe morfa na espécie revelada, quando existe a forma dela. Sem a
      // forma ele simplesmente não morfa — a cena não depende disso.
      if (formaRegistrada(especie.id)) {
        const chave = await prepararForma(especie.id)
        if (!cancelado) setFormaForcada(chave === FORMA_PADRAO ? null : chave)
      }

      // Fala de resultado + contemplação, as duas encurtáveis pelo Enter.
      //
      // Antes só a contemplação era: durante a fala o operador apertava e NADA
      // acontecia, porque o resolvedor estava nulo. Numa cena em que a tecla é
      // a única coisa que ele controla, um Enter que não faz nada lê como
      // travamento — ainda mais na última espécie, onde o que vem depois é a
      // transferência pro 2B.
      const cortado = await Promise.race([
        (async () => {
          await dizer(
            marcado
              ? sortear(roteiro.falas.acerto, roteiro.audio.acerto)
              : sortear(roteiro.falas.revelado, roteiro.audio.revelado),
          )
          // E então ela CONTA sobre o bicho. É o pagamento da dinâmica: a sala
          // acabou de reconhecer o animal e está olhando pra ele nítido na
          // tela — o único instante da apresentação em que ela quer ouvir
          // sobre aquilo. A confirmação seca sozinha desperdiçava o momento.
          await dizer({ linhas: especie.curiosidade, url: especie.audioCuriosidade })
          await daqui(MS_CONTEMPLACAO)
          return false
        })(),
        new Promise<boolean>((resolve) => {
          refRespostaIdent.current = () => {
            refRespostaIdent.current = null
            resolve(true)
          }
        }),
      ])
      refRespostaIdent.current = null
      if (cortado) engine.pararVoz()
      if (cancelado) return

      if (indice + 1 < totalEspecies) {
        void rodar(indice + 1)
      } else {
        motor.exibirEspecie(null)
        // O banco fecha INTEIRO na virada, mesmo que alguma espécie tenha sido
        // revelada pelo operador e valido metade. Quem completa o resto é a IA,
        // e é isso que a fala do `ident-fim` diz: "banco recalibrado". Deixar
        // um número quebrado na tela diria que a expedição falhou pela metade.
        publicarCache(CACHE_TOTAL)
        publicar({ fase: 'fim', indice, pistas, calibracao: refCalibracao.current, acertou: marcado })
        avancar()
      }
    }

    void rodar(0).catch(() => {
      if (!cancelado) avancar()
    })

    return () => {
      cancelado = true
      cancelAnimationFrame(quadro)
      relogios.forEach((id) => window.clearTimeout(id))
      refRespostaIdent.current = null
      motor.turbidez = 0
      motor.exibirEspecie(null)
      // A expedição volta pra profundidade da CENA.
      //
      // Cada espécie tem a sua (a tartaruga a 20 m, a baleia a 40 m), e sem
      // isto o submarino ficava onde a última parou: medido, a cena seguinte
      // à identificação abria a 40 m, e a cena depois dela puxava o submarino
      // 560 m pra baixo de uma vez. A expedição desce; ela não sobe pra ver um
      // bicho e esquece de voltar.
      motor.definirAlvo(refProfundidade.current)
    }
  }, [cena, engine, falarAvulso, avancar, prepararForma, setPainel])

  // --- emergência e hidrofone (2B) ------------------------------------------

  /**
   * O laço da quebra.
   *
   * Três tempos, como a cena do olho: a IA fala normalmente e QUEBRA no meio,
   * a tela de falha trava, e ela volta em modo reduzido. O travamento é o
   * ponto — uma tela que pisca e segue em frente não convence ninguém de que
   * o sistema caiu.
   */
  useEffect(() => {
    if (!cena || cena.tipo !== 'emergencia') {
      setEmerg(null)
      return
    }
    const roteiro = cena
    let cancelado = false
    const relogios: number[] = []
    const daqui = (ms: number) =>
      new Promise<void>((resolve) => {
        relogios.push(window.setTimeout(resolve, ms))
      })

    const rodar = async () => {
      setEmerg({ fase: 'caindo', linhas: 0 })
      const naTela = await falarAvulso(roteiro.audio.queda, roteiro.falasQueda, true)
      await daqui(naTela)
      if (cancelado) return

      // Tela travada: as linhas entram uma a uma e FICAM.
      engine.tocarSfx('alarme')
      setImpacto(true)
      relogios.push(window.setTimeout(() => setImpacto(false), 600))
      setEmerg({ fase: 'travado', linhas: 0 })
      const quantas = Math.max(0, roteiro.tela.linhas.length - 1)
      for (let i = 1; i <= quantas; i++) {
        await daqui(MS_LINHA_FALHA)
        if (cancelado) return
        setEmerg({ fase: 'travado', linhas: i })
      }
      await daqui(MS_TELA_TRAVADA)
      if (cancelado) return

      // E volta reduzida. As luzes nascem aqui e vivem ALÉM desta cena.
      setEmergencia({
        subsistemas: roteiro.subsistemas,
        estados: roteiro.subsistemas.map(() => 'caido' as EstadoLuz),
        encerrando: false,
      })
      setEmerg({ fase: 'retorno', linhas: quantas })
      const volta = await falarAvulso(roteiro.audio.retorno, roteiro.falasRetorno, true)
      await daqui(volta)
      if (cancelado) return
      setFala(null)
      avancar()
    }

    void rodar().catch(() => {
      if (!cancelado) avancar()
    })

    return () => {
      cancelado = true
      relogios.forEach((id) => window.clearTimeout(id))
    }
  }, [cena, engine, falarAvulso, avancar])

  /**
   * Reparos: a fala dos alunos religa o submarino, pela mão do operador.
   *
   * Tecla e não temporizador porque o relógio não sabe quando o grupo chegou
   * no trecho do empuxo. Usada uma vez, a tecla morre: apertar de novo não
   * repete a fala nem acende nada.
   */
  useEffect(() => {
    refReparosUsados.current = new Set()
    if (!cena?.reparos || cena.reparos.length === 0) {
      refReparos.current = null
      return
    }
    const lista = cena.reparos
    refReparos.current = (tecla: string) => {
      const reparo = lista.find((r) => r.tecla === tecla)
      if (!reparo || refReparosUsados.current.has(tecla)) return
      refReparosUsados.current.add(tecla)

      const acender = (estado: EstadoLuz) =>
        setEmergencia((atual) => {
          if (!atual) return atual
          const i = atual.subsistemas.indexOf(reparo.subsistema)
          if (i < 0) return atual
          const estados = [...atual.estados]
          estados[i] = estado
          return { ...atual, estados }
        })

      acender('religando')
      engine.tocarSfx('ok')
      void falarAvulso(reparo.audio, reparo.fala)
      window.setTimeout(() => {
        acender('online')
        setRajadaLog([`${reparo.subsistema}: ONLINE`])
        if (reparo.subsistema === 'SONAR') engine.tocarSfx('sonar')
      }, MS_RELIGANDO)
    }
    return () => {
      refReparos.current = null
    }
  }, [cena, engine, falarAvulso])

  /**
   * O laço do hidrofone.
   *
   * Mesma forma da identificação — som, pista, espera, revelação — com uma
   * diferença que é o ponto da cena: o terceiro som não é só mais um. É a
   * frequência que a IA precisa pra alcançar a superfície, e por isso a cena
   * não termina em "identificado": termina com a comunicação de volta.
   */
  useEffect(() => {
    if (!cena || cena.tipo !== 'hidrofone') {
      setHidro(null)
      engine.pararHidrofone()
      return
    }
    const roteiro = cena
    let cancelado = false
    const relogios: number[] = []
    const daqui = (ms: number) =>
      new Promise<void>((resolve) => {
        relogios.push(window.setTimeout(resolve, ms))
      })

    const sortear = (falas: string[][], audios: string[], i?: number) => {
      if (!falas?.length || !audios?.length) return null
      const n = i ?? Math.floor(Math.random() * falas.length)
      return { linhas: falas[n] ?? falas[0], url: audios[n] ?? audios[0] }
    }
    const dizer = async (grupo: { linhas: string[]; url: string } | null) => {
      if (!grupo) return
      const ms = await falarAvulso(grupo.url, grupo.linhas)
      await daqui(ms)
    }

    const rodar = async (indiceSom: number) => {
      const som = roteiro.sons[indiceSom]
      if (!som || cancelado) return
      const publicar = (estado: EstadoHidro) => {
        if (!cancelado) setHidro(estado)
      }
      publicar({ fase: 'escutando', indice: indiceSom, pista: false, acertou: false })

      await dizer(sortear(roteiro.falas.inicio, roteiro.audio.inicio))
      if (cancelado) return
      engine.iniciarHidrofone(som.id)

      /**
       * Trava local, como na identificação e pelo mesmo motivo: a revelação
       * REARMA `refRespostaHidro` pra poder ser cortada, e uma guarda baseada
       * nela deixaria a pista voltar por cima da fala de resultado.
       */
      let escutando = true
      const marcado = await new Promise<boolean>((resolve) => {
        refRespostaHidro.current = (acertou) => {
          refRespostaHidro.current = null
          escutando = false
          resolve(acertou)
        }
        void (async () => {
          await daqui(MS_ATE_PISTA)
          if (cancelado || !escutando) return
          publicar({ fase: 'escutando', indice: indiceSom, pista: true, acertou: false })
          await falarAvulso(som.audioPista, [som.pista])
        })()
      })
      if (cancelado) return

      engine.pararHidrofone()
      publicar({ fase: 'revelado', indice: indiceSom, pista: true, acertou: marcado })
      engine.tocarSfx(marcado ? 'ok' : 'pulso')

      const cortado = await Promise.race([
        (async () => {
          await dizer(
            marcado
              ? sortear(roteiro.falas.acerto, roteiro.audio.acerto, indiceSom)
              : sortear(roteiro.falas.revelado, roteiro.audio.revelado),
          )
          await daqui(MS_FONTE_NA_TELA)
          return false
        })(),
        new Promise<boolean>((resolve) => {
          refRespostaHidro.current = () => {
            refRespostaHidro.current = null
            resolve(true)
          }
        }),
      ])
      refRespostaHidro.current = null
      if (cortado) engine.pararVoz()
      if (cancelado) return

      if (indiceSom + 1 < roteiro.sons.length) {
        void rodar(indiceSom + 1)
      } else {
        publicar({ fase: 'fim', indice: indiceSom, pista: true, acertou: marcado })
        avancar()
      }
    }

    void rodar(0).catch(() => {
      if (!cancelado) avancar()
    })

    return () => {
      cancelado = true
      relogios.forEach((id) => window.clearTimeout(id))
      refRespostaHidro.current = null
      engine.pararHidrofone()
    }
  }, [cena, engine, falarAvulso, avancar])

  /**
   * As sementes da pane.
   *
   * A água esfria na barra do HUD e o log solta avisos âmbar espaçados. Sem
   * som e sem fala: a plateia não tem que PERCEBER isso acontecendo, tem que
   * reconhecer, depois que a IA quebrar, que já estava ali.
   *
   * A leitura vai direto no DOM. É um número que muda devagar, mas muda
   * sozinho durante uma cena que pode durar dez minutos — como estado, seriam
   * milhares de renders do Player inteiro por apresentação.
   */
  useEffect(() => {
    const sementes = cena?.sementes
    setAguaVisivel(!!sementes?.agua)
    if (!sementes) return

    const inicio = performance.now()
    const avisos = sementes.avisos ?? []
    const relogios = avisos.map((aviso, i) =>
      window.setTimeout(() => setRajadaLog([aviso]), (i + 1) * MS_ENTRE_AVISOS),
    )

    let quadro = 0
    if (sementes.agua) {
      const [de, ate] = sementes.agua
      const desenhar = () => {
        const t = Math.min(1, (performance.now() - inicio) / MS_QUEDA_AGUA)
        if (refAgua.current) {
          refAgua.current.textContent = `${(de + (ate - de) * t).toFixed(1).replace('.', ',')} °C`
        }
        quadro = requestAnimationFrame(desenhar)
      }
      quadro = requestAnimationFrame(desenhar)
    }

    return () => {
      relogios.forEach((id) => window.clearTimeout(id))
      cancelAnimationFrame(quadro)
    }
  }, [cena])

  // --- diretor de cena ------------------------------------------------------

  // As saídas ficam numa ref pra o Diretor ser criado UMA vez: ele tem estado
  // (o que está aberto, os cooldowns) e recriá-lo por render perderia tudo.
  const refSaidas = useRef({
    painel: (pedido: PainelPedido | null) => {
      setPainel((atual) => {
        if (!pedido) {
          // Só fecha o que o próprio Diretor abriu. Painel do operador é dele.
          return atual?.origem === 'diretor' ? null : atual
        }
        return {
          nome: pedido.nome,
          argumento: pedido.args,
          contato: pedido.contato,
          origem: 'diretor' as const,
        }
      })
    },
    /**
     * O Diretor vai encerrar este painel. Ele ainda está na tela.
     *
     * Duas coisas acontecem aqui e nenhuma delas é fechar: o log de bordo
     * escreve `Encerrando <painel>`, pra a plateia ler a saída como decisão e
     * não como falha, e o painel entra em modo despedida — o sonar usa isso
     * pra dar o ping final e apagar o contato antes de sair.
     */
    despedida: (nome: string, motivo: MotivoFecho) => {
      setPainel((atual) =>
        atual?.origem === 'diretor' && atual.nome === nome
          ? { ...atual, despedindo: true }
          : atual,
      )
      setRajadaLog([`Encerrando ${TITULOS_LOG[nome] ?? nome}${motivo === 'teto' ? ' (tempo)' : ''}`])
    },
    forma: (nome: string | null) => {
      if (!nome) {
        setFormaForcada(null)
        return
      }
      void (async () => {
        await carregarFormas([nome], QTD_PONTOS)
        // Forma que não existe (PNG ainda não chegou e não há primitiva
        // homônima) some em silêncio: o carregarFormas já avisou no console do
        // navegador, e o log de bordo é da apresentação, não do desenvolvimento.
        if (obterForma(nome)) setFormaForcada(nome)
      })()
    },
    sfx: (nome: string) => engine.tocarSfx(nome as never),
    mergulho: (para: number) => refSaidas.current.aoMergulhar(para),
    /** Preenchido logo abaixo: o callback só existe depois do useCallback. */
    aoMergulhar: (_para: number) => {},
    log: (linhas: string[], nivel?: 'err' | 'warn' | 'ok') => setRajadaLog(linhas, nivel),
    orbe: (pedido: { estado?: EstadoOrbe; efeito?: 'parar' | 'tremor' | 'lento'; ms?: number }) => {
      if (pedido.estado) setOrbeForcado(pedido.estado)
      if (!pedido.efeito) return
      const ms = pedido.ms ?? 1000
      if (pedido.efeito === 'tremor') {
        // O tremor já existe e se apaga sozinho — é o mesmo de comando não
        // reconhecido, e é exatamente o solavanco que a cena quer.
        setTremor(true)
        window.setTimeout(() => setTremor(false), Math.min(600, ms))
        return
      }
      window.clearTimeout(refRitmoTimer.current)
      setRitmoOrbe(pedido.efeito === 'parar' ? 'parado' : 'lento')
      refRitmoTimer.current = window.setTimeout(() => setRitmoOrbe('normal'), ms)
    },
    trilha: (db: number | null, ms?: number) => engine.nivelDaTrilha(db, ms),
  })

  // O que o roteiro forçou no orbe morre com a cena. Sem isto, um
  // `estado: "processando"` pedido numa linha atravessaria pra cena seguinte,
  // que nao pediu nada e nao tem como desfazer.
  useEffect(() => {
    setOrbeForcado(null)
    setRitmoOrbe('normal')
    window.clearTimeout(refRitmoTimer.current)
  }, [cena?.id])

  const refDiretor = useRef<Diretor | null>(null)
  if (!refDiretor.current) {
    refDiretor.current = new Diretor({
      painel: (p) => refSaidas.current.painel(p),
      despedida: (n, m) => refSaidas.current.despedida(n, m),
      forma: (f) => refSaidas.current.forma(f),
      sfx: (n) => refSaidas.current.sfx(n),
      mergulho: (m) => refSaidas.current.mergulho(m),
      log: (l, nivel) => refSaidas.current.log(l, nivel),
      orbe: (p) => refSaidas.current.orbe(p),
      trilha: (db, ms) => refSaidas.current.trilha(db, ms),
    })
  }
  const diretor = refDiretor.current

  useEffect(() => {
    diretor.ligarGatilhos(gatilhosLigados)
  }, [diretor, gatilhosLigados])

  useEffect(() => {
    refSaidas.current.aoMergulhar = iniciarMergulho
  }, [iniciarMergulho])

  /**
   * A linha do tempo do mergulho, rodando num rAF.
   *
   * Cancelar é simplesmente parar: a limpeza deste efeito zera a inclinação e
   * a turbulência e crava a profundidade no destino. Por isso a seta direita
   * (que troca de cena) corta a sequência sem deixar o mundo torto.
   */
  useEffect(() => {
    if (!mergulho) return
    const { plano, inicio } = mergulho
    let quadro = 0
    let faseAnterior: FaseMergulho | null = null
    let proximoEstalo = 0

    const passo = (agora: number) => {
      const q = quadroDe(plano, agora - inicio)
      motor.pitch = q.pitch
      motor.turbulencia = q.turbulencia
      motor.fixarProfundidade(q.profundidade)
      refProfMergulho.current = q.profundidade

      if (q.fase !== faseAnterior) {
        faseAnterior = q.fase
        setFaseMergulho(q.fase)
        const linhas = logDaFase(q.fase, plano)
        if (linhas) setRajadaLog(linhas)
        if (q.fase === 'aviso') engine.tocarSfx('pressurizacao')
        if (q.fase === 'estabilizacao') engine.tocarSfx('sonar')
      }

      // Estalos de casco: mais frequentes quanto mais fundo. É o aço avisando.
      if (q.fase === 'descida' && agora > proximoEstalo) {
        engine.tocarSfx('casco')
        const fundura = Math.min(1, q.profundidade / 4000)
        proximoEstalo = agora + 950 - fundura * 550 + Math.random() * 700
      }

      if (q.fase === 'fim') {
        setMergulho(null)
        setFaseMergulho(null)
        return
      }
      quadro = requestAnimationFrame(passo)
    }

    setOrbeForcado('processando')
    quadro = requestAnimationFrame(passo)
    return () => {
      cancelAnimationFrame(quadro)
      motor.pitch = 0
      motor.turbulencia = 0
      motor.fixarProfundidade(plano.para)
      setOrbeForcado(null)
      setFaseMergulho(null)
    }
  }, [mergulho, engine])

  /** Qualquer mexida do operador cala o Diretor até a próxima cena. */
  const operadorAssumiu = useCallback(() => diretor.operadorAssumiu(), [diretor])

  const executarComando = useCallback(
    async (texto: string, manterAberto: boolean) => {
      // Comando discreto: a IA age sem abrir o console e sem responder na
      // legenda. É o modo pra quando ela está no meio de uma fala — o console
      // cobre a legenda e a resposta roubaria a vez da narração.
      const discreto = refDiscreto.current
      refDiscreto.current = false

      if (discreto) {
        setRajadaLog([`Acionando subsistema: ${texto.toUpperCase()}`])
      } else {
        setConsoleTravado(true)
        setOrbeForcado('processando')
        setRajadaLog([
          'Interpretando comando...',
          ...POOL_COMANDO.slice(1, 3),
          `Entrada do operador: "${texto}"`,
        ])
        await esperar(sorteio(MS_PROCESSANDO[0], MS_PROCESSANDO[1]))
      }

      const comando = interpretar(texto)
      // Comando digitado é o operador tomando a direção pra si.
      diretor.operadorAssumiu()

      switch (comando.tipo) {
        case 'forma': {
          const chave = await prepararForma(comando.nome, comando.argumento)
          setFormaForcada(chave === FORMA_PADRAO ? null : chave)
          if (chave === FORMA_PADRAO) setIndiceForma(SEM_FORMA)
          engine.tocarSfx('ok')
          break
        }
        case 'painel':
          setPainel({
            nome: comando.nome,
            argumento: comando.argumento,
            origem: 'operador',
          })
          engine.tocarSfx('ok')
          break
        case 'cena': {
          const alvo =
            typeof comando.alvo === 'number'
              ? comando.alvo - 1
              : sequencia.findIndex((c) => c.id === comando.alvo)
          if (alvo >= 0 && alvo < sequencia.length) setIndice(alvo)
          engine.tocarSfx('ok')
          break
        }
        case 'sistema':
          if (comando.acao === 'limpar') setPainel(null)
          if (comando.acao === 'status') setPainel({ nome: 'status' })
          if (comando.acao === 'proximo') avancar()
          if (comando.acao === 'voltar') voltar()
          if (comando.acao === 'pane') {
            setConsoleAberto(false)
            setConsoleTravado(false)
            void dispararPane()
            return
          }
          if (comando.acao === 'reiniciar') {
            setConsoleAberto(false)
            setConsoleTravado(false)
            void reiniciarDaPane()
            return
          }
          if (comando.acao === 'ambiente') {
            const ligado = engine.alternarAmbiente(() => motor.profundidade())
            setRajadaLog([
              ligado
                ? 'Captação acústica externa: ATIVA'
                : 'Captação acústica externa: DESLIGADA',
            ])
            break
          }
          if (comando.acao === 'som') {
            const ms = engine.testarSom()
            setRajadaLog([
              'Teste de som iniciado.',
              `AudioContext: ${engine.estadoDoContexto()}`,
              'ok · sonar · bipe · estática · alarme · pressurização',
              ms > 0
                ? `Duração do teste: ${(ms / 1000).toFixed(1)} s`
                : 'ERR: sem contexto de áudio neste navegador',
            ])
            break
          }
          if (comando.acao === 'ajuda') {
            // Ajuda vai pro log de bordo, não pra legenda: é referência, não fala.
            setRajadaLog(['Comandos disponíveis:', ...vocabulario().slice(0, 14)])
          }
          engine.tocarSfx('ok')
          break
        case 'vozes': {
          if (comando.motor) {
            engine.definirMotorDeVoz(comando.motor)
            setRajadaLog([
              comando.motor === 'sistema'
                ? `Narração: voz do sistema — ${engine.descricaoDaVoz()}`
                : 'Narração: gravação de bordo (mp3)',
            ])
          } else if (comando.numero === undefined) {
            setRajadaLog([
              'Vozes instaladas:',
              ...engine.vozesDisponiveis(),
              'Para trocar: voz 2 · voz mp3 · voz sistema',
            ])
          } else {
            const nome = engine.escolherVoz(comando.numero)
            if (nome) {
              engine.definirMotorDeVoz('sistema')
              setRajadaLog([`Narração: voz do sistema — ${nome}`])
              void engine.falarComNavegador(['Voz de bordo reconfigurada.'])
            } else {
              setRajadaLog([
                `WARN: não existe voz número ${comando.numero}.`,
                'Digite "vozes" pra ver a lista.',
              ])
            }
          }
          engine.tocarSfx('ok')
          break
        }
        case 'gatilhos': {
          const ligar = comando.ligar ?? !gatilhosLigados
          setGatilhosLigados(ligar)
          setRajadaLog([
            ligar
              ? 'Direção automática: ATIVA (a IA ilustra o que fala)'
              : 'Direção automática: DESLIGADA (só ações do roteiro)',
          ])
          engine.tocarSfx('ok')
          break
        }
        case 'turbidez':
          // Depuração: suja ou limpa a água na hora, sem passar pela cena.
          motor.turbidez = comando.valor
          engine.tocarSfx('ok')
          break
        case 'profundidade':
          refProfundidade.current = comando.metros
          motor.definirAlvo(comando.metros, 2500)
          engine.tocarSfx('pressurizacao')
          break
        case 'desconhecido':
          engine.tocarSfx('estatica')
          setRajadaLog([`WARN: entrada não mapeada: "${comando.entrada}"`])
          reagir(false)
          break
      }

      if (comando.resposta && !discreto) {
        // Respostas fixas têm mp3 gerado pelo script; as com parte variável
        // (nome de forma, de painel) vão só pra legenda.
        const chave = 'chaveAudio' in comando ? comando.chaveAudio : undefined
        if (chave) void falarAvulso(audioDaResposta(chave), [comando.resposta])
        else dizer([comando.resposta])
      }
      if (discreto) return
      setOrbeForcado(null)
      setConsoleTravado(false)
      if (!manterAberto) setConsoleAberto(false)
    },
    [
      avancar,
      voltar,
      engine,
      prepararForma,
      dizer,
      falarAvulso,
      sequencia,
      dispararPane,
      reiniciarDaPane,
      reagir,
    ],
  )

  // --- teclado -------------------------------------------------------------

  useTeclado(
    useCallback(
      (acao) => {
        switch (acao.tipo) {
          case 'avancar':
            // Durante o combate a seta direita não pula a cena: força a rodada
            // a seguir. É a válvula de segurança de quem está no palco quando a
            // plateia não responde — e pular a cena inteira perderia o fim.
            if (refCombateAtivo.current) {
              engine.pararVoz()
              responderCombate('forcado')
              break
            }
            // Na identificação, Enter (e a seta) CONFIRMAM o que a sala disse.
            // Não pulam a cena: quem pula é o Esc do operador, e pular aqui
            // deixaria o cache pela metade.
            if (refIdentAtiva.current) {
              refRespostaIdent.current?.(true)
              break
            }
            // No hidrofone, idem: Enter confirma o som, não pula a cena. Pular
            // aqui deixaria a comunicação offline e o 2B sem fim.
            if (refHidroAtiva.current) {
              refRespostaHidro.current?.(true)
              break
            }
            avancar()
            break
          case 'voltar':
            voltar()
            break
          case 'pular':
            engine.pararVoz()
            avancar()
            break
          case 'alternativa':
            // No combate as mesmas teclas marcam o SETOR do contato. É a mesma
            // mão do operador e o mesmo gesto, com outro significado.
            if (refCombateAtivo.current) {
              responderCombate(acao.indice)
              break
            }
            // No 2B elas religam subsistemas, quando o grupo chega no trecho
            // que justifica o reparo. Não há conflito com o quiz: ele não
            // existe no roteiro do 2B.
            if (refReparos.current) {
              refReparos.current(String(acao.indice + 1))
              break
            }
            responderQuiz(acao.indice)
            break
          case 'vf':
            responderVF(acao.resposta)
            break
          case 'pane':
            void dispararPane()
            break
          case 'reiniciar':
            void reiniciarDaPane()
            break
          case 'proximaForma':
            // M, N e O ficam fora do combate: o orbe não é o assunto ali, e uma
            // tecla que muda a silhueta no meio da tensão é só ruído.
            if (refCombateAtivo.current) break
            operadorAssumiu()
            if (formasDaCena.length > 0) {
              setFormaForcada(null)
              setIndiceForma((atual) => (atual + 1) % formasDaCena.length)
            }
            break
          case 'formaAnterior':
            if (refCombateAtivo.current) break
            operadorAssumiu()
            if (formasDaCena.length > 0) {
              setFormaForcada(null)
              setIndiceForma((atual) => (atual <= 0 ? formasDaCena.length - 1 : atual - 1))
            }
            break
          case 'esfera':
            if (refCombateAtivo.current) break
            operadorAssumiu()
            setFormaForcada(null)
            setIndiceForma(SEM_FORMA)
            break
          case 'escala':
            setEscala((atual) =>
              Math.min(
                ESCALA_MAX,
                Math.max(ESCALA_MIN, Number((atual + acao.passo * ESCALA_PASSO).toFixed(2))),
              ),
            )
            break
          case 'revelar':
            if (refHidroAtiva.current) {
              refRespostaHidro.current?.(false)
              break
            }
            if (refIdentAtiva.current) refRespostaIdent.current?.(false)
            break
          case 'cronometro':
            // Não captura dígitos soltos: abre o console com o comando
            // começado. As teclas 1–4 já têm dono em cena (setor do combate,
            // reparo do 2B, dica do enigma) e disputá-las aqui seria ganhar um
            // atalho e perder três.
            operadorAssumiu()
            setComandoIniciado('cronometro ')
            setConsoleAberto(true)
            break
          case 'ajuda':
            setAjudaVisivel((visivel) => !visivel)
            break
          case 'console':
            setComandoIniciado(null)
            setConsoleAberto(true)
            break
          case 'fechar':
            // Esc é a declaração mais clara de "eu assumo": o Diretor para de
            // decidir até a próxima cena, e não reabre o que acabou de fechar.
            operadorAssumiu()
            if (!refPaneAtiva.current) setPainel(null)
            break
        }
      },
      [
        avancar,
        voltar,
        engine,
        formasDaCena,
        responderQuiz,
        responderVF,
        responderCombate,
        dispararPane,
        reiniciarDaPane,
        operadorAssumiu,
      ],
    ),
    // Com o console aberto o input captura tudo. Os painéis de traço e de
    // espectro também: o Enter do aluno é "interpretar", não "avançar cena".
    !consoleAberto && !painelCapturaTeclado(painel?.nome),
  )

  // --- ciclo da cena -------------------------------------------------------

  useEffect(() => {
    if (!cena) return

    let cancelado = false
    diretor.novaCena(cena)
    setSinc({ duracaoMs: null, ativa: false, tempos: null })
    setFalando(false)
    setIndiceForma(cena.formas && cena.formas.length > 0 ? 0 : SEM_FORMA)
    setFormaForcada(null)
    setFala(null)
    setFaseDinamica('pergunta')
    setEscolhidaQuiz(null)
    setEscolhidaVF(null)
    // Os desenhos pertencem à cena em que foram feitos.
    limparTracos()
    setTracos([])
    setTracoTravado(false)
    if (!refPaneAtiva.current) setPainel(null)

    if (cena.sfx) engine.tocarSfx(cena.sfx)

    // O combate tem laço próprio (uma fala por rodada, com espera no meio) e a
    // tela final não fala nada. Nos dois casos o `executar()` de sempre não
    // serve: ele tocaria um áudio que não existe e, na tela final, avançaria
    // pra lugar nenhum.
    if (
      cena.tipo === 'combate' ||
      cena.tipo === 'fim' ||
      cena.tipo === 'olho' ||
      // A emergência toca DOIS áudios com a tela travada no meio, e o
      // hidrofone toca um por som: nos dois casos o `executar()` genérico
      // tocaria um mp3 que não existe e avançaria por baixo do laço.
      cena.tipo === 'emergencia' ||
      cena.tipo === 'hidrofone'
    ) {
      return () => {
        diretor.cenaTerminou()
        engine.pararVoz()
      }
    }

    const url = audioDaCena(cena)
    const legenda = linhasDaLegenda(cena)
    // Sem mp3, quem dita o tempo da cena é a legenda: soma das durações
    // mínimas de leitura, não um valor fixo por linha.
    const fallbackMs = duracaoDaLegenda(legenda ?? linhasDeReferencia(cena), null)

    const executar = async () => {
      // Ordem da voz: mp3 gerado > voz do navegador > só tempo estimado.
      const usarNavegador = engine.vozNavegadorForcada()
      const reproducao = url && !usarNavegador ? await engine.tocar(url) : null
      if (cancelado) return

      // null = sem duração conhecida. A legenda então usa os mínimos puros, que
      // é o que o modo degradado pede; passar o fallback aqui faria ela entrar
      // no ramo proporcional e inflar as linhas curtas.
      const duracaoMs = reproducao?.tocou ? reproducao.duracaoMs : null
      // Offsets medidos linha a linha no mp3: quando existem, a legenda troca
      // exatamente quando a voz troca.
      const reais = reproducao?.tocou ? engine.temposDaCena(roteiro.turma, cena.id) : null
      // Âncora dos comandos com `aposLinha`: os offsets do tempos.json são
      // relativos ao início do mp3, não ao início da cena.
      refInicioAudio.current = performance.now()
      setSinc({ duracaoMs, ativa: true, tempos: reais?.linhas ?? null })
      setFalando(true)

      const proxima = sequencia[indice + 1]
      if (proxima && !usarNavegador) void engine.preparar(audioDaCena(proxima))

      // A cena só termina quando o áudio E a legenda terminarem: se o mp3 for
      // mais curto que os mínimos de leitura, quem manda é a legenda.
      const naTela = legenda
        ? duracaoDaLegenda(legenda, duracaoMs, reais?.linhas ?? null)
        : fallbackMs
      if (reproducao?.tocou) {
        await Promise.all([reproducao.fim, esperar(naTela)])
      } else if (legenda && legenda.length > 0) {
        // Sem mp3: a voz do navegador lê a legenda, e a troca de linha passa a
        // ser comandada por ela em vez de por relógio.
        const falou = await engine.falarComNavegador(legenda, ({ indice: i }) =>
          setLinhaGuiada(i),
        )
        if (cancelado) return
        setLinhaGuiada(null)
        if (!falou) {
          engine.simularVoz(naTela)
          await esperar(naTela)
        }
      } else {
        engine.simularVoz(naTela)
        await esperar(naTela)
      }
      if (cancelado) return

      setFalando(false)
      // Quiz e vf não avançam: entram no tempo de resposta da plateia.
      if (cena.tipo === 'quiz' || cena.tipo === 'vf') setFaseDinamica('respondendo')
      else if (cena.avanco === 'auto') avancar()
    }

    void executar()

    return () => {
      cancelado = true
      setLinhaGuiada(null)
      // Fim de cena fecha tudo, mesmo o que tinha prazo maior. A cena seguinte
      // começa limpa — é o operador quem chama o que quiser nela.
      diretor.cenaTerminou()
      engine.pararVoz()
    }
  }, [cena, indice, sequencia, engine, avancar, roteiro.turma, diretor])

  // Diagnóstico de áudio no próprio log da tela: quem opera não vai abrir o
  // console do navegador no meio da feira.
  useEffect(() => {
    // Conta TODOS os mp3 que o roteiro cita (inclui acerto e erro das
    // dinâmicas), não só o áudio principal de cada cena.
    const urls = roteiro.cenas.flatMap((cena) => {
      const reparos = (cena.reparos ?? []).map((r) => r.audio)
      if (reparos.length > 0) return reparos.concat(audioDaCena(cena) ?? [])
      switch (cena.tipo) {
        case 'quiz':
        case 'vf':
          return Object.values(cena.audio)
        case 'pane':
          return [cena.audio.entrada, cena.audio.retorno]
        case 'emergencia':
          return [cena.audio.queda, cena.audio.retorno]
        case 'hidrofone':
          return [
            ...cena.audio.inicio,
            ...cena.audio.acerto,
            ...cena.audio.revelado,
            ...cena.sons.map((som) => som.audioPista),
          ]
        default: {
          const url = audioDaCena(cena)
          return url ? [url] : []
        }
      }
    })
    const carregados = urls.filter((url) => engine.camadaDe(url) === 'A').length
    const base = [
      `Voz de bordo: ${carregados}/${urls.length} arquivos carregados`,
      carregados > 0
        ? `Sincronismo de legenda: tempos reais (${engine.contarTempos(roteiro.turma)} trechos)`
        : 'WARN: sem áudio de voz — legenda em tempo estimado',
      engine.vozNavegadorForcada()
        ? `Narração: voz do sistema — ${engine.descricaoDaVoz()}`
        : 'Narração: gravação de bordo (mp3)',
      `Saída de áudio: ${engine.estadoDoContexto()}`,
    ]
    setRajadaLog(base)

    // A trilha é a única coisa do áudio que não tem plano B: se o arquivo não
    // viajou junto, a cena roda em silêncio. Por isso a resposta entra no log
    // de ativação, que é onde o operador olha antes de a plateia sentar.
    if (roteiro.turma === '3A') {
      void engine.prepararTrilha().then((ok) => {
        setRajadaLog([
          ...base,
          ok
            ? 'Trilha de combate: carregada'
            : 'WARN: trilha de combate ausente — o combate roda sem música',
        ])
      })
    }
  }, [engine, roteiro])

  // O ambiente sonoro segue a mesma profundidade das câmeras.
  useEffect(() => {
    engine.iniciarAmbiente(() => motor.profundidade())
    return () => engine.pararAmbiente()
  }, [engine])

  // A voz da IA tem prioridade sobre o mar.
  useEffect(() => {
    engine.abafarAmbiente(falando || fala !== null)
    // A voz da IA tem prioridade sobre a trilha também: -9 dB enquanto ela fala.
    engine.abafarTrilha(falando || fala !== null)
  }, [engine, falando, fala])

  // O mundo das câmeras roda enquanto o player estiver montado, mesmo que
  // nenhum feed esteja visível: a profundidade do HUD depende dele.
  useEffect(() => {
    const inicial = sequencia.find((c) => c.profundidade !== undefined)?.profundidade ?? 50
    refProfundidade.current = inicial
    motor.fixarProfundidade(inicial)
    motor.iniciar()
    return () => motor.parar()
  }, [sequencia])

  // Profundidade: cada cena pode declarar a sua, e o motor desce (ou sobe) até
  // lá animado. Cena sem o campo herda a da anterior.
  useEffect(() => {
    if (!cena || cena.profundidade === undefined) return
    if (cena.profundidade === refProfundidade.current) return
    iniciarMergulho(cena.profundidade)
  }, [cena, iniciarMergulho])

  // Nos feeds, a pane é perda total de sinal.
  useEffect(() => {
    motor.estaticaGlobal = pane !== null && pane.fase !== 'voltando'
  }, [pane])

  // No modo reduzido não: a imagem continua, suja.
  useEffect(() => {
    motor.avaria = emergencia !== null && !emergencia.encerrando
    return () => {
      motor.avaria = false
    }
  }, [emergencia])

  /**
   * A voz sai avariada enquanto o sistema está avariado.
   *
   * Vale pros dois jeitos de o submarino quebrar: a pane global (`P`) e o modo
   * reduzido do 2B. Nos dois a IA continua falando, e é a fala dela que tem
   * que soar quebrada — a legenda tremendo diria isso só pra quem está lendo.
   *
   * O efeito depende do BOOLEANO, não dos objetos de estado. Dependendo deles,
   * ele religava a cada subsistema que caía (a pane troca o objeto a cada
   * 400 ms) e a cada reparo: medido, quatro ciclos de liga-desliga numa pane
   * só — o glitch piscava e o sorteio das quedas reiniciava junto.
   */
  const vozQuebrada =
    (pane !== null && pane.fase !== 'voltando') ||
    (emergencia !== null && !emergencia.encerrando)

  useEffect(() => {
    engine.vozAvariada(vozQuebrada)
  }, [engine, vozQuebrada])

  // Desligar de vez é coisa de desmontagem, não de cada re-render.
  useEffect(() => () => engine.vozAvariada(false), [engine])

  /**
   * O log do modo reduzido: UMA linha de erro de vez em quando.
   *
   * Esparsa de propósito. Rajada de erro é linguagem de pane, e aqui o
   * sistema não caiu — ele está mancando por trás de uma apresentação que
   * continua. Uma linha a cada vinte segundos lembra a plateia sem roubar a
   * cena de quem está falando.
   */
  useEffect(() => {
    if (!emergencia || emergencia.encerrando) return
    const caidos = emergencia.subsistemas.filter((_, i) => emergencia.estados[i] !== 'online')
    if (caidos.length === 0) return
    const timer = window.setInterval(() => {
      const nome = caidos[Math.floor(Math.random() * caidos.length)]
      setRajadaLog([`ERR: ${nome.toLowerCase()} sem resposta`])
    }, MS_ENTRE_ERROS)
    return () => window.clearInterval(timer)
  }, [emergencia])

  /**
   * Eventos de linha pro Diretor.
   *
   * O plano vem do MESMO módulo que move a legenda (`planejar`), com os mesmos
   * tempos reais do tempos.json. É o que garante que o painel abre na sílaba
   * que o justifica: se a legenda e o Diretor tivessem cada um o seu relógio,
   * os dois divergiriam no primeiro ajuste de texto.
   */
  useEffect(() => {
    if (!cena || !sinc.ativa || refPaneAtiva.current) return
    const linhas = linhasDaLegenda(cena)
    if (!linhas || linhas.length === 0) return

    const plano = planejar(linhas, sinc.duracaoMs, sinc.tempos)
    const base = refInicioAudio.current
    const agora = performance.now()
    const timers: number[] = []
    plano.forEach((linha, i) => {
      timers.push(
        window.setTimeout(
          () => diretor.linhaComecou(i),
          Math.max(0, base + linha.inicio - agora),
        ),
      )
      timers.push(
        window.setTimeout(
          () => diretor.linhaTerminou(i),
          Math.max(0, base + linha.inicio + linha.duracao - agora),
        ),
      )
    })
    return () => timers.forEach((id) => clearTimeout(id))
  }, [cena, sinc, diretor])

  /** Vence o que tem prazo em segundos. 120 ms é fino o bastante pro olho. */
  useEffect(() => {
    const id = window.setInterval(() => diretor.tique(performance.now()), 120)
    return () => clearInterval(id)
  }, [diretor])

  // Fala avulsa sai de cena sozinha, exceto na pane.
  useEffect(() => {
    if (!fala || fala.fixa) return
    const naTela = duracaoDaLegenda(fala.linhas, fala.duracaoMs)
    const timer = setTimeout(() => setFala(null), naTela + 400)
    return () => clearTimeout(timer)
  }, [fala])

  const aoTerminarAuto = useCallback(() => setAutoComando(null), [])
  const aoFecharConsole = useCallback(() => {
    setConsoleAberto(false)
    // O comando começado morre com o console: reabrir pelo `/` tem que dar um
    // campo vazio, não o `cronometro ` de dois minutos atrás.
    setComandoIniciado(null)
  }, [])

  if (!cena) {
    return (
      <Hud rota="FIM">
        <p className="status">expedição encerrada</p>
      </Hud>
    )
  }

  // Lida pelo callback memorizado do teclado. Atualizar na renderização (e não
  // num efeito) garante que a tecla apertada no mesmo quadro em que a fase
  // muda já veja o valor certo.
  refCombateAtivo.current = cena.tipo === 'combate' && combate?.fase === 'investida'
  // Ativa durante TODA a expedição, não só na espera.
  //
  // Enquanto era só na fase `procurando`, o Enter apertado depois de revelar
  // uma espécie caía no `avancar()` genérico e PULAVA A CENA INTEIRA: acertava
  // a tartaruga, apertava Enter de novo e a expedição ia direto pro 2B com três
  // espécies por mostrar.
  refIdentAtiva.current =
    cena.tipo === 'identificacao' && ident !== null && ident.fase !== 'fim'
  refHidroAtiva.current = cena.tipo === 'hidrofone' && hidro !== null && hidro.fase !== 'fim'

  const estadoOrbe = pane
    ? pane.fase === 'voltando'
      ? 'falando'
      : 'pane'
    : (orbeForcado ?? estadoDoOrbe(cena, falando, faseDinamica))
  const modo = layoutDaCena(cena)
  // Os mini-feeds só saem do ar quando a cena pede (quiz, por exemplo). Na pane
  // eles continuam na tela, em estática — quem cuida disso é o motor.
  // Enquanto o olho está no facho, a câmera É o olho: os mini-feeds saem da
  // tela. Eles voltam no quadro seguinte à rachadura, e voltam em estática —
  // que é justamente a informação da cena.
  // Na cena do olho a câmera grande substitui os dois mini-feeds desde o
  // primeiro tempo: é ela a única janela pra fora a partir dali.
  const mostrarCameras = cena.cameras !== false && passoOlho === null
  const quedasVisiveis = pane
    ? pane.quedas.filter((queda) => !restaurados.includes(queda.nome))
    : undefined

  return (
    <Hud
      emergencia={emergencia !== null && !emergencia.encerrando}
      agua={aguaVisivel ? refAgua : undefined}
      rota={pane ? 'FALHA DE SISTEMA' : rotaDaCena(cena)}
      sonar={
        pane
          ? 'OFFLINE'
          : cena.tipo === 'combate'
            ? 'AUXILIAR'
            : visor === 'rachado'
              ? 'ÚNICO SENSOR'
              : cena.tipo === 'transicao'
                ? 'VARRENDO'
                : 'ATIVO'
      }
      rodapeEsquerda={`turma ${roteiro.turma}`}
      inclinado={faseMergulho === 'inclinacao'}
      mergulhando={mergulho !== null}
      impacto={impacto}
      voltandoDoApagao={voltandoDoApagao}
      rodapeDireita={
        pane
          ? 'pane · R pra reiniciar'
          : `cena ${indice + 1}/${sequencia.length} · ${cena.id}`
      }
    >
      <div className={`palco palco--${modo}${mostrarCameras ? ' palco--cameras' : ''}`}>
        <div className="palco__cena">
          {/* Fica montado a sessão inteira: se trocasse de lugar na árvore a
              cada cena, a animação reiniciaria a cada troca. */}
          <Orbe
            estado={estadoOrbe}
            lerNivel={lerNivel}
            forma={formaAtual}
            escala={escala}
            tremor={tremor}
            pulso={pulso}
            compacto={modo === 'canto'}
            avariado={emergencia !== null && !emergencia.encerrando}
            ritmo={ritmoOrbe}
          />
          <div className="palco__texto">
            {conteudoDaCena(cena, sinc, modo, falando, lerNivel, linhaGuiada)}
          </div>
          {fala && (
            <div className={pane ? 'palco__resposta palco__resposta--alerta' : 'palco__resposta'}>
              <Legenda
                key={fala.chave}
                linhas={fala.linhas}
                duracaoTotalMs={fala.duracaoMs}
                ativa
                falando={false}
                lerNivel={lerNivel}
                cena={`fala-${fala.chave}`}
              />
            </div>
          )}
          {formasDaCena.length > 0 && !pane && (
            <p className="palco__forma">
              {formaAtual}
              {' · '}
              {formaForcada
                ? 'console'
                : indiceForma >= 0
                  ? `${indiceForma + 1}/${formasDaCena.length}`
                  : '—'}
            </p>
          )}
          {dinamicaDaCena(
            cena,
            faseDinamica,
            escolhidaQuiz,
            escolhidaVF,
            responderQuiz,
            responderVF,
            aoZerarTimer,
            aoPing,
          )}
          {cena.tipo === 'combate' && combate && (
            <Combate
              cena={cena}
              estado={combate}
              lerSim={lerSimCombate}
              aoResponder={responderCombate}
            />
          )}
          {cena.tipo === 'identificacao' && ident && (
            <>
              {/* A câmera grande é o palco: mesma caixa da cena do olho, com o
                  bicho e a turbidez desenhados DENTRO dela pelo motor. */}
              <div className="olho-camera olho-camera--ident" aria-hidden="true">
                <Feed
                  className="feed--olho"
                  rotulo="CAM 01 · EXT PROA"
                  camera={{ x0: 0, abertura: 1 }}
                  largura={480}
                  altura={304}
                  visor={visor}
                  semente={3319}
                />
              </div>
              <Identificacao
                especie={cena.especies[ident.indice]}
                estado={ident}
                total={cena.especies.length}
                lerCalibracao={lerCalibracao}
              />
              {/* O cache é da CENA, não do Diretor: ele fica aberto o tempo
                  todo, no canto, e não disputa a faixa central com os painéis
                  que a fala abre. Por isso é renderizado aqui e não por
                  `setPainel` — assim nada o fecha no meio da dinâmica. */}
              {cache && (
                <Painel
                  painel={{ nome: 'cache', origem: 'operador', dica: 'recalibrando' }}
                  cache={cache}
                />
              )}
            </>
          )}
          {cena.tipo === 'emergencia' && emerg && <Emergencia cena={cena} estado={emerg} />}
          {cena.tipo === 'hidrofone' && hidro && (
            <Hidrofone
              som={cena.sons[hidro.indice]}
              estado={hidro}
              total={cena.sons.length}
              lerEspectro={lerEspectro}
              lerOnda={lerOnda}
            />
          )}
          {/* As luzes são da SESSÃO, não da cena: elas atravessam o grupo 3, o
              grupo 4 e o hidrofone, e é justamente essa permanência que conta
              que o submarino continua avariado. */}
          {emergencia && (
            <LuzesEmergencia
              subsistemas={emergencia.subsistemas}
              estados={emergencia.estados}
              encerrando={emergencia.encerrando}
            />
          )}
          {cena.tipo === 'olho' && passoOlho !== null && passoOlho !== 'olho' && (
            <div className={`olho-camera olho-camera--${passoOlho}`} aria-hidden="true">
              <Feed
                className="feed--olho"
                rotulo="CAM 03 · FAROL DE PROA"
                camera={{ x0: 0, abertura: 1 }}
                // Proporção quase igual à da caixa (≈1,56): com 16:9 o
                // `cover` cortava 13% em cima e embaixo, e era exatamente onde
                // estavam a dorsal e a cauda do bicho.
                largura={480}
                altura={304}
                visor={visor}
                semente={7723}
              />
            </div>
          )}
          {cena.tipo === 'olho' && olhoVisivel && (
            <Olho
              key={cena.id}
              duracao={cena.duracao}
              aoQuebrar={() => refQuebrarOlho.current?.()}
            />
          )}
          <Painel
            cache={cache ?? undefined}
            painel={
              painel && {
                ...painel,
                quedas: quedasVisiveis,
                congelado: pane?.fase === 'congelado',
                // Durante a pane o Esc não fecha nada: quem sai da pane é o R.
                dica: pane ? 'r pra reiniciar o sistema' : undefined,
              }
            }
            aoInterpretarTraco={aoInterpretarTraco}
            aoFechar={() => setPainel(null)}
            // Profundidade VIVA, não a declarada na cena: assim o comando
            // "profundidade N" também move o painel, e ele bate com o que as
            // câmeras estão mostrando naquele instante.
            profundidade={Math.round(motor.profundidade())}
            travado={tracoTravado}
            aoPing={aoPing}
            aoPingGrave={aoPingGrave}
            aoAjuda={() => setAjudaVisivel((visivel) => !visivel)}
            // Só nesta cena o sonar conta uma história: o contato vem da borda
            // ao centro em 6 s, com o ping acelerando e ficando grave.
            aproximacao={cena.id === 'contato' ? 6 : undefined}
            visor={visor}
          />
          {mostrarCameras && (
            <>
              <Feed
                className="feed--mini feed--bombordo"
                rotulo="CAM 01 · EXT BOMBORDO"
                camera={{ x0: 0, abertura: 1 }}
                visor={visor}
                semente={4211}
              />
              <Feed
                className="feed--mini feed--estibordo"
                rotulo="CAM 02 · EXT ESTIBORDO"
                camera={{ x0: 1.4, abertura: 1, espelhado: true }}
                visor={visor}
                semente={9137}
              />
            </>
          )}
          {mergulho && (
            <ColunaDagua
              lerProfundidade={() => refProfMergulho.current}
              alvo={mergulho.plano.para}
            />
          )}
          <ConsoleComandos
            aberto={consoleAberto}
            travado={consoleTravado}
            autoTexto={autoComando}
            textoInicial={comandoIniciado}
            aoFechar={aoFecharConsole}
            aoExecutar={executarComando}
            aoTerminarAuto={aoTerminarAuto}
          />
        </div>
        <LogSistemas
          especificas={cena.log}
          modo={pane || cena.tipo === 'combate' ? 'erro' : modoDoLog(estadoOrbe)}
          apagado={modo !== 'central' && !pane}
          lerNivel={lerNivel}
          falando={falando}
          rajada={rajadaLog}
          congelado={pane?.fase === 'congelado' || logParado}
        />
      </div>
      {apagao && <div className="apagao" />}
      {ajudaVisivel && (
        <Ajuda
          cena={cena.id}
          forma={formaAtual}
          escala={escala}
          aceitos={
            cena.tipo === 'identificacao' && ident
              ? {
                  rotulo: cena.especies[ident.indice]?.nome ?? '',
                  termos: cena.especies[ident.indice]?.aceitos ?? [],
                }
              : cena.tipo === 'hidrofone' && hidro
                ? {
                    rotulo: cena.sons[hidro.indice]?.nome ?? '',
                    termos: cena.sons[hidro.indice]?.aceitos ?? [],
                  }
                : null
          }
        />
      )}
      {depurarDiretor && <DepuracaoDiretor diretor={diretor} cena={cena.id} />}
    </Hud>
  )
}

function estadoDoOrbe(cena: Cena, falando: boolean, fase: FaseDinamica): EstadoOrbe {
  switch (cena.tipo) {
    // O modo reduzido nao e pane: a IA continua falando, so que mais devagar
    // e mais escura. Quem escurece o orbe e a classe do HUD, nao o estado.
    case 'emergencia':
      return falando ? 'falando' : 'pane'
    case 'pane':
      return 'pane'
    case 'quiz':
    case 'vf':
      // Enquanto a plateia pensa, o sistema "processa".
      return fase === 'respondendo' ? 'processando' : falando ? 'falando' : 'ocioso'
    case 'apresentacao':
      return 'ocioso'
    case 'combate':
      // A IA esta cega e calculando: `processando` o tempo todo, menos quando
      // ela propria fala.
      return falando ? 'falando' : 'processando'
    case 'fim':
      return 'ocioso'
    case 'olho':
      return 'processando'
    default:
      return falando ? 'falando' : 'ocioso'
  }
}

function modoDoLog(estado: EstadoOrbe): ModoLog {
  if (estado === 'pane') return 'erro'
  if (estado === 'processando') return 'rapido'
  return 'normal'
}

function dinamicaDaCena(
  cena: Cena,
  fase: FaseDinamica,
  escolhidaQuiz: number | null,
  escolhidaVF: boolean | null,
  responderQuiz: (indice: number) => void,
  responderVF: (resposta: boolean) => void,
  aoZerar: () => void,
  aoPing: () => void,
) {
  if (cena.tipo === 'quiz') {
    return (
      <Quiz
        key={cena.id}
        cena={cena}
        fase={fase}
        escolhida={escolhidaQuiz}
        aoResponder={responderQuiz}
        aoZerar={aoZerar}
        aoPing={aoPing}
      />
    )
  }
  if (cena.tipo === 'vf') {
    return (
      <VF
        key={cena.id}
        cena={cena}
        fase={fase}
        escolhida={escolhidaVF}
        aoResponder={responderVF}
        aoZerar={aoZerar}
        aoPing={aoPing}
      />
    )
  }
  return null
}

function conteudoDaCena(
  cena: Cena,
  sinc: { duracaoMs: number | null; ativa: boolean; tempos: TemposReais | null },
  layout: Layout,
  falando: boolean,
  lerNivel: () => number,
  linhaGuiada: number | null,
) {
  switch (cena.tipo) {
    case 'fala':
      return (
        <Fala
          key={cena.id}
          cena={cena}
          duracaoMs={sinc.duracaoMs}
          ativa={sinc.ativa}
          falando={falando}
          lerNivel={lerNivel}
          tempos={sinc.tempos}
          linhaGuiada={linhaGuiada}
        />
      )
    case 'apresentacao':
      return <Apresentacao key={cena.id} cena={cena} palco={layout === 'palco'} />
    case 'fim':
      return <Fim key={cena.id} cena={cena} />
    case 'transicao':
      return (
        <Transicao
          key={cena.id}
          cena={cena}
          duracaoMs={sinc.duracaoMs}
          ativa={sinc.ativa}
          falando={falando}
          lerNivel={lerNivel}
          tempos={sinc.tempos}
          linhaGuiada={linhaGuiada}
        />
      )
    default:
      return null
  }
}
