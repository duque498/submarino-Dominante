/**
 * Sequência de mergulho.
 *
 * Trocar de profundidade era um número mudando no HUD. Vira uma transição com
 * peso: o submarino inclina, a água passa, o casco estala, e a cor do mundo
 * escurece junto. É o que transforma "próxima cena" em "estamos descendo".
 *
 * Este módulo é só a LINHA DO TEMPO, e de propósito é uma função pura do tempo
 * decorrido. Quem pinta é o Player; quem cancela é a seta direita. Sem estado
 * escondido aqui dentro, cancelar é parar de chamar — não há nada pra desfazer.
 */

export type FaseMergulho = 'aviso' | 'inclinacao' | 'descida' | 'estabilizacao' | 'fim'

export type PlanoMergulho = {
  de: number
  para: number
  subindo: boolean
  msAviso: number
  msInclinacao: number
  msDescida: number
  msEstabilizacao: number
  total: number
}

export type QuadroMergulho = {
  fase: FaseMergulho
  /** 0 a 1 dentro da fase atual. */
  naFase: number
  /** 0 a 1 do percurso inteiro. */
  avanco: number
  /** Profundidade neste instante, em metros. */
  profundidade: number
  /**
   * Inclinação, -1 a 1 (com um pouco de folga no overshoot). Positivo = proa
   * pra baixo. É este número que desloca a janela do mundo nas câmeras.
   */
  pitch: number
  /** 0 a 1: quanto o fluxo de bolhas está intenso. */
  turbulencia: number
}

/** Diferença menor que isto não vira sequência: é só o tick do HUD. */
export const MINIMO_PARA_MERGULHAR = 100

const MS_AVISO = 500
const MS_INCLINACAO = 1000
const MS_ESTABILIZACAO = 700
const MS_DESCIDA_MIN = 2000
const MS_DESCIDA_MAX = 4000

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

export function planejarMergulho(de: number, para: number): PlanoMergulho {
  const distancia = Math.abs(para - de)
  // 300 m de descida dão ~3 s; a faixa toda cabe entre 2 e 4 s.
  const msDescida = limitar(
    MS_DESCIDA_MIN + (distancia / 900) * (MS_DESCIDA_MAX - MS_DESCIDA_MIN),
    MS_DESCIDA_MIN,
    MS_DESCIDA_MAX,
  )
  return {
    de,
    para,
    subindo: para < de,
    msAviso: MS_AVISO,
    msInclinacao: MS_INCLINACAO,
    msDescida,
    msEstabilizacao: MS_ESTABILIZACAO,
    total: MS_AVISO + MS_INCLINACAO + msDescida + MS_ESTABILIZACAO,
  }
}

export function quadroDe(plano: PlanoMergulho, decorrido: number): QuadroMergulho {
  const sentido = plano.subindo ? -1 : 1
  const fimAviso = plano.msAviso
  const fimInclinacao = fimAviso + plano.msInclinacao
  const fimDescida = fimInclinacao + plano.msDescida
  const avanco = limitar(decorrido / plano.total, 0, 1)

  if (decorrido < fimAviso) {
    return {
      fase: 'aviso',
      naFase: decorrido / plano.msAviso,
      avanco,
      profundidade: plano.de,
      pitch: 0,
      turbulencia: 0,
    }
  }

  if (decorrido < fimInclinacao) {
    const t = (decorrido - fimAviso) / plano.msInclinacao
    return {
      fase: 'inclinacao',
      naFase: t,
      avanco,
      profundidade: plano.de,
      pitch: sentido * easeOutCubic(t),
      turbulencia: t,
    }
  }

  if (decorrido < fimDescida) {
    const t = (decorrido - fimInclinacao) / plano.msDescida
    return {
      fase: 'descida',
      naFase: t,
      avanco,
      // Easing na profundidade também: o submarino ganha e perde velocidade,
      // e um número subindo linearmente parece contador, não descida.
      profundidade: plano.de + (plano.para - plano.de) * easeInOutCubic(t),
      // Respiração leve na inclinação: parado demais parece imagem congelada.
      pitch: sentido * (1 + Math.sin(t * Math.PI * 3) * 0.06),
      turbulencia: 1,
    }
  }

  const t = limitar((decorrido - fimDescida) / plano.msEstabilizacao, 0, 1)
  // Overshoot: o casco passa do ponto e volta. Sem isso a estabilização
  // termina seca, como se alguém tivesse desligado a animação.
  const volta = sentido * (1 - easeOutCubic(t)) - sentido * Math.sin(t * Math.PI) * 0.22
  return {
    fase: t >= 1 ? 'fim' : 'estabilizacao',
    naFase: t,
    avanco,
    profundidade: plano.para,
    pitch: volta,
    turbulencia: 1 - t,
  }
}

/** As quatro zonas da coluna d'água, pro overlay lateral. */
export const ZONAS = [
  { nome: 'EUFÓTICA', ate: 200 },
  { nome: 'MESOPELÁGICA', ate: 1000 },
  { nome: 'BATIPELÁGICA', ate: 4000 },
  { nome: 'ABISSAL', ate: 6000 },
]

/** Log de bordo de cada fase. Rajada curta: ninguém lê parágrafo no palco. */
export function logDaFase(fase: FaseMergulho, plano: PlanoMergulho): string[] | null {
  const alvo = Math.round(plano.para)
  switch (fase) {
    case 'aviso':
      return plano.subindo
        ? ['Esvaziando lastro...', 'Vedação: OK', `Iniciando subida para ${alvo} M`]
        : ['Ajustando lastro...', 'Vedação: OK', `Iniciando descida para ${alvo} M`]
    case 'estabilizacao':
      return [`Profundidade estabilizada: ${alvo} M`]
    default:
      return null
  }
}
