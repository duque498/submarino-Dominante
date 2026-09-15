import { ESPECIES } from '../mundo/bestiario'

/**
 * Formas geradas em código, sem imagem. Servem pra três casos:
 *
 *  - provisoriamente, no lugar das silhuetas que ainda não chegaram;
 *  - permanentemente, pro console: quando o operador digita "estrela" a forma
 *    é desenhada na hora e amostrada pela mesma rotina dos PNGs;
 *  - pros gatilhos semânticos, que precisam de uma forma pra cada palavra do
 *    dicionário e não podem depender de PNG que ainda não existe.
 *
 * As geométricas são desenhadas aqui. As orgânicas (baleia, tartaruga,
 * água-viva) NÃO são redesenhadas: elas vêm do bestiário das câmeras, em modo
 * silhueta. Desenhar uma baleia duas vezes, em dois arquivos, com dois níveis
 * de capricho, é como as duas versões acabam diferentes — e a plateia veria a
 * baleia boa na câmera e uma pior no orbe.
 */

const LADO = 256

function tela(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = LADO
  canvas.height = LADO
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  return [canvas, ctx]
}

function poligono(pontos: Array<[number, number]>): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  ctx.beginPath()
  pontos.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x * LADO, y * LADO)
    else ctx.lineTo(x * LADO, y * LADO)
  })
  ctx.closePath()
  ctx.fill()
  return canvas
}

