import { useEffect, useMemo, useRef } from 'react'

type Props = {
  linhas: string[]
  /** Duração total do mp3 da cena. Sem áudio, o Player manda o tempo estimado. */
  duracaoTotalMs: number | null
  /** Só começa a contar quando o áudio realmente arrancou. */
  ativa: boolean
  /** Cursor piscando e brilho reativo só enquanto a IA fala. */
  falando?: boolean
  /** Lido dentro do rAF da própria legenda, sem virar estado do React. */
  lerNivel?: () => number
  /** Dispara o glitch de entrada. Trocar o valor = nova cena. */
  cena?: string
}

/**
 * Peso fixo somado a cada linha, em "caracteres equivalentes". Representa a
 * pausa que o TTS faz entre frases — sem isso as linhas curtas passam voando.
 */
const PESO_PAUSA_LINHA = 26
const PESO_PAUSA_PALAVRA = 1.6
/** Usado quando não há mp3: casa com o fallback do Player (2,5 s por linha). */
const MS_POR_LINHA_SEM_AUDIO = 2500
/** Cada palavra passa por caracteres aleatórios antes de assentar no texto real. */
const MS_DECODIFICANDO = 80
const MS_GLITCH = 200
const SUJEIRA = '▓▒░#%&@/\\|=+*<>ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

type LinhaPlanejada = { inicio: number; palavras: string[]; tempos: number[] }

const somar = (numeros: number[]) => numeros.reduce((a, b) => a + b, 0)

const sujeira = (tamanho: number) =>
  Array.from({ length: tamanho }, () => SUJEIRA[(Math.random() * SUJEIRA.length) | 0]).join('')

/**
 * Reparte a duração do áudio entre as linhas e, dentro de cada linha, entre as
 * palavras — tudo proporcional ao número de caracteres. O TTS tem ritmo estável,
 * então isso fica perto o bastante sem precisar de marcação por palavra.
 */
function planejar(linhas: string[], duracaoTotalMs: number | null): LinhaPlanejada[] {
  const total = duracaoTotalMs ?? linhas.length * MS_POR_LINHA_SEM_AUDIO
  const pesos = linhas.map((linha) => linha.length + PESO_PAUSA_LINHA)
  const pesoTotal = somar(pesos) || 1

  let acumulado = 0
  return linhas.map((linha, indice) => {
    const duracao = (total * pesos[indice]) / pesoTotal
    const inicio = acumulado
    acumulado += duracao

    const palavras = linha.split(/\s+/).filter(Boolean)
    const pesosPalavra = palavras.map((palavra) => palavra.length + PESO_PAUSA_PALAVRA)
    const pesoPalavras = somar(pesosPalavra) || 1

    let dentro = 0
    const tempos = pesosPalavra.map((peso) => {
      const quando = inicio + dentro
      dentro += (duracao * peso) / pesoPalavras
      return quando
    })

    return { inicio, palavras, tempos }
  })
}

type PalavraViva = { el: HTMLSpanElement; texto: string; revelada: number; pronta: boolean }

/**
 * Uma linha por vez, grande, embaixo do orbe. A anterior sai por cima enquanto
 * a nova entra por baixo — a plateia lê a frase atual de longe, não um bloco.
 *
 * O DOM das palavras é montado à mão: revelar palavra a palavra por estado do
 * React seria um render da árvore a cada 200 ms, e o brilho reativo, um render
 * por quadro. Aqui um único requestAnimationFrame cuida de tudo.
 */
export function Legenda({
  linhas,
  duracaoTotalMs,
  ativa,
  falando = false,
  lerNivel,
  cena,
}: Props) {
  const plano = useMemo(() => planejar(linhas, duracaoTotalMs), [linhas, duracaoTotalMs])
  const refCaixa = useRef<HTMLDivElement>(null)
  const refContador = useRef<HTMLSpanElement>(null)
  const refFalando = useRef(falando)
  const refNivel = useRef(lerNivel)
  refFalando.current = falando
  refNivel.current = lerNivel

  useEffect(() => {
    const caixa = refCaixa.current
    if (!caixa || !ativa || plano.length === 0) return

    let quadro = 0
    let linhaAtual = -1
    let elLinha: HTMLDivElement | null = null
    let palavras: PalavraViva[] = []
    let brilho = 0
    const inicio = performance.now()

    /** Tira a linha antiga de cena: sobe, encolhe e some. */
    const removerLinha = (el: HTMLDivElement) => {
      el.classList.add('legenda__linha--saindo')
      setTimeout(() => el.remove(), 260)
    }

    const montarLinha = (indice: number, comGlitch: boolean) => {
      if (elLinha) removerLinha(elLinha)

      const el = document.createElement('div')
      el.className = 'legenda__linha legenda__linha--entrando'
      if (comGlitch) el.classList.add('legenda__linha--glitch')

      palavras = plano[indice].palavras.map((texto) => {
        const span = document.createElement('span')
        span.className = 'legenda__palavra'
        el.append(span, document.createTextNode(' '))
        return { el: span, texto, revelada: 0, pronta: false }
      })

      const cursor = document.createElement('span')
      cursor.className = 'legenda__cursor'
      el.append(cursor)

      caixa.append(el)
      elLinha = el
      linhaAtual = indice

      if (comGlitch) {
        setTimeout(() => el.classList.remove('legenda__linha--glitch'), MS_GLITCH)
      }
    }

    const tick = (tempo: number) => {
      quadro = requestAnimationFrame(tick)
      const decorrido = tempo - inicio

      // 1) linha da vez
      let alvo = 0
      for (let i = 0; i < plano.length; i++) {
        if (plano[i].inicio <= decorrido) alvo = i
      }
      if (alvo !== linhaAtual) {
        montarLinha(alvo, linhaAtual === -1)
        if (refContador.current) {
          refContador.current.textContent = `${alvo + 1}/${plano.length}`
        }
      }

      // 2) palavras materializando, com uns milissegundos de "decifrando"
      const tempos = plano[linhaAtual].tempos
      for (let i = 0; i < palavras.length; i++) {
        const palavra = palavras[i]
        if (palavra.pronta) continue

        if (!palavra.revelada) {
          if (decorrido < tempos[i]) continue
          palavra.revelada = tempo
          palavra.el.classList.add('legenda__palavra--visivel')
        }

        if (tempo - palavra.revelada < MS_DECODIFICANDO) {
          palavra.el.textContent = sujeira(palavra.texto.length)
        } else {
          palavra.el.textContent = palavra.texto
          palavra.pronta = true
        }
      }

      // 3) brilho acompanha a voz
      const nivelAlvo = refFalando.current ? (refNivel.current?.() ?? 0) : 0
      brilho += (nivelAlvo - brilho) * 0.12
      caixa.style.setProperty('--brilho', brilho.toFixed(3))
      caixa.classList.toggle('legenda--falando', refFalando.current)
    }

    quadro = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(quadro)
      caixa.replaceChildren()
      caixa.style.removeProperty('--brilho')
    }
    // `cena` entra nas dependências pra o glitch de entrada rodar de novo a
    // cada cena, mesmo que o plano por acaso seja igual.
  }, [plano, ativa, cena])

  return (
    <div className="legenda__caixa">
      <div className="legenda" ref={refCaixa}>
        {!ativa && <div className="legenda__linha" />}
      </div>
      <span className="legenda__contador" ref={refContador} />
    </div>
  )
}
