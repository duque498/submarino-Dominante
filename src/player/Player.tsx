import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConsoleComandos } from '../console/Console'
import { interpretar, vocabulario } from '../console/comandos'
import { carregarFormas, FORMA_PADRAO, prepararGlifo } from '../formas'
import { Painel, type PainelAberto } from '../paineis'
import type { Cena, Roteiro } from '../roteiros/tipos'
import { Apresentacao } from '../cenas/Apresentacao'
import { Fala } from '../cenas/Fala'
import { Transicao } from '../cenas/Transicao'
import { Ajuda } from '../ui/Ajuda'
import { Hud } from '../ui/Hud'
import { Legenda } from '../ui/Legenda'
import { LogSistemas, type ModoLog } from '../ui/LogSistemas'
import { POOL_COMANDO } from '../ui/logPool'
import { Orbe, QTD_PONTOS, type EstadoOrbe } from '../ui/Orbe'
import type { AudioEngine } from './AudioEngine'
import { useTeclado } from './useTeclado'

/** Tempo estimado de leitura por linha, usado quando o mp3 não existe. */
const MS_POR_LINHA_SEM_AUDIO = 2500
/** Limites do ajuste de tamanho do orbe pelo operador ([ e ]). */
const ESCALA_MIN = 0.5
const ESCALA_MAX = 2
const ESCALA_PASSO = 0.1
/** Marca "esfera forçada": o operador apertou O e saiu da lista da cena. */
const SEM_FORMA = -1
/** Quanto tempo a IA "pensa" antes de responder a um comando. */
const MS_PROCESSANDO = [600, 1200] as const
/** Quanto tempo a resposta da IA fica na tela. */
const MS_RESPOSTA = 4200
const MS_TREMOR = 420

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

