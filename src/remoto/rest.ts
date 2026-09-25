/**
 * O transporte B do controle remoto: PostgREST puro, sem WebSocket.
 *
 * Quatro funções e nenhum estado. Quem decide QUANDO chamar é o
 * `receptor.ts` (Chromebook) e o `<script>` do `controle.html` (celular)
 * — este arquivo só sabe falar com a tabela.
 *
 * Nenhuma delas rejeita: toda falha vira `null` ou lista vazia. Um
 * transporte de emergência que explode no meio da apresentação não é um
 * transporte de emergência.
 */

import {
  canalDeResposta,
  MINUTOS_RETENCAO,
  REST_SINAIS,
  SUPABASE_KEY,
} from './config'

/** Uma linha da tabela, já no formato que o receptor consome. */
export type LinhaSinal = {
  id: number
  evento: string
  payload: Record<string, unknown>
}

/**
 * A chave vai em DOIS headers de propósito.
 *
 * `apikey` é o que o PostgREST do Supabase usa pra achar o projeto;
 * `Authorization` é o que define o papel (`anon`) na hora de avaliar a
 * RLS. Mandar só um dos dois dá 401 com uma mensagem que não ajuda.
 */
function cabecalhos(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  }
}

const alvo = (busca: string) => `${REST_SINAIS}?${busca}`

/**
 * O maior id que este canal já tem.
 *
 * Chamado UMA vez, ao entrar no modo REST, e faz dois trabalhos. O
 * primeiro é o marcador: sem ele o Chromebook leria a tabela do zero e
 * reexecutaria todo comando de uma sessão anterior — a apresentação
 * pularia sozinha até o fim nos primeiros 400 ms. O segundo é ser a
 * CONFERÊNCIA de que a tabela existe: é a primeira coisa que o REST faz,
 * e se ninguém rodou o SQL é aqui que se descobre.
 */
export async function ultimoId(canal: string): Promise<{ id: number; motivo?: string }> {
  try {
    const r = await fetch(
      alvo(`canal=eq.${encodeURIComponent(canal)}&select=id&order=id.desc&limit=1`),
      { headers: cabecalhos() },
    )
    if (!r.ok) return { id: 0, motivo: porQue(r.status) }
    const linhas = (await r.json()) as Array<{ id?: number }>
    return { id: Number(linhas?.[0]?.id ?? 0) || 0 }
  } catch {
    return { id: 0, motivo: 'a tabela não respondeu' }
  }
}

/**
 * Por que a tabela não atendeu, em português e já acionável.
 *
 * Esta é a mensagem que mais importa do arquivo inteiro: a tabela só
 * existe se alguém rodou o SQL no painel, e esquecer isso é o erro mais
 * fácil de cometer e o mais difícil de adivinhar. "não respondeu" mandaria
 * o operador procurar problema no wi-fi da escola às sete da manhã.
 */
export const MOTIVO_SEM_TABELA = 'tabela sinais não existe — rodar docs/sinais.sql'

/**
 * O PostgREST devolve 404 quando a tabela não está no schema cache. Não há
 * como confundir com "endereço errado": a URL é montada aqui, de uma
 * constante, e é sempre a mesma.
 */
function porQue(status: number): string {
  if (status === 404) return MOTIVO_SEM_TABELA
  if (status === 401 || status === 403) {
    // RLS de pé sem policy, ou o `grant` que faltou. Também é SQL não rodado.
    return 'tabela sinais recusou a chave — conferir as policies do SQL'
  }
  return `a tabela respondeu ${status}`
}

/** O que uma leitura devolveu, junto com o tempo que ela levou. */
export type Leitura = {
  linhas: LinhaSinal[]
  /** Ida e volta em ms. É isto que vira o "rest · 420ms" do overlay H. */
  ms: number
  ok: boolean
  /** Só quando `ok` é false: o que dizer pro operador. */
  motivo?: string
}

/** As linhas deste canal com id maior que `depoisDe`, em ordem. */
export async function ler(canal: string, depoisDe: number): Promise<Leitura> {
  const comeco = performance.now()
  try {
    const r = await fetch(
      alvo(
        `canal=eq.${encodeURIComponent(canal)}&id=gt.${depoisDe}` +
          `&select=id,evento,payload&order=id.asc`,
      ),
      { headers: cabecalhos() },
    )
    const ms = Math.round(performance.now() - comeco)
    if (!r.ok) return { linhas: [], ms, ok: false, motivo: porQue(r.status) }
    const cru = (await r.json()) as Array<{
      id?: number
      evento?: string
      payload?: Record<string, unknown>
    }>
    const linhas: LinhaSinal[] = (Array.isArray(cru) ? cru : [])
      .filter((l) => typeof l?.id === 'number' && typeof l?.evento === 'string')
      .map((l) => ({ id: l.id as number, evento: l.evento as string, payload: l.payload ?? {} }))
    return { linhas, ms, ok: true }
  } catch {
    // Nem chegou a ter resposta: sem rede, DNS, proxy. Não dá pra culpar a
    // tabela — e dizer que ela não existe seria mandar o operador rodar um
    // SQL que já está rodado.
    return {
      linhas: [],
      ms: Math.round(performance.now() - comeco),
      ok: false,
      motivo: 'a tabela não respondeu',
    }
  }
}

/**
 * Escreve uma linha. `Prefer: return=minimal` pra resposta vir vazia —
 * não há nada que a gente queira de volta, e é um corpo a menos no
 * wi-fi da escola.
 */
export async function enviar(
  canal: string,
  evento: string,
  payload: unknown,
): Promise<string | null> {
  try {
    const r = await fetch(REST_SINAIS, {
      method: 'POST',
      headers: cabecalhos({
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }),
      body: JSON.stringify({ canal, evento, payload }),
    })
    return r.ok ? null : porQue(r.status)
  } catch {
    return 'a tabela não respondeu'
  }
}

/**
 * Apaga as linhas velhas das DUAS pontas deste canal (a de ida e a
 * `:resp`). São duas requisições em vez de um `or=(...)` cheio de
 * escape: roda uma vez por minuto, e legível ganha de curto.
 *
 * O recorte de tempo é o mesmo da policy do SQL. Se divergirem, o
 * servidor simplesmente não apaga nada — falha silenciosa e inofensiva,
 * mas a tabela cresce. Por isso o número vem do `config.ts`, um só.
 */
export async function apagarAntigas(canal: string): Promise<void> {
  const corte = new Date(Date.now() - MINUTOS_RETENCAO * 60_000).toISOString()
  for (const nome of [canal, canalDeResposta(canal)]) {
    try {
      await fetch(
        alvo(`canal=eq.${encodeURIComponent(nome)}&criado_em=lt.${encodeURIComponent(corte)}`),
        { method: 'DELETE', headers: cabecalhos({ Prefer: 'return=minimal' }) },
      )
    } catch {
      /* a tabela crescer um pouco não estraga apresentação nenhuma */
    }
  }
}
