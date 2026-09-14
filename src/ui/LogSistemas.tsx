import { useEffect, useRef } from 'react'
import { sortearErro, sortearGenerico, type EntradaLog } from './logPool'

export type ModoLog = 'normal' | 'rapido' | 'erro'

type Props = {
  /** Linhas da cena atual (campo `log` do JSON), intercaladas com as genéricas. */
  especificas?: string[]
  modo?: ModoLog
  /** Nas apresentações o painel recua pra não competir com os alunos. */
  apagado?: boolean
  /** Alimenta a sparkline enquanto a IA fala. */
  lerNivel?: () => number
  falando?: boolean
  /**
   * Linhas pra emitir em rajada, na frente da fila. Trocar a identidade do
   * array dispara a rajada — é assim que o console mostra o sistema "pensando".
   */
  rajada?: string[] | null
  /** Para tudo: na pane o log congela junto com o resto da tela. */
  congelado?: boolean
}

const MAX_LINHAS = 18
/** Ritmo de cada modo, em ms. Sorteado dentro da faixa a cada linha. */
const RITMOS: Record<ModoLog, [number, number]> = {
  normal: [800, 2500],
  rapido: [150, 400],
  erro: [150, 400],
}
const CHANCE_ESPECIFICA = 0.45
/** Digitação de uma linha inteira, em ms. A velocidade sai disso dividido pelo tamanho. */
const MS_DIGITACAO = [150, 300] as const
/** De tempos em tempos o log acelera: log de verdade não é métrico. */
const INTERVALO_RAJADA = [10000, 20000] as const
const LINHAS_POR_RAJADA = [3, 5] as const
const MS_ENTRE_RAJADA = 110
const AMOSTRAS_SPARKLINE = 90
const BLOCOS_BARRA = 6

const sorteio = (min: number, max: number) => min + Math.random() * (max - min)

type Progresso = { atual: number; alvo: number; inicio: number; duracao: number }
type Valor = {
  atual: number
  alvo: number
  congelaEm: number
  unidade: string
  casas: number
}

type LinhaViva = {
  el: HTMLLIElement
  elTexto: HTMLSpanElement
  elSufixo: HTMLSpanElement
  elCursor: HTMLSpanElement
  prefixo: string
  digitados: number
  msPorChar: number
  inicio: number
  concluida: boolean
  progresso?: Progresso
  valor?: Valor
}

/** Classe de destaque inferida do texto final. */
function destaqueDe(texto: string): string | null {
  if (/^ERR/.test(texto)) return 'log__linha--err'
  if (/^WARN/.test(texto)) return 'log__linha--warn'
  if (/\bOK\b|conclu[ií]d/i.test(texto)) return 'log__linha--ok'
  return null
}

function barra(fracao: number): string {
  const cheios = Math.round(fracao * BLOCOS_BARRA)
  return '▰'.repeat(cheios) + '▱'.repeat(BLOCOS_BARRA - cheios)
}

const horaEm = (deslocamentoMs = 0) =>
  new Date(Date.now() + deslocamentoMs).toLocaleTimeString('pt-BR', { hour12: false })

/**
 * Painel cenográfico. Nada aqui reflete estado real do sistema.
 *
 * O DOM das linhas é manipulado direto, fora do React: com digitação, barra de
 * progresso e leitura oscilando, virar estado do React seria um re-render da
 * lista inteira a 60 fps. Um único requestAnimationFrame cuida de tudo.
 */