/** Linhas de texto da cena — só pra estimar a duração sem áudio. */
function linhasDaCena(cena: Cena): string[] {
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

type Props = { roteiro: Roteiro; engine: AudioEngine }

export function Player({ roteiro, engine }: Props) {
  // A pane fica no mesmo JSON, mas fora da ordem: ela é disparada pela tecla P
  // (Fase 2), então some da sequência linear que as setas percorrem.
  const sequencia = useMemo(
    () => roteiro.cenas.filter((cena) => cena.tipo !== 'pane'),
    [roteiro],
  )

  const [indice, setIndice] = useState(0)
  /** Cronômetro da legenda: só arranca quando o áudio da cena arrancou. */
  const [sinc, setSinc] = useState<{ duracaoMs: number | null; ativa: boolean }>({
    duracaoMs: null,
    ativa: false,
  })
  const [falando, setFalando] = useState(false)
  /** Índice na lista `formas` da cena; SEM_FORMA quando o operador forçou esfera. */
  const [indiceForma, setIndiceForma] = useState(SEM_FORMA)
  /** Forma pedida pelo console — tem prioridade sobre a lista da cena. */
  const [formaForcada, setFormaForcada] = useState<string | null>(null)
  const [escala, setEscala] = useState(1)
  const [ajudaVisivel, setAjudaVisivel] = useState(false)

  const [consoleAberto, setConsoleAberto] = useState(false)
  const [consoleTravado, setConsoleTravado] = useState(false)
  const [autoComando, setAutoComando] = useState<string | null>(null)
  const [painel, setPainel] = useState<PainelAberto | null>(null)
  const [resposta, setResposta] = useState<{ texto: string; chave: number } | null>(null)
  const [rajadaLog, setRajadaLog] = useState<string[] | null>(null)
  const [orbeForcado, setOrbeForcado] = useState<EstadoOrbe | null>(null)
  const [tremor, setTremor] = useState(false)
  const proximaChave = useRef(0)

  const cena = sequencia[indice]
  const formasDaCena = useMemo(() => cena?.formas ?? [], [cena])
  const formaDaLista =
    indiceForma >= 0 && indiceForma < formasDaCena.length
      ? formasDaCena[indiceForma]
      : FORMA_PADRAO
  const formaAtual = formaForcada ?? formaDaLista

  const avancar = useCallback(() => {
    setIndice((atual) => Math.min(atual + 1, sequencia.length - 1))
  }, [sequencia.length])

  const voltar = useCallback(() => {
    setIndice((atual) => Math.max(atual - 1, 0))
  }, [])

  // Definido antes de qualquer return: hook não pode ficar dentro do JSX que
  // só é alcançado em alguns caminhos.
  const lerNivel = useCallback(() => engine.nivel(), [engine])

  /** Amostra a forma pedida (se ainda não estiver em cache) e devolve a chave. */
  const prepararForma = useCallback(async (nome: string, argumento?: string) => {
    if (nome === 'glifo') return prepararGlifo(argumento ?? '?', QTD_PONTOS)
    await carregarFormas([nome], QTD_PONTOS)
    return nome
  }, [])

  const responder = useCallback((texto: string) => {
    proximaChave.current += 1
    setResposta({ texto, chave: proximaChave.current })
  }, [])

  /** Ciclo completo de um comando: processa, responde e executa. */
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
          if (comando.acao === 'ajuda') {
            // Ajuda vai pro log de bordo, não pra legenda: é referência, não fala.
            setRajadaLog(['Comandos disponíveis:', ...vocabulario().slice(0, 14)])
          }
          engine.tocarSfx('ok')
          break
        case 'desconhecido':
          engine.tocarSfx('estatica')
          setRajadaLog([`WARN: entrada não mapeada: "${comando.entrada}"`])
          setTremor(true)
          setTimeout(() => setTremor(false), MS_TREMOR)
          break
      }

      if (comando.resposta) responder(comando.resposta)
      setOrbeForcado(null)
      setConsoleTravado(false)
      if (!manterAberto) setConsoleAberto(false)
    },
    [avancar, voltar, engine, prepararForma, responder, sequencia],
  )

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
          case 'proximaForma':
            // Vindo de SEM_FORMA (-1), o +1 cai naturalmente na primeira da lista.
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
            setPainel(null)
            break
          // quiz, vf e pane entram na Fase 2.
          default:
            break
        }
      },
      [avancar, voltar, engine, formasDaCena],
    ),
    // Com o console aberto o input captura tudo: nenhuma tecla de navegação
    // pode disparar enquanto o operador digita.
    !consoleAberto,
  )

  // Toca a cena atual: sfx, áudio, legenda e avanço automático.
  useEffect(() => {
    if (!cena) return

    let cancelado = false
    setSinc({ duracaoMs: null, ativa: false })
    setFalando(false)
    // A primeira forma da cena entra sozinha ao abrir.
    setIndiceForma(cena.formas && cena.formas.length > 0 ? 0 : SEM_FORMA)
    setFormaForcada(null)
    setPainel(null)
    setResposta(null)

    if (cena.sfx) engine.tocarSfx(cena.sfx)

    const url = audioDaCena(cena)
    const fallbackMs = Math.max(
      MS_POR_LINHA_SEM_AUDIO,
      linhasDaCena(cena).length * MS_POR_LINHA_SEM_AUDIO,
    )

    const executar = async () => {
      const reproducao = url ? await engine.tocar(url) : null
      if (cancelado) return

      // A legenda só existe depois que sabemos a duração real: é ela que define
      // o ritmo das linhas. Sem mp3, cai no tempo estimado.
      const duracaoMs = reproducao?.tocou ? (reproducao.duracaoMs ?? fallbackMs) : fallbackMs
      setSinc({ duracaoMs, ativa: true })
      setFalando(true)
      // Sem mp3, o nível vem do envelope sintético: a cena toda ficaria parada
      // se o orbe e a legenda dependessem de um áudio que não existe.
      if (!reproducao?.tocou) engine.simularVoz(fallbackMs)

      // Pré-decodifica só a próxima cena, pra não encher a memória de buffers.
      const proxima = sequencia[indice + 1]
      if (proxima) void engine.preparar(audioDaCena(proxima))

      if (reproducao?.tocou) await reproducao.fim
      else await esperar(fallbackMs)
      if (cancelado) return

      setFalando(false)
      if (cena.avanco === 'auto') avancar()
    }

    void executar()

    return () => {
      cancelado = true
      engine.pararVoz()
    }
  }, [cena, indice, sequencia, engine, avancar])

  // Comandos roteirizados: a IA abre o console e digita sozinha.
  useEffect(() => {
    if (!cena?.comandos?.length) return
    const timers = cena.comandos.map((comando) =>
      setTimeout(() => {
        setConsoleAberto(true)
        setAutoComando(comando.texto)
      }, comando.atraso),
    )
    return () => timers.forEach(clearTimeout)
  }, [cena])

  // A resposta da IA sai de cena sozinha.
  useEffect(() => {
    if (!resposta) return
    const timer = setTimeout(() => setResposta(null), MS_RESPOSTA)
    return () => clearTimeout(timer)
  }, [resposta])

  const aoTerminarAuto = useCallback(() => setAutoComando(null), [])
  const aoFecharConsole = useCallback(() => setConsoleAberto(false), [])

  if (!cena) {
    return (
      <Hud rota="FIM" profundidade={0}>
        <p className="status">expedição encerrada</p>
      </Hud>
    )
  }

  const estadoOrbe = orbeForcado ?? estadoDoOrbe(cena, falando)
  // Só a apresentação escolhe: em "palco" o orbe é o cenário do que os alunos
  // estão falando; em "discreto" ele recua pro canto e a tela é deles.
  const modo = layoutDaCena(cena)

  return (
    <Hud
      rota={rotaDaCena(cena)}
      // Profundidade é decorativa: desce ao longo do roteiro.
      profundidade={120 + indice * 240}
      sonar={cena.tipo === 'transicao' ? 'VARRENDO' : 'ATIVO'}
      rodapeEsquerda={`turma ${roteiro.turma}`}
      rodapeDireita={`cena ${indice + 1}/${sequencia.length} · ${cena.id}`}
    >
      <div className={`palco palco--${modo}`}>
        <div className="palco__cena">
          {/* Fica montado a sessão inteira: se trocasse de lugar na árvore a
              cada cena, a animação reiniciaria a cada troca. */}
          <Orbe
            estado={estadoOrbe}
            lerNivel={lerNivel}
            forma={formaAtual}
            escala={escala}
            tremor={tremor}
            compacto={modo === 'canto'}
          />
          <div className="palco__texto">
            {conteudoDaCena(cena, sinc, modo, falando, lerNivel)}
          </div>
          {resposta && (
            <div className="palco__resposta">
              <Legenda
                key={resposta.chave}
                linhas={[resposta.texto]}
                duracaoTotalMs={MS_RESPOSTA * 0.6}
                ativa
                falando={false}
                lerNivel={lerNivel}
                cena={`resposta-${resposta.chave}`}
              />
            </div>
          )}
          {formasDaCena.length > 0 && (
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
          {painel && <Painel painel={painel} />}
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
          modo={modoDoLog(estadoOrbe)}
          apagado={modo !== 'central'}
          lerNivel={lerNivel}
          falando={falando}
          rajada={rajadaLog}
        />
      </div>
      {ajudaVisivel && <Ajuda cena={cena.id} forma={formaAtual} escala={escala} />}
    </Hud>
  )
}

function estadoDoOrbe(cena: Cena, falando: boolean): EstadoOrbe {
  switch (cena.tipo) {
    case 'pane':
      return 'pane'
    case 'quiz':
    case 'vf':
      return 'processando'
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

function conteudoDaCena(
  cena: Cena,
  sinc: { duracaoMs: number | null; ativa: boolean },
  layout: Layout,
  falando: boolean,
  lerNivel: () => number,
) {
  // O `key` por id garante que cada cena começa com estado limpo: sem ele, duas
  // falas seguidas reaproveitam o mesmo componente e a legenda herda a posicao
  // da cena anterior.
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
        />
      )
    default:
      // quiz, vf e pane chegam na Fase 2.
      return <p className="pendente">cena "{cena.tipo}" — a implementar (Fase 2)</p>
  }
}
