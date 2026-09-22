/**
 * Bestiário das câmeras externas.
 *
 * Cada espécie sabe em que faixa de profundidade vive e como se desenha. Quem
 * escolhe é o `mundo`, olhando só os metros — a câmera continua sem saber qual
 * turma está apresentando.
 *
 * Duas regras de desenho valem pra todas:
 *
 *  1. **Silhueta com anatomia, não mancha com apêndice.** O corpo é feito de
 *     curvas de Bézier, e cada nadadeira é uma peça à parte. Uma elipse com um
 *     triângulo atrás é o que faz a coisa parecer recorte voando.
 *  2. **Contraluz, não preenchimento chapado.** Lá fora a luz vem de cima (ou
 *     do farol do submarino), então o dorso pega um fio de brilho e a barriga
 *     some no escuro. É esse gradiente que dá volume.
 *
 * Fundo escuro pede bioluminescência: da mesopelágica pra baixo as espécies
 * têm fotóforos, e eles são a única coisa que ainda se lê a 4000 m.
 */

export type Pincel = {
  ctx: CanvasRenderingContext2D
  /** Comprimento total do bicho, em px. O desenho vai de -comp/2 a +comp/2. */
  comp: number
  /** Altura do corpo, em px. */
  alt: number
  /** Relógio do mundo, pra ondular nadadeira e tentáculo. */
  t: number
  /** Deslocamento próprio: dois bichos iguais não ondulam em uníssono. */
  fase: number
  /** Luz ambiente, 0 a 1. Perto de 0 só a bioluminescência aparece. */
  luz: number
  /** Facho do submarino, 0 a 1. Lá embaixo é a única luz que existe. */
  farol: number
  /** Opacidade geral já calculada pela distância e pela zona. */
  alpha: number
  /**
   * Modo silhueta: preenche tudo de preto chapado, sem gradiente, sem olho e
   * sem fotóforo. É assim que o orbe reaproveita estes desenhos — quem lê a
   * silhueta é o amostrador de formas, que corta por luminância, e um
   * gradiente ali deixaria o corte indeciso.
   */
  silhueta?: boolean
  /**
   * Desenhar o olho? Só a travessia do 3A diz que não.
   *
   * O olho do bestiário é um ponto estilizado, feito pra ser visto com 4 px.
   * Na travessia o bicho passa com 760 px de corpo e ele vira uma bola de
   * desenho animado — e, pior, aparece DOIS SEGUNDOS antes do plano em que o
   * olho é a cena inteira. O bicho passa sem olhar; quem olha é a cena seguinte.
   */
  olhar?: boolean
  /**
   * Quanto o corpo fica RÍGIDO, de 0 (a ondulação natural) a 1 (só a cauda).
   *
   * Tubarão grande não serpenteia: o tronco vai duro e quem varre é o terço
   * traseiro. A ondulação padrão já cresce pra trás, mas o meio do corpo ainda
   * se mexe meio corpo de altura — invisível num bicho de 200 px, e uma onda
   * de 450 px quando ele atravessa a câmera com 1600 px de comprimento.
   */
  rigidez?: number
}

export type Especie = {
  chave: string
  /** Rótulo do retículo da câmera. */
  rotulo: string
  /** Faixa de profundidade em metros: [de, até]. */
  faixa: [number, number]
  /** Porte relativo sorteado dentro desta faixa. */
  porte: [number, number]
  /** Proporção altura/comprimento do corpo. */
  proporcao: number
  desenhar: (p: Pincel) => void
}

// --- paleta -----------------------------------------------------------------

const DORSO: [number, number, number] = [26, 62, 74]
const MEIO: [number, number, number] = [12, 32, 40]
const BARRIGA: [number, number, number] = [30, 70, 78]
// Versões sob o facho do submarino. No raso o bicho é silhueta contra a luz de
// cima; no fundo não há luz de cima nenhuma, e ele passa a ser um objeto
// iluminado de frente. Sem estas cores ele fica azul-escuro sobre preto e some.
const DORSO_FAROL: [number, number, number] = [96, 158, 166]
const MEIO_FAROL: [number, number, number] = [54, 104, 116]
const BARRIGA_FAROL: [number, number, number] = [78, 140, 148]
const CONTORNO = '150, 226, 234'
const BIOLUM = '124, 255, 214'

const rgba = (c: [number, number, number], a: number) =>
  `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`

const misturarCor = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/**
 * Preenche o caminho já montado com o gradiente de contraluz e passa o fio de
 * contorno por cima. Tudo que é corpo passa por aqui, pra as espécies ficarem
 * parecendo do mesmo oceano.
 */
function encorpar(p: Pincel, forcaContorno = 1) {
  const { ctx, alt, alpha, luz } = p
  if (p.silhueta) {
    ctx.fillStyle = '#000'
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = Math.max(2, p.comp * 0.02)
    ctx.stroke()
    return
  }
  const f = Math.max(0, Math.min(1, p.farol))
  const g = ctx.createLinearGradient(0, -alt, 0, alt)
  g.addColorStop(0, rgba(misturarCor(DORSO, DORSO_FAROL, f), alpha * (0.5 + luz * 0.5 + f * 0.45)))
  g.addColorStop(0.5, rgba(misturarCor(MEIO, MEIO_FAROL, f), alpha * (0.95 * (1 - f) + f)))
  g.addColorStop(1, rgba(misturarCor(BARRIGA, BARRIGA_FAROL, f), alpha * (0.3 + luz * 0.4 + f * 0.5)))
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * (0.75 + f * 0.22) * forcaContorno})`
  ctx.lineWidth = Math.max(0.7, p.comp * 0.006)
  ctx.stroke()
}

/** Fio de luz no dorso: é ele que separa o bicho da água atrás. */
function contraluz(p: Pincel, traçar: () => void) {
  const { ctx, alpha, luz } = p
  // Contraluz é volume, e silhueta não tem volume.
  if (p.silhueta) return
  ctx.beginPath()
  traçar()
  ctx.strokeStyle = `rgba(190, 245, 250, ${alpha * (0.25 + luz * 0.5 + p.farol * 0.35)})`
  ctx.lineWidth = Math.max(0.8, p.comp * 0.008)
  ctx.stroke()
}

/**
 * Olho: escuro, com um aro fino de luz e um reflexo minúsculo.
 *
 * A primeira versão era um disco branco com miolo preto — do tamanho de olho de
 * desenho animado, e era a primeira coisa que se via no bicho. O olho de peixe
 * é escuro; quem o revela é o aro molhado pegando luz.
 */
function olho(p: Pincel, x: number, y: number, r: number) {
  const { ctx, alpha } = p
  // Na silhueta o olho seria um furo branco no meio do bicho.
  if (p.silhueta || p.olhar === false) return
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(3, 9, 13, ${alpha})`
  ctx.fill()
  ctx.strokeStyle = `rgba(206, 246, 250, ${alpha * 0.7})`
  ctx.lineWidth = Math.max(0.5, r * 0.22)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x + r * 0.34, y - r * 0.34, Math.max(0.5, r * 0.26), 0, Math.PI * 2)
  ctx.fillStyle = `rgba(235, 255, 255, ${alpha * 0.9})`
  ctx.fill()
}

