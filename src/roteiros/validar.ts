import { marcadorExiste, NOMES_MARCADORES } from '../paineis/mapa'
import { formaRegistrada, NOMES_FORMAS } from '../formas'
import { ESPECIES } from '../mundo/bestiario'
import { NOMES_PAINEIS } from '../paineis/nomes'
import type { Acao, Cena, CenaCombate, Linha, Roteiro, Turma } from './tipos'
import { TURMAS } from './tipos'

// Quem edita os JSONs nao e programador: os erros precisam dizer EXATAMENTE
// qual cena e qual campo estao errados, em portugues.

const TIPOS_VALIDOS = [
  'fala',
  'apresentacao',
  'transicao',
  'quiz',
  'vf',
  'pane',
  'combate',
  'fim',
]
const SFX_VALIDOS = [
  'sonar',
  'alarme',
  'estatica',
  'ok',
  'pressurizacao',
  'bipe-timer',
  'casco',
  'vidro',
  'pulso',
  'impacto',
]
const VISOR_VALIDO = ['ok', 'rachado', 'parcial']

function ehTextoPreenchido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0
}

function ehListaDeTextos(valor: unknown): valor is string[] {
  return Array.isArray(valor) && valor.length > 0 && valor.every(ehTextoPreenchido)
}

/** Uma linha e um texto solto ou um objeto com texto e acoes. */
function ehLinha(valor: unknown): valor is Linha {
  if (ehTextoPreenchido(valor)) return true
  return (
    typeof valor === 'object' &&
    valor !== null &&
    ehTextoPreenchido((valor as { texto?: unknown }).texto)
  )
}

function ehListaDeLinhas(valor: unknown): valor is Linha[] {
  return Array.isArray(valor) && valor.length > 0 && valor.every(ehLinha)
}

/** Confere um prazo de vida ("ate"). `total` e quantas linhas a cena tem. */
function conferirPrazo(prazo: unknown, total: number, onde: string, erros: string[]) {
  if (prazo === 'fimLinha' || prazo === 'fimCena') return
  if (typeof prazo === 'object' && prazo !== null) {
    const p = prazo as { linha?: unknown; segundos?: unknown }
    if (typeof p.linha === 'number') {
      if (!Number.isInteger(p.linha) || p.linha < 0 || p.linha >= total) {
        erros.push(
          `${onde}: "ate.linha" e ${p.linha}, mas esta cena tem ${total} linha(s) ` +
            `(indices 0 a ${Math.max(0, total - 1)}).`,
        )
      }
      return
    }
    if (typeof p.segundos === 'number' && p.segundos > 0) return
  }
  erros.push(
    `${onde}: "ate" deve ser "fimLinha", "fimCena", { "linha": N } ou { "segundos": N }.`,
  )
}

/** Confere as acoes de uma linha: nomes que nao existem viram erro legivel. */
function conferirAcoes(linha: Linha, total: number, onde: string, erros: string[]) {
  if (typeof linha === 'string') return
  const acoes = (linha as { acoes?: unknown }).acoes
  if (acoes === undefined) return
  if (!Array.isArray(acoes)) {
    erros.push(`${onde}: "acoes" deve ser uma lista.`)
    return
  }

  acoes.forEach((bruta, i) => {
    const acao = bruta as Partial<Acao> & { tipo?: string }
    const rotulo = `${onde}, acao ${i + 1}`
    if (acao?.quando !== undefined && acao.quando !== 'inicio' && acao.quando !== 'fim') {
      erros.push(`${rotulo}: "quando" deve ser "inicio" ou "fim".`)
    }
    switch (acao?.tipo) {
      case 'painel': {
        const nome = (acao as { nome?: unknown }).nome
        if (!ehTextoPreenchido(nome) || !NOMES_PAINEIS.includes(nome)) {
          erros.push(
            `${rotulo}: painel "${String(nome)}" nao existe. ` +
              `Disponiveis: ${NOMES_PAINEIS.join(', ')}.`,
          )
        }
        conferirPrazo((acao as { ate?: unknown }).ate, total, rotulo, erros)
        break
      }
      case 'forma': {
        const nome = (acao as { nome?: unknown }).nome
        if (!ehTextoPreenchido(nome) || !formaRegistrada(nome)) {
          erros.push(
            `${rotulo}: a forma "${String(nome)}" nao esta registrada. ` +
              `Formas disponiveis: ${NOMES_FORMAS.join(', ')}.`,
          )
        }
        conferirPrazo((acao as { ate?: unknown }).ate, total, rotulo, erros)
        break
      }
      case 'mapa': {
        const marcador = (acao as { marcador?: unknown }).marcador
        if (!ehTextoPreenchido(marcador) || !marcadorExiste(marcador)) {
          erros.push(
            `${rotulo}: marcador "${String(marcador)}" nao existe no mapa. ` +
              `Disponiveis: ${NOMES_MARCADORES.join(', ')}.`,
          )
        }
        const ate = (acao as { ate?: unknown }).ate
        if (ate !== undefined) conferirPrazo(ate, total, rotulo, erros)
        break
      }
      case 'camera': {
        const qual = (acao as { qual?: unknown }).qual
        if (qual !== 1 && qual !== 2) {
          erros.push(`${rotulo}: "qual" deve ser 1 ou 2.`)
        }
        conferirPrazo((acao as { ate?: unknown }).ate, total, rotulo, erros)
        break
      }
      case 'fechar': {
        const alvo = (acao as { alvo?: unknown }).alvo
        if (alvo !== 'painel' && alvo !== 'forma' && alvo !== 'tudo') {
          erros.push(`${rotulo}: "alvo" deve ser "painel", "forma" ou "tudo".`)
        }
        break
      }
      case 'sfx': {
        const nome = (acao as { nome?: unknown }).nome
        if (!ehTextoPreenchido(nome) || !SFX_VALIDOS.includes(nome)) {
          erros.push(`${rotulo}: sfx "${String(nome)}" nao existe. Use: ${SFX_VALIDOS.join(', ')}.`)
        }
        break
      }
      case 'mergulho': {
        const para = (acao as { para?: unknown }).para
        if (typeof para !== 'number' || para < 0) {
          erros.push(`${rotulo}: "para" deve ser a profundidade-alvo em metros.`)
        }
        break
      }
      default:
        erros.push(
          `${rotulo}: tipo "${String(acao?.tipo)}" desconhecido. ` +
            `Use: painel, forma, fechar, mapa, camera, sfx ou mergulho.`,
        )
    }
  })
}

