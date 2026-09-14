import { useEffect, useMemo, useState } from 'react'

type Props = {
  linhas: string[]
  /** Duração total do mp3 da cena. Sem áudio, o Player manda o tempo estimado. */
  duracaoTotalMs: number | null
  /** Só começa a contar quando o áudio realmente arrancou. */
  ativa: boolean
}

/**
 * Peso fixo somado a cada linha, em "caracteres equivalentes". Representa a
 * pausa que o TTS faz entre frases — sem isso as linhas curtas passam voando.
 */
const PESO_PAUSA_LINHA = 26
const PESO_PAUSA_PALAVRA = 1.6
/** Usado quando não há mp3: casa com o fallback do Player (2,5 s por linha). */
const MS_POR_LINHA_SEM_AUDIO = 2500
const INTERVALO_TICK = 50

type LinhaPlanejada = { inicio: number; palavras: string[]; tempos: number[] }

const somar = (numeros: number[]) => numeros.reduce((a, b) => a + b, 0)

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

/**
 * Uma linha por vez, grande, embaixo do orbe. As anteriores não ficam na tela —
 * a plateia lê a frase atual de longe, não um bloco de texto.
 */
export function Legenda({ linhas, duracaoTotalMs, ativa }: Props) {
  const plano = useMemo(() => planejar(linhas, duracaoTotalMs), [linhas, duracaoTotalMs])
  const [posicao, setPosicao] = useState({ linha: 0, palavras: 0 })

  useEffect(() => {
    if (!ativa) {
      setPosicao({ linha: 0, palavras: 0 })
      return
    }

    const inicio = performance.now()
    const tick = () => {
      const decorrido = performance.now() - inicio

      let linha = 0
      for (let i = 0; i < plano.length; i++) {
        if (plano[i].inicio <= decorrido) linha = i
      }
      let palavras = 0
      for (const quando of plano[linha].tempos) {
        if (quando <= decorrido) palavras++
      }

      setPosicao((atual) =>
        atual.linha === linha && atual.palavras === palavras ? atual : { linha, palavras },
      )
    }

    tick()
    const timer = setInterval(tick, INTERVALO_TICK)
    return () => clearInterval(timer)
  }, [plano, ativa])

  if (!ativa || plano.length === 0) return <p className="legenda" />

  // O reset de `posicao` mora num efeito, que só roda depois do render. Numa
  // troca de cena o render anterior chega aqui com o indice antigo e um plano
  // novo, possivelmente mais curto — daí o clamp.
  const indiceLinha = Math.min(posicao.linha, plano.length - 1)
  const atual = plano[indiceLinha]
  const visivel = atual.palavras.slice(0, Math.max(1, posicao.palavras)).join(' ')

  return (
    <p className="legenda">
      {visivel}
      <span className="legenda__contador">
        {indiceLinha + 1}/{plano.length}
      </span>
    </p>
  )
}
