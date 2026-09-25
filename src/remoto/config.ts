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
 * no `index.html` e no `public/controle.html` — os três precisam bater, senão
 * o celular e o Chromebook falam protocolos diferentes.
 *
 * SAIU DA 2.45.4 POR UM MOTIVO MEDIDO, não por higiene. Subindo um servidor
 * websocket local e lendo o quadro `phx_join` que cada versão manda, com a
 * nossa chave:
 *
 *     2.45.4  (vsn=1.0.0)  payload.access_token = "sb_publishable_..."
 *     2.117.2 (vsn=2.0.0)  sem access_token — autentica só pelo ?apikey=
 *
 * O Realtime valida o `access_token` do join COMO JWT. A chave `anon` antiga
 * era um JWT e passava; uma `sb_publishable_` não é, então o join é recusado e
 * o subscribe() morre em CHANNEL_ERROR sem chegar em SUBSCRIBED. De quebra, a
 * 2.117.2 reconhece o formato (`startsWith('sb_publishable_')`) e a 2.45.4 não
 * tem a string no bundle.
 *
 * O que NÃO é motivo, pra não virar lenda: as duas carregam igual por
 * `<script src>` e expõem a mesma API de canal; nenhuma das duas emite warning
 * com essa chave; o segundo arquivo do UMD da 2.45.4 (`591.supabase.js`) nunca
 * chega a ser pedido. A diferença é o conteúdo do join, só.
 *
 * Ressalva: daqui não dá pra alcançar o host do Supabase, então a recusa do
 * servidor é dedução do que o cliente manda, não medição ponta a ponta. Se
 * ainda assim não conectar, a linha `canal:` do overlay H mostra o motivo real.
 */
export const VERSAO_SUPABASE = '2.117.2'
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
