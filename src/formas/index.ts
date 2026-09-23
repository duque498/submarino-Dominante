import { amostrarCanvas, amostrarImagem, type FormaAmostrada } from './amostrar'
import {
  CHAVES_ESPECIE,
  especieCanonica,
  pngDaEspecie,
  registroDaEspecie,
} from './especies'
import { gerarGlifo, PRIMITIVAS } from './primitivas'

/**
 * Registro central das silhuetas que o orbe sabe assumir.
 *
 * Duas origens, nesta ordem de prioridade:
 *
 *  1. ESPÉCIE COM PNG (`src/formas/especies/`) — a mesma silhueta que o
 *     bestiário da identificação anima. A baleia em que o orbe morfa e a
 *     baleia que passa na câmera são o mesmo arquivo, de propósito: eram
 *     bichos diferentes na mesma apresentação e a plateia percebia.
 *     Adicionar espécie = um PNG na pasta + uma linha no registro de lá.
 *  2. PRIMITIVA (`primitivas.ts`) — desenho em código, pras formas que não são
 *     bicho (círculo, prancha, satélite) e pras espécies que ainda não têm PNG.
 *
 * Espécie que TEM PNG nunca cai na primitiva, mesmo que exista uma homônima:
 * o PNG é a versão que a plateia já viu na identificação.
 */

/** "esfera" não é uma silhueta: é o estado natural do orbe. */
export const FORMA_PADRAO = 'esfera'

/** Todo nome aceito no campo "formas" do JSON. */
export const NOMES_FORMAS: string[] = [
  ...new Set([FORMA_PADRAO, ...CHAVES_ESPECIE, ...Object.keys(PRIMITIVAS)]),
]

/**
 * Nome sob o qual a forma é guardada no cache. Alias de espécie ("cachalote")
 * e chave canônica ("baleia") têm que cair no MESMO cache, senão a mesma
 * silhueta é amostrada duas vezes e o pré-carregamento da cena não cobre o
 * nome que o JSON usou.
 */
function chaveDeCache(nome: string): string {
  return especieCanonica(nome) ?? nome
}

export function formaRegistrada(nome: string): boolean {
  return NOMES_FORMAS.includes(nome)
}

/** Cache de amostragem. Uma forma só é convertida em pontos uma vez por sessão. */
const cache = new Map<string, FormaAmostrada>()

/** Pontos já amostrados de uma forma, ou null se ela ainda não foi carregada. */
export function obterForma(nome: string): FormaAmostrada | null {
  return cache.get(chaveDeCache(nome)) ?? null
}

/**
 * Amostra as formas pedidas. Chamado no gesto inicial, junto do preload de
 * áudio: um getImageData de 200x200 é rápido, mas dez deles no meio da
 * apresentação seriam um engasgo visível.
 */
export async function carregarFormas(nomes: string[], quantidade: number): Promise<void> {
  const pendentes = [...new Set(nomes.map(chaveDeCache))].filter(
    (nome) => nome !== FORMA_PADRAO && !cache.has(nome),
  )

  await Promise.all(
    pendentes.map(async (nome) => {
      try {
        const url = pngDaEspecie(nome)
        if (url) {
          const escala = registroDaEspecie(nome)?.escala ?? 1
          cache.set(nome, escalar(await amostrarImagem(url, quantidade), escala))
          return
        }
        const gerada = PRIMITIVAS[nome]
        if (!gerada) {
          console.warn(`[formas] "${nome}" não está registrada em src/formas/index.ts`)
          return
        }
        cache.set(nome, amostrarCanvas(gerada(), quantidade))
      } catch (erro) {
        console.warn(`[formas] falha ao amostrar "${nome}":`, erro)
      }
    }),
  )
}

/**
 * Aplica a escala do registro à nuvem de pontos, sem nunca passar da borda.
 *
 * A amostragem normaliza a silhueta pra maior dimensão = 2 unidades, e o orbe
 * projeta 1 unidade exatamente na borda do canvas. Então ESTICAR aqui só
 * corta: o megalodonte, que no sprite é 1,3x o tubarão porque ali os bichos
 * se comparam entre si, saía sem focinho e sem cauda no orbe, onde só existe
 * uma forma por vez. Encolher continua valendo.
 */
function escalar(forma: FormaAmostrada, escala: number): FormaAmostrada {
  const fator = Math.min(1, escala)
  if (fator === 1) return forma
  return {
    contornos: forma.contornos,
    pontos: forma.pontos.map((p) => ({ x: p.x * fator, y: p.y * fator, borda: p.borda })),
  }
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

/**
 * Desenhos feitos pelo aluno no painel de traço.
 *
 * Vivem só na memória e só até trocar de cena. De propósito NÃO entram em
 * NOMES_FORMAS: se entrassem, "traco-1" passaria a ser aceito no campo
 * "formas" do JSON e apareceria no autocomplete de qualquer cena — prometendo
 * uma forma que não existe mais assim que a cena vira.
 */
const tracos: string[] = []

/** Amostra o desenho e devolve a chave dele ("traco-1", "traco-2", ...). */
export function registrarTraco(canvas: HTMLCanvasElement, quantidade: number): string {
  const chave = `traco-${tracos.length + 1}`
  cache.set(chave, amostrarCanvas(canvas, quantidade))
  tracos.push(chave)
  return chave
}

export function tracosRegistrados(): string[] {
  return [...tracos]
}

/** Chamado ao trocar de cena: os desenhos daquela cena morrem com ela. */
export function limparTracos(): void {
  for (const chave of tracos) cache.delete(chave)
  tracos.length = 0
}

/** Nome legível de uma forma, pro indicador e pra resposta da IA. */
export function rotuloDaForma(nome: string): string {
  if (nome.startsWith('glifo:')) return nome.slice(6)
  if (nome.startsWith('traco-')) return `traço ${nome.slice(6)}`
  return nome
}