/** Ponto de luz viva. O halo é o que faz parecer luz e não tinta clara. */
function fotoforo(p: Pincel, x: number, y: number, r: number, forca = 1) {
  const { ctx, alpha, t, fase } = p
  if (p.silhueta) return
  const pulso = 0.6 + 0.4 * Math.sin(t * 2.4 + fase + x * 0.35)
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 4)
  halo.addColorStop(0, `rgba(${BIOLUM}, ${alpha * 0.85 * pulso * forca})`)
  halo.addColorStop(1, `rgba(${BIOLUM}, 0)`)
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, y, r * 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(226, 255, 245, ${alpha * pulso * forca})`
  ctx.fill()
}

/** Fileira de fotóforos ao longo da barriga. */
function fileiraDeLuzes(p: Pincel, de: number, ate: number, y: number, quantos: number) {
  for (let i = 0; i < quantos; i++) {
    const x = de + ((ate - de) * i) / (quantos - 1)
    fotoforo(p, x, y, Math.max(0.7, p.comp * 0.008))
  }
}

// --- zona eufótica ----------------------------------------------------------

/**
 * Tartaruga-marinha, de perfil. O que diz "tartaruga" é a nadadeira dianteira:
 * longa, em forma de remo, batendo como asa. Casco sem ela vira ovo.
 */
function tartaruga(p: Pincel) {
  const { ctx, comp, alt, t, fase, alpha } = p
  const rema = Math.sin(t * 1.5 + fase)

  // nadadeira dianteira do lado de trás, mais apagada (dá profundidade)
  const remoDianteiro = (lado: number, escuro: number) => {
    ctx.beginPath()
    ctx.moveTo(comp * 0.16, lado * alt * 0.3)
    ctx.bezierCurveTo(
      comp * 0.46, lado * alt * (0.9 + rema * 0.9),
      comp * 0.34, lado * alt * (2.4 + rema * 1.3),
      comp * 0.0, lado * alt * (2.5 + rema * 1.2),
    )
    ctx.bezierCurveTo(
      comp * 0.06, lado * alt * (1.4 + rema * 0.6),
      comp * 0.06, lado * alt * 0.7,
      comp * 0.16, lado * alt * 0.3,
    )
    ctx.closePath()
    encorpar(p, escuro)
  }
  remoDianteiro(1, 0.4)

  // nadadeiras traseiras: curtas e triangulares
  for (const lado of [1, -1]) {
    ctx.beginPath()
    ctx.moveTo(-comp * 0.26, lado * alt * 0.5)
    ctx.quadraticCurveTo(-comp * 0.5, lado * alt * 1.5, -comp * 0.54, lado * alt * 0.6)
    ctx.quadraticCurveTo(-comp * 0.42, lado * alt * 0.4, -comp * 0.26, lado * alt * 0.5)
    ctx.closePath()
    encorpar(p, lado > 0 ? 0.5 : 0.7)
  }

  // carapaça: cúpula por cima, plastrão quase reto por baixo
  ctx.beginPath()
  ctx.moveTo(comp * 0.34, -alt * 0.15)
  ctx.bezierCurveTo(comp * 0.2, -alt * 1.5, -comp * 0.24, -alt * 1.5, -comp * 0.42, -alt * 0.1)
  ctx.bezierCurveTo(-comp * 0.34, alt * 0.85, comp * 0.1, alt * 0.95, comp * 0.34, alt * 0.35)
  ctx.quadraticCurveTo(comp * 0.42, alt * 0.1, comp * 0.34, -alt * 0.15)
  ctx.closePath()
  encorpar(p)

  // escudos do casco: quatro divisões acompanhando a cúpula
  ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * 0.3})`
  ctx.lineWidth = Math.max(0.5, comp * 0.004)
  for (let i = 0; i < 4; i++) {
    const x = comp * (0.2 - i * 0.16)
    ctx.beginPath()
    ctx.moveTo(x, -alt * (1.3 - Math.abs(i - 1.5) * 0.18))
    ctx.quadraticCurveTo(x - comp * 0.02, 0, x + comp * 0.02, alt * 0.75)
    ctx.stroke()
  }

  // pescoço e cabeça
  ctx.beginPath()
  ctx.moveTo(comp * 0.3, -alt * 0.35)
  ctx.quadraticCurveTo(comp * 0.52, -alt * 0.6, comp * 0.62, -alt * 0.38)
  ctx.quadraticCurveTo(comp * 0.72, -alt * 0.12, comp * 0.56, alt * 0.06)
  ctx.quadraticCurveTo(comp * 0.4, alt * 0.14, comp * 0.32, -alt * 0.02)
  ctx.closePath()
  encorpar(p)

  contraluz(p, () => {
    ctx.moveTo(comp * 0.34, -alt * 0.15)
    ctx.bezierCurveTo(comp * 0.2, -alt * 1.5, -comp * 0.24, -alt * 1.5, -comp * 0.42, -alt * 0.1)
  })
  olho(p, comp * 0.58, -alt * 0.3, Math.max(0.9, alt * 0.11))
  // a nadadeira da frente passa POR CIMA do casco: é o gesto do bicho
  remoDianteiro(-1, 1)
}

/** Golfinho: corpo fusiforme, dorsal em foice, nadadeira caudal horizontal. */
function golfinho(p: Pincel) {
  const { ctx, comp, alt, t, fase } = p
  const bate = Math.sin(t * 2.6 + fase)

  // cauda horizontal (cetáceo bate pra cima e pra baixo)
  ctx.beginPath()
  ctx.moveTo(-comp * 0.36, bate * alt * 0.14)
  ctx.quadraticCurveTo(-comp * 0.52, bate * alt * 0.4, -comp * 0.56, bate * alt * 0.4 - alt * 0.7)
  ctx.quadraticCurveTo(-comp * 0.42, bate * alt * 0.3, -comp * 0.44, bate * alt * 0.22)
  ctx.quadraticCurveTo(-comp * 0.42, bate * alt * 0.3 + alt * 0.8, -comp * 0.56, bate * alt * 0.4 + alt * 0.7)
  ctx.quadraticCurveTo(-comp * 0.52, bate * alt * 0.4, -comp * 0.36, bate * alt * 0.14)
  encorpar(p, 0.7)

  // corpo
  ctx.beginPath()
  ctx.moveTo(comp * 0.5, alt * 0.06)
  ctx.bezierCurveTo(comp * 0.28, -alt * 0.9, -comp * 0.1, -alt * 0.78, -comp * 0.38, bate * alt * 0.12)
  ctx.bezierCurveTo(-comp * 0.1, alt * 0.82, comp * 0.24, alt * 0.8, comp * 0.5, alt * 0.06)
  ctx.closePath()
  encorpar(p)

  // dorsal em foice
  ctx.beginPath()
  ctx.moveTo(comp * 0.06, -alt * 0.72)
  ctx.quadraticCurveTo(-comp * 0.02, -alt * 1.75, -comp * 0.18, -alt * 1.5)
  ctx.quadraticCurveTo(-comp * 0.1, -alt * 0.92, -comp * 0.14, -alt * 0.6)
  ctx.closePath()
  encorpar(p, 0.8)

  // peitoral
  ctx.beginPath()
  ctx.moveTo(comp * 0.2, alt * 0.5)
  ctx.quadraticCurveTo(comp * 0.06, alt * 1.5, -comp * 0.08, alt * 1.25)
  ctx.quadraticCurveTo(comp * 0.06, alt * 0.75, comp * 0.16, alt * 0.45)
  ctx.closePath()
  encorpar(p, 0.7)

  contraluz(p, () => {
    ctx.moveTo(comp * 0.5, alt * 0.06)
    ctx.bezierCurveTo(comp * 0.28, -alt * 0.9, -comp * 0.1, -alt * 0.78, -comp * 0.38, bate * alt * 0.12)
  })
  // rostro (o "bico")
  ctx.beginPath()
  ctx.moveTo(comp * 0.44, -alt * 0.06)
  ctx.quadraticCurveTo(comp * 0.62, alt * 0.02, comp * 0.5, alt * 0.14)
  ctx.closePath()
  encorpar(p, 0.7)
  olho(p, comp * 0.33, -alt * 0.18, Math.max(1, alt * 0.11))
}

