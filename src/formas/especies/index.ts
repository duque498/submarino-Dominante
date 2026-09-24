/**
 * REGISTRO ÚNICO DAS SILHUETAS DE ESPÉCIE.
 *
 * Uma espécie, um PNG, uma linha aqui. Os dois sistemas que desenham bicho
 * leem deste mesmo lugar:
 *
 *  - o BESTIÁRIO da identificação (`mundo/sprites.ts`), que fatia o PNG em
 *    tiras e faz a onda percorrer o corpo;
 *  - o ORBE (`formas/index.ts`), que amostra o MESMO PNG em nuvem de pontos e
 *    morfa nele.
 *
 * Antes eram dois caminhos: o orbe usava um desenho procedural do bestiário e
 * o sprite usava o PNG. A baleia do orbe e a baleia da identificação eram
 * bichos diferentes na mesma apresentação, e a plateia percebe.
 *
 * Os PNGs ficam em `src/`, e não em `public/`, porque o build transforma tudo
 * em `src/` com menos de 10 MB em data URI (ver `assetsInlineLimit` no
 * vite.config). Imagem carregada por CAMINHO local contamina o canvas — e some
 * se alguém copiar só o index.html.
 *
 * O `import.meta.glob` é o que permite a pasta estar VAZIA: um `import` direto
 * de um arquivo que ainda não chegou quebraria o build inteiro. Sem o PNG, a
 * espécie cai no desenho procedural e continua funcionando.
 *
 * ORIENTAÇÃO CANÔNICA: o bicho olha pra DIREITA, de perfil, centralizado, com
 * fundo transparente. O warp de tiras assume isso pra saber onde é a cauda.
 *
 * Este arquivo não importa NADA de propósito: `formas/index.ts` importa daqui,
 * `primitivas.ts` importa do bestiário e o bestiário importa de sprites.ts —
 * qualquer import aqui fecharia o ciclo.
 */

/** Uma região da imagem que bate por conta própria, em frações de 0 a 1. */
export type Nadadeira = {
  x: number
  y: number
  w: number
  h: number
  /** Deslocamento de fase, em radianos. Duas nadadeiras em uníssono parecem asa. */
  fase?: number
  /** Multiplicador de amplitude em relação ao corpo. */
  amp?: number
}

export type RegistroEspecie = {
  /** Nome do arquivo nesta pasta, sem extensão. */
  arquivo: string
  /** Outras chaves que caem nesta mesma silhueta. */
  aliases?: string[]
  /** Regiões com seno próprio (peitoral, asa de raia). Usado só pelo sprite. */
  nadadeiras?: Nadadeira[]
  /** Multiplicador de tamanho em relação ao PNG. Vale pro orbe e pro sprite. */
  escala?: number
  /**
   * PNG emprestado de outra espécie, até chegar o definitivo. O texto diz de
   * quem foi emprestado — é o que o relatório pra professora lista.
   */
  provisorio?: string
}

const arquivos = import.meta.glob('./*.{png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** Nome do arquivo (sem extensão) -> data URI. */
const URLS: Record<string, string> = Object.fromEntries(
  Object.entries(arquivos).map(([caminho, url]) => [
    caminho.replace(/^\.\//, '').replace(/\.[^.]+$/, ''),
    url,
  ]),
)

/**
 * O registro.
 *
 * `provisorio` marca quem ainda está usando PNG emprestado. A escolha do
 * empréstimo é sempre pela SILHUETA, não pelo parentesco: megalodonte pega o
 * tubarão porque a leitura a 15 metros é a mesma (dorsal + caudal em meia-lua),
 * e não porque sejam o mesmo bicho.
 *
 * Quem NÃO está aqui, e por quê — em todos os casos entrar é UMA LINHA quando
 * o PNG definitivo chegar:
 *
 *  - raia / arraia-manta: nenhum dos quatro PNGs se parece com uma raia nem
 *    esticado. Um tubarão achatado no lugar de uma manta seria pior que o
 *    desenho procedural, que pelo menos se lê como raia.
 *  - orca e baleia-azul: têm primitiva DESENHADA à mão, com a proporção certa
 *    de cada uma. Emprestar a baleia pras duas faria a cena "SETOR: BALEIAS"
 *    do 2B (baleia + baleia-azul + orca) mostrar a mesma silhueta três vezes.
 *  - peixe-boi: não aparece em roteiro nenhum ainda, e não há silhueta
 *    parecida pra emprestar.
 */
export const ESPECIES_SILHUETA: Record<string, RegistroEspecie> = {
  baleia: {
    arquivo: 'baleia',
    aliases: ['cachalote', 'jubarte', 'cetaceo'],
    // Peitoral com seno próprio e amplitude PEQUENA: a 1,4 a nadadeira
    // arrancava o flanco junto.
    nadadeiras: [{ x: 0.17, y: 0.66, w: 0.42, h: 0.34, amp: 0.5, fase: 0.7 }],
  },
  tartaruga: {
    arquivo: 'tartaruga',
    aliases: ['tartaruga-verde', 'tartarugas'],
  },
  golfinho: {
    arquivo: 'golfinho',
    aliases: ['boto', 'delfim'],
  },
  tubarao: {
    arquivo: 'tubarao',
    aliases: ['tubarão'],
  },
  megalodonte: {
    arquivo: 'tubarao',
    aliases: ['megalodon', 'megalodonte-sonar'],
    escala: 1.3,
    provisorio: 'emprestado do tubarão-branco',
  },
}

/** Alias -> chave canônica. Montado uma vez. */
const CANONICA: Record<string, string> = (() => {
  const mapa: Record<string, string> = {}
  for (const [chave, reg] of Object.entries(ESPECIES_SILHUETA)) {
    mapa[chave] = chave
    for (const alias of reg.aliases ?? []) mapa[alias] = chave
  }
  return mapa
})()

/** Chave canônica da espécie, ou null se ela não está no registro. */
export function especieCanonica(nome: string): string | null {
  return CANONICA[nome] ?? null
}

/** Toda chave aceita, canônicas e aliases. */
export const CHAVES_ESPECIE: string[] = Object.keys(CANONICA)

/** O registro da espécie, resolvendo alias. */
export function registroDaEspecie(nome: string): RegistroEspecie | null {
  const chave = CANONICA[nome]
  if (!chave) return null
  const reg = ESPECIES_SILHUETA[chave]
  // Registrada mas sem o arquivo na pasta: pra quem chama é o mesmo que não ter.
  return URLS[reg.arquivo] ? reg : null
}

/** Data URI do PNG da espécie, resolvendo alias. */
export function pngDaEspecie(nome: string): string | null {
  const reg = registroDaEspecie(nome)
  return reg ? URLS[reg.arquivo] : null
}

/** Espécies desenhadas com PNG emprestado: "chave (motivo)". Pro relatório. */
export function especiesProvisorias(): string[] {
  return Object.entries(ESPECIES_SILHUETA)
    .filter(([chave, reg]) => reg.provisorio && registroDaEspecie(chave))
    .map(([chave, reg]) => `${chave} (${reg.provisorio})`)
}

/** Espécies registradas cujo PNG ainda não chegou na pasta. Pro relatório. */
export function especiesSemArquivo(): string[] {
  return Object.entries(ESPECIES_SILHUETA)
    .filter(([, reg]) => !URLS[reg.arquivo])
    .map(([chave]) => chave)
}
