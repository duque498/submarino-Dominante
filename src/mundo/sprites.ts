/**
 * Sprites de espécie animados por WARP DE TIRAS.
 *
 * O bestiário procedural desenha bem um vulto passando no facho, mas a
 * expedição de identificação precisa do contrário: a plateia tem que
 * RECONHECER o bicho, e reconhecer uma tartaruga-verde por um polígono é
 * pedir demais. Aqui a forma vem de um PNG de silhueta e o movimento vem do
 * código.
 *
 * A ideia do warp: fatiar a imagem em tiras verticais e deslocar cada tira em
 * y por um seno cuja fase atrasa da cabeça pra cauda. É uma onda viajante
 * percorrendo o corpo — o mesmo princípio da espinha do megalodonte, só que
 * aplicado a pixels em vez de a um traçado. Custa ~24 `drawImage` de recorte
 * por quadro, que é barato, e dá vida a qualquer silhueta sem precisar de
 * quadro-a-quadro desenhado à mão.
 *
 * Sem o PNG nada disto roda: quem chama decide o que fazer (a cena cai no
 * bestiário procedural).
 */

import { pngDaEspecie } from '../formas/especies'

/** Uma região da imagem que bate por conta própria, em frações de 0 a 1. */
export type Nadadeira = {
  x: number
  y: number
  w: number
  h: number
  /** Deslocamento de fase, em radianos. Duas nadadeiras em uníssono parecem asa. */
  fase?: number
  /** Multiplicador de amplitude em relação ao corpo. */
  amp?: number
}

export type RegistroSprite = {
  /**
   * Quanto do bicho, a partir do FOCINHO, não ondula.
   *
   * Tubarão e tartaruga têm cabeça rígida; o que varre é o que vem depois.
   * Sem isto, o bicho inteiro serpenteia e vira enguia.
   */
  cabeca: number
  /** Amplitude máxima da onda na cauda, em frações da altura do sprite. */
  onda: number
  /** Batida do corpo, em Hz. Bicho grande bate devagar. */
  batida: number
  /** Comprimento de onda ao longo do corpo, em voltas. */
  voltas: number
  /** Regiões com seno próprio. */
  nadadeiras?: Nadadeira[]
  /** Inclinação máxima do corpo inteiro, em graus. */
  rolagem?: number
}

/** Quantas tiras. 24 é o ponto em que a costura some e o custo ainda é nada. */
const TIRAS = 24

export type PoseSprite = {
  /** Centro do bicho na tela. */
  x: number
  y: number
  /** Largura desejada, em px. A altura sai da proporção do PNG. */
  largura: number
  /** Relógio, em segundos. */
  t: number
  /** Deslocamento próprio. */
  fase: number
  /** 1 = olhando pra direita (orientação do arquivo), -1 = espelhado. */
  direcao: number
  /** 0 a 1. Abaixo de 1 o bicho é desenhado mais escuro, como no turvo. */
  nitidez: number
  alpha: number
}

/**
 * Imagens já decodificadas. Uma por espécie, carregada uma vez.
 *
 * `HTMLImageElement` com data URI decodifica sozinho; o `pronta` evita
 * desenhar antes de o navegador ter os pixels, que dá um quadro em branco.
 */
type Carregada = { img: HTMLImageElement; pronta: boolean }
const cache = new Map<string, Carregada>()

export function imagemDaEspecie(chave: string): HTMLImageElement | null {
  const guardada = cache.get(chave)
  if (guardada) return guardada.pronta ? guardada.img : null
  const url = pngDaEspecie(chave)
  if (!url) {
    cache.set(chave, { img: new Image(), pronta: false })
    return null
  }
  const img = new Image()
  const registro: Carregada = { img, pronta: false }
  img.onload = () => {
    registro.pronta = true
  }
  img.src = url
  cache.set(chave, registro)
  return null
}

/** Existe PNG pra essa espécie? (Pra a cena decidir entre sprite e bestiário.) */
export function temSprite(chave: string): boolean {
  return pngDaEspecie(chave) !== null
}

/**
 * Desenha o sprite com a onda percorrendo o corpo.
 *
 * As tiras são recortadas da imagem e coladas com deslocamento em y. Quando
 * uma tira cruza uma nadadeira, ela é cortada em três — acima, dentro, abaixo —
 * e o pedaço de dentro recebe o seno da nadadeira. É o que faz a peitoral da
 * jubarte bater fora do compasso do corpo sem fantasma de imagem duplicada.
 */
