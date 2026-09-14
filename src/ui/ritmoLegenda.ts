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

/**
 * Monta a linha do tempo da legenda.
 *
 * Sem duração de áudio, cada linha recebe o próprio mínimo. Com áudio, a
 * duração real é repartida proporcional a caracteres — mas nunca abaixo do
 * mínimo: se o mp3 for mais curto que a soma dos mínimos, quem dita o ritmo é
 * a legenda, e a cena espera por ela.
 */
export function planejar(linhas: string[], duracaoTotalMs: number | null): LinhaPlanejada[] {
  const minimos = linhas.map(duracaoMinima)

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

    return { inicio, duracao, palavras, tempos }
  })
}

/** Quanto tempo a legenda inteira leva. */
export function duracaoDoPlano(plano: LinhaPlanejada[]): number {
  return somar(plano.map((linha) => linha.duracao))
}

/** Atalho: duração da legenda dessas linhas com (ou sem) áudio. */
export function duracaoDaLegenda(linhas: string[], duracaoTotalMs: number | null): number {
  return duracaoDoPlano(planejar(linhas, duracaoTotalMs))
}
