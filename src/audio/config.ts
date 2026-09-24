/**
 * Ajustes de mixagem do áudio de bordo.
 *
 * Os números de mix ficam aqui, num lugar só, e não espalhados pelo
 * `AudioEngine`: quem mexe neles no dia da feira é quem está ouvindo a sala, e
 * essa pessoa precisa achar tudo junto. Cada um pode ser sobrescrito pela URL,
 * porque no dia não dá pra recompilar — ajusta, recarrega, ouve.
 */

/** Lê um número da query string, dentro de uma faixa. Fora dela, o padrão. */
function daUrl(chave: string, padrao: number, minimo = 0, maximo = 2): number {
  if (typeof window === 'undefined') return padrao
  const bruto = new URLSearchParams(window.location.search).get(chave)
  if (bruto === null) return padrao
  const valor = Number(bruto.replace(',', '.'))
  if (!Number.isFinite(valor) || valor < minimo || valor > maximo) return padrao
  return valor
}

export const AUDIO = {
  voz: {
    /**
     * Ganho da voz da IA. 1 = o nível do próprio mp3.
     *
     * O padrão é -4 dB (10^(-4/20) = 0,63). A voz saía no nível cheio do
     * arquivo, direto no destino, e ficava à frente de tudo — inclusive da
     * trilha, que é um `<audio>` com volume absoluto e não tem como competir.
     *
     * O nó de ganho entra DEPOIS do analisador, de propósito: quem move o orbe
     * é o nível da voz, e baixar o volume da sala não pode encolher o orbe.
     *
     * Ajuste na URL: `?voz=0.6`.
     */
    ganho: daUrl('voz', 0.63),
  },
}
