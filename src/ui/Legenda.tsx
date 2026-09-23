import { useEffect, useMemo, useRef } from 'react'
import type { EnfaseLinha } from '../roteiros/tipos'
import { planejar, type TemposReais } from './ritmoLegenda'

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
  /** Offsets reais medidos no mp3. Quando existem, mandam no ritmo. */
  tempos?: TemposReais | null
  /**
   * Linha que a voz do navegador está dizendo AGORA. Quando vem preenchida,
   * ela manda em tudo: a legenda troca junto com a fala, não por relógio.
   */
  linhaGuiada?: number | null
  /**
   * Até que caractere da linha a voz do navegador já chegou.
   *
   * Quando vem preenchido, ele manda na revelação das palavras: elas aparecem
   * no instante em que são ditas, em vez de num ritmo estimado. `null` quando
   * o motor de voz não avisa (nem todos avisam), e aí vale a estimativa.
   */
  charGuiado?: number | null
  /**
   * Destaque por linha, na mesma ordem de `linhas`. Serve pras falas em que o
   * texto É o acontecimento.
   */
  enfases?: Array<EnfaseLinha | null> | null
}

/** Cada palavra passa por caracteres aleatórios antes de assentar no texto real. */
const MS_DECODIFICANDO = 80
const MS_GLITCH = 200
const SUJEIRA = '▓▒░#%&@/\\|=+*<>ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const sujeira = (tamanho: number) =>
  Array.from({ length: tamanho }, () => SUJEIRA[(Math.random() * SUJEIRA.length) | 0]).join('')

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
  tempos,
  linhaGuiada,
  charGuiado,
  enfases,
}: Props) {
  const plano = useMemo(
    () => planejar(linhas, duracaoTotalMs, tempos),
    [linhas, duracaoTotalMs, tempos],
  )
  const refCaixa = useRef<HTMLDivElement>(null)
  const refContador = useRef<HTMLSpanElement>(null)
  const refFalando = useRef(falando)
  const refNivel = useRef(lerNivel)
  const refGuiada = useRef(linhaGuiada)
  const refChar = useRef(charGuiado)
  refChar.current = charGuiado
  const refEnfases = useRef(enfases)
  refEnfases.current = enfases
  refFalando.current = falando
  refNivel.current = lerNivel
  refGuiada.current = linhaGuiada

  useEffect(() => {
    const caixa = refCaixa.current
    if (!caixa || !ativa || plano.length === 0) return

    let quadro = 0
    let linhaAtual = -1
    let elLinha: HTMLDivElement | null = null
    /** Tudo que este efeito pendurou no container, pra tirar só isso na saída. */
    const criados = new Set<HTMLElement>()
    let palavras: PalavraViva[] = []
    let brilho = 0
    const inicio = performance.now()

    /** Tira a linha antiga de cena: sobe, encolhe e some. */
    const removerLinha = (el: HTMLDivElement) => {
      el.classList.add('legenda__linha--saindo')
      setTimeout(() => {
        criados.delete(el)
        el.remove()
      }, 260)
    }

    /** Quando a linha atual entrou, pra revelar as palavras no modo guiado. */
    let inicioLinha = 0
    /** Fração do tempo da linha em que cada palavra aparece. */
    let fracoes: number[] = []
    /** A linha atual pediu pra não ser decifrada letra a letra. */
    let semDecifrar = false
    /** Caractere em que cada palavra da linha atual começa. */
    let inicios: number[] = []

    const montarLinha = (indice: number, comGlitch: boolean) => {
      if (elLinha) removerLinha(elLinha)

      const enfase = refEnfases.current?.[indice] ?? null
      // `glitch: false` desliga TUDO que decifra: a classe de entrada e a
      // sujeira palavra a palavra. Um nome que a IA acabou de encontrar não
      // pode chegar tremendo — a linha inteira é o achado.
      const decifrando = enfase?.glitch !== false
      const el = document.createElement('div')
      el.className = 'legenda__linha legenda__linha--entrando'
      if (comGlitch && decifrando) el.classList.add('legenda__linha--glitch')
      // Em `em`, então é fração do tamanho que o CSS já deu à legenda.
      if (enfase?.escala) el.style.fontSize = `${enfase.escala}em`

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
      criados.add(el)
      elLinha = el
      linhaAtual = indice
      inicioLinha = performance.now()

      // Onde cada palavra começa, em caracteres. É com isto que o aviso de
      // `boundary` da voz do navegador (que vem em charIndex) vira "revele até
      // aqui".
      let andado = 0
      inicios = plano[indice].palavras.map((p) => {
        const onde = andado
        andado += p.length + 1
        return onde
      })

      // No modo guiado sem `boundary` não há linha do tempo: as palavras se
      // distribuem pelo tamanho delas dentro da estimativa de duração da frase.
      const pesos = plano[indice].palavras.map((p) => p.length + 1.6)
      const total = pesos.reduce((a, b) => a + b, 0) || 1
      let acumulado = 0
      fracoes = pesos.map((peso) => {
        const inicio = acumulado / total
        acumulado += peso
        return inicio
      })

      semDecifrar = !decifrando

      if (comGlitch && decifrando) {
        setTimeout(() => el.classList.remove('legenda__linha--glitch'), MS_GLITCH)
      }
    }

    const tick = (tempo: number) => {
      quadro = requestAnimationFrame(tick)
      const decorrido = tempo - inicio

      // 1) linha da vez — a voz manda, se estiver guiando
      const guiada = refGuiada.current
      let alvo = 0
      if (guiada !== null && guiada !== undefined) {
        alvo = Math.max(0, Math.min(guiada, plano.length - 1))
      } else {
        for (let i = 0; i < plano.length; i++) {
          if (plano[i].inicio <= decorrido) alvo = i
        }
      }
      if (alvo !== linhaAtual) {
        montarLinha(alvo, linhaAtual === -1)
        if (refContador.current) {
          refContador.current.textContent = `${alvo + 1}/${plano.length}`
        }
      }

      // 2) palavras materializando, com uns milissegundos de "decifrando"
      const tempos = plano[linhaAtual].tempos
      // No modo guiado a janela é estimada pelo tamanho da frase; no modo por
      // relógio ela vem do plano.
      const janelaGuiada = Math.max(700, plano[linhaAtual].palavras.join(' ').length * 82)
      const naLinha = tempo - inicioLinha
      for (let i = 0; i < palavras.length; i++) {
        const palavra = palavras[i]
        if (palavra.pronta) continue

        if (!palavra.revelada) {
          let pronto: boolean
          if (guiada !== null && guiada !== undefined) {
            const ate = refChar.current
            pronto =
              ate !== null && ate !== undefined
                ? // A voz avisou onde está: revela tudo até ali. O `+ 1` cobre
                  // a palavra que ESTÁ sendo dita — o aviso chega no começo
                  // dela, e escondê-la até acabar seria o atraso de novo.
                  (inicios[i] ?? 0) <= ate + 1
                : naLinha >= (fracoes[i] ?? 0) * janelaGuiada
          } else {
            pronto = decorrido >= tempos[i]
          }
          if (!pronto) continue
          palavra.revelada = tempo
          palavra.el.classList.add('legenda__palavra--visivel')
        }

        if (!semDecifrar && tempo - palavra.revelada < MS_DECODIFICANDO) {
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
      // Remove só os nós deste efeito. `replaceChildren()` levaria junto
      // qualquer coisa que o React tenha posto ali no meio-tempo.
      for (const el of criados) el.remove()
      criados.clear()
      caixa.style.removeProperty('--brilho')
    }
    // `cena` entra nas dependências pra o glitch de entrada rodar de novo a
    // cada cena, mesmo que o plano por acaso seja igual.
  }, [plano, ativa, cena])

  // O <div class="legenda"> é território do efeito abaixo, que monta e remove
  // as linhas na mão. Ele NÃO pode ter filho vindo do React: os dois brigariam
  // pelo mesmo nó e o React estouraria com "removeChild is not a child".
  // A altura vazia fica por conta do min-height no CSS.
  return (
    <div className="legenda__caixa">
      <div className="legenda" ref={refCaixa} />
      <span className="legenda__contador" ref={refContador} />
    </div>
  )
}
