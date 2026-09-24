/**
 * Geografia do mapa da expedição.
 *
 * Separado do componente de propósito: o validador do roteiro precisa saber se
 * `{ "tipo": "mapa", "marcador": "abrolhos" }` existe, e não pode arrastar
 * React e canvas junto pra descobrir isso.
 *
 * Coordenadas são aproximadas — é um mostrador de bordo pra ler a 15 metros,
 * não carta de navegação. Pares [longitude, latitude].
 */

export const COSTA: Array<[number, number]> = [
  [-51.0, 4.3],
  [-50.0, 1.0],
  [-48.5, -0.8],
  [-46.5, -1.0],
  [-44.3, -2.5],
  [-42.8, -2.7],
  [-41.0, -2.9],
  [-38.5, -3.7],
  [-37.0, -4.9],
  [-35.2, -5.8],
  [-34.8, -7.1],
  [-35.0, -8.1],
  [-36.0, -9.7],
  [-37.1, -11.0],
  [-38.5, -12.9],
  [-39.0, -14.8],
  [-39.0, -16.4],
  [-39.7, -18.0],
  [-40.8, -19.6],
  [-41.8, -21.2],
  [-43.2, -22.9],
  [-45.0, -23.7],
  [-47.0, -24.7],
  [-48.5, -26.0],
  [-48.6, -27.6],
  [-50.0, -29.3],
  [-51.2, -31.0],
  [-52.3, -32.2],
  [-53.4, -33.7],
]

export type Marcador = {
  chave: string
  /** O que aparece na tela, em caixa alta. */
  rotulo: string
  lon: number
  lat: number
  /** Uma linha de contexto sob o rótulo. Some quando o mapa está longe. */
  nota?: string
}

export const MARCADORES: Marcador[] = [
  {
    chave: 'abrolhos',
    rotulo: 'ABROLHOS',
    lon: -38.7,
    lat: -17.9,
    nota: 'maior banco de corais do Atlântico Sul',
  },
  {
    chave: 'amazonia',
    rotulo: 'FOZ DO AMAZONAS',
    lon: -48.5,
    lat: -0.9,
    nota: 'manguezais e recife de corais profundos',
  },
  {
    chave: 'fernando-de-noronha',
    rotulo: 'FERNANDO DE NORONHA',
    lon: -32.42,
    lat: -3.85,
    nota: 'arquipélago vulcânico, 350 km da costa',
  },
  {
    chave: 'costa-sudeste',
    rotulo: 'COSTA SUDESTE',
    lon: -44.2,
    lat: -23.3,
    nota: 'ponto de partida da expedição',
  },
  {
    chave: 'baia-de-todos-os-santos',
    rotulo: 'BAÍA DE TODOS-OS-SANTOS',
    lon: -38.6,
    lat: -12.9,
  },
  {
    chave: 'atol-das-rocas',
    rotulo: 'ATOL DAS ROCAS',
    lon: -33.8,
    lat: -3.86,
    nota: 'único atol do Atlântico Sul',
  },
]

export const NOMES_MARCADORES = MARCADORES.map((m) => m.chave)

export function marcadorExiste(chave: string): boolean {
  return NOMES_MARCADORES.includes(chave)
}

export function acharMarcador(chave: string | undefined): Marcador | null {
  if (!chave) return null
  return MARCADORES.find((m) => m.chave === chave) ?? null
}

/** Caixa que contém a costa inteira, pro enquadramento de partida. */
export function caixaDaCosta() {
  const lons = COSTA.map((p) => p[0])
  const lats = COSTA.map((p) => p[1])
  return {
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  }
}
