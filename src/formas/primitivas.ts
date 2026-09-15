/**
 * Formas geradas em código, sem imagem. Servem pra dois casos:
 *
 *  - provisoriamente, no lugar das silhuetas que ainda não chegaram;
 *  - permanentemente, pro console: quando o operador digita "estrela" a forma
 *    é desenhada na hora e amostrada pela mesma rotina dos PNGs.
 *
 * Nada aqui tenta desenhar uma baleia: figura orgânica feita com paths fica
 * pior do que não ter figura nenhuma. São primitivas geométricas.
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
  'letra-d': () => glifo('D'),
}

/** Primitivas com argumento, só pelo console: "letra x", "numero 7". */
export function gerarGlifo(texto: string): HTMLCanvasElement {
  return glifo(texto.toUpperCase().slice(0, 3))
}
