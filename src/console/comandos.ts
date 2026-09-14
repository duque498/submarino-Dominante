import { formaRegistrada, NOMES_FORMAS } from '../formas'
import { PRIMITIVAS } from '../formas/primitivas'
import { NOMES_FICHAS, NOMES_PAINEIS, resolverPainel } from '../paineis/nomes'
import { MOLDES, RESPOSTAS, type ChaveResposta } from './respostas'

/**
 * Parser dos comandos do console. Sintaxe livre e tolerante: no palco, o
 * operador digita rápido e na frente de todo mundo — errar acento ou esquecer
 * o verbo não pode quebrar nada.
 */

export type Comando =
  | { tipo: 'forma'; nome: string; argumento?: string; resposta: string; chaveAudio?: ChaveResposta }
  | { tipo: 'painel'; nome: string; argumento?: string; resposta: string }
  | { tipo: 'cena'; alvo: number | string; resposta: string }
  | {
      tipo: 'sistema'
      acao:
        | 'pane'
        | 'reiniciar'
        | 'limpar'
        | 'ajuda'
        | 'status'
        | 'proximo'
        | 'voltar'
        | 'som'
        | 'ambiente'
      resposta: string
      chaveAudio?: ChaveResposta
    }
  | { tipo: 'profundidade'; metros: number; resposta: string }
  | {
      tipo: 'vozes'
      /** Número da voz na lista. Sem ele, o comando só lista. */
      numero?: number
      /** Troca a fonte da narração. */
      motor?: 'mp3' | 'sistema'
      resposta: string
    }
  | { tipo: 'desconhecido'; entrada: string; resposta: string; chaveAudio?: ChaveResposta }

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
    'camera 1',
    'camera 2',
    'profundidade 4500',
    'som',
    'ambiente',
    'vozes',
    'voz 1',
    'voz sistema',
    'voz mp3',
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
    const ehEsfera = semVerboForma === 'esfera'
    return {
      tipo: 'forma',
      nome: semVerboForma,
      resposta: ehEsfera ? RESPOSTAS.esfera : MOLDES.forma(semVerboForma),
      chaveAudio: ehEsfera ? 'esfera' : undefined,
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
      resposta: MOLDES.forma(conteudo),
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
        resposta: MOLDES.fichaSemArgumento(NOMES_FICHAS.join(', ')),
      }
    }
    return {
      tipo: 'painel',
      nome: painel,
      argumento,
      resposta: argumento ? MOLDES.ficha(argumento) : MOLDES.painel(painel),
    }
  }

  // 4) voz. Tudo que começa com voz/vozes cai aqui, porque na hora de digitar
  // ninguém lembra se o comando era no singular ou no plural.
  const comandoDeVoz = /^(?:voz|vozes|narrador|trocar voz|listar vozes)(?:\s+(.+))?$/.exec(
    texto,
  )
  if (comandoDeVoz) {
    const argumento = (comandoDeVoz[1] ?? '').trim()
    if (!argumento) {
      return { tipo: 'vozes', resposta: 'Listando vozes instaladas no log de bordo.' }
    }
    if (/^\d+$/.test(argumento)) {
      return {
        tipo: 'vozes',
        numero: Number(argumento),
        resposta: 'Trocando o sintetizador de voz.',
      }
    }
    if (/^(mp3|gravacao|gravada|arquivo|bordo)$/.test(argumento)) {
      return { tipo: 'vozes', motor: 'mp3', resposta: 'Usando a gravação de bordo.' }
    }
    if (/^(sistema|navegador|sintetizador|ao vivo)$/.test(argumento)) {
      return { tipo: 'vozes', motor: 'sistema', resposta: 'Usando a voz do sistema.' }
    }
    // Chegou aqui: quis mexer na voz mas errou a forma. Responder com a forma
    // certa é mais útil que mandar de volta pro "não reconhecido".
    return {
      tipo: 'vozes',
      resposta: 'Use: vozes (lista), voz 2 (escolhe), voz mp3 ou voz sistema.',
    }
  }

  // 5) profundidade (comando de depuração: força o cenário numa faixa)
  const profundidade = /^(?:profundidade|prof|descer|subir)\s+(\d+)$/.exec(texto)
  if (profundidade) {
    const metros = Math.max(0, Math.min(11000, Number(profundidade[1])))
    return {
      tipo: 'profundidade',
      metros,
      resposta: MOLDES.profundidade(metros),
    }
  }

  // 6) navegação
  if (VERBOS_CENA.includes(palavras[0]) && palavras[1]) {
    const numero = Number(palavras[1])
    const alvo = Number.isInteger(numero) && numero > 0 ? numero : palavras.slice(1).join('-')
    return { tipo: 'cena', alvo, resposta: MOLDES.navegando(palavras.slice(1).join(' ')) }
  }

  // 7) sistema
  switch (texto) {
    case 'pane':
    case 'falha':
      return {
        tipo: 'sistema',
        acao: 'pane',
        resposta: RESPOSTAS.paneAlerta,
        chaveAudio: 'paneAlerta',
      }
    case 'reiniciar':
    case 'reset':
      return {
        tipo: 'sistema',
        acao: 'reiniciar',
        resposta: RESPOSTAS.reiniciado,
        chaveAudio: 'reiniciado',
      }
    case 'limpar':
    case 'fechar':
      return {
        tipo: 'sistema',
        acao: 'limpar',
        resposta: RESPOSTAS.paineisEncerrados,
        chaveAudio: 'paineisEncerrados',
      }
    case 'ambiente':
    case 'fundo':
    case 'mar':
      return {
        tipo: 'sistema',
        acao: 'ambiente',
        resposta: 'Alternando captação acústica externa.',
      }
    case 'som':
    case 'testar som':
    case 'audio':
    case 'teste de som':
      return {
        tipo: 'sistema',
        acao: 'som',
        resposta: 'Testando os alto-falantes de bordo.',
      }
    case 'ajuda':
    case 'help':
      return { tipo: 'sistema', acao: 'ajuda', resposta: RESPOSTAS.ajuda, chaveAudio: 'ajuda' }
    case 'proximo':
    case 'avancar':
      return {
        tipo: 'sistema',
        acao: 'proximo',
        resposta: RESPOSTAS.avancando,
        chaveAudio: 'avancando',
      }
    case 'voltar':
      return {
        tipo: 'sistema',
        acao: 'voltar',
        resposta: RESPOSTAS.retornando,
        chaveAudio: 'retornando',
      }
  }

  // 8) primitivas procedurais, desenhadas na hora
  if (semVerboForma in PRIMITIVAS) {
    return {
      tipo: 'forma',
      nome: semVerboForma,
      resposta: MOLDES.forma(semVerboForma),
    }
  }

  // 9) fallback — nunca "comando inválido" seco: no palco isso parece defeito
  return {
    tipo: 'desconhecido',
    entrada: bruto,
    resposta: RESPOSTAS.desconhecido,
    chaveAudio: 'desconhecido',
  }
}

/** Um comando roteirizado resolve? Usado pela validação do JSON. */
export function comandoResolve(texto: string): boolean {
  return interpretar(texto).tipo !== 'desconhecido'
}
