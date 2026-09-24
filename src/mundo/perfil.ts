/**
 * Tradução de profundidade em parâmetros de cenário.
 *
 * A profundidade é o ÚNICO input do sistema de câmeras: elas não sabem qual
 * turma está apresentando, sabem quantos metros. Todas as transições são
 * contínuas — passar de 190 pra 210 m não pode mudar a tela de repente.
 */

export type Cor = [number, number, number]

export type Perfil = {
  /** Luz ambiente, 0 a 1. */
  luz: number
  fundoTopo: Cor
  fundoBaixo: Cor
  /** Raios de sol descendo. */
  raios: number
  /** Superfície ondulando visível no topo do quadro. */
  superficie: number
  /** Multiplicadores de densidade, 0 a 1. */
  cardume: number
  fauna: number
  corais: number
  aguasVivas: number
  bolhas: number
  neve: number
  biolum: number
  /** Cone do farol do submarino. */
  farol: number
  /** Tremor de pressão no feed. */
  tremor: number
}

/** Interpolação suave (3t² − 2t³) entre dois limites. */
export function suave(inicio: number, fim: number, valor: number): number {
  const t = Math.max(0, Math.min(1, (valor - inicio) / (fim - inicio || 1)))
  return t * t * (3 - 2 * t)
}

const misturar = (a: number, b: number, t: number) => a + (b - a) * t

function misturarCor(a: Cor, b: Cor, t: number): Cor {
  return [misturar(a[0], b[0], t), misturar(a[1], b[1], t), misturar(a[2], b[2], t)]
}

export const rgba = (cor: Cor, alpha: number) =>
  `rgba(${cor[0] | 0}, ${cor[1] | 0}, ${cor[2] | 0}, ${alpha})`

// Cores de cada zona, do topo do quadro pro fundo.
const EUFOTICA_TOPO: Cor = [18, 96, 122]
const EUFOTICA_BAIXO: Cor = [6, 44, 62]
const MESO_TOPO: Cor = [5, 34, 50]
const MESO_BAIXO: Cor = [1, 12, 20]
const ABISSO_TOPO: Cor = [1, 6, 10]
const ABISSO_BAIXO: Cor = [0, 2, 4]

/**
 * As quatro zonas se sobrepõem de propósito: cada parâmetro sobe ou desce ao
 * longo de uma faixa larga, então nunca há um degrau visível.
 */
export function perfilDe(profundidade: number): Perfil {
  const p = Math.max(0, profundidade)

  // Quanto já saímos da zona iluminada, e quanto já entramos no escuro.
  const saindoDaLuz = suave(60, 260, p)
  const entrandoNoFundo = suave(700, 1400, p)
  const abissal = suave(3200, 4600, p)

  const fundoTopo = misturarCor(
    misturarCor(EUFOTICA_TOPO, MESO_TOPO, saindoDaLuz),
    ABISSO_TOPO,
    entrandoNoFundo,
  )
  const fundoBaixo = misturarCor(
    misturarCor(EUFOTICA_BAIXO, MESO_BAIXO, saindoDaLuz),
    ABISSO_BAIXO,
    entrandoNoFundo,
  )

  return {
    luz: (1 - saindoDaLuz) * 0.85 + 0.15 * (1 - entrandoNoFundo),
    fundoTopo,
    fundoBaixo,
    raios: 1 - suave(40, 190, p),
    superficie: 1 - suave(10, 120, p),
    // O cardume rareia mas nunca some de todo até o abisso.
    cardume: (1 - suave(150, 1100, p)) * 0.9 + 0.1 * (1 - abissal),
    fauna: 1 - abissal * 0.75,
    corais: 1 - suave(80, 210, p),
    aguasVivas: suave(120, 380, p) * (1 - suave(1800, 3200, p)),
    bolhas: 1 - suave(30, 220, p),
    neve: suave(180, 900, p),
    biolum: suave(300, 1200, p) * (0.6 + 0.4 * abissal),
    farol: suave(650, 1000, p),
    tremor: abissal,
  }
}

/** Nome da zona, pro rótulo das câmeras. */
export function zonaDe(profundidade: number): string {
  if (profundidade < 200) return 'EUFÓTICA'
  if (profundidade < 1000) return 'MESOPELÁGICA'
  if (profundidade < 4000) return 'BATIPELÁGICA'
  return 'ABISSAL'
}
