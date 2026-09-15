import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConsoleComandos } from '../console/Console'
import { interpretar, vocabulario } from '../console/comandos'
import { audioDaResposta, RESPOSTAS } from '../console/respostas'
import {
  carregarFormas,
  FORMA_PADRAO,
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
import { textoDaLinha, type Cena, type CenaPane, type Roteiro } from '../roteiros/tipos'
import { Apresentacao } from '../cenas/Apresentacao'
import { Fala } from '../cenas/Fala'
import { Quiz, type FaseDinamica } from '../cenas/Quiz'
import { Transicao } from '../cenas/Transicao'
import { VF } from '../cenas/VF'
import { Ajuda } from '../ui/Ajuda'
import { Hud } from '../ui/Hud'
import { Legenda } from '../ui/Legenda'
import { LogSistemas, type ModoLog } from '../ui/LogSistemas'
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
  }
}

function rotaDaCena(cena: Cena): string {
  switch (cena.tipo) {
    case 'transicao':
      return cena.destino.toUpperCase()
    case 'fala':
    case 'apresentacao':
      return (cena.tela.titulo ?? cena.id).toUpperCase()
    default:
      return cena.id.toUpperCase()
  }
}

type Layout = 'central' | 'palco' | 'canto'

function layoutDaCena(cena: Cena): Layout {
  if (cena.tipo !== 'apresentacao') return 'central'
  return cena.orbe === 'palco' ? 'palco' : 'canto'
}

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
  const [rajadaLog, setRajadaLog] = useState<string[] | null>(null)
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
    log: (linhas: string[]) => setRajadaLog(linhas),
  })

  const refDiretor = useRef<Diretor | null>(null)
  if (!refDiretor.current) {
    refDiretor.current = new Diretor({
      painel: (p) => refSaidas.current.painel(p),
      despedida: (n, m) => refSaidas.current.despedida(n, m),
      forma: (f) => refSaidas.current.forma(f),
      sfx: (n) => refSaidas.current.sfx(n),
      mergulho: (m) => refSaidas.current.mergulho(m),
      log: (l) => refSaidas.current.log(l),
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
            operadorAssumiu()
            if (formasDaCena.length > 0) {
              setFormaForcada(null)
              setIndiceForma((atual) => (atual + 1) % formasDaCena.length)
            }
            break
          case 'formaAnterior':
            operadorAssumiu()
            if (formasDaCena.length > 0) {
              setFormaForcada(null)
              setIndiceForma((atual) => (atual <= 0 ? formasDaCena.length - 1 : atual - 1))
            }
            break
          case 'esfera':
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
          case 'ajuda':
            setAjudaVisivel((visivel) => !visivel)
            break
          case 'console':
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
      switch (cena.tipo) {
        case 'quiz':
        case 'vf':
          return Object.values(cena.audio)
        case 'pane':
          return [cena.audio.entrada, cena.audio.retorno]
        default: {
          const url = audioDaCena(cena)
          return url ? [url] : []
        }
      }
    })
    const carregados = urls.filter((url) => engine.camadaDe(url) === 'A').length
    setRajadaLog([
      `Voz de bordo: ${carregados}/${urls.length} arquivos carregados`,
      carregados > 0
        ? `Sincronismo de legenda: tempos reais (${engine.contarTempos(roteiro.turma)} trechos)`
        : 'WARN: sem áudio de voz — legenda em tempo estimado',
      engine.vozNavegadorForcada()
        ? `Narração: voz do sistema — ${engine.descricaoDaVoz()}`
        : 'Narração: gravação de bordo (mp3)',
      `Saída de áudio: ${engine.estadoDoContexto()}`,
    ])
  }, [engine, roteiro])

  // O ambiente sonoro segue a mesma profundidade das câmeras.
  useEffect(() => {
    engine.iniciarAmbiente(() => motor.profundidade())
    return () => engine.pararAmbiente()
  }, [engine])

  // A voz da IA tem prioridade sobre o mar.
  useEffect(() => {
    engine.abafarAmbiente(falando || fala !== null)
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
  const aoFecharConsole = useCallback(() => setConsoleAberto(false), [])

  if (!cena) {
    return (
      <Hud rota="FIM">
        <p className="status">expedição encerrada</p>
      </Hud>
    )
  }

  const estadoOrbe = pane
    ? pane.fase === 'voltando'
      ? 'falando'
      : 'pane'
    : (orbeForcado ?? estadoDoOrbe(cena, falando, faseDinamica))
  const modo = layoutDaCena(cena)
  // Os mini-feeds só saem do ar quando a cena pede (quiz, por exemplo). Na pane
  // eles continuam na tela, em estática — quem cuida disso é o motor.
  const mostrarCameras = cena.cameras !== false
  const quedasVisiveis = pane
    ? pane.quedas.filter((queda) => !restaurados.includes(queda.nome))
    : undefined

  return (
    <Hud
      rota={pane ? 'FALHA DE SISTEMA' : rotaDaCena(cena)}
      sonar={pane ? 'OFFLINE' : cena.tipo === 'transicao' ? 'VARRENDO' : 'ATIVO'}
      rodapeEsquerda={`turma ${roteiro.turma}`}
      inclinado={faseMergulho === 'inclinacao'}
      mergulhando={mergulho !== null}
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
          <Painel
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
          />
          {mostrarCameras && (
            <>
              <Feed
                className="feed--mini feed--bombordo"
                rotulo="CAM 01 · EXT BOMBORDO"
                camera={{ x0: 0, abertura: 1 }}
              />
              <Feed
                className="feed--mini feed--estibordo"
                rotulo="CAM 02 · EXT ESTIBORDO"
                camera={{ x0: 1.4, abertura: 1, espelhado: true }}
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
            aoFechar={aoFecharConsole}
            aoExecutar={executarComando}
            aoTerminarAuto={aoTerminarAuto}
          />
        </div>
        <LogSistemas
          especificas={cena.log}
          modo={pane ? 'erro' : modoDoLog(estadoOrbe)}
          apagado={modo !== 'central' && !pane}
          lerNivel={lerNivel}
          falando={falando}
          rajada={rajadaLog}
          congelado={pane?.fase === 'congelado'}
        />
      </div>
      {ajudaVisivel && <Ajuda cena={cena.id} forma={formaAtual} escala={escala} />}
      {depurarDiretor && <DepuracaoDiretor diretor={diretor} cena={cena.id} />}
    </Hud>
  )
}

function estadoDoOrbe(cena: Cena, falando: boolean, fase: FaseDinamica): EstadoOrbe {
  switch (cena.tipo) {
    case 'pane':
      return 'pane'
    case 'quiz':
    case 'vf':
      // Enquanto a plateia pensa, o sistema "processa".
      return fase === 'respondendo' ? 'processando' : falando ? 'falando' : 'ocioso'
    case 'apresentacao':
      return 'ocioso'
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
