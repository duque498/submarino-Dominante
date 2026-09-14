import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConsoleComandos } from '../console/Console'
import { interpretar, vocabulario } from '../console/comandos'
import { audioDaResposta } from '../console/respostas'
import { carregarFormas, FORMA_PADRAO, prepararGlifo } from '../formas'
import { Feed } from '../mundo/Feed'
import { motor } from '../mundo/motor'
import { Painel, type PainelAberto } from '../paineis'
import type { Queda } from '../paineis/PainelStatus'
import type { Cena, CenaPane, Roteiro } from '../roteiros/tipos'
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
  return cena.tipo === 'fala' || cena.tipo === 'transicao' ? cena.tela.linhas : null
}

/** Linhas só pra estimar duração em cenas que não têm legenda. */
function linhasDeReferencia(cena: Cena): string[] {
  switch (cena.tipo) {
    case 'fala':
    case 'transicao':
      return cena.tela.linhas
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
  const [indiceForma, setIndiceForma] = useState(SEM_FORMA)
  const [formaForcada, setFormaForcada] = useState<string | null>(null)
  const [escala, setEscala] = useState(1)
  const [ajudaVisivel, setAjudaVisivel] = useState(false)

  const [consoleAberto, setConsoleAberto] = useState(false)
  const [consoleTravado, setConsoleTravado] = useState(false)
  const [autoComando, setAutoComando] = useState<string | null>(null)
  const [painel, setPainel] = useState<PainelAberto | null>(null)
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
  /** Lido dentro do efeito da cena, que não pode avançar por baixo da pane. */
  const refPaneAtiva = useRef(false)
  const refFimDaFalaPane = useRef(0)
  const proximaChave = useRef(0)

  const cena = sequencia[indice]
  const formasDaCena = useMemo(() => cena?.formas ?? [], [cena])
  const formaDaLista =
    indiceForma >= 0 && indiceForma < formasDaCena.length
      ? formasDaCena[indiceForma]
      : FORMA_PADRAO
  const formaAtual = formaForcada ?? formaDaLista

  const avancar = useCallback(() => {
    if (refPaneAtiva.current) return
    setIndice((atual) => Math.min(atual + 1, sequencia.length - 1))
  }, [sequencia.length])

  const voltar = useCallback(() => {
    if (refPaneAtiva.current) return
    setIndice((atual) => Math.max(atual - 1, 0))
  }, [])

  const lerNivel = useCallback(() => engine.nivel(), [engine])

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
      const reproducao = await engine.tocar(url)
      const duracaoMs = reproducao.tocou ? reproducao.duracaoMs : null
      const naTela = duracaoDaLegenda(linhas, duracaoMs)
      if (!reproducao.tocou) engine.simularVoz(naTela)
      dizer(linhas, duracaoMs, fixa)
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

  const executarComando = useCallback(
    async (texto: string, manterAberto: boolean) => {
      setConsoleTravado(true)
      setOrbeForcado('processando')
      setRajadaLog([
        'Interpretando comando...',
        ...POOL_COMANDO.slice(1, 3),
        `Entrada do operador: "${texto}"`,
      ])

      await esperar(sorteio(MS_PROCESSANDO[0], MS_PROCESSANDO[1]))

      const comando = interpretar(texto)

      switch (comando.tipo) {
        case 'forma': {
          const chave = await prepararForma(comando.nome, comando.argumento)
          setFormaForcada(chave === FORMA_PADRAO ? null : chave)
          if (chave === FORMA_PADRAO) setIndiceForma(SEM_FORMA)
          engine.tocarSfx('ok')
          break
        }
        case 'painel':
          setPainel({ nome: comando.nome, argumento: comando.argumento })
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

      if (comando.resposta) {
        // Respostas fixas têm mp3 gerado pelo script; as com parte variável
        // (nome de forma, de painel) vão só pra legenda.
        const chave = 'chaveAudio' in comando ? comando.chaveAudio : undefined
        if (chave) void falarAvulso(audioDaResposta(chave), [comando.resposta])
        else dizer([comando.resposta])
      }
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
            if (formasDaCena.length > 0) {
              setFormaForcada(null)
              setIndiceForma((atual) => (atual + 1) % formasDaCena.length)
            }
            break
          case 'formaAnterior':
            if (formasDaCena.length > 0) {
              setFormaForcada(null)
              setIndiceForma((atual) => (atual <= 0 ? formasDaCena.length - 1 : atual - 1))
            }
            break
          case 'esfera':
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
      ],
    ),
    // Com o console aberto o input captura tudo: nenhuma tecla de navegação
    // pode disparar enquanto o operador digita.
    !consoleAberto,
  )

  // --- ciclo da cena -------------------------------------------------------

  useEffect(() => {
    if (!cena) return

    let cancelado = false
    setSinc({ duracaoMs: null, ativa: false, tempos: null })
    setFalando(false)
    setIndiceForma(cena.formas && cena.formas.length > 0 ? 0 : SEM_FORMA)
    setFormaForcada(null)
    setFala(null)
    setFaseDinamica('pergunta')
    setEscolhidaQuiz(null)
    setEscolhidaVF(null)
    if (!refPaneAtiva.current) setPainel(null)

    if (cena.sfx) engine.tocarSfx(cena.sfx)

    const url = audioDaCena(cena)
    const legenda = linhasDaLegenda(cena)
    // Sem mp3, quem dita o tempo da cena é a legenda: soma das durações
    // mínimas de leitura, não um valor fixo por linha.
    const fallbackMs = duracaoDaLegenda(legenda ?? linhasDeReferencia(cena), null)

    const executar = async () => {
      const reproducao = url ? await engine.tocar(url) : null
      if (cancelado) return

      // null = sem duração conhecida. A legenda então usa os mínimos puros, que
      // é o que o modo degradado pede; passar o fallback aqui faria ela entrar
      // no ramo proporcional e inflar as linhas curtas.
      const duracaoMs = reproducao?.tocou ? reproducao.duracaoMs : null
      // Offsets medidos linha a linha no mp3: quando existem, a legenda troca
      // exatamente quando a voz troca.
      const reais = reproducao?.tocou ? engine.temposDaCena(roteiro.turma, cena.id) : null
      setSinc({ duracaoMs, ativa: true, tempos: reais?.linhas ?? null })
      setFalando(true)
      if (!reproducao?.tocou) engine.simularVoz(fallbackMs)

      const proxima = sequencia[indice + 1]
      if (proxima) void engine.preparar(audioDaCena(proxima))

      // A cena só termina quando o áudio E a legenda terminarem: se o mp3 for
      // mais curto que os mínimos de leitura, quem manda é a legenda.
      const naTela = legenda
        ? duracaoDaLegenda(legenda, duracaoMs, reais?.linhas ?? null)
        : fallbackMs
      if (reproducao?.tocou) await Promise.all([reproducao.fim, esperar(naTela)])
      else await esperar(naTela)
      if (cancelado) return

      setFalando(false)
      // Quiz e vf não avançam: entram no tempo de resposta da plateia.
      if (cena.tipo === 'quiz' || cena.tipo === 'vf') setFaseDinamica('respondendo')
      else if (cena.avanco === 'auto') avancar()
    }

    void executar()

    return () => {
      cancelado = true
      engine.pararVoz()
    }
  }, [cena, indice, sequencia, engine, avancar, roteiro.turma])

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
    refProfundidade.current = cena.profundidade
    motor.definirAlvo(cena.profundidade)
    engine.tocarSfx('pressurizacao')
  }, [cena, engine])

  // Nos feeds, a pane é perda total de sinal.
  useEffect(() => {
    motor.estaticaGlobal = pane !== null && pane.fase !== 'voltando'
  }, [pane])

  // Comandos roteirizados: a IA abre o console e digita sozinha.
  useEffect(() => {
    if (!cena?.comandos?.length) return
    const timers = cena.comandos.map((comando) =>
      setTimeout(() => {
        if (refPaneAtiva.current) return
        setConsoleAberto(true)
        setAutoComando(comando.texto)
      }, comando.atraso),
    )
    return () => timers.forEach(clearTimeout)
  }, [cena])

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
            {conteudoDaCena(cena, sinc, modo, falando, lerNivel)}
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
          {painel && (
            <Painel
              painel={{
                ...painel,
                quedas: quedasVisiveis,
                congelado: pane?.fase === 'congelado',
                // Durante a pane o Esc não fecha nada: quem sai da pane é o R.
                dica: pane ? 'r pra reiniciar o sistema' : undefined,
              }}
            />
          )}
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
        />
      )
    default:
      return null
  }
}
