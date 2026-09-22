/**
 * PNGs de silhueta das espécies da expedição de identificação.
 *
 * Mesma regra da foto do dossiê: ficam em `src/`, e não em `public/`, porque o
 * build transforma tudo em `src/` com menos de 10 MB em data URI (ver
 * `assetsInlineLimit` no vite.config). Imagem carregada por CAMINHO local
 * contamina o canvas — e some se alguém copiar só o index.html.
 *
 * O `import.meta.glob` é o que permite a pasta estar VAZIA: um `import` direto
 * de um arquivo que ainda não chegou quebraria o build inteiro. Sem o PNG, a
 * cena cai no desenho procedural do bestiário e continua funcionando.
 *
 * ORIENTAÇÃO CANÔNICA: o bicho olha pra DIREITA, de perfil, centralizado, com
 * fundo transparente. O warp de tiras assume isso pra saber onde é a cauda.
 */

const arquivos = import.meta.glob('./*.{png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** Chave da espécie -> data URI do PNG, pra quem tiver. */
export const PNGS_ESPECIE: Record<string, string> = Object.fromEntries(
  Object.entries(arquivos).map(([caminho, url]) => [
    caminho.replace(/^\.\//, '').replace(/\.[^.]+$/, ''),
    url,
  ]),
)

export function pngDaEspecie(chave: string): string | null {
  return PNGS_ESPECIE[chave] ?? null
}
