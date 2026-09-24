/**
 * Monta o que o celular vê. Função pura: recebe o que o Player já tem e
 * devolve o payload.
 *
 * Duas coisas moram aqui e não no Player: a tradução de tipo-de-cena pra MODO
 * (a "tela" que o celular desenha) e a COLINHA padrão. A colinha padrão existe
 * pra nenhuma cena chegar no celular sem instrução — quem escreve o roteiro
 * põe `colinha` quando o combinado é específico, e as outras ganham uma frase
 * que ao menos diz qual é a tecla que faz a cena andar.
 */

import type { Cena } from '../roteiros/tipos'
import type { EstadoRemoto, ModoRemoto } from './protocolo'

/**
 * Teclas que existem em qualquer cena. Avançar é a que importa.
 *
 * Escape entra aqui porque é a saída de emergência do operador: fecha o painel
 * que a IA abriu e tira o Diretor do volante até a próxima cena. É justamente
 * quando ele está longe do Chromebook, com o celular na mão, que essa tecla
 * faz mais falta — um painel aberto na hora errada fica na frente da plateia.
 */
const SEMPRE = ['ArrowRight', 'ArrowLeft', ' ', 'Escape']

function modoDaCena(cena: Cena, mergulhando: boolean): ModoRemoto {
  // A espera vem antes do mergulho de propósito: ela é a cena parada, e nada
  // pode estar mergulhando antes de a apresentação começar.
  if (cena.tipo === 'espera') return 'espera'
  if (mergulhando) return 'mergulho'
  switch (cena.tipo) {
    case 'quiz':
    case 'vf':
      return 'quiz'
    case 'identificacao':
      return 'identificacao'
    case 'hidrofone':
      return 'hidrofone'
    case 'combate':
      return 'combate'
    case 'emergencia':
      return 'emergencia'
    default:
      return 'apresentacao'
  }
}

/** Título curto da cena, pro badge do celular. */
export function tituloDaCena(cena: Cena | undefined): string {
  if (!cena) return 'FIM'
  const tela = (cena as { tela?: { titulo?: string } }).tela
  if (tela?.titulo) return tela.titulo
  return cena.id.replace(/-/g, ' ').toUpperCase()
}

function colinhaPadrao(cena: Cena, mergulhando: boolean): string {
  if (cena.tipo === 'espera') {
    return 'Quando a turma estiver pronta, aperte → pra iniciar a IA'
  }
  if (mergulhando) return 'Mergulhando — espere a profundidade chegar'
  switch (cena.tipo) {
    case 'apresentacao':
      return 'Os alunos falam. Quando acabarem, aperte →'
    case 'quiz':
      return 'Leia a pergunta, espere a sala responder, aperte a alternativa'
    case 'vf':
      return 'A sala responde verdadeiro ou falso: V ou F'
    case 'identificacao':
      return 'A sala grita o nome. ENTER confirma; X revela sem acerto'
    case 'hidrofone':
      return 'Toque os sons com 1–4. ENTER quando a sala acertar'
    case 'combate':
      return 'A plateia grita o setor. Aperte 1, 2 ou 3'
    case 'emergencia':
      return 'Religue os subsistemas conforme os alunos falam'
    case 'pane':
      return 'A IA caiu. Deixe o silêncio durar antes de seguir'
    case 'transicao':
      return 'Deslocamento automático — só espere'
    case 'fim':
      return 'Fim da expedição'
    default:
      return 'Fala da IA. Quando terminar, aperte →'
  }
}

