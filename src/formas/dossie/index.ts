/**
 * Imagens de reconstrução dos dossiês.
 *
 * Ficam aqui, em `src/`, e não em `public/`, por causa do `file://`: o build
 * transforma tudo em `src/` com menos de 10 MB em data URI (ver
 * `assetsInlineLimit` no vite.config). Uma imagem carregada por CAMINHO de
 * arquivo local contamina o canvas e o `getImageData` lança `SecurityError` —
 * e, pior no dia da feira, some se alguém copiar só o index.html.
 *
 * O `import.meta.glob` é o que permite a pasta estar VAZIA. Um `import`
 * direto de um arquivo que ainda não chegou quebra o build inteiro; assim, o
 * painel simplesmente não mostra a foto e continua funcionando com a silhueta.
 */

const arquivos = import.meta.glob('./*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** Chave da ficha -> data URI da imagem, pra quem tiver. */
export const IMAGENS_DOSSIE: Record<string, string> = Object.fromEntries(
  Object.entries(arquivos).map(([caminho, url]) => [
    caminho.replace(/^\.\//, '').replace(/\.[^.]+$/, ''),
    url,
  ]),
)

export function imagemDoDossie(chave: string): string | null {
  return IMAGENS_DOSSIE[chave] ?? null
}
