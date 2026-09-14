import { amostrarCanvas, amostrarImagem, type PontoForma } from './amostrar'
import { gerarGlifo, PRIMITIVAS } from './primitivas'

/**
 * Registro central das silhuetas que o orbe sabe assumir.
 *
 * Pra adicionar uma forma nova:
 *   1. jogue o PNG em src/formas/ (silhueta preta, fundo transparente ou
 *      branco, no mínimo 256px no maior lado);
 *   2. importe e registre aqui embaixo;
 *   3. cite o nome no campo "formas" da cena, no JSON do roteiro.
 *
 * O import passa pelo Vite de propósito: com assetsInlineLimit alto o PNG vira
 * data URI e entra no bundle. Imagem carregada por caminho de arquivo via
 * file:// contamina o canvas e o getImageData lança SecurityError.
 *
 * TODO (Fase 4): trocar as primitivas provisórias pelas silhuetas reais —
 *   bio:  baleia, tartaruga, agua-viva, coral, peixe
 *   ef:   mergulhador, prancha, barco
 *   arte: onda, concha
 *
 * import baleia from './baleia.png'
 */
export const IMAGENS_FORMAS: Record<string, string> = {
  // baleia,
}

/** "esfera" não é uma silhueta: é o estado natural do orbe. */
export const FORMA_PADRAO = 'esfera'

/** Todo nome aceito no campo "formas" do JSON. */
export const NOMES_FORMAS: string[] = [
  FORMA_PADRAO,
  ...Object.keys(IMAGENS_FORMAS),
  ...Object.keys(PRIMITIVAS),
]

export function formaRegistrada(nome: string): boolean {
  return NOMES_FORMAS.includes(nome)
}

/** Cache de amostragem. Uma forma só é convertida em pontos uma vez por sessão. */
const cache = new Map<string, PontoForma[]>()

/** Pontos já amostrados de uma forma, ou null se ela ainda não foi carregada. */
export function obterForma(nome: string): PontoForma[] | null {
  return cache.get(nome) ?? null
}

/**
 * Amostra as formas pedidas. Chamado no gesto inicial, junto do preload de
 * áudio: um getImageData de 200x200 é rápido, mas dez deles no meio da
 * apresentação seriam um engasgo visível.
 */
export async function carregarFormas(nomes: string[], quantidade: number): Promise<void> {
  const pendentes = [...new Set(nomes)].filter(
    (nome) => nome !== FORMA_PADRAO && !cache.has(nome),
  )

  await Promise.all(
    pendentes.map(async (nome) => {
      try {
        const gerada = PRIMITIVAS[nome]
        if (gerada) {
          cache.set(nome, amostrarCanvas(gerada(), quantidade))
          return
        }
        const imagem = IMAGENS_FORMAS[nome]
        if (!imagem) {
          console.warn(`[formas] "${nome}" não está registrada em src/formas/index.ts`)
          return
        }
        cache.set(nome, await amostrarImagem(imagem, quantidade))
      } catch (erro) {
        console.warn(`[formas] falha ao amostrar "${nome}":`, erro)
      }
    }),
  )
}

/**
 * Gera e amostra um glifo na hora ("letra x", "numero 7"). O console usa isso
 * pra formas que não existem em lugar nenhum até alguém pedir.
 */
export function prepararGlifo(texto: string, quantidade: number): string {
  const chave = `glifo:${texto.toLowerCase()}`
  if (!cache.has(chave)) {
    cache.set(chave, amostrarCanvas(gerarGlifo(texto), quantidade))
  }
  return chave
}

/** Nome legível de uma forma, pro indicador e pra resposta da IA. */
export function rotuloDaForma(nome: string): string {
  return nome.startsWith('glifo:') ? nome.slice(6) : nome
}