function teclasDaCena(cena: Cena, modo: ModoRemoto): string[] {
  // Na espera a lista NÃO parte do SEMPRE: só a seta direita existe. Voltar
  // não tem pra onde ir, e espaço "corta o áudio e avança" — avançaria a cena
  // que é justamente a que não pode avançar por acidente.
  if (modo === 'espera') return ['ArrowRight']
  const teclas = [...SEMPRE]
  switch (modo) {
    case 'apresentacao':
      teclas.push('m', 'n', 'o', 't', '/')
      break
    case 'quiz': {
      if (cena.tipo === 'vf') {
        teclas.push('v', 'f')
        break
      }
      // Só o número de alternativas que a cena realmente tem: um botão aceso
      // que não faz nada é pior que um apagado.
      const quantas = cena.tipo === 'quiz' ? cena.alternativas.length : 4
      for (let i = 1; i <= Math.min(4, quantas); i++) teclas.push(String(i))
      break
    }
    case 'identificacao':
      teclas.push('Enter', 'x')
      break
    case 'hidrofone': {
      const sons = cena.tipo === 'hidrofone' ? cena.sons.length : 4
      for (let i = 1; i <= Math.min(4, sons); i++) teclas.push(String(i))
      teclas.push('Enter', 'x')
      break
    }
    case 'combate': {
      const setores = cena.tipo === 'combate' ? cena.setores.length : 3
      for (let i = 1; i <= Math.min(3, setores); i++) teclas.push(String(i))
      break
    }
    case 'emergencia':
      // As teclas de reparo são declaradas na própria cena. Sem inventar.
      for (const reparo of cena.reparos ?? []) teclas.push(reparo.tecla)
      break
    case 'mergulho':
      break
  }
  // P e R existem em toda cena, mas no celular ficam atrás de toque longo.
  teclas.push('p', 'r')
  return [...new Set(teclas)]
}

/**
 * O estado publicado enquanto a tela de ativação está no ar.
 *
 * O canal abre com a página, então o celular já conecta aqui e vê o PIN
 * valendo. Sem teclas de propósito: o gesto que libera o áudio tem que ser
 * físico, no Chromebook, e o celular não consegue dar esse gesto (ver o
 * `aceitaTeclas` no useRemoto).
 */
export function estadoDeAtivacao(turma: string): EstadoRemoto {
  return {
    turma,
    cenaId: 'ativacao',
    cenaTitulo: 'ATIVAÇÃO',
    proximaTitulo: 'espera',
    instrucao: 'Aperte qualquer tecla NO TECLADO do Chromebook pra ativar os sistemas',
    teclasDisponiveis: [],
    modo: 'ativacao',
    audioDestravado: false,
  }
}

export type DadosDoEstado = {
  turma: string
  cena: Cena
  proxima: Cena | undefined
  mergulhando: boolean
  audioDestravado: boolean
  /** Os mp3 já estão prontos? Na espera, isso é o que libera o →. */
  carregado: boolean
  aviso?: 'audio-bloqueado'
  emergencia?: { casco: boolean; sonar: boolean; com: boolean }
  combate?: { casco: number; contato: number; setor: 1 | 2 | 3; recarga: number }
}

/** Na espera, a colinha muda conforme o que está faltando pra poder começar. */
function colinhaDaEspera(dados: DadosDoEstado, cena: Cena): string {
  if (!dados.carregado) return 'Carregando os áudios da turma — espere'
  if (!dados.audioDestravado) {
    return 'Toque na tela do Chromebook uma vez, depois aperte →'
  }
  return cena.colinha ?? colinhaPadrao(cena, false)
}

export function montarEstado(dados: DadosDoEstado): EstadoRemoto {
  const { cena, mergulhando } = dados
  const modo = modoDaCena(cena, mergulhando)
  return {
    turma: dados.turma,
    cenaId: cena.id,
    cenaTitulo: tituloDaCena(cena),
    proximaTitulo: tituloDaCena(dados.proxima),
    instrucao:
      modo === 'espera'
        ? colinhaDaEspera(dados, cena)
        : (cena.colinha ?? colinhaPadrao(cena, mergulhando)),
    // Na espera o → só vale quando os áudios estão prontos: apertar antes
    // disso começaria a apresentação com a primeira fala muda.
    teclasDisponiveis:
      modo === 'espera' && !dados.carregado ? [] : teclasDaCena(cena, modo),
    modo,
    audioDestravado: dados.audioDestravado,
    ...(dados.aviso ? { aviso: dados.aviso } : {}),
    ...(dados.emergencia ? { emergencia: dados.emergencia } : {}),
    ...(dados.combate ? { combate: dados.combate } : {}),
  }
}
