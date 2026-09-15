import dicionario from '../roteiros/gatilhos.json'

/**
 * Gatilhos semânticos: a IA ilustra o que ela mesma está dizendo.
 *
 * O dicionário vive em src/roteiros/gatilhos.json, editável por quem não
 * programa. Este módulo só o aplica, e é de propósito uma função pura: recebe
 * texto, devolve o que casou. Quem decide o que fazer com isso — e por quanto
 * tempo — é o Diretor.
 *
 * Duas decisões que valem mais do que parecem:
 *
 *  - **Palavra inteira, nunca pedaço.** "mar" não pode casar "marcador", nem
 *    "cor" casar "recorde". A comparação é feita sobre a lista de palavras já
 *    separadas, não sobre a string.
 *  - **Posição no texto importa.** Quando duas formas casam na mesma frase,
 *    vence a que aparece primeiro: é a que a plateia acabou de ouvir.
 */

export type TipoGatilho = 'forma' | 'painel' | 'marcador'

export type Casamento = {
  tipo: TipoGatilho
  /** Nome da forma, do painel ou do marcador. */
  nome: string
  /** A palavra do dicionário que casou — útil pra revisar o dicionário. */
  termo: string
  /** Índice da palavra onde casou, pra desempatar pela ordem da fala. */
  posicao: number
}

export type Gatilhos = {
  forma: Casamento | null
  painel: Casamento | null
  marcador: Casamento | null
}

type Dicionario = Record<string, string[]>

const FORMAS = (dicionario as Record<string, unknown>).formas as Dicionario
const PAINEIS = (dicionario as Record<string, unknown>).paineis as Dicionario
const MARCADORES = (dicionario as Record<string, unknown>).marcadores as Dicionario

/** Minúsculas, sem acento. A mesma normalização do parser de comandos. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Parte o texto em palavras. Hífen conta como separador pra "água-viva" virar
 * ["agua", "viva"] tanto na fala quanto no dicionário — assim a expressão de
 * duas palavras casa do mesmo jeito, escrita com hífen ou com espaço.
 */
function palavras(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

type Termo = { nome: string; termo: string; partes: string[] }

/** Achata o dicionário numa lista de termos já normalizados. */
function compilar(mapa: Dicionario): Termo[] {
  const termos: Termo[] = []
  for (const [nome, lista] of Object.entries(mapa ?? {})) {
    for (const termo of lista) {
      const partes = palavras(termo)
      if (partes.length > 0) termos.push({ nome, termo, partes })
    }
  }
  // Termo mais longo primeiro: "sistemas de bordo" tem que ganhar de "bordo"
  // se algum dia alguém puser as duas no dicionário.
  return termos.sort((a, b) => b.partes.length - a.partes.length)
}

const TERMOS_FORMA = compilar(FORMAS)
const TERMOS_PAINEL = compilar(PAINEIS)
const TERMOS_MARCADOR = compilar(MARCADORES)

/** Onde a sequência `partes` começa dentro de `ditas`, ou -1. */
function posicaoDe(ditas: string[], partes: string[]): number {
  for (let i = 0; i + partes.length <= ditas.length; i++) {
    let bate = true
    for (let k = 0; k < partes.length; k++) {
      if (ditas[i + k] !== partes[k]) {
        bate = false
        break
      }
    }
    if (bate) return i
  }
  return -1
}

/** O primeiro termo desta lista que aparece no texto, na ordem da fala. */
function primeiro(ditas: string[], termos: Termo[], tipo: TipoGatilho): Casamento | null {
  let melhor: Casamento | null = null
  for (const t of termos) {
    const posicao = posicaoDe(ditas, t.partes)
    if (posicao < 0) continue
    if (!melhor || posicao < melhor.posicao) {
      melhor = { tipo, nome: t.nome, termo: t.termo, posicao }
    }
  }
  return melhor
}

/** O que esta linha de fala dispara. */
export function gatilhosDe(texto: string): Gatilhos {
  const ditas = palavras(texto)
  return {
    forma: primeiro(ditas, TERMOS_FORMA, 'forma'),
    painel: primeiro(ditas, TERMOS_PAINEL, 'painel'),
    marcador: primeiro(ditas, TERMOS_MARCADOR, 'marcador'),
  }
}

/**
 * O painel que a linha abre, já resolvida a prioridade: um marcador é sempre
 * um ponto no mapa, então ele ocupa a vaga de painel e leva o argumento junto.
 */
export function painelDe(g: Gatilhos): { nome: string; args?: string; termo: string } | null {
  if (g.marcador) return { nome: 'mapa', args: g.marcador.nome, termo: g.marcador.termo }
  if (g.painel) return { nome: g.painel.nome, termo: g.painel.termo }
  return null
}

/** Todo nome de forma citado no dicionário — a validação confere se existem. */
export function formasCitadas(): string[] {
  return Object.keys(FORMAS ?? {})
}

/** Todo nome de painel citado no dicionário. */
export function paineisCitados(): string[] {
  return Object.keys(PAINEIS ?? {})
}

/** Todo marcador citado no dicionário. */
export function marcadoresCitados(): string[] {
  return Object.keys(MARCADORES ?? {})
}
