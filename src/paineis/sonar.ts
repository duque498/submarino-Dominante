/**
 * O mostrador de sonar, desenhado num lugar só.
 *
 * O painel do console e o combate do 3A usam o MESMO instrumento — o de fora
 * é o de dentro sem as cunhas acesas. Eram dois desenhos parecidos e não
 * iguais, e isso aparecia: a plateia via um radar na cena de biologia e outro
 * no combate, e o submarino deixava de parecer uma máquina só.
 *
 * O desenho é de INSTRUMENTO, não de radar de desenho animado. O que separa os
 * dois é sempre a mesma coisa: escala legível (anéis rotulados em metros),
 * referência de direção (azimute a cada 30°, proa no topo), decaimento em vez
 * de linha dura, e ruído de fundo. Um mostrador limpo demais parece enfeite;
 * um instrumento de verdade está sempre um pouco sujo.
 *
 * Função pura de desenho: recebe o estado e pinta. Quem simula é quem chama.
 */

import { obterForma } from '../formas'
import { comportamentoDe, desenharSprite, imagemDaEspecie, temSprite } from '../mundo/sprites'

/** Velocidade do som na água salgada. A mesma do painel `eco` e do combate. */
export const VELOCIDADE_SOM = 1500

export type ContatoSonar = {
  /** Índice do setor onde ele está. -1 = sem setor (painel fora do combate). */
  setor: number
  /** Metros até o centro. */
  distancia: number
  /**
   * Desvio lateral dentro da cunha, -1 a 1. É o zigue-zague: um contato que
   * desce em linha reta parece animação de menu, não um bicho manobrando.
   */
  desvio: number
  /** Metros por segundo. Só dimensiona o vetor de velocidade. */
  velocidade: number
  /** `perdido` pisca e some: foi atingido. */
  estado: 'ativo' | 'perdido'
  /**
   * Nome na etiqueta, no lugar de `CONTATO`.
   *
   * Fora do combate o mostrador sabe O QUE achou (`CETÁCEO`, `CARDUME`), e
   * dizer isso é o serviço do painel. No combate ele não sabe — e é por isso
   * que a plateia precisa existir.
   */
  rotulo?: string
  /**
   * Espécie do registro de silhuetas. Tendo PNG, o contato deixa de ser um
   * blip redondo e vira a SILHUETA do bicho, articulada.
   *
   * É o que separa o megalodonte do ruído de fundo: no mostrador tudo é ponto
   * redondo, e a única coisa com FORMA é ele. A plateia não precisa que
   * ninguém explique qual dos pontos importa.
   */
  especie?: string
}

export type EstadoSonar = {
  /** Rótulos dos setores. Vazio = mostrador sem cunhas. */
  setores: string[]
  /** Cunha acesa, ou null. Fora do combate é sempre null. */
  setorAceso: number | null
  /** Metros na borda do mostrador. */
  alcance: number
  /** Anéis rotulados, em metros. */
  aneis: number[]
  contato: ContatoSonar | null
  /** Ângulo da varredura, em radianos. */
  angulo: number
  /** Pulso acústico saindo: setor e idade em ms. */
  pulso: { setor: number; idade: number } | null
}

/** Topo do mostrador: no canvas o y cresce pra baixo, então 12h é -π/2. */
const TOPO = -Math.PI / 2
/** Rastro da varredura. 120° é o que dá decaimento sem virar disco cheio. */
const RASTRO = (Math.PI * 2) / 3

const CIANO = '56, 232, 255'
const VERDE = '77, 255, 166'
const AMBAR = '255, 194, 77'
const VERMELHO = '255, 110, 90'

export function tempoDeEco(metros: number): number {
  return (2 * metros) / VELOCIDADE_SOM
}

/** Ruído de fundo: blips fracos que nascem e somem sozinhos. */
export type RuidoSonar = { angulo: number; raio: number; nascimento: number; vida: number }

export function semearRuido(agora: number, quantos = 9): RuidoSonar[] {
  return Array.from({ length: quantos }, () => ({
    angulo: Math.random() * Math.PI * 2,
    raio: 0.15 + Math.random() * 0.8,
    nascimento: agora - Math.random() * 3000,
    vida: 1800 + Math.random() * 3200,
  }))
}

