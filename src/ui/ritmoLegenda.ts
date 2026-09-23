/**
 * Ritmo da legenda. Fica num módulo próprio porque o Player também precisa:
 * é a legenda que decide quando a cena pode avançar, não só o áudio.
 */

/** Leitura em voz alta confortável, em caracteres por segundo. */
const CARACTERES_POR_SEGUNDO = 14
/** Nenhuma linha fica menos que isso na tela, por mais curta que seja. */
const MS_MINIMO_LINHA = 1800
/** Silêncio depois que a última palavra assentou, antes da próxima linha entrar. */
const MS_PAUSA_LINHA = 600
/** Materialização mais rápida que isso não é legível. */
const MS_MINIMO_REVELACAO = 300
/**
 * Peso somado a cada linha na distribuição proporcional, em "caracteres
 * equivalentes": representa a pausa que o TTS faz entre frases.
 */
const PESO_PAUSA_LINHA = 26
const PESO_PAUSA_PALAVRA = 1.6

export type LinhaPlanejada = {
  inicio: number
  duracao: number
  palavras: string[]
  tempos: number[]
  /**
   * Quando a VOZ desta linha acaba — que é diferente de quando a linha sai da
   * tela. O que há entre os dois é silêncio, e é só dentro desse silêncio que
   * uma linha pode ser segurada sem passar por cima da fala seguinte.
   */
  fimFala: number
}

const somar = (numeros: number[]) => numeros.reduce((a, b) => a + b, 0)

/** Tempo de leitura em voz alta de uma linha, sem a pausa. */
function msDeLeitura(linha: string): number {
  return (linha.length / CARACTERES_POR_SEGUNDO) * 1000
}

/** Quanto tempo a linha precisa ficar na tela, leitura + pausa. */
export function duracaoMinima(linha: string): number {
  return Math.max(MS_MINIMO_LINHA, msDeLeitura(linha)) + MS_PAUSA_LINHA
}

/** Offsets reais de cada linha dentro do mp3, vindos do tempos.json. */
export type TemposReais = Array<{ inicio: number; fim: number }>

/**
 * Monta a linha do tempo da legenda. Três modos, nesta ordem de preferência:
 *
 *  1. tempos reais — offsets medidos linha a linha no mp3 pelo gerar_audios.py.
 *     A legenda troca exatamente quando a voz troca;
 *  2. proporcional — reparte a duração do mp3 por número de caracteres, nunca
 *     abaixo do mínimo de leitura;
 *  3. mínimos — sem áudio nenhum, cada linha fica o tempo de ser lida em voz
 *     alta mais a pausa.
 */
export function planejar(
  linhas: string[],
  duracaoTotalMs: number | null,
  tempos?: TemposReais | null,
): LinhaPlanejada[] {
  const minimos = linhas.map(duracaoMinima)

  // Modo 1: offsets reais. Só vale se bater linha a linha com o roteiro —
  // um tempos.json defasado é pior que não ter nenhum.
  if (tempos && tempos.length === linhas.length) {
    return linhas.map((linha, indice) => {
      const inicio = tempos[indice].inicio
      const fimDaFala = tempos[indice].fim
      const proximo = tempos[indice + 1]?.inicio ?? (duracaoTotalMs ?? fimDaFala)
      const palavras = linha.split(/\s+/).filter(Boolean)
      const janela = Math.max(MS_MINIMO_REVELACAO, fimDaFala - inicio)
      const pesosPalavra = palavras.map((palavra) => palavra.length + PESO_PAUSA_PALAVRA)
      const pesoPalavras = somar(pesosPalavra) || 1

      let dentro = 0
      const temposPalavra = pesosPalavra.map((peso) => {
        const quando = inicio + dentro
        dentro += (janela * peso) / pesoPalavras
        return quando
      })

      return {
        inicio,
        duracao: Math.max(proximo - inicio, janela),
        palavras,
        tempos: temposPalavra,
        fimFala: fimDaFala,
      }
    })
  }

  let duracoes: number[]
  if (duracaoTotalMs === null) {
    duracoes = minimos
  } else {
    const pesos = linhas.map((linha) => linha.length + PESO_PAUSA_LINHA)
    const pesoTotal = somar(pesos) || 1
    duracoes = linhas.map((_, i) =>
      Math.max(minimos[i], (duracaoTotalMs * pesos[i]) / pesoTotal),
    )
  }

  let acumulado = 0
  return linhas.map((linha, indice) => {
    const duracao = duracoes[indice]
    const inicio = acumulado
    acumulado += duracao

    const palavras = linha.split(/\s+/).filter(Boolean)
    // As palavras se materializam no tempo de leitura da frase; o resto da
    // duração é a linha parada, sendo lida.
    const janela = Math.min(
      duracao - MS_PAUSA_LINHA,
      Math.max(MS_MINIMO_REVELACAO, msDeLeitura(linha)),
    )
    const pesosPalavra = palavras.map((palavra) => palavra.length + PESO_PAUSA_PALAVRA)
    const pesoPalavras = somar(pesosPalavra) || 1

    let dentro = 0
    const tempos = pesosPalavra.map((peso) => {
      const quando = inicio + dentro
      dentro += (janela * peso) / pesoPalavras
      return quando
    })

    return { inicio, duracao, palavras, tempos, fimFala: inicio + janela }
  })
}

/** Quanto tempo a legenda inteira leva, do zero ao fim da última linha. */
export function duracaoDoPlano(plano: LinhaPlanejada[]): number {
  if (plano.length === 0) return 0
  const ultima = plano[plano.length - 1]
  // Com tempos reais as linhas não começam no fim da anterior, então somar as
  // durações daria um total errado: o que vale é onde a última termina.
  return Math.max(ultima.inicio + ultima.duracao, somar(plano.map((l) => l.duracao)))
}

/** Atalho: duração da legenda dessas linhas com (ou sem) áudio. */
export function duracaoDaLegenda(
  linhas: string[],
  duracaoTotalMs: number | null,
  tempos?: TemposReais | null,
): number {
  return duracaoDoPlano(planejar(linhas, duracaoTotalMs, tempos))
}
