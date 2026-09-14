import type { Cena, Roteiro, Turma } from './tipos'
import { TURMAS } from './tipos'

// Quem edita os JSONs nao e programador: os erros precisam dizer EXATAMENTE
// qual cena e qual campo estao errados, em portugues.

const TIPOS_VALIDOS = ['fala', 'apresentacao', 'transicao', 'quiz', 'vf', 'pane']
const SFX_VALIDOS = ['sonar', 'alarme', 'estatica', 'ok']

function ehTextoPreenchido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0
}

function ehListaDeTextos(valor: unknown): valor is string[] {
  return Array.isArray(valor) && valor.length > 0 && valor.every(ehTextoPreenchido)
}

/**
 * Confere o roteiro inteiro e devolve a lista de problemas encontrados.
 * Lista vazia = roteiro valido.
 */
export function validarRoteiro(dado: unknown): string[] {
  const erros: string[] = []

  if (typeof dado !== 'object' || dado === null) {
    return ['O arquivo do roteiro nao e um objeto JSON valido.']
  }

  const roteiro = dado as Partial<Roteiro>

  if (!TURMAS.includes(roteiro.turma as Turma)) {
    erros.push(
      `Campo "turma": esperado um de ${TURMAS.join(', ')}, veio "${String(roteiro.turma)}".`,
    )
  }

  if (!Array.isArray(roteiro.cenas) || roteiro.cenas.length === 0) {
    erros.push('Campo "cenas": precisa ser uma lista com pelo menos uma cena.')
    return erros
  }

  const idsVistos = new Set<string>()

  roteiro.cenas.forEach((cena, indice) => {
    const onde = `Cena ${indice + 1} (id "${(cena as Cena)?.id ?? '???'}")`

    if (typeof cena !== 'object' || cena === null) {
      erros.push(`Cena ${indice + 1}: nao e um objeto.`)
      return
    }

    if (!ehTextoPreenchido(cena.id)) {
      erros.push(`Cena ${indice + 1}: campo "id" faltando ou vazio.`)
    } else if (idsVistos.has(cena.id)) {
      erros.push(`${onde}: o id "${cena.id}" esta repetido no roteiro.`)
    } else {
      idsVistos.add(cena.id)
    }

    if (!TIPOS_VALIDOS.includes((cena as Cena).tipo)) {
      erros.push(
        `${onde}: campo "tipo" invalido ("${String((cena as Cena).tipo)}"). ` +
          `Use um de: ${TIPOS_VALIDOS.join(', ')}.`,
      )
      return
    }

    if (cena.avanco !== undefined && cena.avanco !== 'auto' && cena.avanco !== 'manual') {
      erros.push(`${onde}: campo "avanco" deve ser "auto" ou "manual".`)
    }

    if (cena.sfx !== undefined && !SFX_VALIDOS.includes(cena.sfx)) {
      erros.push(`${onde}: campo "sfx" invalido. Use um de: ${SFX_VALIDOS.join(', ')}.`)
    }

    if (cena.log !== undefined && !ehListaDeTextos(cena.log)) {
      erros.push(`${onde}: campo "log" deve ser uma lista de textos nao vazia.`)
    }

    switch (cena.tipo) {
      case 'fala': {
        if (!ehListaDeTextos(cena.tela?.linhas)) {
          erros.push(`${onde}: "tela.linhas" precisa ser uma lista de textos nao vazia.`)
        }
        if (!ehTextoPreenchido(cena.audio)) {
          erros.push(`${onde}: campo "audio" precisa ser o caminho do mp3.`)
        }
        break
      }
      case 'apresentacao': {
        if (!ehTextoPreenchido(cena.tela?.titulo)) {
          erros.push(`${onde}: "tela.titulo" faltando.`)
        }
        if (!ehTextoPreenchido(cena.tela?.status)) {
          erros.push(`${onde}: "tela.status" faltando.`)
        }
        if (cena.avanco !== 'manual') {
          erros.push(`${onde}: cena de apresentacao precisa ter "avanco": "manual".`)
        }
        break
      }
      case 'transicao': {
        if (!ehTextoPreenchido(cena.destino)) {
          erros.push(`${onde}: campo "destino" faltando (ex.: "2o ano B").`)
        }
        if (!ehListaDeTextos(cena.tela?.linhas)) {
          erros.push(`${onde}: "tela.linhas" precisa ser uma lista de textos nao vazia.`)
        }
        if (!ehTextoPreenchido(cena.audio)) {
          erros.push(`${onde}: campo "audio" precisa ser o caminho do mp3.`)
        }
        break
      }
      case 'quiz': {
        if (!ehTextoPreenchido(cena.pergunta)) {
          erros.push(`${onde}: campo "pergunta" faltando.`)
        }
        if (!ehListaDeTextos(cena.alternativas)) {
          erros.push(`${onde}: "alternativas" precisa ser uma lista de textos.`)
        } else if (cena.alternativas.length < 2 || cena.alternativas.length > 4) {
          erros.push(
            `${onde}: "alternativas" precisa ter de 2 a 4 itens (tem ${cena.alternativas.length}).`,
          )
        } else if (
          typeof cena.correta !== 'number' ||
          !Number.isInteger(cena.correta) ||
          cena.correta < 0 ||
          cena.correta >= cena.alternativas.length
        ) {
          erros.push(
            `${onde}: "correta" deve ser o indice da alternativa certa, ` +
              `entre 0 e ${cena.alternativas.length - 1}.`,
          )
        }
        if (typeof cena.tempo !== 'number' || cena.tempo <= 0) {
          erros.push(`${onde}: "tempo" deve ser o numero de segundos do timer.`)
        }
        for (const chave of ['pergunta', 'acerto', 'erro'] as const) {
          if (!ehTextoPreenchido(cena.audio?.[chave])) {
            erros.push(`${onde}: "audio.${chave}" faltando.`)
          }
        }
        break
      }
      case 'vf': {
        if (!ehTextoPreenchido(cena.afirmacao)) {
          erros.push(`${onde}: campo "afirmacao" faltando.`)
        }
        if (typeof cena.resposta !== 'boolean') {
          erros.push(`${onde}: "resposta" deve ser true (verdadeiro) ou false (falso).`)
        }
        if (typeof cena.tempo !== 'number' || cena.tempo <= 0) {
          erros.push(`${onde}: "tempo" deve ser o numero de segundos do timer.`)
        }
        for (const chave of ['afirmacao', 'acerto', 'erro'] as const) {
          if (!ehTextoPreenchido(cena.audio?.[chave])) {
            erros.push(`${onde}: "audio.${chave}" faltando.`)
          }
        }
        break
      }
      case 'pane': {
        if (!ehListaDeTextos(cena.subsistemas)) {
          erros.push(`${onde}: "subsistemas" precisa ser uma lista de textos nao vazia.`)
        } else if (cena.estados !== undefined) {
          if (!ehListaDeTextos(cena.estados)) {
            erros.push(`${onde}: "estados" precisa ser uma lista de textos.`)
          } else if (cena.estados.length !== cena.subsistemas.length) {
            erros.push(
              `${onde}: "estados" tem ${cena.estados.length} itens mas ` +
                `"subsistemas" tem ${cena.subsistemas.length}. Precisam bater.`,
            )
          }
        }
        for (const chave of ['entrada', 'retorno'] as const) {
          if (!ehTextoPreenchido(cena.audio?.[chave])) {
            erros.push(`${onde}: "audio.${chave}" faltando.`)
          }
        }
        break
      }
    }
  })

  return erros
}

/** Erro lancado quando o roteiro nao passa na validacao. */
export class RoteiroInvalido extends Error {
  readonly problemas: string[]

  constructor(problemas: string[]) {
    super(`Roteiro inválido: ${problemas.length} problema(s).`)
    this.problemas = problemas
  }
}

/** Valida e devolve o roteiro tipado, ou lanca RoteiroInvalido. */
export function carregarRoteiro(dado: unknown): Roteiro {
  const problemas = validarRoteiro(dado)
  if (problemas.length > 0) throw new RoteiroInvalido(problemas)
  return dado as Roteiro
}