export function atualizarRuido(ruido: RuidoSonar[], agora: number) {
  for (const r of ruido) {
    if (agora - r.nascimento < r.vida) continue
    r.angulo = Math.random() * Math.PI * 2
    r.raio = 0.15 + Math.random() * 0.8
    r.nascimento = agora
    r.vida = 1800 + Math.random() * 3200
  }
}

/**
 * Memória do contato entre quadros.
 *
 * `desenharSonar` é função pura de desenho e continua sendo: o estado que
 * SOBREVIVE de um quadro pro outro (pra onde o bicho está indo, onde ele
 * esteve, quanto da silhueta já se desfez) mora aqui e é de quem chama, do
 * mesmo jeito que o ruído de fundo.
 */
export type RastroContato = {
  /** Posições passadas, em pixels do canvas. */
  pontos: Array<{ x: number; y: number; em: number }>
  /** Direção do movimento, em radianos. Suavizada. */
  direcao: number
  /** Giro em curso (o pulso empurrou): de onde, pra onde, até quando. */
  giroDe: number
  giroPara: number
  giroAte: number
  /** Quanto o corpo está afinado no meio do giro. 1 = inteiro. */
  afinamento: number
  ultimoX: number
  ultimoY: number
  ultimoAgora: number
  /** 1 = silhueta inteira, 0 = dissolvida em pontos e sumida. */
  coesao: number
}

export function criarRastro(): RastroContato {
  return {
    pontos: [],
    direcao: 0,
    giroDe: 0,
    giroPara: 0,
    giroAte: 0,
    afinamento: 1,
    ultimoX: NaN,
    ultimoY: NaN,
    ultimoAgora: 0,
    coesao: 1,
  }
}

/** Diferença entre dois ângulos pelo caminho curto. */
function curto(delta: number): number {
  return ((delta + Math.PI * 3) % (Math.PI * 2)) - Math.PI
}

/** Quantas posições passadas ficam acesas. */
const RASTRO_MAX = 16
/** Espaçamento entre marcas do rastro, em ms. */
const RASTRO_MS = 110
/**
 * Fração do diâmetro que a silhueta ocupa: no alcance máximo e junto do centro.
 *
 * Dobrou em relação à primeira versão (9% e 16%). A 9% de um mostrador de
 * 440 px o bicho tinha 33 px de comprimento e 16 de altura: a cauda batia, mas
 * não dava pra ver de onde a plateia está.
 */
const ICONE_LONGE = 0.18
const ICONE_PERTO = 0.32

/**
 * Como o megalodonte do sonar nada, por cima do que o bestiário diz.
 *
 * `cabeca: 0.6` é o pedido literal: a onda só existe nos últimos 40% do
 * comprimento. `onda: 0.25` põe a ponta da cauda a 25% da altura da silhueta —
 * que é o tanto que se lê a quinze metros. `rolagem: 0` porque cabeça e tronco
 * têm que ficar PARADOS: com a inclinação do corpo inteiro o bicho balançava e
 * a cauda sumia no meio do balanço.
 */
const NADO_NO_SONAR = { cabeca: 0.6, onda: 0.25, voltas: 0.6, rolagem: 0 }
/** Batida da cauda em repouso, em Hz. Sobe com a proximidade. */
const BATIDA_BASE = 1.2
/** Duração do giro quando o pulso o empurra. */
const MS_GIRO = 200

/**
 * Canvas de tingimento, reaproveitado entre quadros.
 *
 * A silhueta do arquivo é quase preta e o mostrador é âmbar. Tingir com
 * `ctx.filter` custaria caro (medido em outra cena: 14 fps contra 60), então
 * o sprite é desenhado uma vez num canvas pequeno e recortado com
 * `source-in`. São ~50x50 px por quadro: não aparece na conta.
 */
let tinta: HTMLCanvasElement | null = null

