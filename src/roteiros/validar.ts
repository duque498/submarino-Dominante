import { marcadorExiste, NOMES_MARCADORES } from '../paineis/mapa'
import { formaRegistrada, NOMES_FORMAS } from '../formas'
import { ESPECIES } from '../mundo/bestiario'
import { idSintetizado } from '../audio/hidrofone'
import { NOMES_PAINEIS } from '../paineis/nomes'
import type {
  Acao,
  Cena,
  CenaCombate,
  CenaEmergencia,
  CenaHidrofone,
  CenaIdentificacao,
  Linha,
  Roteiro,
  Turma,
} from './tipos'
import { CACHE_TOTAL, TURMAS } from './tipos'

// Quem edita os JSONs nao e programador: os erros precisam dizer EXATAMENTE
// qual cena e qual campo estao errados, em portugues.

const TIPOS_VALIDOS = [
  'fala',
  'apresentacao',
  'transicao',
  'quiz',
  'vf',
  'pane',
  'emergencia',
  'hidrofone',
  'combate',
  'identificacao',
  'olho',
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
  'presenca',
  'whoosh',
  'agua',
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
      case 'log': {
        const linhas = (acao as { linhas?: unknown }).linhas
        if (!Array.isArray(linhas) || linhas.length === 0 || !linhas.every(ehTextoPreenchido)) {
          erros.push(`${rotulo}: "linhas" deve ser uma lista de textos.`)
        }
        const nivel = (acao as { nivel?: unknown }).nivel
        if (nivel !== undefined && nivel !== 'err' && nivel !== 'warn' && nivel !== 'ok') {
          erros.push(`${rotulo}: "nivel" deve ser "err", "warn" ou "ok".`)
        }
        break
      }
      case 'orbe': {
        const estado = (acao as { estado?: unknown }).estado
        if (estado !== undefined && !ESTADOS_ORBE.includes(String(estado))) {
          erros.push(`${rotulo}: "estado" deve ser ${ESTADOS_ORBE.join(', ')}.`)
        }
        const efeito = (acao as { efeito?: unknown }).efeito
        if (efeito !== undefined && !EFEITOS_ORBE.includes(String(efeito))) {
          erros.push(`${rotulo}: "efeito" deve ser ${EFEITOS_ORBE.join(', ')}.`)
        }
        if (estado === undefined && efeito === undefined) {
          erros.push(`${rotulo}: a acao "orbe" precisa de "estado" ou "efeito".`)
        }
        const ms = (acao as { ms?: unknown }).ms
        if (ms !== undefined && (typeof ms !== 'number' || ms <= 0)) {
          erros.push(`${rotulo}: "ms" deve ser um numero de milissegundos.`)
        }
        break
      }
      case 'trilha': {
        const db = (acao as { db?: unknown }).db
        if (db !== null && (typeof db !== 'number' || db > 0 || db < -60)) {
          erros.push(`${rotulo}: "db" deve ser de -60 a 0, ou null pra parar.`)
        }
        break
      }
      default:
        erros.push(
          `${rotulo}: tipo "${String(acao?.tipo)}" desconhecido. ` +
            `Use: painel, forma, fechar, mapa, camera, sfx, mergulho, log, orbe ou trilha.`,
        )
    }
  })
}

const ESTADOS_ORBE = ['ocioso', 'falando', 'processando', 'pane']
const EFEITOS_ORBE = ['parar', 'tremor', 'lento']

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
/**
 * A cena de identificacao.
 *
 * O que ela nao pode ter, e o motivo: menos de tres pistas (a dinamica e
 * mediana -> facil -> quase entrega, e com duas ela vira adivinhacao), lista de
 * aceitos vazia (o operador precisa saber o que vale como acerto quando a sala
 * gritar "raia" em vez de "arraia") e incremento que nao fecha o total do cache
 * (o contador pararia num numero quebrado depois da ultima especie).
 */