/** Texto grande centralizado — base de `letra X` e `numero N`. */
function glifo(texto: string): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  const tamanho = texto.length > 1 ? (LADO * 0.8) / texto.length : LADO * 0.86
  ctx.font = `bold ${tamanho}px ui-monospace, "DejaVu Sans Mono", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(texto, LADO / 2, LADO / 2)
  return canvas
}

function circulo(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  ctx.beginPath()
  ctx.arc(LADO / 2, LADO / 2, LADO * 0.42, 0, Math.PI * 2)
  ctx.fill()
  return canvas
}

function quadrado(): HTMLCanvasElement {
  return poligono([
    [0.1, 0.1],
    [0.9, 0.1],
    [0.9, 0.9],
    [0.1, 0.9],
  ])
}

function triangulo(): HTMLCanvasElement {
  return poligono([
    [0.5, 0.08],
    [0.94, 0.9],
    [0.06, 0.9],
  ])
}

function estrela(): HTMLCanvasElement {
  const pontos: Array<[number, number]> = []
  const pontas = 5
  for (let i = 0; i < pontas * 2; i++) {
    const raio = i % 2 === 0 ? 0.44 : 0.18
    const angulo = (i * Math.PI) / pontas - Math.PI / 2
    pontos.push([0.5 + Math.cos(angulo) * raio, 0.5 + Math.sin(angulo) * raio])
  }
  return poligono(pontos)
}

function coracao(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  ctx.beginPath()
  // Curva paramétrica clássica do coração, normalizada pro canvas.
  for (let i = 0; i <= 240; i++) {
    const t = (i / 240) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    const px = LADO / 2 + (x / 17) * LADO * 0.44
    const py = LADO / 2 + (y / 17) * LADO * 0.44
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  return canvas
}

function onda(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  ctx.beginPath()
  const desenharCrista = (deslocamento: number) => {
    for (let i = 0; i <= 120; i++) {
      const x = (i / 120) * LADO
      const y =
        LADO / 2 +
        deslocamento +
        Math.sin((i / 120) * Math.PI * 3) * LADO * 0.16 +
        Math.sin((i / 120) * Math.PI * 7) * LADO * 0.04
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
  }
  desenharCrista(-LADO * 0.16)
  for (let i = 120; i >= 0; i--) {
    const x = (i / 120) * LADO
    const y =
      LADO / 2 +
      LADO * 0.16 +
      Math.sin((i / 120) * Math.PI * 3) * LADO * 0.16 +
      Math.sin((i / 120) * Math.PI * 7) * LADO * 0.04
    ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  return canvas
}

function gota(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  ctx.beginPath()
  ctx.moveTo(LADO / 2, LADO * 0.08)
  ctx.bezierCurveTo(LADO * 0.92, LADO * 0.5, LADO * 0.86, LADO * 0.92, LADO / 2, LADO * 0.92)
  ctx.bezierCurveTo(LADO * 0.14, LADO * 0.92, LADO * 0.08, LADO * 0.5, LADO / 2, LADO * 0.08)
  ctx.fill()
  return canvas
}

function anel(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  ctx.beginPath()
  ctx.arc(LADO / 2, LADO / 2, LADO * 0.44, 0, Math.PI * 2)
  // evenodd + círculo interno = furo no meio
  ctx.arc(LADO / 2, LADO / 2, LADO * 0.26, 0, Math.PI * 2)
  ctx.fill('evenodd')
  return canvas
}

function espiral(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  ctx.strokeStyle = '#000'
  ctx.lineWidth = LADO * 0.07
  ctx.lineCap = 'round'
  ctx.beginPath()
  const voltas = 3.2
  for (let i = 0; i <= 400; i++) {
    const t = i / 400
    const angulo = t * Math.PI * 2 * voltas
    const raio = t * LADO * 0.44
    const x = LADO / 2 + Math.cos(angulo) * raio
    const y = LADO / 2 + Math.sin(angulo) * raio
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  return canvas
}

function seta(): HTMLCanvasElement {
  return poligono([
    [0.5, 0.06],
    [0.92, 0.48],
    [0.66, 0.48],
    [0.66, 0.94],
    [0.34, 0.94],
    [0.34, 0.48],
    [0.08, 0.48],
  ])
}

/**
 * Concha: leque a partir da charneira, com a borda superior ondulada. Não tenta
 * ser uma vieira realista — em silhueta, o que identifica uma concha é o leque
 * com estrias na borda, e é isso que sobrevive a 15 metros.
 */
function concha(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  const cx = LADO / 2
  const charneira = LADO * 0.94
  const raio = LADO * 0.47

  ctx.beginPath()
  ctx.moveTo(cx, charneira)
  const passos = 220
  for (let i = 0; i <= passos; i++) {
    const t = i / passos
    // de ~189° a ~351°: o leque abre pra cima a partir da charneira.
    const angulo = Math.PI * (1.05 + t * 0.9)
    // 13 ondas na borda = as estrias da concha, sem virar serrilha.
    const r = raio * (1 + 0.05 * Math.cos(t * Math.PI * 13))
    ctx.lineTo(cx + Math.cos(angulo) * r, charneira + Math.sin(angulo) * r * 0.92)
  }
  ctx.closePath()
  ctx.fill()
  return canvas
}

/** Lado maior pras silhuetas orgânicas: tentáculo e nadadeira saem do corpo. */
const LADO_GRANDE = 512

/**
 * Pega uma espécie do bestiário e rasteriza a silhueta dela. O amostrador
 * normaliza pela caixa do desenho, então o que importa aqui é não deixar nada
 * sair do canvas.
 */
function doBestiario(chave: string): () => HTMLCanvasElement {
  return () => {
    const canvas = document.createElement('canvas')
    canvas.width = LADO_GRANDE
    canvas.height = LADO_GRANDE
    const ctx = canvas.getContext('2d')!
    const especie = ESPECIES.find((e) => e.chave === chave)
    if (!especie) return canvas
    const comp = LADO_GRANDE * 0.46
    ctx.translate(LADO_GRANDE / 2, LADO_GRANDE / 2)
    especie.desenhar({
      ctx,
      comp,
      alt: comp * especie.proporcao,
      // Tempo fixo: a forma do orbe é uma pose, não uma animação.
      t: 0.8,
      fase: 0.4,
      luz: 1,
      farol: 0,
      alpha: 1,
      silhueta: true,
    })
    return canvas
  }
}

/** Peixe genérico — "peixe", "peixes", "cardume". Corpo, dorsal e cauda. */
function peixe(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  const cx = LADO / 2
  const cy = LADO / 2
  const c = LADO * 0.4
  const a = c * 0.42
  // cauda em forquilha
  ctx.beginPath()
  ctx.moveTo(cx - c * 0.55, cy)
  ctx.lineTo(cx - c * 1.0, cy - a * 0.95)
  ctx.lineTo(cx - c * 0.82, cy)
  ctx.lineTo(cx - c * 1.0, cy + a * 0.95)
  ctx.closePath()
  ctx.fill()
  // corpo
  ctx.beginPath()
  ctx.moveTo(cx + c, cy)
  ctx.bezierCurveTo(cx + c * 0.4, cy - a, cx - c * 0.2, cy - a, cx - c * 0.6, cy)
  ctx.bezierCurveTo(cx - c * 0.2, cy + a, cx + c * 0.4, cy + a, cx + c, cy)
  ctx.closePath()
  ctx.fill()
  // dorsal e ventral
  ctx.beginPath()
  ctx.moveTo(cx + c * 0.1, cy - a * 0.8)
  ctx.lineTo(cx - c * 0.1, cy - a * 1.75)
  ctx.lineTo(cx - c * 0.4, cy - a * 0.72)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx + c * 0.2, cy + a * 0.72)
  ctx.lineTo(cx + c * 0.02, cy + a * 1.5)
  ctx.lineTo(cx - c * 0.16, cy + a * 0.68)
  ctx.closePath()
  ctx.fill()
  return canvas
}

/** Coral ramificado — "coral", "corais", "recife". */
function coral(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  ctx.strokeStyle = '#000'
  ctx.lineCap = 'round'
  const ramo = (x: number, y: number, angulo: number, comp: number, nivel: number) => {
    if (nivel === 0 || comp < LADO * 0.02) return
    const fx = x + Math.cos(angulo) * comp
    const fy = y + Math.sin(angulo) * comp
    ctx.lineWidth = Math.max(2, nivel * LADO * 0.014)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(fx, fy)
    ctx.stroke()
    ramo(fx, fy, angulo - 0.42, comp * 0.72, nivel - 1)
    ramo(fx, fy, angulo + 0.42, comp * 0.72, nivel - 1)
    if (nivel > 3) ramo(fx, fy, angulo + 0.05, comp * 0.66, nivel - 2)
  }
  // três troncos saindo da mesma base, pra ler como colônia e não como árvore
  ramo(LADO * 0.5, LADO * 0.95, -Math.PI / 2, LADO * 0.2, 5)
  ramo(LADO * 0.42, LADO * 0.95, -Math.PI / 2 - 0.4, LADO * 0.15, 4)
  ramo(LADO * 0.58, LADO * 0.95, -Math.PI / 2 + 0.4, LADO * 0.15, 4)
  return canvas
}

/** Mergulhador de perfil — "mergulhador", "mergulho", "mergulhar". */
function mergulhador(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  const u = LADO / 100
  // pé-de-pato
  ctx.beginPath()
  ctx.moveTo(22 * u, 54 * u)
  ctx.lineTo(6 * u, 44 * u)
  ctx.lineTo(4 * u, 58 * u)
  ctx.lineTo(20 * u, 62 * u)
  ctx.closePath()
  ctx.fill()
  // pernas e tronco, numa só massa
  ctx.beginPath()
  ctx.moveTo(20 * u, 50 * u)
  ctx.quadraticCurveTo(44 * u, 46 * u, 62 * u, 40 * u)
  ctx.quadraticCurveTo(74 * u, 36 * u, 78 * u, 30 * u)
  ctx.lineTo(70 * u, 22 * u)
  ctx.quadraticCurveTo(56 * u, 32 * u, 34 * u, 38 * u)
  ctx.quadraticCurveTo(24 * u, 42 * u, 18 * u, 44 * u)
  ctx.closePath()
  ctx.fill()
  // cilindro nas costas
  ctx.beginPath()
  ctx.ellipse(50 * u, 30 * u, 13 * u, 7 * u, -0.34, 0, Math.PI * 2)
  ctx.fill()
  // cabeça com máscara
  ctx.beginPath()
  ctx.arc(80 * u, 24 * u, 9 * u, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(86 * u, 20 * u)
  ctx.lineTo(95 * u, 22 * u)
  ctx.lineTo(94 * u, 30 * u)
  ctx.lineTo(85 * u, 29 * u)
  ctx.closePath()
  ctx.fill()
  // braço estendido à frente
  ctx.beginPath()
  ctx.moveTo(74 * u, 30 * u)
  ctx.quadraticCurveTo(84 * u, 42 * u, 96 * u, 44 * u)
  ctx.lineTo(96 * u, 50 * u)
  ctx.quadraticCurveTo(78 * u, 48 * u, 68 * u, 34 * u)
  ctx.closePath()
  ctx.fill()
  return canvas
}

/** Submarino de perfil — "submarino", "DOMI", "expedição", "tripulação". */
function submarino(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  const u = LADO / 100
  // casco
  ctx.beginPath()
  ctx.moveTo(90 * u, 50 * u)
  ctx.bezierCurveTo(86 * u, 36 * u, 40 * u, 34 * u, 16 * u, 42 * u)
  ctx.quadraticCurveTo(10 * u, 44 * u, 10 * u, 50 * u)
  ctx.quadraticCurveTo(10 * u, 56 * u, 16 * u, 58 * u)
  ctx.bezierCurveTo(40 * u, 66 * u, 86 * u, 64 * u, 90 * u, 50 * u)
  ctx.closePath()
  ctx.fill()
  // vela (torre de comando)
  ctx.beginPath()
  ctx.moveTo(56 * u, 38 * u)
  ctx.lineTo(54 * u, 22 * u)
  ctx.lineTo(42 * u, 22 * u)
  ctx.lineTo(38 * u, 39 * u)
  ctx.closePath()
  ctx.fill()
  // periscópio
  ctx.fillRect(48 * u, 12 * u, 3 * u, 11 * u)
  // leme de profundidade
  ctx.beginPath()
  ctx.moveTo(22 * u, 44 * u)
  ctx.lineTo(14 * u, 30 * u)
  ctx.lineTo(9 * u, 32 * u)
  ctx.lineTo(16 * u, 47 * u)
  ctx.closePath()
  ctx.fill()
  // hélice
  ctx.beginPath()
  ctx.moveTo(10 * u, 50 * u)
  ctx.lineTo(3 * u, 40 * u)
  ctx.lineTo(3 * u, 60 * u)
  ctx.closePath()
  ctx.fill()
  return canvas
}

/** Primitivas com nome fixo — valem no JSON e no console. */
export const PRIMITIVAS: Record<string, () => HTMLCanvasElement> = {
  circulo,
  quadrado,
  triangulo,
  estrela,
  coracao,
  onda,
  gota,
  anel,
  espiral,
  seta,
  concha,
  peixe,
  coral,
  mergulhador,
  submarino,
  // Do bestiário das câmeras, em silhueta: mesmo desenho que passa na câmera.
  baleia: doBestiario('cachalote'),
  tartaruga: doBestiario('tartaruga'),
  'agua-viva': doBestiario('agua-viva'),
  raia: doBestiario('raia'),
  tubarao: doBestiario('tubarao'),
  lula: doBestiario('lula-gigante'),
  'letra-d': () => glifo('D'),
}

/** Primitivas com argumento, só pelo console: "letra x", "numero 7". */
export function gerarGlifo(texto: string): HTMLCanvasElement {
  return glifo(texto.toUpperCase().slice(0, 3))
}