/**
 * Fator de superamostragem.
 *
 * O ícone tem ~50 px de largura. Com 24 tiras isso dá 2 px por tira, e o
 * deslocamento da onda chega a 2,6 px: o bicho aparecia RASGADO em faixas,
 * que é o contrário de "articulado". Desenhando a 3x e reduzindo na hora de
 * colar, o degrau cai pra menos de um pixel e a interpolação do navegador
 * costura o resto. Custa um canvas de 150x150 por quadro.
 */
const SUPER = 3

function silhuetaTingida(
  img: HTMLImageElement,
  especie: string,
  largura: number,
  t: number,
  fase: number,
  cor: string,
  batida: number,
): HTMLCanvasElement | null {
  const lado = Math.max(8, Math.ceil(largura * 1.5) * SUPER)
  if (!tinta) tinta = document.createElement('canvas')
  if (tinta.width !== lado || tinta.height !== lado) {
    tinta.width = lado
    tinta.height = lado
  }
  const ctx = tinta.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, lado, lado)
  const comp = { ...comportamentoDe(especie), ...NADO_NO_SONAR, batida }
  desenharSprite(ctx, img, comp, {
    x: lado / 2,
    y: lado / 2,
    largura: largura * SUPER,
    t,
    fase,
    direcao: 1,
    nitidez: 1,
    alpha: 1,
  })
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = `rgb(${cor})`
  ctx.fillRect(0, 0, lado, lado)
  ctx.globalCompositeOperation = 'source-over'
  return tinta
}

/** Direção de espalhamento de cada caco, fixa por índice. */
function sopro(i: number): [number, number] {
  const a = Math.sin(i * 12.9898) * 43758.5453
  const ang = (a - Math.floor(a)) * Math.PI * 2
  return [Math.cos(ang), Math.sin(ang)]
}

/**
 * Desenha o mostrador inteiro. `lado` é o canvas quadrado.
 *
 * A ordem importa e é de fora pra dentro: cunhas, anéis, azimute, rastro,
 * ruído, contato, submarino. O contato vem depois do ruído de propósito — ele
 * é a informação, e informação não pode ficar embaixo de enfeite.
 */