export function desenharSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  reg: RegistroSprite,
  pose: PoseSprite,
  apoio?: CanvasRenderingContext2D | null,
) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (!iw || !ih) return

  const largura = pose.largura
  const altura = (largura * ih) / iw
  // Respiração: ±2% de escala. Um corpo que não muda de tamanho nenhum parece
  // adesivo colado na água.
  const respiro = 1 + Math.sin(pose.t * 0.8 + pose.fase) * 0.02
  const rolagem = ((reg.rolagem ?? 4) * Math.PI) / 180
  const inclinacao = Math.sin(pose.t * 0.45 + pose.fase * 1.7) * rolagem

  // Pinta no canvas de apoio quando há um, pra a luz e a opacidade serem
  // aplicadas ao bicho INTEIRO de uma vez. Aplicá-las tira a tira custaria um
  // `ctx.filter` por recorte — medido: 14 fps contra 60.
  const alvo = apoio ?? ctx
  if (apoio) apoio.clearRect(0, 0, apoio.canvas.width, apoio.canvas.height)

  alvo.save()
  alvo.translate(pose.x, pose.y)
  alvo.rotate(inclinacao)
  alvo.scale(pose.direcao * respiro, respiro)
  if (!apoio) alvo.globalAlpha = pose.alpha

  const passoFonte = iw / TIRAS
  const passoDestino = largura / TIRAS
  const x0 = -largura / 2
  const y0 = -altura / 2
  const ampMax = altura * reg.onda
  const w = pose.t * Math.PI * 2 * reg.batida + pose.fase

  for (let i = 0; i < TIRAS; i++) {
    // `f` vai de 0 no FOCINHO (direita do arquivo) a 1 na cauda.
    const f = 1 - (i + 0.5) / TIRAS
    const livre = Math.max(0, f - reg.cabeca) / Math.max(0.001, 1 - reg.cabeca)
    const amp = ampMax * livre ** 1.7
    const dy = Math.sin(w - f * Math.PI * 2 * reg.voltas) * amp

    const sx = i * passoFonte
    const dx = x0 + i * passoDestino
    // Meio pixel de sobreposição: sem isto aparecem fios de fundo entre as tiras.
    const sw = passoFonte + 0.5
    const dw = passoDestino + 0.5
    const fx = (sx + passoFonte / 2) / iw

    const cortes = fatiar(reg.nadadeiras, fx)
    if (!cortes.length) {
      alvo.drawImage(img, sx, 0, sw, ih, dx, y0 + dy, dw, altura)
      continue
    }
    for (const corte of cortes) {
      const sy = corte.de * ih
      const sh = (corte.ate - corte.de) * ih
      let extra = 0
      if (corte.nad) {
        const n = corte.nad
        // O deslocamento MORRE nas bordas da região, nos dois eixos. Sem isso a
        // nadadeira sobe em bloco e abre uma fenda no meio do corpo — foi
        // exatamente o que aconteceu na primeira versão: o bicho se despedaçava
        // em faixas. Com o afinamento ela flexiona pra fora do corpo.
        const lx = Math.min(1, Math.max(0, (fx - n.x) / Math.max(0.001, n.w)))
        const meio = (corte.de + corte.ate) / 2
        const ly = Math.min(1, Math.max(0, (meio - n.y) / Math.max(0.001, n.h)))
        const suave = Math.sin(Math.PI * lx) * Math.sin(Math.PI * ly)
        extra = Math.sin(w * 1.35 + (n.fase ?? 0)) * ampMax * (n.amp ?? 1) * suave
      }
      alvo.drawImage(
        img,
        sx,
        sy,
        sw,
        sh,
        dx,
        y0 + corte.de * altura + dy + extra,
        dw,
        (corte.ate - corte.de) * altura,
      )
    }
  }
  alvo.restore()

  if (!apoio) return

  // Luz do farol por cima do bicho, e só dele: contraluz de baixo pra cima e um
  // fio claro na borda de cima. `source-atop` recorta no alfa do sprite.
  const cv = apoio.canvas
  apoio.save()
  apoio.globalCompositeOperation = 'source-atop'
  const g = apoio.createLinearGradient(0, pose.y - altura * 0.6, 0, pose.y + altura * 0.6)
  const luz = pose.nitidez
  // A silhueta do arquivo é quase preta. Revelada, ela tem que virar um ANIMAL
  // — dorso claro em cima, barriga escura embaixo, com um fio de luz na borda
  // de cima. Sem isto o "acertou" entrega a mesma mancha escura de antes.
  g.addColorStop(0, `rgba(216, 248, 252, ${0.12 + luz * 0.82})`)
  g.addColorStop(0.22, `rgba(150, 214, 226, ${0.08 + luz * 0.6})`)
  g.addColorStop(0.62, `rgba(70, 138, 158, ${0.04 + luz * 0.32})`)
  g.addColorStop(1, `rgba(8, 26, 36, ${0.34 - luz * 0.2})`)
  apoio.fillStyle = g
  apoio.fillRect(0, 0, cv.width, cv.height)
  apoio.restore()

  ctx.save()
  ctx.globalAlpha = pose.alpha
  ctx.drawImage(cv, 0, 0)
  ctx.restore()
}

