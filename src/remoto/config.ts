/**
 * Controle remoto pelo celular: credenciais e endereços.
 *
 * A chave é `publishable` — ela é PÚBLICA por desenho. Fica escrita aqui, à
 * vista, e não em variável de ambiente: o app roda por `file://` num
 * Chromebook, não existe build com segredo pra injetar, e esconder uma chave
 * pública só criaria a ilusão de que ela é secreta.
 *
 * O que protege a sessão não é a chave: é o CÓDIGO de quatro dígitos que entra
 * no nome do canal, sorteado a cada carregamento da página. Sem ele, um
 * celular com o link não acha o canal de ninguém.
 */

export const SUPABASE_URL = 'https://wihrdhckrqgoofkfofug.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_OuSu06JQOJv-yuNlzJk0Ww_o_JeIGlp'

/**
 * Versão PINADA do supabase-js.
 *
 * Pinada e não `@2`: o app é aberto de um arquivo no dia da feira, e uma
 * versão nova publicada na véspera não pode mudar nada. O mesmo endereço está
 * no `public/controle.html` — os dois lados precisam falar o mesmo protocolo.
 */
export const VERSAO_SUPABASE = '2.45.4'
export const CDN_SUPABASE =
  `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${VERSAO_SUPABASE}/dist/umd/supabase.js`

/** Nome do canal. A turma vai em MAIÚSCULO nos dois lados. */
export function nomeDoCanal(turma: string, codigo: string): string {
  return `domi:${turma.toUpperCase()}:${codigo}`
}

/**
 * Código da sessão: quatro dígitos, sorteados uma vez por carregamento.
 *
 * Começa em 1000 pra nunca ter zero à esquerda — o campo do celular é
 * numérico, e "0421" digitado lá vira 421.
 */
export function gerarCodigo(): string {
  return String(1000 + Math.floor(Math.random() * 9000))
}

/** De quanto em quanto tempo o Chromebook tenta voltar, se a conexão cair. */
export const MS_RECONEXAO = 5000
/** De quanto em quanto tempo o estado é republicado, mesmo sem mudança. */
export const MS_ESTADO = 2000