/** Roda a conferencia de acoes em todas as linhas da cena. */
function conferirLinhas(linhas: unknown, onde: string, erros: string[]) {
  if (!Array.isArray(linhas)) return
  linhas.forEach((linha, i) => {
    if (!ehLinha(linha)) return
    conferirAcoes(linha as Linha, linhas.length, `${onde}, linha ${i}`, erros)
  })
}

/**
 * Confere o roteiro inteiro e devolve a lista de problemas encontrados.
 * Lista vazia = roteiro valido.
 */
/**
 * Confere uma cena de combate.
 *
 * O contrato mais importante e o alinhamento entre `rodadas`, `falas.rodada` e
 * `audio.rodada`: se as tres listas nao tiverem o mesmo tamanho, a terceira
 * rodada fica muda no dia da feira e ninguem descobre antes. Melhor a tela
 * vermelha no carregamento.
 */
function conferirCombate(cena: CenaCombate, onde: string, erros: string[]) {
  if (!ehTextoPreenchido(cena.criatura)) {
    erros.push(`${onde}: campo "criatura" faltando (uma chave do bestiario).`)
  } else if (!ESPECIES.some((e) => e.chave === cena.criatura)) {
    erros.push(
      `${onde}: a criatura "${cena.criatura}" nao esta no bestiario. ` +
        `Disponiveis: ${ESPECIES.map((e) => e.chave).join(', ')}. ` +
        `Pra adicionar, escreva o desenho em src/mundo/bestiario.ts.`,
    )
  }

  if (!ehListaDeTextos(cena.setores) || cena.setores.length < 2) {
    erros.push(`${onde}: "setores" precisa ter pelo menos 2 rotulos (ex.: PROA, BOMBORDO).`)
  } else if (cena.setores.length > 9) {
    erros.push(`${onde}: "setores" tem ${cena.setores.length} — o maximo e 9 (teclas 1 a 9).`)
  }
  const quantosSetores = Array.isArray(cena.setores) ? cena.setores.length : 0

  if (!Array.isArray(cena.rodadas) || cena.rodadas.length === 0) {
    erros.push(`${onde}: "rodadas" precisa ser uma lista com pelo menos uma rodada.`)
    return
  }

  cena.rodadas.forEach((rodada, i) => {
    const ondeR = `${onde}, rodada ${i + 1}`
    if (typeof rodada?.distancia !== 'number' || rodada.distancia <= 0) {
      erros.push(`${ondeR}: "distancia" deve ser um numero de metros maior que zero.`)
    }
    if (typeof rodada?.tempo !== 'number' || rodada.tempo <= 0) {
      erros.push(`${ondeR}: "tempo" deve ser um numero de segundos maior que zero.`)
    }
    if (rodada?.setor !== undefined) {
      if (!Number.isInteger(rodada.setor) || rodada.setor < 0 || rodada.setor >= quantosSetores) {
        erros.push(
          `${ondeR}: "setor" ${rodada.setor} nao existe — ` +
            `os setores vao de 0 a ${quantosSetores - 1}.`,
        )
      }
    }
  })

  const total = cena.rodadas.length
  for (const chave of ['rodada', 'acerto', 'erro', 'timeout'] as const) {
    const falas = cena.falas?.[chave]
    if (!Array.isArray(falas) || falas.length === 0) {
      erros.push(`${onde}: "falas.${chave}" precisa ser uma lista de falas nao vazia.`)
    } else if (!falas.every(ehListaDeTextos)) {
      erros.push(`${onde}: "falas.${chave}" e uma lista de FALAS, e cada fala e uma lista de linhas.`)
    } else if (chave === 'rodada' && falas.length !== total) {
      erros.push(
        `${onde}: "falas.rodada" tem ${falas.length} falas mas ha ${total} rodadas. ` +
          `Uma por rodada, na ordem.`,
      )
    }

    const audios = cena.audio?.[chave]
    if (!ehListaDeTextos(audios)) {
      erros.push(`${onde}: "audio.${chave}" precisa ser uma lista de caminhos de mp3.`)
    } else if (Array.isArray(falas) && audios.length !== falas.length) {
      erros.push(
        `${onde}: "audio.${chave}" tem ${audios.length} caminhos e ` +
          `"falas.${chave}" tem ${falas.length} falas. Precisam bater.`,
      )
    }
  }

  if (cena.falas?.critico !== undefined && !ehListaDeTextos(cena.falas.critico)) {
    erros.push(`${onde}: "falas.critico" deve ser uma lista de linhas.`)
  }
  if (cena.falas?.critico && !ehTextoPreenchido(cena.audio?.critico)) {
    erros.push(`${onde}: "falas.critico" existe mas "audio.critico" faltando.`)
  }
}

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

    if (cena.profundidade !== undefined) {
      if (typeof cena.profundidade !== 'number' || Number.isNaN(cena.profundidade)) {
        erros.push(`${onde}: "profundidade" deve ser um numero em metros.`)
      } else if (cena.profundidade < 0 || cena.profundidade > 11000) {
        erros.push(
          `${onde}: "profundidade" fora da faixa (${cena.profundidade} m). ` +
            `Use de 0 a 11000 — o ponto mais fundo do oceano tem ~10994 m.`,
        )
      }
    }

    if (cena.cameras !== undefined && typeof cena.cameras !== 'boolean') {
      erros.push(`${onde}: "cameras" deve ser true ou false.`)
    }

    if (cena.visor !== undefined && !VISOR_VALIDO.includes(cena.visor)) {
      erros.push(`${onde}: "visor" deve ser um de: ${VISOR_VALIDO.join(', ')}.`)
    }

    if (cena.ameacas !== undefined && typeof cena.ameacas !== 'boolean') {
      erros.push(`${onde}: "ameacas" deve ser true ou false.`)
    }

    if (cena.comandos !== undefined) {
      // O modelo de comandos roteirizados saiu na Fase 3.5: quem decide agora e
      // o Diretor, pelas `acoes` de cada linha. Deixar o campo passar calado
      // seria pior que o erro — o roteiro pareceria certo e nada aconteceria.
      erros.push(
        `${onde}: o campo "comandos" nao existe mais. Ponha uma acao na linha ` +
          `que justifica o efeito: { "texto": "...", "acoes": [{ "tipo": "painel", ` +
          `"nome": "sonar", "ate": "fimLinha" }] }.`,
      )
    }

    if (cena.formas !== undefined) {
      if (!ehListaDeTextos(cena.formas)) {
        erros.push(`${onde}: campo "formas" deve ser uma lista de nomes de forma.`)
      } else {
        for (const nome of cena.formas) {
          if (!formaRegistrada(nome)) {
            erros.push(
              `${onde}: a forma "${nome}" nao esta registrada. ` +
                `Formas disponiveis: ${NOMES_FORMAS.join(', ')}. ` +
                `Pra adicionar, ponha o PNG em src/formas/ e registre em src/formas/index.ts.`,
            )
          }
        }
      }
    }

    switch (cena.tipo) {
      case 'fala': {
        if (!ehListaDeLinhas(cena.tela?.linhas)) {
          erros.push(`${onde}: "tela.linhas" precisa ser uma lista de falas nao vazia.`)
        } else {
          conferirLinhas(cena.tela.linhas, onde, erros)
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
        if (cena.orbe !== undefined && cena.orbe !== 'palco' && cena.orbe !== 'discreto') {
          erros.push(`${onde}: campo "orbe" deve ser "palco" ou "discreto".`)
        }
        break
      }
      case 'transicao': {
        if (!ehTextoPreenchido(cena.destino)) {
          erros.push(`${onde}: campo "destino" faltando (ex.: "2o ano B").`)
        }
        if (!ehListaDeLinhas(cena.tela?.linhas)) {
          erros.push(`${onde}: "tela.linhas" precisa ser uma lista de falas nao vazia.`)
        } else {
          conferirLinhas(cena.tela.linhas, onde, erros)
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
      case 'combate': {
        conferirCombate(cena, onde, erros)
        break
      }
      case 'fim': {
        if (!ehTextoPreenchido(cena.tela?.titulo)) {
          erros.push(`${onde}: "tela.titulo" faltando.`)
        }
        if (!ehTextoPreenchido(cena.tela?.subtitulo)) {
          erros.push(`${onde}: "tela.subtitulo" faltando.`)
        }
        if (cena.avanco === 'auto') {
          erros.push(
            `${onde}: a cena "fim" nao pode ter "avanco": "auto" — ` +
              `ela e a ultima tela e fica na frente da plateia.`,
          )
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