export function LogSistemas({
  especificas,
  modo = 'normal',
  apagado = false,
  lerNivel,
  falando = false,
  rajada,
  congelado = false,
}: Props) {
  const refLista = useRef<HTMLOListElement>(null)
  const refContador = useRef<HTMLSpanElement>(null)
  const refSparkline = useRef<HTMLCanvasElement>(null)
  const refFila = useRef<string[]>([])
  const refModo = useRef(modo)
  const refNivel = useRef(lerNivel)
  const refFalando = useRef(falando)
  const refCongelado = useRef(congelado)
  const refPrioritarias = useRef<string[]>([])
  const refUltimaRajada = useRef<string[] | null | undefined>(null)
  refModo.current = modo
  refNivel.current = lerNivel
  refFalando.current = falando
  refCongelado.current = congelado

  // Cada cena traz sua própria fila de linhas específicas.
  useEffect(() => {
    refFila.current = especificas ? [...especificas] : []
  }, [especificas])

  // Rajada do console entra na frente da fila normal.
  useEffect(() => {
    if (rajada && rajada !== refUltimaRajada.current) {
      refPrioritarias.current.push(...rajada)
    }
    refUltimaRajada.current = rajada
  }, [rajada])

  useEffect(() => {
    const lista = refLista.current
    const canvas = refSparkline.current
    if (!lista || !canvas) return
    const ctxSpark = canvas.getContext('2d')

    const vivas: LinhaViva[] = []
    let contador = 400 + Math.floor(Math.random() * 200)
    const amostras = new Float32Array(AMOSTRAS_SPARKLINE)
    let ruido = 0.25
    let quadroSpark = 0

    /** Monta o <li> e devolve o registro que o tick vai animar. */
    const criarLinha = (
      prefixo: string,
      extras: { progresso?: Progresso; valor?: Valor; textoCompleto?: string },
      agora: number,
    ): LinhaViva => {
      const el = document.createElement('li')
      el.className = 'log__linha'

      const hora = document.createElement('span')
      hora.className = 'log__hora'
      hora.textContent = `[${horaEm()}]`

      const elTexto = document.createElement('span')
      const elSufixo = document.createElement('span')
      elSufixo.className = 'log__sufixo'
      const elCursor = document.createElement('span')
      elCursor.className = 'log__cursor'

      el.append(hora, document.createTextNode(' '), elTexto, elSufixo, elCursor)
      lista.append(el)

      // Anima a altura de 0 até a natural: sem isso as linhas antigas sobem
      // de pulo em vez de deslizar.
      const altura = el.scrollHeight
      el.style.height = '0px'
      void el.offsetHeight
      el.style.height = `${altura}px`
      setTimeout(() => {
        el.style.height = ''
      }, 260)

      const total = sorteio(MS_DIGITACAO[0], MS_DIGITACAO[1])
      return {
        el,
        elTexto,
        elSufixo,
        elCursor,
        prefixo,
        digitados: 0,
        msPorChar: total / Math.max(1, prefixo.length),
        inicio: agora,
        concluida: false,
        progresso: extras.progresso,
        valor: extras.valor,
      }
    }

    const emitirTexto = (texto: string, agora: number) => {
      vivas.push(criarLinha(texto, {}, agora))
    }

    const emitirEntrada = (entrada: EntradaLog, agora: number) => {
      switch (entrada.tipo) {
        case 'texto':
          emitirTexto(entrada.gerar(), agora)
          break
        case 'progresso':
          vivas.push(
            criarLinha(
              `${entrada.rotulo}...`,
              {
                progresso: {
                  atual: 0,
                  alvo: sorteio(42, 100),
                  inicio: agora,
                  duracao: sorteio(1000, 3000),
                },
              },
              agora,
            ),
          )
          break
        case 'valor': {
          const alvo = sorteio(entrada.faixa[0], entrada.faixa[1])
          vivas.push(
            criarLinha(
              `${entrada.rotulo}:`,
              {
                valor: {
                  atual: alvo,
                  alvo,
                  // Continua oscilando alguns segundos e depois congela.
                  congelaEm: agora + sorteio(3000, 6000),
                  unidade: entrada.unidade,
                  casas: entrada.casas,
                },
              },
              agora,
            ),
          )
          break
        }
      }
    }

    const proximaLinha = (agora: number) => {
      const modoAtual = refModo.current

      const prioritaria = refPrioritarias.current.shift()
      if (prioritaria) return emitirTexto(prioritaria, agora)

      const usarEspecifica =
        refFila.current.length > 0 && modoAtual !== 'erro' && Math.random() < CHANCE_ESPECIFICA
      if (usarEspecifica) return emitirTexto(refFila.current.shift()!, agora)

      emitirEntrada(modoAtual === 'erro' ? sortearErro() : sortearGenerico(), agora)
    }

    let agora = performance.now()
    let proximaEm = agora + 400
    let proximaRajadaEm = agora + sorteio(INTERVALO_RAJADA[0], INTERVALO_RAJADA[1])
    let restamNaRajada = 0

    const agendar = (tempo: number) => {
      if (refPrioritarias.current.length > 0) return tempo + MS_ENTRE_RAJADA
      if (restamNaRajada > 0) {
        restamNaRajada--
        return tempo + MS_ENTRE_RAJADA
      }
      if (tempo > proximaRajadaEm) {
        restamNaRajada = Math.floor(sorteio(LINHAS_POR_RAJADA[0], LINHAS_POR_RAJADA[1]))
        proximaRajadaEm = tempo + sorteio(INTERVALO_RAJADA[0], INTERVALO_RAJADA[1])
        return tempo + MS_ENTRE_RAJADA
      }
      const [min, max] = RITMOS[refModo.current]
      return tempo + sorteio(min, max)
    }

    let quadro = 0
    let anteriorCongelado = 0
    const tick = (tempo: number) => {
      quadro = requestAnimationFrame(tick)
      if (refCongelado.current) {
        // Congelado: nem emite, nem digita, nem redesenha. A tela inteira para.
        anteriorCongelado = tempo
        return
      }
      // Ao descongelar, o tempo parado não pode virar uma enxurrada de linhas.
      if (anteriorCongelado) {
        const parado = tempo - anteriorCongelado
        proximaEm += parado
        for (const linha of vivas) linha.inicio += parado
        anteriorCongelado = 0
      }
      agora = tempo

      if (tempo >= proximaEm) {
        proximaLinha(tempo)
        contador++
        if (refContador.current) {
          refContador.current.textContent = String(contador).padStart(4, '0')
        }
        while (vivas.length > MAX_LINHAS) vivas.shift()!.el.remove()
        proximaEm = agendar(tempo)
      }

      for (const linha of vivas) {
        // 1) digitação
        if (linha.digitados < linha.prefixo.length) {
          const alvo = Math.min(
            linha.prefixo.length,
            Math.floor((tempo - linha.inicio) / linha.msPorChar),
          )
          if (alvo !== linha.digitados) {
            linha.digitados = alvo
            linha.elTexto.textContent = linha.prefixo.slice(0, alvo)
          }
          continue
        }

        if (!linha.concluida) {
          linha.concluida = true
          linha.elTexto.textContent = linha.prefixo
          linha.elCursor.remove()
          const classe = destaqueDe(linha.prefixo)
          if (classe) linha.el.classList.add(classe)
        }

        // 2) progresso sobe até o alvo
        if (linha.progresso) {
          const p = linha.progresso
          const avanco = Math.min(1, (tempo - p.inicio) / p.duracao)
          const valor = p.alvo * avanco
          linha.elSufixo.textContent = ` ${valor.toFixed(0)} % ${barra(avanco)}`
          if (avanco >= 1) {
            linha.elSufixo.textContent = ` ${p.alvo.toFixed(0)} % ${barra(1)}`
            linha.progresso = undefined
          }
        }

        // 3) leitura oscila e depois congela
        if (linha.valor) {
          const v = linha.valor
          if (tempo > v.congelaEm) {
            linha.valor = undefined
          } else {
            if (Math.random() < 0.04) {
              const amplitude = Math.max(0.3, Math.abs(v.alvo) * 0.01)
              v.alvo += (Math.random() - 0.5) * amplitude * 2
            }
            v.atual += (v.alvo - v.atual) * 0.12
          }
          linha.elSufixo.textContent = ` ${v.atual.toFixed(v.casas)}${
            v.unidade ? ' ' + v.unidade : ''
          }`
        }
      }

      // 4) sparkline — redesenhada em quadros alternados, é enfeite
      amostras.copyWithin(0, 1)
      const nivel = refFalando.current ? (refNivel.current?.() ?? 0) : 0
      ruido += (sorteio(0.12, 0.42) - ruido) * 0.02
      amostras[AMOSTRAS_SPARKLINE - 1] = refFalando.current ? nivel : ruido

      if (ctxSpark && (quadroSpark++ & 1) === 0) {
        const l = canvas.width
        const h = canvas.height
        ctxSpark.clearRect(0, 0, l, h)
        ctxSpark.beginPath()
        for (let i = 0; i < AMOSTRAS_SPARKLINE; i++) {
          const x = (i / (AMOSTRAS_SPARKLINE - 1)) * l
          const y = h - 1 - amostras[i] * (h - 2)
          if (i === 0) ctxSpark.moveTo(x, y)
          else ctxSpark.lineTo(x, y)
        }
        ctxSpark.strokeStyle =
          refModo.current === 'erro' ? 'rgba(255,77,94,0.8)' : 'rgba(56,232,255,0.8)'
        ctxSpark.lineWidth = 1
        ctxSpark.stroke()
      }
    }

    const ajustarCanvas = () => {
      const caixa = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(caixa.width))
      canvas.height = Math.max(1, Math.round(caixa.height))
    }
    ajustarCanvas()
    const observador = new ResizeObserver(ajustarCanvas)
    observador.observe(canvas)

    // Semeia o painel: nascendo vazio ele leva uns 15 s pra encher e parece defeito.
    for (let i = 0; i < 7; i++) {
      // Só entradas de texto puro: uma linha de "valor" semeada sem o número
      // apareceria como "Luminosidade ambiente..." e nada mais.
      let entrada = sortearGenerico()
      for (let tentativa = 0; entrada.tipo !== 'texto' && tentativa < 12; tentativa++) {
        entrada = sortearGenerico()
      }
      if (entrada.tipo !== 'texto') continue
      const linha = criarLinha(entrada.gerar(), {}, agora - 5000)
      linha.digitados = linha.prefixo.length
      linha.elTexto.textContent = linha.prefixo
      linha.concluida = true
      linha.elCursor.remove()
      linha.el.style.height = ''
      vivas.push(linha)
      contador++
    }

    quadro = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
      lista.replaceChildren()
    }
  }, [])

  const classes = ['log', apagado && 'log--apagado', modo === 'erro' && 'log--erro']
    .filter(Boolean)
    .join(' ')

  return (
    <aside className={classes} aria-hidden="true">
      <div className="log__cabecalho">
        <h2 className="log__titulo">log de sistemas</h2>
        <span className="log__rec">● rec</span>
        <span className="log__contador" ref={refContador}>
          0000
        </span>
      </div>
      <div className="log__telemetria">
        <span className="log__rotulo-spark">telemetria</span>
        <canvas className="log__spark" ref={refSparkline} />
      </div>
      <ol className="log__lista" ref={refLista} />
    </aside>
  )
}