/**
 * Raia-manta, vista de cima — que é como ela cruza o quadro.
 *
 * De perfil uma manta é uma linha, e foi isso que a primeira versão virou. De
 * cima ela é um losango largo de asas em ponta, com os dois chifres cefálicos
 * na frente e o chicote da cauda atrás. Lê na hora.
 */
function raia(p: Pincel) {
  const { ctx, comp, alt, t, fase, alpha } = p
  const bate = Math.sin(t * 1.1 + fase)

  for (const lado of [-1, 1]) {
    // A ponta da asa sobe e desce; a raiz fica presa ao disco.
    const ponta = alt * (1.9 + bate * 0.35) * lado
    ctx.beginPath()
    ctx.moveTo(comp * 0.3, lado * alt * 0.12)
    // bordo de ataque, quase reto até a ponta
    ctx.quadraticCurveTo(comp * 0.16, ponta * 0.62, -comp * 0.16, ponta)
    // bordo de fuga, côncavo — é essa concavidade que faz a asa de manta
    ctx.quadraticCurveTo(-comp * 0.18, ponta * 0.5, -comp * 0.3, lado * alt * 0.5)
    ctx.quadraticCurveTo(-comp * 0.1, lado * alt * 0.3, comp * 0.3, lado * alt * 0.12)
    ctx.closePath()
    encorpar(p, 0.75)
  }

  // disco central
  ctx.beginPath()
  ctx.moveTo(comp * 0.36, 0)
  ctx.bezierCurveTo(comp * 0.3, -alt * 0.62, -comp * 0.18, -alt * 0.6, -comp * 0.34, 0)
  ctx.bezierCurveTo(-comp * 0.18, alt * 0.6, comp * 0.3, alt * 0.62, comp * 0.36, 0)
  ctx.closePath()
  encorpar(p)

  // chifres cefálicos, enrolados pra dentro
  for (const lado of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(comp * 0.34, lado * alt * 0.28)
    ctx.quadraticCurveTo(comp * 0.56, lado * alt * 0.34, comp * 0.54, lado * alt * 0.08)
    ctx.quadraticCurveTo(comp * 0.44, lado * alt * 0.28, comp * 0.32, lado * alt * 0.2)
    ctx.closePath()
    encorpar(p, 0.6)
  }

  // cauda em chicote
  ctx.beginPath()
  ctx.moveTo(-comp * 0.32, 0)
  ctx.quadraticCurveTo(-comp * 0.62, bate * alt * 0.22, -comp * 0.98, bate * alt * 0.4)
  ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * 0.6})`
  ctx.lineWidth = Math.max(0.7, comp * 0.008)
  ctx.stroke()

  contraluz(p, () => {
    ctx.moveTo(comp * 0.36, 0)
    ctx.bezierCurveTo(comp * 0.3, -alt * 0.62, -comp * 0.18, -alt * 0.6, -comp * 0.34, 0)
  })
  // Vista de cima, os dois olhos aparecem — na LATERAL DA CABEÇA, pequenos.
  // No meio do disco e grandes eles viravam dois parafusos.
  for (const lado of [-1, 1]) {
    olho(p, comp * 0.3, lado * alt * 0.3, Math.max(0.7, alt * 0.05))
  }
}

/** Tubarão: torpedo, dorsal alta, cauda heterocerca (lobo de cima maior). */
function tubarao(p: Pincel) {
  const { ctx, comp, alt, t, fase } = p
  const varre = Math.sin(t * 2.2 + fase)

  // cauda
  ctx.beginPath()
  ctx.moveTo(-comp * 0.34, varre * alt * 0.18)
  ctx.lineTo(-comp * 0.58 + varre * comp * 0.04, -alt * 1.5)
  ctx.lineTo(-comp * 0.46 + varre * comp * 0.03, -alt * 0.1)
  ctx.lineTo(-comp * 0.56 + varre * comp * 0.04, alt * 0.95)
  ctx.closePath()
  encorpar(p, 0.8)

  // corpo
  ctx.beginPath()
  ctx.moveTo(comp * 0.52, -alt * 0.02)
  ctx.bezierCurveTo(comp * 0.26, -alt * 0.95, -comp * 0.06, -alt * 0.82, -comp * 0.36, varre * alt * 0.16)
  ctx.bezierCurveTo(-comp * 0.06, alt * 0.8, comp * 0.26, alt * 0.85, comp * 0.52, -alt * 0.02)
  ctx.closePath()
  encorpar(p)

  // dorsal
  ctx.beginPath()
  ctx.moveTo(comp * 0.1, -alt * 0.8)
  ctx.lineTo(-comp * 0.04, -alt * 2.1)
  ctx.lineTo(-comp * 0.16, -alt * 0.68)
  ctx.closePath()
  encorpar(p, 0.85)

  // peitorais
  for (const lado of [1, 0.55]) {
    ctx.beginPath()
    ctx.moveTo(comp * 0.24, alt * 0.55)
    ctx.lineTo(comp * 0.02, alt * (1.7 * lado))
    ctx.lineTo(comp * 0.16, alt * 0.45)
    ctx.closePath()
    encorpar(p, 0.6)
  }

  contraluz(p, () => {
    ctx.moveTo(comp * 0.52, -alt * 0.02)
    ctx.bezierCurveTo(comp * 0.26, -alt * 0.95, -comp * 0.06, -alt * 0.82, -comp * 0.36, varre * alt * 0.16)
  })
  // fenda da boca
  ctx.beginPath()
  ctx.moveTo(comp * 0.5, alt * 0.12)
  ctx.quadraticCurveTo(comp * 0.36, alt * 0.34, comp * 0.2, alt * 0.26)
  ctx.strokeStyle = `rgba(4, 14, 18, ${p.alpha * 0.8})`
  ctx.lineWidth = Math.max(0.7, comp * 0.007)
  ctx.stroke()
  olho(p, comp * 0.38, -alt * 0.2, Math.max(1, alt * 0.09))
}

// --- zona mesopelágica ------------------------------------------------------

/**
 * Lula. Nada com os braços na frente, manto afilando pra trás e as duas aletas
 * na ponta da cauda — não o contrário, que foi o que a primeira versão fez: os
 * braços saíam da cabeça como bigode e o manto parecia um foguete.
 */
function lula(p: Pincel) {
  const { ctx, comp, alt, t, fase, alpha } = p
  const onda = (i: number) => Math.sin(t * 1.9 + fase + i * 0.6)

  // aletas: dois losangos presos ao terço traseiro, passando POR FORA do manto
  for (const lado of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(-comp * 0.14, lado * alt * 0.58)
    ctx.quadraticCurveTo(-comp * 0.34, lado * alt * 1.7, -comp * 0.52, lado * alt * 1.05)
    ctx.quadraticCurveTo(-comp * 0.56, lado * alt * 0.42, -comp * 0.4, lado * alt * 0.4)
    ctx.closePath()
    encorpar(p, 0.5)
  }

  // manto: largo na cabeça, estreitando até uma ponta ARREDONDADA. Terminar em
  // bico fazia o bicho parecer avião de papel.
  ctx.beginPath()
  ctx.moveTo(comp * 0.22, -alt * 0.78)
  ctx.quadraticCurveTo(-comp * 0.18, -alt * 0.66, -comp * 0.44, -alt * 0.28)
  ctx.quadraticCurveTo(-comp * 0.58, 0, -comp * 0.44, alt * 0.28)
  ctx.quadraticCurveTo(-comp * 0.18, alt * 0.66, comp * 0.22, alt * 0.78)
  ctx.quadraticCurveTo(comp * 0.36, 0, comp * 0.22, -alt * 0.78)
  ctx.closePath()
  encorpar(p)

  // oito braços curtos, saindo da frente em leque
  for (let i = 0; i < 8; i++) {
    const espalha = (i / 7 - 0.5) * 1.7
    const o = onda(i)
    ctx.beginPath()
    ctx.moveTo(comp * 0.3, espalha * alt * 0.3)
    ctx.quadraticCurveTo(
      comp * 0.5, espalha * alt * 0.75 + o * alt * 0.2,
      comp * 0.66 + o * comp * 0.02, espalha * alt * 1.15 + o * alt * 0.3,
    )
    ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * 0.5})`
    ctx.lineWidth = Math.max(0.6, comp * 0.008)
    ctx.stroke()
  }

  // dois tentáculos de caça, mais longos, com a clava na ponta
  for (const lado of [-1, 1]) {
    const o = onda(lado + 4)
    const fx = comp * 0.98
    const fy = lado * alt * 0.9 + o * alt * 0.7
    ctx.beginPath()
    ctx.moveTo(comp * 0.3, lado * alt * 0.2)
    ctx.bezierCurveTo(
      comp * 0.58, lado * alt * 0.3 + o * alt * 0.3,
      comp * 0.8, lado * alt * 0.8 + o * alt * 0.6,
      fx, fy,
    )
    ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * 0.6})`
    ctx.lineWidth = Math.max(0.6, comp * 0.007)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(fx, fy, comp * 0.05, alt * 0.12, lado * 0.5, 0, Math.PI * 2)
    encorpar(p, 0.55)
  }

  contraluz(p, () => {
    ctx.moveTo(comp * 0.22, -alt * 0.78)
    ctx.quadraticCurveTo(-comp * 0.16, -alt * 0.62, -comp * 0.56, 0)
  })
  olho(p, comp * 0.24, -alt * 0.34, Math.max(1, alt * 0.15))
  fileiraDeLuzes(p, -comp * 0.42, comp * 0.08, alt * 0.48, 5)
}

/**
 * Peixe-machado. O nome vem da silhueta: corpo alto e achatado terminando numa
 * quilha afiada na barriga, que é onde ficam os fotóforos. A primeira versão
 * virou um balão com um olho enorme — faltava justamente a quilha.
 */
function peixeMachado(p: Pincel) {
  const { ctx, comp, alt, alpha } = p

  // cauda em forquilha, num pedúnculo bem fino
  ctx.beginPath()
  ctx.moveTo(-comp * 0.26, -alt * 0.1)
  ctx.lineTo(-comp * 0.5, -alt * 0.7)
  ctx.lineTo(-comp * 0.4, 0)
  ctx.lineTo(-comp * 0.5, alt * 0.7)
  ctx.lineTo(-comp * 0.26, alt * 0.1)
  ctx.closePath()
  encorpar(p, 0.7)

  // corpo: dorso alto e reto, flanco caindo até a quilha em ponta
  ctx.beginPath()
  ctx.moveTo(comp * 0.38, -alt * 0.55)
  ctx.quadraticCurveTo(comp * 0.2, -alt * 1.15, -comp * 0.02, -alt * 1.1)
  ctx.lineTo(-comp * 0.26, -alt * 0.12)
  ctx.lineTo(-comp * 0.26, alt * 0.12)
  // a quilha: desce em diagonal até uma ponta baixa, bem à frente
  ctx.lineTo(-comp * 0.04, alt * 0.9)
  ctx.lineTo(comp * 0.16, alt * 1.65)
  ctx.lineTo(comp * 0.3, alt * 0.85)
  ctx.quadraticCurveTo(comp * 0.46, alt * 0.1, comp * 0.38, -alt * 0.55)
  ctx.closePath()
  encorpar(p)

  // dorsal curta, em cima do dorso reto
  ctx.beginPath()
  ctx.moveTo(comp * 0.06, -alt * 1.1)
  ctx.lineTo(-comp * 0.04, -alt * 1.75)
  ctx.lineTo(-comp * 0.16, -alt * 0.95)
  ctx.closePath()
  encorpar(p, 0.6)

  // costelas prateadas: o corpo do machado é espelhado
  ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * 0.22})`
  ctx.lineWidth = Math.max(0.5, comp * 0.004)
  for (let i = 0; i < 4; i++) {
    const x = comp * (0.22 - i * 0.1)
    ctx.beginPath()
    ctx.moveTo(x, -alt * 0.85)
    ctx.lineTo(x - comp * 0.04, alt * 0.8)
    ctx.stroke()
  }

  contraluz(p, () => {
    ctx.moveTo(comp * 0.38, -alt * 0.55)
    ctx.quadraticCurveTo(comp * 0.2, -alt * 1.15, -comp * 0.02, -alt * 1.1)
  })
  // olho tubular apontando pra cima: ele caça contra a luz que vem de lá
  ctx.beginPath()
  ctx.ellipse(comp * 0.28, -alt * 0.5, alt * 0.13, alt * 0.22, 0, 0, Math.PI * 2)
  encorpar(p, 0.6)
  olho(p, comp * 0.28, -alt * 0.62, Math.max(0.9, alt * 0.11))
  // fotóforos na aresta da quilha
  for (let i = 0; i < 6; i++) {
    const k = i / 5
    fotoforo(
      p,
      comp * (-0.04 + k * 0.34),
      alt * (0.9 + Math.sin(k * Math.PI) * 0.55),
      Math.max(0.7, comp * 0.009),
    )
  }
}