export function desenharSonar(
  ctx: CanvasRenderingContext2D,
  lado: number,
  estado: EstadoSonar,
  ruido: RuidoSonar[],
  agora: number,
  rastro?: RastroContato,
) {
  const c = lado / 2
  const raio = lado * 0.42
  ctx.clearRect(0, 0, lado, lado)

  const fonte = (f: number) => `${Math.max(8, lado * f)}px ui-monospace, monospace`
  const paraRaio = (metros: number) => (Math.min(metros, estado.alcance) / estado.alcance) * raio

  const setores = estado.setores.length
  const abertura = setores > 0 ? (Math.PI * 2) / setores : 0
  const inicioDe = (i: number) => TOPO - abertura / 2 + i * abertura

  // --- 0) geometria do contato, antes de tudo ------------------------------
  //
  // Calculada aqui e não na seção 8 porque os rótulos dos anéis precisam saber
  // se o bicho vai passar por cima deles: com a silhueta no tamanho novo, um
  // "600" âmbar no meio do corpo dele é a única coisa que a plateia lê.
  const alvo = estado.contato
  // Trajetória RETA: o rumo é o do setor e não muda durante a investida. O
  // desvio saiu de ÂNGULO dentro da cunha (onde 1 unidade varria 36°, e o
  // contato lia como pêndulo) e virou deslocamento PERPENDICULAR à direção do
  // movimento, em fração do raio. Deriva de nado, não manobra.
  const ang = alvo
    ? alvo.setor >= 0 && setores > 0
      ? inicioDe(alvo.setor) + abertura / 2
      : TOPO
    : 0
  const r = alvo ? paraRaio(alvo.distancia) : 0
  const bx = alvo ? c + Math.cos(ang) * r + Math.cos(ang + Math.PI / 2) * alvo.desvio * raio : 0
  const by = alvo ? c + Math.sin(ang) * r + Math.sin(ang + Math.PI / 2) * alvo.desvio * raio : 0
  const proximidade = alvo ? 1 - Math.min(1, r / raio) : 0
  const tamanho = raio * 2 * (ICONE_LONGE + (ICONE_PERTO - ICONE_LONGE) * proximidade)
  /** Quanto um ponto da tela está coberto pela silhueta. 0 = livre, 1 = em cima. */
  const cobertoPor = (x: number, y: number): number => {
    if (!alvo || !alvo.especie || !temSprite(alvo.especie)) return 0
    const dx = (x - bx) / (tamanho * 0.55)
    const dy = (y - by) / (tamanho * 0.3)
    const d = Math.sqrt(dx * dx + dy * dy)
    return Math.max(0, Math.min(1, 1.35 - d))
  }


  // --- 1) cunhas dos setores -----------------------------------------------
  if (setores > 0) {
    for (let i = 0; i < setores; i++) {
      const aceso = estado.setorAceso === i
      ctx.beginPath()
      ctx.moveTo(c, c)
      ctx.arc(c, c, raio, inicioDe(i), inicioDe(i) + abertura)
      ctx.closePath()
      ctx.fillStyle = aceso ? `rgba(${VERMELHO}, 0.09)` : `rgba(${CIANO}, 0.025)`
      ctx.fill()
      ctx.strokeStyle = `rgba(${CIANO}, ${aceso ? 0.45 : 0.18})`
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  // --- 2) anéis de distância, finos e rotulados ----------------------------
  ctx.lineWidth = 1
  for (const metros of estado.aneis) {
    const r = paraRaio(metros)
    if (r <= 2) continue
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${CIANO}, 0.14)`
    ctx.stroke()
  }
  // Rótulos numa régua vertical descendo do centro: é a única direção livre
  // quando há três cunhas, porque ela cai exatamente sobre uma divisa.
  ctx.textAlign = 'center'
  ctx.font = fonte(0.021)
  const ultimoAnel = estado.aneis[estado.aneis.length - 1]
  for (const metros of estado.aneis) {
    const r = paraRaio(metros)
    if (r <= 2) continue
    // A unidade vai no último anel, e não numa legenda solta embaixo do
    // mostrador: lá ela caía exatamente em cima do rótulo de 180° do azimute.
    const texto = metros === ultimoAnel ? `${metros} M` : `${metros}`
    const larg = ctx.measureText(texto).width + lado * 0.018
    // Por DENTRO do anel: centrado nele, o rótulo do último anel encostava no
    // `180°` do azimute, que vem logo fora da borda.
    const base = c + r - lado * 0.014
    // Onde a silhueta passa, o rótulo RECUA em vez de brigar. O contato é a
    // informação da cena; a régua de distância é referência, e referência
    // cede.
    const recuo = 1 - cobertoPor(c, base) * 0.88
    ctx.fillStyle = `rgba(4, 16, 20, ${0.82 * recuo})`
    ctx.fillRect(c - larg / 2, base - lado * 0.018, larg, lado * 0.024)
    ctx.fillStyle = `rgba(${CIANO}, ${0.55 * recuo})`
    ctx.fillText(texto, c, base)
  }

  // --- 3) azimute a cada 30°, proa no topo ---------------------------------
  for (let g = 0; g < 360; g += 30) {
    const ang = TOPO + (g * Math.PI) / 180
    const cardeal = g % 90 === 0
    const r0 = raio * (cardeal ? 0.955 : 0.975)
    ctx.beginPath()
    ctx.moveTo(c + Math.cos(ang) * r0, c + Math.sin(ang) * r0)
    ctx.lineTo(c + Math.cos(ang) * raio, c + Math.sin(ang) * raio)
    ctx.strokeStyle = `rgba(${CIANO}, ${cardeal ? 0.6 : 0.3})`
    ctx.lineWidth = cardeal ? 1.6 : 1
    ctx.stroke()
    if (g % 90 === 0) {
      const rt = raio * 1.075
      ctx.font = fonte(0.024)
      ctx.fillStyle = `rgba(${CIANO}, ${g === 0 ? 0.95 : 0.5})`
      ctx.textBaseline = 'middle'
      ctx.fillText(
        g === 0 ? 'N' : `${g}°`,
        c + Math.cos(ang) * rt,
        c + Math.sin(ang) * rt,
      )
      ctx.textBaseline = 'alphabetic'
    }
  }
  ctx.beginPath()
  ctx.arc(c, c, raio, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(${CIANO}, 0.35)`
  ctx.lineWidth = 1.2
  ctx.stroke()

  // --- 4) varredura com afterglow ------------------------------------------
  // Gradiente cônico começando 120° ATRÁS da linha: o rastro decai de onde ela
  // passou até sumir, em vez de ser uma linha dura girando.
  const conico = ctx.createConicGradient?.(estado.angulo - RASTRO, c, c)
  if (conico) {
    conico.addColorStop(0, `rgba(${VERDE}, 0)`)
    conico.addColorStop(0.2, `rgba(${VERDE}, 0.05)`)
    conico.addColorStop(0.32, `rgba(${VERDE}, 0.16)`)
    conico.addColorStop(0.3333, `rgba(${VERDE}, 0.26)`)
    conico.addColorStop(0.3334, `rgba(${VERDE}, 0)`)
    ctx.fillStyle = conico
    ctx.beginPath()
    ctx.arc(c, c, raio, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(c, c)
  ctx.lineTo(c + Math.cos(estado.angulo) * raio, c + Math.sin(estado.angulo) * raio)
  ctx.strokeStyle = `rgba(${VERDE}, 0.75)`
  ctx.lineWidth = 1.4
  ctx.stroke()

  // --- 5) ruído de fundo ----------------------------------------------------
  for (const r of ruido) {
    const idade = (agora - r.nascimento) / r.vida
    if (idade < 0 || idade > 1) continue
    // Sino: nasce, brilha, some. Sem isso eles piscam em corte.
    const vis = Math.sin(idade * Math.PI) * 0.4
    ctx.beginPath()
    ctx.arc(c + Math.cos(r.angulo) * raio * r.raio, c + Math.sin(r.angulo) * raio * r.raio, lado * 0.005, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${VERDE}, ${vis})`
    ctx.fill()
  }

  // --- 6) números grandes dos setores, no arco externo ---------------------
  if (setores > 0) {
    for (let i = 0; i < setores; i++) {
      const meio = inicioDe(i) + abertura / 2
      const aceso = estado.setorAceso === i
      const rx = c + Math.cos(meio) * raio * 0.84
      const ry = c + Math.sin(meio) * raio * 0.84
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `bold ${lado * 0.105}px ui-monospace, monospace`
      ctx.fillStyle = aceso ? `rgba(${VERMELHO}, 0.5)` : `rgba(${CIANO}, 0.22)`
      ctx.fillText(String(i + 1), rx, ry)
      ctx.font = fonte(0.022)
      ctx.fillStyle = aceso ? `rgba(${VERMELHO}, 0.7)` : `rgba(189, 255, 240, 0.4)`
      ctx.fillText(estado.setores[i], rx, ry + lado * 0.075)
      ctx.textBaseline = 'alphabetic'
    }
  }

  // --- 7) pulso acústico ----------------------------------------------------
  if (estado.pulso) {
    const f = Math.min(1, estado.pulso.idade / 900)
    ctx.save()
    if (setores > 0) {
      ctx.beginPath()
      ctx.moveTo(c, c)
      ctx.arc(c, c, raio, inicioDe(estado.pulso.setor), inicioDe(estado.pulso.setor) + abertura)
      ctx.closePath()
      ctx.clip()
    }
    for (let k = 0; k < 3; k++) {
      const r = raio * (f * 1.25 - k * 0.13)
      if (r <= 0) continue
      ctx.beginPath()
      ctx.arc(c, c, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(150, 255, 210, ${(1 - f) * (0.8 - k * 0.22)})`
      ctx.lineWidth = lado * 0.011
      ctx.stroke()
    }
    ctx.restore()
  }

  // --- 8) o contato ---------------------------------------------------------
  if (alvo) {
    const pulsa = (Math.sin(agora / 170) + 1) / 2
    const perdido = alvo.estado === 'perdido'
    // Perdido pisca em blocos: é sinal intermitente, não fade.
    const piscando = perdido ? (Math.floor(agora / 130) % 2 === 0 ? 1 : 0.15) : 1
    const cor = AMBAR

    // --- 8a) memória entre quadros: direção, rastro e coesão ---------------
    const img = alvo.especie ? imagemDaEspecie(alvo.especie) : null
    const comSilhueta = img !== null && alvo.especie !== undefined && temSprite(alvo.especie)

    if (rastro) {
      const dt = rastro.ultimoAgora ? Math.min(0.1, (agora - rastro.ultimoAgora) / 1000) : 0
      rastro.ultimoAgora = agora

      // A direção é EXATA, não derivada do rastro: a trajetória agora é reta
      // e radial, então enquanto ele avança a cabeça aponta pro casco e,
      // empurrado, ela aponta pra fora. Antes eu tirava a direção do
      // deslocamento das últimas 1,7 s — com a pendulação isso era a única
      // saída, e com a reta é só ruído numérico.
      const rumo = perdido ? ang : ang + Math.PI

      if (!Number.isFinite(rastro.ultimoX)) {
        rastro.direcao = rumo
        rastro.afinamento = 1
      } else if (rastro.giroAte > agora) {
        // Giro em curso: o corpo AFINA até virar um risco e volta a engrossar
        // do outro lado. Girar 180° em rotação contínua leria como pirueta;
        // afinando, lê como o bicho passando de perfil.
        const f = 1 - (rastro.giroAte - agora) / MS_GIRO
        rastro.direcao = f < 0.5 ? rastro.giroDe : rastro.giroPara
        rastro.afinamento = Math.max(0.12, Math.abs(Math.cos(f * Math.PI)))
      } else {
        rastro.afinamento = 1
        const delta = curto(rumo - rastro.direcao)
        if (Math.abs(delta) > 2) {
          rastro.giroDe = rastro.direcao
          rastro.giroPara = rumo
          rastro.giroAte = agora + MS_GIRO
        } else {
          rastro.direcao += delta * Math.min(1, dt * 6)
        }
      }

      rastro.ultimoX = bx
      rastro.ultimoY = by

      const ultimo = rastro.pontos[rastro.pontos.length - 1]
      if (!ultimo || agora - ultimo.em > RASTRO_MS) {
        rastro.pontos.push({ x: bx, y: by, em: agora })
        if (rastro.pontos.length > RASTRO_MAX) rastro.pontos.shift()
      }

      // A coesão cai quando o sinal se perde e volta quando ele reaparece.
      const destino = perdido ? 0 : 1
      rastro.coesao += (destino - rastro.coesao) * Math.min(1, dt * 2.6)
    }

    const direcao = rastro?.direcao ?? (perdido ? ang : ang + Math.PI)
    const afinamento = rastro?.afinamento ?? 1
    const coesao = rastro ? rastro.coesao : perdido ? 0 : 1

    // --- 8b) rastro: pontos apagando, nunca linha --------------------------
    // Linha ligando as posições vira trajetória desenhada, e sonar não desenha
    // trajetória: ele guarda ecos que vão apagando.
    if (rastro && rastro.pontos.length > 1) {
      for (let i = 0; i < rastro.pontos.length - 1; i++) {
        const marca = rastro.pontos[i]
        const idade = (agora - marca.em) / (RASTRO_MAX * RASTRO_MS)
        if (idade >= 1) continue
        const forca = (1 - idade) ** 2
        ctx.beginPath()
        ctx.arc(marca.x, marca.y, lado * (0.0025 + forca * 0.0035), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${cor}, ${forca * 0.3 * piscando})`
        ctx.fill()
      }
    }

    // --- 8c) halo pulsante --------------------------------------------------
    const haloBase = comSilhueta ? tamanho * 0.42 : lado * 0.026
    ctx.beginPath()
    ctx.arc(bx, by, haloBase + pulsa * lado * 0.018, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${cor}, ${(0.5 - pulsa * 0.3) * piscando * Math.max(0.25, coesao)})`
    ctx.lineWidth = 1.5
    ctx.stroke()

    // --- 8d) o bicho --------------------------------------------------------
    if (!comSilhueta) {
      // Sem PNG registrado é blip redondo, como sempre foi.
      ctx.beginPath()
      ctx.arc(bx, by, lado * 0.0135, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${cor}, ${(0.75 + pulsa * 0.25) * piscando})`
      ctx.fill()
    } else if (coesao > 0.02) {
      ctx.save()
      ctx.translate(bx, by)
      ctx.rotate(direcao)
      // Virado pra esquerda, o bicho rotacionado fica de barriga pra cima.
      // Espelhar em y no referencial JÁ girado devolve o dorso pra cima sem
      // mexer no sentido da cabeça.
      if (Math.cos(direcao) < 0) ctx.scale(1, -1)
      // Afinamento do giro: encurta o EIXO DO CORPO. Um bicho que vira passa
      // de perfil, e de perfil ele é um risco.
      if (afinamento < 1) ctx.scale(afinamento, 1)

      // A cauda bate mais rápido quanto mais perto do casco ele está: a
      // frequência é a leitura de esforço, e esforço perto do casco é o que a
      // cena precisa que a plateia sinta.
      const batida = BATIDA_BASE * (1 + proximidade * 0.5)
      const pintado = silhuetaTingida(
        img,
        alvo.especie as string,
        tamanho,
        agora / 1000,
        0,
        cor,
        batida,
      )
      if (pintado) {
        const w = pintado.width / SUPER
        ctx.globalAlpha = coesao * coesao * piscando
        ctx.drawImage(pintado, -w / 2, -w / 2, w, w)
        ctx.globalAlpha = 1
      }

      // Dissolução: a MESMA nuvem de pontos que o orbe usa pra morfar nesta
      // espécie, espalhando. É o morph ao contrário, e é o que faz o
      // "SINAL PERDIDO" ser uma coisa que acontece com o bicho, não um texto.
      const forma = obterForma(alvo.especie as string)
      const espalhando = (1 - coesao) * coesao * 4
      if (forma && espalhando > 0.01) {
        const escala = tamanho / 2
        // Espalhamento CURTO: a 1,1x o tamanho do bicho os pontos cobriam um
        // terço do mostrador e o que se via era confete, não uma silhueta se
        // desfazendo. A leitura precisa continuar sendo "aquilo ali é o
        // bicho" até o último quadro.
        const fuga = tamanho * 0.5 * (1 - coesao)
        ctx.fillStyle = `rgba(${cor}, ${Math.min(1, espalhando) * 0.85 * piscando})`
        for (let i = 0; i < forma.pontos.length; i += 3) {
          const ponto = forma.pontos[i]
          const [sx, sy] = sopro(i)
          ctx.fillRect(
            ponto.x * escala + sx * fuga - 0.7,
            ponto.y * escala + sy * fuga - 0.7,
            1.4,
            1.4,
          )
        }
      }
      ctx.restore()
    }

    // vetor de velocidade: aponta pra onde ele VAI (o centro), e o tamanho diz
    // quão rápido. É o que transforma um ponto num objeto com intenção.
    if (!perdido && alvo.velocidade > 0) {
      const comp = Math.min(raio * 0.3, lado * 0.02 + alvo.velocidade * 0.0016 * lado)
      const vx = bx + Math.cos(ang + Math.PI) * comp
      const vy = by + Math.sin(ang + Math.PI) * comp
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(vx, vy)
      ctx.strokeStyle = `rgba(${cor}, 0.7)`
      ctx.lineWidth = 1.6
      ctx.stroke()
      // ponta de seta
      const asa = lado * 0.012
      ctx.beginPath()
      ctx.moveTo(vx, vy)
      ctx.lineTo(vx - Math.cos(ang + Math.PI - 0.5) * asa, vy - Math.sin(ang + Math.PI - 0.5) * asa)
      ctx.moveTo(vx, vy)
      ctx.lineTo(vx - Math.cos(ang + Math.PI + 0.5) * asa, vy - Math.sin(ang + Math.PI + 0.5) * asa)
      ctx.stroke()
    }

    // etiqueta grudada no blip
    const texto = perdido
      ? 'SINAL PERDIDO'
      : `${alvo.rotulo ?? 'CONTATO'} · ${Math.round(alvo.distancia)} M · ECO ${tempoDeEco(alvo.distancia)
          .toFixed(2)
          .replace('.', ',')} s`
    ctx.font = fonte(0.024)
    ctx.textAlign = 'left'
    const larg = ctx.measureText(texto).width + lado * 0.024
    const alt = lado * 0.036
    // Sai pro lado de FORA do mostrador: apontada pro centro, a tarja cobria o
    // submarino, que é a única coisa que não pode sumir. Com o contato perto do
    // meio nenhum dos dois lados cabe — aí ela sobe (ou desce), que é o único
    // lugar onde ela não tapa nem a borda nem o centro.
    const folga = lado * 0.03
    // Afastamento da etiqueta: o contato deixou de ser um ponto. Com o
    // afastamento antigo (fixo) a tarja caía em cima do bicho justamente
    // quando ele chega perto e fica maior — tapando a única coisa da tela que
    // a cena inteira existe pra mostrar.
    const afasta = Math.max(lado * 0.022, (comSilhueta ? tamanho : 0) * 0.58)
    const afastaY = Math.max(lado * 0.05, (comSilhueta ? tamanho : 0) * 0.42)
    const cabeNaDireita = bx + larg + folga <= lado
    const cabeNaEsquerda = bx - larg - folga >= 0
    const deLado = bx < c ? cabeNaEsquerda || cabeNaDireita : cabeNaDireita || cabeNaEsquerda
    const paraEsquerda = bx < c ? cabeNaEsquerda : !cabeNaDireita
    // Acima do blip quando ele está na metade de baixo, abaixo quando na de
    // cima: sempre pro lado de fora, nunca por cima da rota dele.
    const paraCima = by > c
    // Sempre dentro do mostrador. Com a silhueta no tamanho novo o
    // afastamento ficou grande, e perto do centro a tarja saía pela borda
    // esquerda — a etiqueta é o dado, e dado cortado não é dado.
    const ex = Math.max(
      folga,
      Math.min(
        lado - larg - folga,
        deLado
          ? paraEsquerda
            ? bx - larg - afasta
            : bx + afasta
          : bx - larg / 2,
      ),
    )
    const ey = deLado
      ? by - alt / 2
      : paraCima
        ? by - afastaY - alt
        : by + afastaY
    ctx.fillStyle = 'rgba(4, 16, 20, 0.88)'
    ctx.fillRect(ex, ey, larg, alt)
    ctx.strokeStyle = `rgba(${cor}, ${0.45 * piscando})`
    ctx.lineWidth = 1
    ctx.strokeRect(ex, ey, larg, alt)
    ctx.fillStyle = `rgba(${cor}, ${0.95 * piscando})`
    ctx.fillText(texto, ex + lado * 0.012, ey + alt * 0.7)
    // fio ligando a etiqueta ao blip
    ctx.beginPath()
    if (deLado) {
      ctx.moveTo(paraEsquerda ? ex + larg : ex, by)
    } else {
      ctx.moveTo(ex + larg / 2, paraCima ? ey + alt : ey)
    }
    ctx.lineTo(bx, by)
    ctx.strokeStyle = `rgba(${cor}, ${0.35 * piscando})`
    ctx.stroke()
    ctx.textAlign = 'center'
  }

  // --- 9) o submarino no centro, com o anel de alcance do pulso ------------
  ctx.beginPath()
  ctx.arc(c, c, lado * 0.052, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(${AMBAR}, 0.28)`
  ctx.setLineDash([3, 4])
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = `rgba(${VERDE}, 0.95)`
  ctx.beginPath()
  ctx.ellipse(c, c, lado * 0.019, lado * 0.008, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(c - lado * 0.0035, c - lado * 0.021, lado * 0.007, lado * 0.014)
}
