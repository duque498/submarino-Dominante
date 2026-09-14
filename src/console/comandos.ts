import { formaRegistrada, NOMES_FORMAS } from '../formas'
import { PRIMITIVAS } from '../formas/primitivas'
import { NOMES_FICHAS, NOMES_PAINEIS, resolverPainel } from '../paineis/nomes'

/**
 * Parser dos comandos do console. Sintaxe livre e tolerante: no palco, o
 * operador digita rápido e na frente de todo mundo — errar acento ou esquecer
 * o verbo não pode quebrar nada.
 */

export type Comando =
  | { tipo: 'forma'; nome: string; argumento?: string; resposta: string }
  | { tipo: 'painel'; nome: string; argumento?: string; resposta: string }
  | { tipo: 'cena'; alvo: number | string; resposta: string }
  | {
      tipo: 'sistema'
      acao: 'pane' | 'reiniciar' | 'limpar' | 'ajuda' | 'status' | 'proximo' | 'voltar'
      resposta: string
    }
  | { tipo: 'desconhecido'; entrada: string; resposta: string }

/** Minúsculas, sem acento, sem espaço sobrando. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

const VERBOS_FORMA = ['forma', 'formar', 'morfar', 'virar', 'assumir', 'ser']
const VERBOS_PAINEL = ['abrir', 'mostrar', 'exibir', 'ver', 'consultar']
const VERBOS_CENA = ['cena', 'ir', 'pular']

/** Tudo que o autocomplete e o comando "ajuda" conhecem. */
export function vocabulario(): string[] {
  return [
    ...NOMES_FORMAS.filter((nome: string) => nome !== 'esfera'),
    'esfera',
    ...NOMES_PAINEIS,
    ...NOMES_FICHAS.map((nome: string) => `ficha ${nome}`),
    'pane',
    'reiniciar',
    'limpar',
    'ajuda',
    'proximo',
    'voltar',
    'letra a',
    'numero 1',
  ]
}

/** Primeira sugestão que começa com o que já foi digitado. */
export function completar(parcial: string): string | null {
  const alvo = normalizar(parcial)
  if (!alvo) return null
  return vocabulario().find((opcao) => opcao.startsWith(alvo) && opcao !== alvo) ?? null
}

function semVerbo(palavras: string[], verbos: string[]): string[] {
  return verbos.includes(palavras[0]) ? palavras.slice(1) : palavras
}

export function interpretar(entrada: string): Comando {
  const bruto = entrada.trim()
  const texto = normalizar(bruto)
  if (!texto) return { tipo: 'desconhecido', entrada: bruto, resposta: '' }

  const palavras = texto.split(' ')

  // 1) formas registradas — com ou sem verbo antes
  const semVerboForma = semVerbo(palavras, VERBOS_FORMA).join(' ')
  if (formaRegistrada(semVerboForma)) {
    return {
      tipo: 'forma',
      nome: semVerboForma,
      resposta:
        semVerboForma === 'esfera'
          ? 'Retornando à forma padrão.'
          : `Assumindo forma: ${semVerboForma.toUpperCase()}.`,
    }
  }

  // 2) glifos: "letra x", "numero 7"
  const glifo = /^(?:letra|numero|número)\s+(.+)$/.exec(semVerboForma)
  if (glifo) {
    const conteudo = glifo[1].replace(/\s+/g, '').slice(0, 3)
    return {
      tipo: 'forma',
      nome: 'glifo',
      argumento: conteudo,
      resposta: `Assumindo forma: ${conteudo.toUpperCase()}.`,
    }
  }

  // 3) painéis
  const semVerboPainel = semVerbo(palavras, VERBOS_PAINEL)
  const painel = resolverPainel(semVerboPainel[0] ?? '')
  if (painel) {
    const argumento = semVerboPainel.slice(1).join(' ') || undefined
    if (painel === 'ficha' && !argumento) {
      return {
        tipo: 'desconhecido',
        entrada: bruto,
        resposta: `Informe o que catalogar. Disponíveis: ${NOMES_FICHAS.join(', ')}.`,
      }
    }
    return {
      tipo: 'painel',
      nome: painel,
      argumento,
      resposta: argumento
        ? `Abrindo ficha: ${argumento.toUpperCase()}.`
        : `Abrindo ${painel.toUpperCase()}.`,
    }
  }

  // 4) navegação
  if (VERBOS_CENA.includes(palavras[0]) && palavras[1]) {
    const numero = Number(palavras[1])
    const alvo = Number.isInteger(numero) && numero > 0 ? numero : palavras.slice(1).join('-')
    return { tipo: 'cena', alvo, resposta: `Navegando para ${palavras.slice(1).join(' ')}.` }
  }

  // 5) sistema
  switch (texto) {
    case 'pane':
    case 'falha':
      return { tipo: 'sistema', acao: 'pane', resposta: 'ALERTA. FALHA NO SISTEMA DE BORDO.' }
    case 'reiniciar':
    case 'reset':
      return { tipo: 'sistema', acao: 'reiniciar', resposta: '...sistema reiniciado.' }
    case 'limpar':
    case 'fechar':
      return { tipo: 'sistema', acao: 'limpar', resposta: 'Painéis encerrados.' }
    case 'ajuda':
    case 'help':
      return { tipo: 'sistema', acao: 'ajuda', resposta: 'Listando comandos no log de bordo.' }
    case 'proximo':
    case 'avancar':
      return { tipo: 'sistema', acao: 'proximo', resposta: 'Avançando.' }
    case 'voltar':
      return { tipo: 'sistema', acao: 'voltar', resposta: 'Retornando.' }
  }

  // 6) primitivas procedurais, desenhadas na hora
  if (semVerboForma in PRIMITIVAS) {
    return {
      tipo: 'forma',
      nome: semVerboForma,
      resposta: `Assumindo forma: ${semVerboForma.toUpperCase()}.`,
    }
  }

  // 7) fallback — nunca "comando inválido" seco: no palco isso parece defeito
  return {
    tipo: 'desconhecido',
    entrada: bruto,
    resposta: 'Comando não reconhecido pelo sistema de bordo.',
  }
}

/** Um comando roteirizado resolve? Usado pela validação do JSON. */
export function comandoResolve(texto: string): boolean {
  return interpretar(texto).tipo !== 'desconhecido'
}