/** Água-viva grande: umbrela pulsando e braços orais compridos. */
function aguaVivaGrande(p: Pincel) {
  const { ctx, comp, alt, t, fase, alpha } = p
  const pulso = 0.82 + 0.18 * Math.sin(t * 1.5 + fase)
  const r = comp * 0.34

  ctx.beginPath()
  ctx.moveTo(-r, 0)
  ctx.quadraticCurveTo(-r * 0.9, -alt * 1.5 * pulso, 0, -alt * 1.55 * pulso)
  ctx.quadraticCurveTo(r * 0.9, -alt * 1.5 * pulso, r, 0)
  // barra franjada da umbrela
  for (let i = 4; i >= 0; i--) {
    const x = -r + (r * 2 * i) / 4
    ctx.quadraticCurveTo(x + r * 0.12, alt * 0.3 * pulso, x, 0)
  }
  ctx.closePath()
  const g = ctx.createRadialGradient(0, -alt * 0.5, 0, 0, -alt * 0.5, r * 1.4)
  g.addColorStop(0, `rgba(${BIOLUM}, ${alpha * 0.3})`)
  g.addColorStop(1, `rgba(110, 200, 220, ${alpha * 0.08})`)
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = `rgba(${BIOLUM}, ${alpha * 0.55})`
  ctx.lineWidth = Math.max(0.8, comp * 0.008)
  ctx.stroke()

  // braços orais
  ctx.strokeStyle = `rgba(${BIOLUM}, ${alpha * 0.34})`
  ctx.lineWidth = Math.max(0.6, comp * 0.006)
  for (let i = 0; i < 7; i++) {
    const x0 = -r * 0.7 + (r * 1.4 * i) / 6
    const o = Math.sin(t * 1.2 + fase + i)
    ctx.beginPath()
    ctx.moveTo(x0, 0)
    ctx.bezierCurveTo(
      x0 + o * comp * 0.05, alt * 1.4,
      x0 - o * comp * 0.08, alt * 2.6,
      x0 + o * comp * 0.1, alt * 3.6,
    )
    ctx.stroke()
  }
}

// --- zona batipelágica ------------------------------------------------------

