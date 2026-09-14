/**
 * Formas provisórias desenhadas em código, só pra exercitar o morph enquanto os
 * PNGs de verdade não chegam. São figuras geométricas de propósito: uma baleia
 * feita com paths ficaria pior do que não ter baleia nenhuma.
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

function circulo(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  ctx.beginPath()
  ctx.arc(LADO / 2, LADO / 2, LADO * 0.42, 0, Math.PI * 2)
  ctx.fill()
  return canvas
}

function triangulo(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  ctx.beginPath()
  ctx.moveTo(LADO / 2, LADO * 0.08)
  ctx.lineTo(LADO * 0.94, LADO * 0.9)
  ctx.lineTo(LADO * 0.06, LADO * 0.9)
  ctx.closePath()
  ctx.fill()
  return canvas
}

function letraD(): HTMLCanvasElement {
  const [canvas, ctx] = tela()
  ctx.font = `bold ${LADO * 0.86}px ui-monospace, "DejaVu Sans Mono", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('D', LADO / 2, LADO / 2)
  return canvas
}

/** Formas geradas em código, disponíveis pro JSON como qualquer outra. */
export const FORMAS_GERADAS: Record<string, () => HTMLCanvasElement> = {
  circulo,
  triangulo,
  'letra-d': letraD,
}
