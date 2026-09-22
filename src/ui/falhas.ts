/**
 * Falhas que o error boundary NÃO pega.
 *
 * A Escotilha cobre erros de render. Mas metade do que este projeto faz roda
 * fora do render: laços de `requestAnimationFrame`, `setTimeout`, promessas de
 * áudio. Um erro ali não desmonta a árvore — ele só mata aquele laço em
 * silêncio, e a apresentação continua com uma peça parada e ninguém sabendo
 * por quê.
 *
 * Aqui esses erros viram linha no log de bordo, que é onde o operador já está
 * olhando. Não conserta nada; deixa o problema VISÍVEL, que é a diferença
 * entre "travou" e "travou por causa disto".
 */

const EVENTO = 'domi:falha'

/**
 * Ruído de navegador que NÃO é falha.
 *
 * O aviso do ResizeObserver é o caso: os canvas se redimensionam dentro do
 * próprio callback do observador, o Chrome avisa que adiou uma notificação, e
 * nada acontece de errado. Virava `ERR:` no log de bordo na frente da plateia,
 * que é o oposto do que este arquivo existe pra fazer.
 */
const RUIDO = [/ResizeObserver loop/i]

/** Últimas falhas, pra quem montar depois ainda ver o que aconteceu. */
const historico: string[] = []

export function registrarFalha(mensagem: string) {
  if (RUIDO.some((padrao) => padrao.test(mensagem))) return
  const linha = `ERR: ${mensagem}`.slice(0, 160)
  // Repetição não ajuda ninguém: um laço quebrado dispara o mesmo erro 60
  // vezes por segundo e encheria o log em dois segundos.
  if (historico[historico.length - 1] === linha) return
  historico.push(linha)
  if (historico.length > 8) historico.shift()
  console.error('[falha]', mensagem)
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: linha }))
}

export function falhasAnteriores(): string[] {
  return [...historico]
}

export function observarFalhas(aoFalhar: (linha: string) => void): () => void {
  const ouvinte = (evento: Event) => aoFalhar((evento as CustomEvent<string>).detail)
  window.addEventListener(EVENTO, ouvinte)
  return () => window.removeEventListener(EVENTO, ouvinte)
}

/** Liga os dois ganchos globais. Chamado uma vez, na entrada do app. */
export function ligarCapturaDeFalhas() {
  window.addEventListener('error', (evento) => {
    registrarFalha(evento.message || String(evento.error))
  })
  window.addEventListener('unhandledrejection', (evento) => {
    const motivo = evento.reason
    registrarFalha(motivo?.message ?? String(motivo))
  })
}

/**
 * Envolve um laço de animação: um quadro que estoura vira uma linha no log e o
 * laço PARA, em vez de repetir o erro para sempre. Devolve a função protegida.
 */
export function quadroSeguro(onde: string, desenhar: (agora: number) => void) {
  let morto = false
  return (agora: number) => {
    if (morto) return
    try {
      desenhar(agora)
    } catch (erro) {
      morto = true
      registrarFalha(`${onde}: ${(erro as Error)?.message ?? erro}`)
    }
  }
}