/** Peixe-pescador: corpo bojudo, mandíbula de dentes, isca luminosa na haste. */
function peixePescador(p: Pincel) {
  const { ctx, comp, alt, t, fase, alpha } = p
  const balanca = Math.sin(t * 1.1 + fase)

  // cauda em leque
  ctx.beginPath()
  ctx.moveTo(-comp * 0.3, 0)
  ctx.quadraticCurveTo(-comp * 0.52, -alt * 0.75, -comp * 0.58, -alt * 0.3)
  ctx.quadraticCurveTo(-comp * 0.5, 0, -comp * 0.58, alt * 0.3)
  ctx.quadraticCurveTo(-comp * 0.52, alt * 0.75, -comp * 0.3, 0)
  ctx.closePath()
  encorpar(p, 0.7)

  // corpo quase esférico
  ctx.beginPath()
  ctx.moveTo(comp * 0.34, -alt * 0.3)
  ctx.bezierCurveTo(comp * 0.2, -alt * 1.25, -comp * 0.18, -alt * 1.2, -comp * 0.3, -alt * 0.15)
  ctx.bezierCurveTo(-comp * 0.2, alt * 1.15, comp * 0.2, alt * 1.2, comp * 0.34, alt * 0.35)
  ctx.closePath()
  encorpar(p)

  // mandíbula escancarada
  ctx.beginPath()
  ctx.moveTo(comp * 0.34, -alt * 0.3)
  ctx.quadraticCurveTo(comp * 0.56, -alt * 0.1, comp * 0.48, alt * 0.12)
  ctx.quadraticCurveTo(comp * 0.56, alt * 0.5, comp * 0.3, alt * 0.42)
  ctx.closePath()
  ctx.fillStyle = `rgba(3, 10, 14, ${alpha})`
  ctx.fill()
  ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * 0.7})`
  ctx.lineWidth = Math.max(0.7, comp * 0.006)
  ctx.stroke()

  // dentes: triângulos alternando de cima e de baixo
  ctx.fillStyle = `rgba(232, 252, 250, ${alpha * 0.85})`
  for (let i = 0; i < 6; i++) {
    const x = comp * (0.34 + i * 0.035)
    const cima = i % 2 === 0
    ctx.beginPath()
    ctx.moveTo(x, cima ? -alt * 0.22 : alt * 0.3)
    ctx.lineTo(x + comp * 0.018, cima ? alt * 0.02 : alt * 0.06)
    ctx.lineTo(x + comp * 0.036, cima ? -alt * 0.22 : alt * 0.3)
    ctx.closePath()
    ctx.fill()
  }

  // haste e isca: a isca é o que se vê primeiro no escuro
  const ix = comp * (0.3 + balanca * 0.04)
  const iy = -alt * (1.5 + balanca * 0.12)
  ctx.beginPath()
  ctx.moveTo(comp * 0.02, -alt * 1.05)
  ctx.quadraticCurveTo(comp * 0.24, -alt * 1.7, ix, iy)
  ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * 0.6})`
  ctx.lineWidth = Math.max(0.7, comp * 0.007)
  ctx.stroke()
  fotoforo(p, ix, iy, Math.max(1.6, comp * 0.022), 1.4)

  olho(p, comp * 0.2, -alt * 0.45, Math.max(1, alt * 0.12))
}

/**
 * Peixe-víbora. Cabeça grande com presas que não cabem na boca — elas passam
 * POR FORA da mandíbula, e é isso que dá o susto. Tem ainda um raio dorsal
 * comprido, com a luz na ponta, que ele arma sobre a cabeça como anzol.
 */
function peixeVibora(p: Pincel) {
  const { ctx, comp, alt, t, fase, alpha } = p
  const ondula = Math.sin(t * 2.2 + fase)

  // cauda
  ctx.beginPath()
  ctx.moveTo(-comp * 0.32, ondula * alt * 0.5)
  ctx.lineTo(-comp * 0.52, ondula * alt * 0.5 - alt * 0.9)
  ctx.lineTo(-comp * 0.44, ondula * alt * 0.5)
  ctx.lineTo(-comp * 0.52, ondula * alt * 0.5 + alt * 0.9)
  ctx.closePath()
  encorpar(p, 0.7)

  // corpo: cabeçudo na frente, afilando num rabo fino que ondula
  ctx.beginPath()
  ctx.moveTo(comp * 0.46, -alt * 0.1)
  ctx.quadraticCurveTo(comp * 0.24, -alt * 1.25, comp * 0.02, -alt * 0.95)
  ctx.quadraticCurveTo(-comp * 0.2, -alt * 0.6 + ondula * alt * 0.35, -comp * 0.34, ondula * alt * 0.5)
  ctx.quadraticCurveTo(-comp * 0.2, alt * 0.6 + ondula * alt * 0.35, comp * 0.02, alt * 0.95)
  ctx.quadraticCurveTo(comp * 0.26, alt * 1.15, comp * 0.46, alt * 0.35)
  ctx.quadraticCurveTo(comp * 0.56, alt * 0.1, comp * 0.46, -alt * 0.1)
  ctx.closePath()
  encorpar(p)

  // a boca escancarada
  ctx.beginPath()
  ctx.moveTo(comp * 0.46, -alt * 0.12)
  ctx.quadraticCurveTo(comp * 0.3, alt * 0.1, comp * 0.16, alt * 0.05)
  ctx.quadraticCurveTo(comp * 0.32, alt * 0.55, comp * 0.46, alt * 0.35)
  ctx.closePath()
  ctx.fillStyle = `rgba(3, 10, 14, ${alpha})`
  ctx.fill()

  // presas: as de cima descem POR FORA do queixo, as de baixo sobem
  ctx.fillStyle = `rgba(238, 255, 253, ${alpha * 0.92})`
  for (let i = 0; i < 5; i++) {
    const x = comp * (0.2 + i * 0.05)
    const alto = i % 2 === 0
    ctx.beginPath()
    if (alto) {
      ctx.moveTo(x, -alt * 0.05)
      ctx.lineTo(x + comp * 0.01, alt * 0.85)
      ctx.lineTo(x + comp * 0.026, -alt * 0.05)
    } else {
      ctx.moveTo(x, alt * 0.45)
      ctx.lineTo(x + comp * 0.01, -alt * 0.45)
      ctx.lineTo(x + comp * 0.026, alt * 0.45)
    }
    ctx.closePath()
    ctx.fill()
  }

  // raio dorsal comprido, armado sobre a cabeça, com a luz na ponta
  const lx = comp * (0.42 + ondula * 0.03)
  const ly = -alt * (2.1 + ondula * 0.15)
  ctx.beginPath()
  ctx.moveTo(comp * 0.04, -alt * 0.95)
  ctx.quadraticCurveTo(comp * 0.34, -alt * 2.2, lx, ly)
  ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * 0.55})`
  ctx.lineWidth = Math.max(0.6, comp * 0.006)
  ctx.stroke()
  fotoforo(p, lx, ly, Math.max(1.1, comp * 0.013), 1.2)

  contraluz(p, () => {
    ctx.moveTo(comp * 0.46, -alt * 0.1)
    ctx.quadraticCurveTo(comp * 0.24, -alt * 1.25, comp * 0.02, -alt * 0.95)
  })
  olho(p, comp * 0.34, -alt * 0.45, Math.max(0.9, alt * 0.13))
  fileiraDeLuzes(p, -comp * 0.3, comp * 0.16, alt * 0.62, 8)
}

/** Cachalote: cabeça quadrada enorme, mandíbula fina, cauda horizontal. */
function cachalote(p: Pincel) {
  const { ctx, comp, alt, t, fase, alpha } = p
  const bate = Math.sin(t * 1.1 + fase)

  // cauda
  ctx.beginPath()
  ctx.moveTo(-comp * 0.38, bate * alt * 0.12)
  ctx.quadraticCurveTo(-comp * 0.54, bate * alt * 0.3, -comp * 0.6, bate * alt * 0.3 - alt * 0.85)
  ctx.quadraticCurveTo(-comp * 0.46, bate * alt * 0.22, -comp * 0.47, bate * alt * 0.18)
  ctx.quadraticCurveTo(-comp * 0.46, bate * alt * 0.22 + alt * 0.95, -comp * 0.6, bate * alt * 0.3 + alt * 0.85)
  ctx.quadraticCurveTo(-comp * 0.54, bate * alt * 0.3, -comp * 0.38, bate * alt * 0.12)
  encorpar(p, 0.7)

  // corpo: a testa é reta e quadrada, é o que identifica o cachalote
  ctx.beginPath()
  ctx.moveTo(comp * 0.5, -alt * 0.85)
  ctx.lineTo(comp * 0.52, alt * 0.35)
  ctx.quadraticCurveTo(comp * 0.3, alt * 0.62, comp * 0.1, alt * 0.7)
  ctx.quadraticCurveTo(-comp * 0.2, alt * 0.8, -comp * 0.4, bate * alt * 0.14)
  ctx.quadraticCurveTo(-comp * 0.2, -alt * 0.9, comp * 0.1, -alt * 0.95)
  ctx.quadraticCurveTo(comp * 0.36, -alt * 0.98, comp * 0.5, -alt * 0.85)
  ctx.closePath()
  encorpar(p)

  // mandíbula estreita, colada embaixo da testa
  ctx.beginPath()
  ctx.moveTo(comp * 0.5, alt * 0.36)
  ctx.quadraticCurveTo(comp * 0.28, alt * 0.52, comp * 0.12, alt * 0.48)
  ctx.quadraticCurveTo(comp * 0.3, alt * 0.34, comp * 0.5, alt * 0.28)
  ctx.closePath()
  encorpar(p, 0.6)

  // rugas do dorso
  ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * 0.25})`
  ctx.lineWidth = Math.max(0.5, comp * 0.004)
  for (let i = 0; i < 4; i++) {
    const x = -comp * (0.1 + i * 0.07)
    ctx.beginPath()
    ctx.moveTo(x, -alt * 0.7)
    ctx.quadraticCurveTo(x - comp * 0.02, 0, x, alt * 0.55)
    ctx.stroke()
  }

  contraluz(p, () => {
    ctx.moveTo(comp * 0.5, -alt * 0.85)
    ctx.quadraticCurveTo(comp * 0.36, -alt * 0.98, comp * 0.1, -alt * 0.95)
    ctx.quadraticCurveTo(-comp * 0.2, -alt * 0.9, -comp * 0.4, bate * alt * 0.14)
  })
  olho(p, comp * 0.34, alt * 0.2, Math.max(1, alt * 0.07))
}

