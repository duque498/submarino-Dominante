import fichas from '../roteiros/fichas.json'

/**
 * Nomes e apelidos dos painéis, separados dos componentes de propósito: o
 * validador do roteiro e o parser de comandos precisam da lista sem arrastar
 * React e canvas junto.
 */
export const PAINEIS: Array<{
  nome: string
  aliases: string[]
  precisaArgumento?: boolean
  /**
   * O painel escuta o teclado por conta própria e o operador perde as teclas
   * de navegação enquanto ele estiver aberto. Sem isso o Enter do aluno, no
   * painel de traço, avançaria a cena em vez de mandar interpretar o desenho.
   */
  capturaTeclado?: boolean
}> = [
  { nome: 'sonar', aliases: ['radar', 'varredura'] },
  { nome: 'status', aliases: ['sistemas', 'diagnostico', 'subsistemas'] },
  { nome: 'ficha', aliases: ['catalogo', 'especie', 'dados'], precisaArgumento: true },
  { nome: 'dossie', aliases: ['dossiê', 'arquivo', 'classificado'], precisaArgumento: true },
  { nome: 'mapa', aliases: ['rota', 'carta'] },
  { nome: 'camera', aliases: ['cam', 'cameras', 'externa', 'feed'] },
  { nome: 'traco', aliases: ['desenhar', 'desenho', 'rabisco'], capturaTeclado: true },
  { nome: 'espectro', aliases: ['cores', 'cor', 'luz'], capturaTeclado: true },
  { nome: 'zonas', aliases: ['camadas', 'zona', 'coluna', 'profundidades'] },
  { nome: 'cache', aliases: ['banco', 'registros', 'especies'] },
  { nome: 'eco', aliases: ['ecolocalizacao', 'ecolocalização', 'distancia', 'pulso'], capturaTeclado: true },
  // Generico: recebe os segundos no argumento ("cronometro 20"). Nao captura o
  // teclado — o operador continua com as setas enquanto o tempo corre.
  { nome: 'cronometro', aliases: ['cronômetro', 'tempo', 'timer', 'contagem'] },
  // Captura: ele usa 1-4 pras dicas e Enter pra armar o relogio.
  { nome: 'enigma', aliases: ['scape', 'escape', 'descontaminacao', 'descontaminação'], capturaTeclado: true },
]

/** O painel toma conta do teclado enquanto estiver aberto? */
export function painelCapturaTeclado(nome: string | null | undefined): boolean {
  return PAINEIS.some((p) => p.nome === nome && p.capturaTeclado === true)
}

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