/**
 * Corta a faixa vertical de uma tira nos pedaços que as nadadeiras exigem.
 *
 * Devolve vazio quando nenhuma nadadeira cruza essa tira — o caso comum, que
 * segue desenhando de uma vez só.
 */
function fatiar(
  nadadeiras: Nadadeira[] | undefined,
  fx: number,
): Array<{ de: number; ate: number; nad?: Nadadeira }> {
  if (!nadadeiras?.length) return []
  const cruzando = nadadeiras.filter((n) => fx >= n.x && fx <= n.x + n.w)
  if (!cruzando.length) return []
  const bordas = new Set<number>([0, 1])
  for (const n of cruzando) {
    bordas.add(Math.max(0, n.y))
    bordas.add(Math.min(1, n.y + n.h))
  }
  const pontos = [...bordas].sort((a, b) => a - b)
  const pedacos: Array<{ de: number; ate: number; nad?: Nadadeira }> = []
  for (let i = 0; i < pontos.length - 1; i++) {
    const de = pontos[i]
    const ate = pontos[i + 1]
    if (ate - de < 0.001) continue
    const meio = (de + ate) / 2
    const nad = cruzando.find((n) => meio >= n.y && meio <= n.y + n.h)
    pedacos.push({ de, ate, nad })
  }
  return pedacos
}

/**
 * Como cada espécie se comporta na câmera.
 *
 * O registro junta três coisas que andam juntas: a forma da onda (rigidez da
 * cabeça, amplitude, batida), o tamanho relativo e o jeito de nadar. Tamanho
 * relativo é o que faz a cena contar a verdade — a tartaruga cabe na tela com
 * folga e a jubarte NÃO cabe, entra e passa, e é assim que a plateia entende
 * que uma é do tamanho de uma mesa e a outra de um ônibus.
 *
 * `largura` é fração da largura do quadro. Acima de 1 o bicho não cabe.
 */
export type ComportamentoEspecie = RegistroSprite & {
  largura: number
  /** Larguras de quadro por segundo. Negativo anda pra esquerda. */
  velocidade: number
  /** Sobe e desce, em frações da altura do quadro. */
  deriva: number
  /** Altura de repouso, 0 = topo, 1 = base. */
  altura: number
}

export const COMPORTAMENTOS: Record<string, ComportamentoEspecie> = {
  // Vista de cima, remando devagar. O casco é rígido: a onda quase não existe.
  tartaruga: {
    cabeca: 0.7,
    onda: 0.05,
    batida: 0.45,
    voltas: 0.35,
    rolagem: 4,
    largura: 0.42,
    velocidade: 0.03,
    deriva: 0.05,
    altura: 0.5,
  },
  // Rápido e nervoso: batida alta, onda curta. É o mais ágil dos quatro.
  golfinho: {
    cabeca: 0.42,
    onda: 0.1,
    batida: 0.85,
    voltas: 0.6,
    rolagem: 5,
    largura: 0.5,
    velocidade: 0.09,
    deriva: 0.07,
    altura: 0.5,
  },
  // Onda longa percorrendo o corpo, do jeito que tubarão nada.
  tubarao: {
    cabeca: 0.38,
    onda: 0.1,
    batida: 0.6,
    voltas: 0.75,
    rolagem: 3,
    largura: 0.62,
    velocidade: 0.07,
    deriva: 0.05,
    altura: 0.5,
  },
  // Lenta e enorme: passa das bordas do quadro, mas só um pouco. A 1,7 ela
  // virava uma parede cinza e a plateia não reconhecia NADA — e desde que a
  // revelação é o prêmio da dinâmica, um bicho irreconhecível no fim é o
  // contrário do que a cena precisa. A 1,05 ela continua sendo de longe a
  // maior das quatro e ainda se lê como baleia.
  //
  // A peitoral ganha um seno próprio de amplitude PEQUENA: a primeira versão
  // usava 1,4 e a nadadeira arrancava o flanco junto.
  baleia: {
    cabeca: 0.3,
    onda: 0.13,
    batida: 0.2,
    voltas: 0.5,
    rolagem: 2.5,
    largura: 1.05,
    velocidade: 0.075,
    deriva: 0.035,
    altura: 0.52,
    nadadeiras: [{ x: 0.17, y: 0.66, w: 0.42, h: 0.34, amp: 0.5, fase: 0.7 }],
  },
}

/** O comportamento da espécie, ou um padrão discreto pra chave desconhecida. */
export function comportamentoDe(chave: string): ComportamentoEspecie {
  return (
    COMPORTAMENTOS[chave] ?? {
      cabeca: 0.5,
      onda: 0.1,
      batida: 0.4,
      voltas: 0.5,
      largura: 0.5,
      velocidade: 0.04,
      deriva: 0.05,
      altura: 0.5,
    }
  )
}