// --- zona abissal -----------------------------------------------------------

/**
 * Peixe-pelicano. É quase só boca: uma bolsa que abre maior que o próprio
 * corpo, presa a um chicote que termina numa ponta acesa. A primeira versão
 * desenhou a bolsa como uma fresta — e sem a bolsa aberta o bicho some.
 */
function peixePelicano(p: Pincel) {
  const { ctx, comp, alt, t, fase, alpha } = p
  const ondula = (k: number) => Math.sin(t * 1.4 + fase + k)

  // o chicote: sai da nuca e vai longe, terminando na isca luminosa
  const cx = -comp * 0.95
  const cy = alt * 2.2 * ondula(2)
  ctx.beginPath()
  ctx.moveTo(-comp * 0.16, alt * 0.1)
  ctx.bezierCurveTo(
    -comp * 0.42, alt * 0.9 * ondula(0),
    -comp * 0.72, alt * 2.0 * ondula(1),
    cx, cy,
  )
  ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * 0.55})`
  ctx.lineWidth = Math.max(0.8, comp * 0.014)
  ctx.stroke()
  fotoforo(p, cx, cy, Math.max(1.3, comp * 0.018), 1.3)

  // mandíbula superior: uma haste longa e reta, da nuca até a ponta do focinho
  ctx.beginPath()
  ctx.moveTo(-comp * 0.16, -alt * 0.2)
  ctx.quadraticCurveTo(comp * 0.2, -alt * 0.5, comp * 0.52, -alt * 0.18)
  ctx.quadraticCurveTo(comp * 0.2, -alt * 0.2, -comp * 0.14, alt * 0.05)
  ctx.closePath()
  encorpar(p, 0.8)

  // a bolsa: enorme, inflada, indo da ponta do focinho até a nuca
  ctx.beginPath()
  ctx.moveTo(comp * 0.52, -alt * 0.18)
  ctx.bezierCurveTo(comp * 0.5, alt * 1.9, comp * 0.02, alt * 2.6, -comp * 0.14, alt * 0.1)
  ctx.quadraticCurveTo(comp * 0.16, alt * 0.2, comp * 0.52, -alt * 0.18)
  ctx.closePath()
  encorpar(p)

  // as pregas da bolsa, que dizem que aquilo estica
  ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * 0.25})`
  ctx.lineWidth = Math.max(0.5, comp * 0.004)
  for (let i = 0; i < 4; i++) {
    const k = 0.2 + i * 0.18
    ctx.beginPath()
    ctx.moveTo(comp * (0.5 - k * 0.6), alt * 0.15)
    ctx.quadraticCurveTo(comp * (0.44 - k * 0.55), alt * 1.4, comp * (0.3 - k * 0.5), alt * 1.9)
    ctx.stroke()
  }

  olho(p, comp * 0.4, -alt * 0.3, Math.max(0.8, alt * 0.1))
}

/** Lula-gigante: manto comprido, aletas largas, dez apêndices. */
function lulaGigante(p: Pincel) {
  const { ctx, comp, alt, t, fase, alpha } = p
  const onda = (i: number) => Math.sin(t * 1.2 + fase + i * 0.55)

  // aletas largas, quase metade do manto — a marca da Architeuthis
  for (const lado of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(-comp * 0.06, lado * alt * 0.6)
    ctx.quadraticCurveTo(-comp * 0.3, lado * alt * 2.0, -comp * 0.54, lado * alt * 1.15)
    ctx.quadraticCurveTo(-comp * 0.58, lado * alt * 0.4, -comp * 0.36, lado * alt * 0.42)
    ctx.closePath()
    encorpar(p, 0.45)
  }

  ctx.beginPath()
  ctx.moveTo(comp * 0.14, -alt * 0.72)
  ctx.quadraticCurveTo(-comp * 0.24, -alt * 0.6, -comp * 0.46, -alt * 0.26)
  ctx.quadraticCurveTo(-comp * 0.6, 0, -comp * 0.46, alt * 0.26)
  ctx.quadraticCurveTo(-comp * 0.24, alt * 0.6, comp * 0.14, alt * 0.72)
  ctx.quadraticCurveTo(comp * 0.3, 0, comp * 0.14, -alt * 0.72)
  ctx.closePath()
  encorpar(p)

  // dez apêndices: oito braços e dois tentáculos mais longos, com clava
  for (let i = 0; i < 10; i++) {
    const espalha = (i / 9 - 0.5) * 1.9
    const longo = i === 0 || i === 9
    const o = onda(i)
    const fim = comp * (longo ? 1.25 : 0.78)
    ctx.beginPath()
    ctx.moveTo(comp * 0.18, espalha * alt * 0.4)
    ctx.bezierCurveTo(
      comp * 0.5, espalha * alt * 0.7 + o * alt * 0.35,
      comp * 0.8, espalha * alt * 1.2 + o * alt * 0.8,
      fim, espalha * alt * 1.3 + o * alt * 1.0,
    )
    ctx.strokeStyle = p.silhueta ? '#000' : `rgba(${CONTORNO}, ${alpha * (longo ? 0.6 : 0.45)})`
    ctx.lineWidth = Math.max(0.6, comp * (longo ? 0.009 : 0.007))
    ctx.stroke()
    if (longo) {
      ctx.beginPath()
      ctx.ellipse(
        fim, espalha * alt * 1.3 + o * alt,
        comp * 0.055, alt * 0.14, espalha * 0.4, 0, Math.PI * 2,
      )
      encorpar(p, 0.5)
    }
  }

  // o olho da lula-gigante é do tamanho de um prato: aqui ele é o detalhe
  olho(p, comp * 0.16, -alt * 0.34, Math.max(1.6, alt * 0.26))
  fileiraDeLuzes(p, -comp * 0.44, comp * 0.06, alt * 0.5, 4)
}