function conferirIdentificacao(cena: CenaIdentificacao, onde: string, erros: string[]) {
  if (!Array.isArray(cena.especies) || cena.especies.length === 0) {
    erros.push(`${onde}: "especies" precisa ser uma lista com pelo menos uma especie.`)
    return
  }
  let soma = 0
  cena.especies.forEach((e, i) => {
    const ondeE = `${onde}, especie ${i + 1} (${e?.id ?? '?'})`
    if (!ehTextoPreenchido(e?.id)) erros.push(`${ondeE}: "id" faltando.`)
    if (!ehTextoPreenchido(e?.nome)) erros.push(`${ondeE}: "nome" faltando.`)
    if (!ehListaDeTextos(e?.aceitos)) {
      erros.push(`${ondeE}: "aceitos" precisa listar os sinonimos que valem como acerto.`)
    }
    if (!ehListaDeTextos(e?.pistas) || e.pistas.length !== 3) {
      erros.push(`${ondeE}: "pistas" precisa ter exatamente 3, da mediana pra facil.`)
    }
    if (!ehListaDeTextos(e?.audioPistas) || e.audioPistas.length !== e?.pistas?.length) {
      erros.push(`${ondeE}: "audioPistas" precisa ter um mp3 por pista.`)
    }
    if (!ehListaDeTextos(e?.curiosidade)) {
      erros.push(
        `${ondeE}: "curiosidade" faltando — e o que a IA conta sobre o bicho ` +
          `depois que a sala acerta, que e o pagamento da dinamica.`,
      )
    }
    if (!ehTextoPreenchido(e?.audioCuriosidade)) {
      erros.push(`${ondeE}: "audioCuriosidade" faltando (o mp3 da fala sobre a especie).`)
    }
    if (typeof e?.intervaloPistas !== 'number' || e.intervaloPistas <= 0) {
      erros.push(`${ondeE}: "intervaloPistas" deve ser um numero de segundos.`)
    }
    if (typeof e?.incrementoCache !== 'number' || e.incrementoCache <= 0) {
      erros.push(`${ondeE}: "incrementoCache" deve ser um numero maior que zero.`)
    } else {
      soma += e.incrementoCache
    }
  })
  if (soma !== CACHE_TOTAL) {
    erros.push(
      `${onde}: os incrementos somam ${soma}, e o cache fecha em ${CACHE_TOTAL}. ` +
        `Depois da ultima especie o contador pararia num numero quebrado.`,
    )
  }
  for (const chave of ['inicio', 'acerto', 'revelado'] as const) {
    const falas = cena.falas?.[chave]
    const audio = cena.audio?.[chave]
    if (!Array.isArray(falas) || falas.length === 0) {
      erros.push(`${onde}: "falas.${chave}" precisa ter pelo menos uma fala.`)
    }
    if (!ehListaDeTextos(audio)) {
      erros.push(`${onde}: "audio.${chave}" precisa ter um mp3 por fala.`)
    }
  }
}

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
  for (const chave of ['rodada', 'acerto', 'erro', 'perdido', 'retorno'] as const) {
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

function conferirEmergencia(cena: CenaEmergencia, onde: string, erros: string[]) {
  if (!ehListaDeTextos(cena.subsistemas)) {
    erros.push(`${onde}: "subsistemas" precisa ser uma lista de textos nao vazia.`)
  }
  if (!ehListaDeTextos(cena.tela?.linhas)) {
    erros.push(`${onde}: "tela.linhas" precisa ser a tela de falha (primeira linha = titulo).`)
  }
  for (const chave of ['falasQueda', 'falasRetorno'] as const) {
    if (!ehListaDeTextos(cena[chave])) {
      erros.push(`${onde}: "${chave}" precisa ser uma lista de falas nao vazia.`)
    }
  }
  for (const chave of ['queda', 'retorno'] as const) {
    if (!ehTextoPreenchido(cena.audio?.[chave])) {
      erros.push(`${onde}: "audio.${chave}" faltando.`)
    }
  }
  if (cena.avanco === 'manual') {
    erros.push(
      `${onde}: a cena "emergencia" nao pode ser manual — ela avanca sozinha ` +
        `quando a IA termina de voltar em modo reduzido, e parar antes disso ` +
        `deixaria a tela de falha travada na frente da plateia.`,
    )
  }
}

function conferirHidrofone(cena: CenaHidrofone, onde: string, erros: string[]) {
  if (!Array.isArray(cena.sons) || cena.sons.length === 0) {
    erros.push(`${onde}: "sons" precisa ser uma lista com pelo menos um som.`)
    return
  }

  cena.sons.forEach((som, i) => {
    const ondeS = `${onde}, som ${i + 1} ("${som?.id ?? '???'}")`
    if (!ehTextoPreenchido(som?.id)) erros.push(`${ondeS}: "id" faltando.`)
    if (!ehTextoPreenchido(som?.nome)) erros.push(`${ondeS}: "nome" faltando.`)
    if (!ehListaDeTextos(som?.aceitos)) {
      erros.push(
        `${ondeS}: "aceitos" vazio. E a lista que o operador le no overlay H ` +
          `pra decidir se a plateia acertou.`,
      )
    }
    if (!ehTextoPreenchido(som?.pista)) {
      erros.push(`${ondeS}: "pista" faltando — uma so, e facil.`)
    }
    if (!ehTextoPreenchido(som?.audioPista)) {
      erros.push(`${ondeS}: "audioPista" faltando (o mp3 da pista).`)
    }
    if (typeof som?.distanciaKm !== 'number' || som.distanciaKm <= 0) {
      erros.push(`${ondeS}: "distanciaKm" deve ser um numero de quilometros.`)
    }
    if (!['superficie', 'navio', 'animal'].includes(som?.origem)) {
      erros.push(`${ondeS}: "origem" deve ser "superficie", "navio" ou "animal".`)
    }
    if (!idSintetizado(som?.id)) {
      erros.push(
        `${ondeS}: nao existe sintetizador pro id "${som?.id}". ` +
          `Ha sintetizador pra: chuva, navio, baleia. Um som sem sintetizador ` +
          `e sem mp3 deixaria a plateia olhando um espectrograma mudo.`,
      )
    }
  })

  for (const chave of ['inicio', 'acerto', 'revelado'] as const) {
    const falas = cena.falas?.[chave]
    const audios = cena.audio?.[chave]
    if (!Array.isArray(falas) || falas.length === 0 || !falas.every(ehListaDeTextos)) {
      erros.push(`${onde}: "falas.${chave}" precisa ser uma lista de listas de falas.`)
    }
    if (!ehListaDeTextos(audios)) {
      erros.push(`${onde}: "audio.${chave}" precisa ser uma lista de mp3.`)
    } else if (Array.isArray(falas) && audios.length !== falas.length) {
      erros.push(
        `${onde}: "audio.${chave}" tem ${audios.length} itens e "falas.${chave}" ` +
          `tem ${falas.length}. Precisam bater.`,
      )
    }
  }

  // As falas de acerto levam o dado da distancia, entao ha UMA por som, na
  // ordem — nao sao sorteadas como as de inicio.
  if (Array.isArray(cena.falas?.acerto) && cena.falas.acerto.length !== cena.sons.length) {
    erros.push(
      `${onde}: "falas.acerto" tem ${cena.falas.acerto.length} entradas e ha ` +
        `${cena.sons.length} sons. Cada acerto carrega a distancia do som dele, ` +
        `entao a lista e na ordem dos sons, nao sorteada.`,
    )
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

    if (cena.sementes !== undefined) {
      const agua = cena.sementes?.agua
      if (agua !== undefined) {
        if (!Array.isArray(agua) || agua.length !== 2 || !agua.every((v) => typeof v === 'number')) {
          erros.push(`${onde}: "sementes.agua" deve ser [inicio, fim] em graus Celsius.`)
        } else if (agua[0] === agua[1]) {
          erros.push(
            `${onde}: "sementes.agua" comeca e termina em ${agua[0]} °C. ` +
              `A leitura existe pra MUDAR na frente da plateia; parada, e so ruido no HUD.`,
          )
        }
      }
      if (cena.sementes?.avisos !== undefined && !ehListaDeTextos(cena.sementes.avisos)) {
        erros.push(`${onde}: "sementes.avisos" deve ser uma lista de textos.`)
      }
    }

    if (cena.reparos !== undefined) {
      if (!Array.isArray(cena.reparos) || cena.reparos.length === 0) {
        erros.push(`${onde}: "reparos" deve ser uma lista com pelo menos um reparo.`)
      } else {
        const teclas = new Set<string>()
        cena.reparos.forEach((reparo, i) => {
          const ondeR = `${onde}, reparo ${i + 1}`
          if (!['1', '2', '3'].includes(reparo?.tecla)) {
            erros.push(`${ondeR}: "tecla" deve ser "1", "2" ou "3".`)
          } else if (teclas.has(reparo.tecla)) {
            erros.push(
              `${ondeR}: a tecla "${reparo.tecla}" ja e usada por outro reparo ` +
                `nesta cena. Uma tecla so pode religar um subsistema.`,
            )
          } else {
            teclas.add(reparo.tecla)
          }
          if (!ehTextoPreenchido(reparo?.subsistema)) {
            erros.push(`${ondeR}: "subsistema" faltando.`)
          }
          if (!ehListaDeTextos(reparo?.fala)) {
            erros.push(`${ondeR}: "fala" precisa ser uma lista de falas nao vazia.`)
          }
          if (!ehTextoPreenchido(reparo?.audio)) {
            erros.push(`${ondeR}: "audio" faltando (o mp3 da fala do reparo).`)
          }
        })
      }
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
      case 'emergencia': {
        conferirEmergencia(cena, onde, erros)
        break
      }
      case 'hidrofone': {
        conferirHidrofone(cena, onde, erros)
        break
      }
      case 'combate': {
        conferirCombate(cena, onde, erros)
        break
      }
      case 'identificacao': {
        conferirIdentificacao(cena, onde, erros)
        break
      }
      case 'olho': {
        if (!ehTextoPreenchido(cena.criatura)) {
          erros.push(`${onde}: campo "criatura" faltando (uma chave do bestiario).`)
        } else if (!ESPECIES.some((e) => e.chave === cena.criatura)) {
          erros.push(
            `${onde}: a criatura "${cena.criatura}" nao esta no bestiario. ` +
              `Disponiveis: ${ESPECIES.map((e) => e.chave).join(', ')}.`,
          )
        }
        if (typeof cena.duracao !== 'number' || cena.duracao < 500) {
          erros.push(`${onde}: "duracao" deve ser um numero de ms (minimo 500).`)
        }
        if (cena.avanco === 'manual') {
          erros.push(
            `${onde}: a cena "olho" nao pode ser manual — ela termina na ` +
              `rachadura, e parar antes disso deixa o olho na tela pra sempre.`,
          )
        }
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

  // Um reparo que aponta pra um subsistema que nao existe nao acende nada e
  // nao reclama: o operador aperta a tecla no meio da apresentacao e fica sem
  // resposta. E exatamente o tipo de erro que so aparece na feira.
  const quebra = roteiro.cenas.find(
    (c): c is CenaEmergencia => (c as Cena)?.tipo === 'emergencia',
  )
  for (const cena of roteiro.cenas) {
    for (const reparo of (cena as Cena)?.reparos ?? []) {
      if (!quebra) {
        erros.push(
          `Cena "${(cena as Cena).id}": ha "reparos" mas o roteiro nao tem ` +
            `nenhuma cena de "emergencia" — nao ha luz nenhuma pra acender.`,
        )
        break
      }
      if (!quebra.subsistemas.includes(reparo.subsistema)) {
        erros.push(
          `Cena "${(cena as Cena).id}": o reparo da tecla "${reparo.tecla}" aponta ` +
            `pro subsistema "${reparo.subsistema}", que nao esta na cena de ` +
            `emergencia "${quebra.id}" (${quebra.subsistemas.join(', ')}).`,
        )
      }
    }
  }

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
