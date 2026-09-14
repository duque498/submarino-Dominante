import fichas from '../roteiros/fichas.json'

/**
 * Nomes e apelidos dos painéis, separados dos componentes de propósito: o
 * validador do roteiro e o parser de comandos precisam da lista sem arrastar
 * React e canvas junto.
 */
export const PAINEIS: Array<{ nome: string; aliases: string[]; precisaArgumento?: boolean }> = [
  { nome: 'sonar', aliases: ['radar', 'varredura'] },
  { nome: 'status', aliases: ['sistemas', 'diagnostico', 'subsistemas'] },
  { nome: 'ficha', aliases: ['catalogo', 'especie', 'dados'], precisaArgumento: true },
  { nome: 'mapa', aliases: ['rota', 'carta'] },
]

/** Resolve um nome ou apelido pro nome canônico do painel. */
export function resolverPainel(termo: string): string | null {
  const alvo = termo.trim().toLowerCase()
  for (const painel of PAINEIS) {
    if (painel.nome === alvo || painel.aliases.includes(alvo)) return painel.nome
  }
  return null
}

export const NOMES_PAINEIS = PAINEIS.map((p) => p.nome)

/** Nomes das fichas catalogadas, lidos direto do JSON (sem passar por React). */
export const NOMES_FICHAS: string[] = Object.keys(fichas)

export function fichaExiste(nome: string): boolean {
  return NOMES_FICHAS.includes(nome)
}