/**
 * Megalodonte.
 *
 * É o tubarão com tudo aumentado, e de propósito: a plateia precisa reconhecer
 * a forma em meio segundo, num blip de sonar ou numa sombra. Inventar uma
 * silhueta nova só faria o contorno ficar ilegível.
 *
 * O que muda em relação ao tubarão é a PROPORÇÃO, que é onde o tamanho mora: a
 * cabeça é muito mais larga que o corpo, a dorsal é alta e reta em vez de
 * curva, e a cauda é assimétrica de tubarão grande — lóbulo de cima bem maior
 * que o de baixo. Um tubarão desenhado 1,6× maior continua parecendo um
 * tubarão; um tubarão com a cabeça de um terço do corpo é outro bicho.
 *
 * Nada disto aparece sozinho na câmera: ele só entra por roteiro. Trocar de
 * criatura é trocar a chave no JSON e escrever outra função aqui.
 */
/** Batida do megalodonte, em Hz. Bicho grande não vibra: 0,4 é uma a cada 2,5 s. */
const BATIDA_MEGALODONTE = 0.4

/**
 * Espinha articulada.
 *
 * O corpo deixa de ser uma curva fixa com a cauda balançando e passa a ser uma
 * CADEIA: uma onda viajante que percorre o bicho da cabeça pra cauda, como nos
 * peixes. É a diferença entre um desenho que abana o rabo e um que nada.
 *
 * Duas coisas fazem isso funcionar:
 *
 *  - **A onda viaja pra trás** (o `-x * K_ONDA` na fase). A cabeça inicia o
 *    movimento e a cauda chega depois; invertido, o bicho parece puxado pelo
 *    rabo.
 *  - **A amplitude cresce do focinho pra cauda.** Tubarão grande quase não mexe
 *    a cabeça — o que varre é o terço traseiro. Com amplitude constante, ele
 *    nada como uma enguia.
 *
 * `x` vai de -0,5 (ponta da cauda) a +0,5 (focinho), em frações do comprimento.
 */
function espinha(x: number, alt: number, t: number, fase: number, rigidez = 0): number {
  const K_ONDA = 7.5
  // `rigidez` empurra o início da onda pra trás (0,42 -> -0,12: o tronco inteiro
  // para) e deixa a subida mais íngreme. A constante é recalculada pra a PONTA
  // da cauda varrer sempre o mesmo tanto — enrijecer o corpo não pode virar um
  // bicho que também perdeu a batida.
  const r = Math.max(0, Math.min(1, rigidez))
  const inicio = 0.42 - r * 0.54
  const expo = 1.6 + r * 0.9
  const ganho = AMPLITUDE_PONTA / (inicio + 0.5) ** expo
  const amplitude = Math.max(0, inicio - x) ** expo * ganho
  return Math.sin(t * Math.PI * 2 * BATIDA_MEGALODONTE + fase - x * K_ONDA) * alt * amplitude
}

/** Quanto a ponta da cauda varre, em alturas de corpo. É o mesmo em qualquer rigidez. */
const AMPLITUDE_PONTA = 0.92 ** 1.6 * 2.1

/** Inclinação local da espinha, pra as barbatanas acompanharem o corpo. */
function anguloDaEspinha(
  x: number,
  alt: number,
  comp: number,
  t: number,
  fase: number,
  rigidez = 0,
): number {
  const d = 0.02
  const dy = espinha(x + d, alt, t, fase, rigidez) - espinha(x - d, alt, t, fase, rigidez)
  return Math.atan2(dy, d * 2 * comp)
}

/**
 * Megalodonte.
 *
 * É o tubarão com tudo aumentado, e de propósito: a plateia precisa reconhecer
 * a forma em meio segundo, num blip de sonar ou numa sombra. Inventar uma
 * silhueta nova só faria o contorno ficar ilegível.
 *
 * O que muda em relação ao tubarão é a PROPORÇÃO, que é onde o tamanho mora: a
 * cabeça é muito mais larga que o corpo, a dorsal é alta e reta em vez de
 * curva, e a cauda é assimétrica de tubarão grande — lóbulo de cima bem maior
 * que o de baixo. Um tubarão desenhado 1,6× maior continua parecendo um
 * tubarão; um tubarão com a cabeça de um terço do corpo é outro bicho.
 *
 * Nada disto aparece sozinho na câmera: ele só entra por roteiro. Trocar de
 * criatura é trocar a chave no JSON e escrever outra função aqui.
 */
function megalodonte(p: Pincel) {
  const { ctx, comp, alt, t, fase } = p
  const rigidez = p.rigidez ?? 0

  /** Ponto na espinha, em px. */
  const ex = (x: number) => x * comp
  const ey = (x: number) => espinha(x, alt, t, fase, rigidez)
  /** Ponto deslocado perpendicularmente à espinha — é o que dá volume ao corpo. */
  const lado = (x: number, offset: number): [number, number] => {
    const ang = anguloDaEspinha(x, alt, comp, t, fase, rigidez)
    return [ex(x) - Math.sin(ang) * offset, ey(x) + Math.cos(ang) * offset]
  }

  // cauda assimétrica: o lóbulo superior é quase o dobro do inferior
  const xCauda = -0.42
  const yCauda = ey(xCauda)
  const angCauda = anguloDaEspinha(xCauda, alt, comp, t, fase, rigidez)
  ctx.save()
  ctx.translate(ex(xCauda), yCauda)
  ctx.rotate(angCauda)
  ctx.beginPath()
  ctx.moveTo(comp * 0.12, 0)
  ctx.lineTo(-comp * 0.1, -alt * 2.4)
  ctx.lineTo(-comp * 0.02, -alt * 0.15)
  ctx.lineTo(-comp * 0.14, alt * 1.3)
  ctx.closePath()
  encorpar(p, 0.8)
  ctx.restore()

  // quilha caudal: a aresta lateral que os tubarões grandes têm antes da cauda
  ctx.beginPath()
  ctx.moveTo(...lado(-0.2, alt * 0.18))
  ctx.lineTo(...lado(-0.33, alt * 0.38))
  ctx.lineTo(...lado(-0.33, alt * 0.12))
  ctx.closePath()
  encorpar(p, 0.55)

  // corpo: torpedo grosso, montado em cima da espinha
  const perfilCorpo = (x: number): number => {
    // Altura do corpo ao longo do comprimento: fina na cauda, cheia no meio,
    // afilando de novo no focinho.
    if (x > 0.5 || x < -0.42) return 0
    const f = (x + 0.42) / 0.92
    return alt * (Math.sin(Math.PI * f ** 0.78) ** 0.85)
  }
  ctx.beginPath()
  for (let k = 0; k <= 26; k++) {
    const x = 0.5 - (k / 26) * 0.92
    const ponto = lado(x, -perfilCorpo(x))
    if (k === 0) ctx.moveTo(...ponto)
    else ctx.lineTo(...ponto)
  }
  for (let k = 0; k <= 26; k++) {
    const x = -0.42 + (k / 26) * 0.92
    ctx.lineTo(...lado(x, perfilCorpo(x) * 0.94))
  }
  ctx.closePath()
  encorpar(p)

  // dorsal alta e reta, com a ponta levemente pra trás
  const dorsal = (x: number, y: number) => lado(x, y)
  ctx.beginPath()
  ctx.moveTo(...dorsal(0.14, -alt * 0.86))
  ctx.lineTo(...dorsal(0.02, -alt * 2.25))
  ctx.lineTo(...dorsal(-0.04, -alt * 2.2))
  ctx.lineTo(...dorsal(-0.16, -alt * 0.76))
  ctx.closePath()
  encorpar(p, 0.9)

  // segunda dorsal, pequena, perto da cauda
  ctx.beginPath()
  ctx.moveTo(...dorsal(-0.24, -alt * 0.56))
  ctx.lineTo(...dorsal(-0.3, -alt * 0.98))
  ctx.lineTo(...dorsal(-0.35, -alt * 0.48))
  ctx.closePath()
  encorpar(p, 0.7)

  // peitorais enormes, em foice
  for (const escala of [1, 0.58]) {
    ctx.beginPath()
    ctx.moveTo(...lado(0.24, alt * 0.6))
    ctx.quadraticCurveTo(...lado(0.08, alt * 2.05 * escala), ...lado(-0.06, alt * 1.95 * escala))
    ctx.quadraticCurveTo(...lado(0.04, alt * 1.05 * escala), ...lado(0.14, alt * 0.5))
    ctx.closePath()
    encorpar(p, 0.62)
  }

  // anal
  ctx.beginPath()
  ctx.moveTo(...lado(-0.2, alt * 0.56))
  ctx.lineTo(...lado(-0.29, alt * 1.02))
  ctx.lineTo(...lado(-0.33, alt * 0.46))
  ctx.closePath()
  encorpar(p, 0.6)

  contraluz(p, () => {
    for (let k = 0; k <= 22; k++) {
      const x = 0.5 - (k / 22) * 0.92
      const ponto = lado(x, -perfilCorpo(x))
      if (k === 0) ctx.moveTo(...ponto)
      else ctx.lineTo(...ponto)
    }
  })

  if (p.silhueta) return

  // a boca: a coisa pela qual o bicho é conhecido. Aberta, larga, com a fileira
  // de dentes triangulares sugerida — não desenhada um a um, que a essa escala
  // vira serrilha.
  ctx.beginPath()
  ctx.moveTo(...lado(0.49, -alt * 0.1))
  ctx.quadraticCurveTo(...lado(0.34, alt * 0.62), ...lado(0.06, alt * 0.56))
  ctx.strokeStyle = `rgba(3, 10, 14, ${p.alpha * 0.85})`
  ctx.lineWidth = Math.max(1.2, comp * 0.014)
  ctx.stroke()

  ctx.beginPath()
  const dentes = 7
  for (let i = 0; i < dentes; i++) {
    const f = i / (dentes - 1)
    const x = 0.47 - f * 0.4
    const y = alt * (-0.06 + f * 0.62)
    const d = Math.max(1, alt * 0.2 * (1 - f * 0.35))
    ctx.moveTo(...lado(x, y))
    ctx.lineTo(...lado(x - d * 0.5 / comp, y + d))
    ctx.lineTo(...lado(x + d * 0.5 / comp, y + d * 0.7))
  }
  ctx.fillStyle = `rgba(226, 250, 252, ${p.alpha * 0.55})`
  ctx.fill()

  // cinco fendas branquiais
  ctx.strokeStyle = `rgba(4, 14, 18, ${p.alpha * 0.6})`
  ctx.lineWidth = Math.max(0.8, comp * 0.008)
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const x = 0.3 - i * 0.045
    ctx.moveTo(...lado(x, -alt * 0.44))
    ctx.lineTo(...lado(x - 0.012, alt * 0.4))
  }
  ctx.stroke()

  const [ox, oy] = lado(0.38, -alt * 0.46)
  olho(p, ox, oy, Math.max(1.2, alt * 0.12))
}

// --- catálogo ---------------------------------------------------------------

/**
 * Faixas se sobrepõem de propósito: numa mesma profundidade há mais de uma
 * espécie possível, então a câmera não fica previsível. As de fundo são
 * maiores — é o que a expedição encontra ao descer.
 */
export const ESPECIES: Especie[] = [
  { chave: 'tartaruga', rotulo: 'QUELÔNIO', faixa: [0, 260], porte: [0.5, 0.8], proporcao: 0.3, desenhar: tartaruga },
  { chave: 'golfinho', rotulo: 'CETÁCEO', faixa: [0, 320], porte: [0.6, 0.95], proporcao: 0.2, desenhar: golfinho },
  { chave: 'raia', rotulo: 'ELASMOBRÂNQUIO', faixa: [0, 420], porte: [0.6, 1.0], proporcao: 0.47, desenhar: raia },
  { chave: 'tubarao', rotulo: 'ELASMOBRÂNQUIO', faixa: [20, 600], porte: [0.7, 1.15], proporcao: 0.17, desenhar: tubarao },
  { chave: 'lula', rotulo: 'CEFALÓPODE', faixa: [180, 1400], porte: [0.5, 0.85], proporcao: 0.3, desenhar: lula },
  { chave: 'machado', rotulo: 'ARGYROPELECUS', faixa: [200, 1200], porte: [0.34, 0.55], proporcao: 0.3, desenhar: peixeMachado },
  { chave: 'agua-viva', rotulo: 'CNIDÁRIO', faixa: [150, 2200], porte: [0.45, 0.8], proporcao: 0.3, desenhar: aguaVivaGrande },
  { chave: 'pescador', rotulo: 'MELANOCETUS', faixa: [900, 4200], porte: [0.5, 0.8], proporcao: 0.42, desenhar: peixePescador },
  { chave: 'vibora', rotulo: 'CHAULIODUS', faixa: [800, 3800], porte: [0.6, 0.95], proporcao: 0.2, desenhar: peixeVibora },
  { chave: 'cachalote', rotulo: 'CETÁCEO', faixa: [700, 3200], porte: [1.1, 1.6], proporcao: 0.26, desenhar: cachalote },
  { chave: 'pelicano', rotulo: 'EURYPHARYNX', faixa: [2500, 7000], porte: [0.7, 1.1], proporcao: 0.22, desenhar: peixePelicano },
  { chave: 'lula-gigante', rotulo: 'ARCHITEUTHIS', faixa: [2200, 8000], porte: [1.2, 1.8], proporcao: 0.3, desenhar: lulaGigante },
  // Fora do sorteio (ver ESPECIES_ESPONTANEAS): so entra por roteiro.
  { chave: 'megalodonte', rotulo: 'OTODUS MEGALODON', faixa: [1000, 8000], porte: [1.8, 2.6], proporcao: 0.15, desenhar: megalodonte },
]

/**
 * Quem a camera pode sortear sozinha.
 *
 * O megalodonte fica de fora: ele e um evento de roteiro do 3A, e uma aparicao
 * aleatoria dele na camera do 2A estragaria a surpresa e a verossimilhanca ao
 * mesmo tempo. Criatura nova de roteiro entra no ESPECIES e NAO entra aqui.
 */
const SO_POR_ROTEIRO = new Set(['megalodonte'])

export const ESPECIES_ESPONTANEAS = ESPECIES.filter((e) => !SO_POR_ROTEIRO.has(e.chave))

/** Uma especie pelo nome, pro roteiro invocar a criatura que quiser. */
export function especiePorChave(chave: string): Especie | null {
  return ESPECIES.find((e) => e.chave === chave) ?? null
}

/** Espécies possíveis nesta profundidade. Nunca devolve lista vazia. */
export function especiesEm(profundidade: number): Especie[] {
  const cabem = ESPECIES_ESPONTANEAS.filter(
    (e) => profundidade >= e.faixa[0] && profundidade <= e.faixa[1],
  )
  if (cabem.length > 0) return cabem
  // Fora de qualquer faixa (mais fundo que tudo): fica com as mais profundas.
  return ESPECIES_ESPONTANEAS.filter((e) => e.faixa[1] >= 4000)
}
