/**
 * Converte uma silhueta 2D numa nuvem de pontos que o orbe consegue assumir.
 *
 * A ideia: ler os pixels "cheios" da imagem e escolher N deles — N sendo o
 * número de partículas do orbe — distribuídos de forma uniforme, com uma fatia
 * reservada pro contorno. Sem reforçar o contorno, a silhueta vira um borrão
 * a 15 metros de distância.
 */

/** Um alvo de partícula, em coordenadas de modelo (-1 a 1, mesma escala da esfera). */
export type PontoForma = { x: number; y: number; borda: boolean }

/** Lado do canvas de amostragem. 200px dá resolução de sobra pra ~760 pontos. */
const LADO_AMOSTRAGEM = 200
/** Fatia das partículas reservada pro contorno. */
const PROPORCAO_BORDA = 0.3
/** Acima disso a imagem é considerada "sem alpha" e o corte passa a ser por luminância. */
const LIMITE_OPACIDADE = 0.99

type Mascara = { cheio: Uint8Array; largura: number; altura: number }

/** Desenha a imagem num canvas offscreen cabendo em LADO_AMOSTRAGEM, sem distorcer. */
function rasterizar(fonte: CanvasImageSource, largura: number, altura: number): ImageData {
  const escala = LADO_AMOSTRAGEM / Math.max(largura, altura)
  const w = Math.max(1, Math.round(largura * escala))
  const h = Math.max(1, Math.round(altura * escala))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(fonte, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/**
 * Decide o que é "cheio". A silhueta pode vir preta sobre transparente ou preta
 * sobre branco; se quase não houver pixel transparente, o corte passa a ser por
 * luminância.
 */
function construirMascara(imagem: ImageData): Mascara {
  const { data, width, height } = imagem
  const total = width * height

  let transparentes = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) transparentes++
  }
  const usarAlpha = transparentes / total > 1 - LIMITE_OPACIDADE

  const cheio = new Uint8Array(total)
  for (let p = 0; p < total; p++) {
    const i = p * 4
    const alpha = data[i + 3]
    if (usarAlpha) {
      cheio[p] = alpha > 128 ? 1 : 0
    } else {
      const luz = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      cheio[p] = luz < 128 ? 1 : 0
    }
  }
  return { cheio, largura: width, altura: height }
}

/** Pixel cheio com pelo menos um vizinho vazio (ou fora da imagem) está na borda. */
function ehBorda(mascara: Mascara, x: number, y: number): boolean {
  const { cheio, largura, altura } = mascara
  const vizinhos: Array<[number, number]> = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ]
  for (const [vx, vy] of vizinhos) {
    if (vx < 0 || vy < 0 || vx >= largura || vy >= altura) return true
    if (!cheio[vy * largura + vx]) return true
  }
  return false
}

type Pixel = { x: number; y: number }

/**
 * Amostragem estratificada: divide a área numa grade com aproximadamente uma
 * célula por ponto desejado e tira um pixel de cada célula ocupada. Aleatório
 * puro faria grumos e buracos.
 */
function amostrarInterior(pixels: Pixel[], quantidade: number, lado: number): Pixel[] {
  if (quantidade <= 0 || pixels.length === 0) return []

  const celulas = new Map<number, Pixel[]>()
  // Grade com ~quantidade células cobrindo a imagem inteira.
  const passo = Math.max(1, Math.floor(lado / Math.sqrt(quantidade)))
  for (const pixel of pixels) {
    const chave = Math.floor(pixel.y / passo) * lado + Math.floor(pixel.x / passo)
    const balde = celulas.get(chave)
    if (balde) balde.push(pixel)
    else celulas.set(chave, [pixel])
  }

  const escolhidos: Pixel[] = []
  for (const balde of celulas.values()) {
    escolhidos.push(balde[Math.floor(Math.random() * balde.length)])
  }

  // Sobrou célula demais: descarta em passo constante, mantendo a distribuição.
  if (escolhidos.length > quantidade) {
    const salto = escolhidos.length / quantidade
    const filtrados: Pixel[] = []
    for (let i = 0; filtrados.length < quantidade; i += salto) {
      filtrados.push(escolhidos[Math.floor(i)])
    }
    return filtrados
  }

  // Faltou: repete pixels quaisquer (o jitter entra na normalização).
  while (escolhidos.length < quantidade) {
    escolhidos.push(pixels[Math.floor(Math.random() * pixels.length)])
  }
  return escolhidos
}

/** Contorno distribuído por ângulo, pra cobrir a silhueta inteira e não um lado só. */
function amostrarBorda(pixels: Pixel[], quantidade: number): Pixel[] {
  if (quantidade <= 0 || pixels.length === 0) return []

  const cx = pixels.reduce((soma, p) => soma + p.x, 0) / pixels.length
  const cy = pixels.reduce((soma, p) => soma + p.y, 0) / pixels.length
  const ordenados = [...pixels].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  )

  const escolhidos: Pixel[] = []
  const salto = ordenados.length / quantidade
  for (let i = 0; escolhidos.length < quantidade; i += salto) {
    escolhidos.push(ordenados[Math.floor(i) % ordenados.length])
  }
  return escolhidos
}

/**
 * Amostra uma silhueta já rasterizada. `quantidade` é o número de partículas do
 * orbe — cada ponto devolvido vira o alvo de uma delas.
 */
export function amostrarImageData(imagem: ImageData, quantidade: number): PontoForma[] {
  const mascara = construirMascara(imagem)
  const { cheio, largura, altura } = mascara

  const interior: Pixel[] = []
  const borda: Pixel[] = []
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (!cheio[y * largura + x]) continue
      if (ehBorda(mascara, x, y)) borda.push({ x, y })
      else interior.push({ x, y })
    }
  }

  if (borda.length === 0 && interior.length === 0) return []

  const alvoBorda = Math.round(quantidade * PROPORCAO_BORDA)
  const pontosBorda = amostrarBorda(borda, Math.min(alvoBorda, quantidade))
  const pontosInterior = amostrarInterior(
    interior.length > 0 ? interior : borda,
    quantidade - pontosBorda.length,
    Math.max(largura, altura),
  )

  const brutos = [
    ...pontosBorda.map((p) => ({ ...p, borda: true })),
    ...pontosInterior.map((p) => ({ ...p, borda: false })),
  ]

  // Normaliza pro mesmo raio visual da esfera: maior dimensão vira 2 unidades.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of brutos) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const centroX = (minX + maxX) / 2
  const centroY = (minY + maxY) / 2
  const escala = 2 / Math.max(maxX - minX, maxY - minY, 1)

  return brutos.map((p) => ({
    // Jitter de meio pixel: desfaz a aparência de grade dos pontos repetidos.
    x: (p.x + Math.random() - 0.5 - centroX) * escala,
    y: (p.y + Math.random() - 0.5 - centroY) * escala,
    borda: p.borda,
  }))
}

/** Amostra um canvas já desenhado (usado pelas formas geradas em código). */
export function amostrarCanvas(canvas: HTMLCanvasElement, quantidade: number): PontoForma[] {
  return amostrarImageData(rasterizar(canvas, canvas.width, canvas.height), quantidade)
}

/**
 * Amostra um PNG. A `src` precisa ser data URI: imagem carregada por caminho de
 * arquivo via file:// contamina o canvas e o getImageData lança SecurityError.
 */
export function amostrarImagem(src: string, quantidade: number): Promise<PontoForma[]> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        resolve(amostrarImageData(rasterizar(img, img.width, img.height), quantidade))
      } catch (erro) {
        reject(erro)
      }
    }
    img.onerror = () => reject(new Error(`não foi possível carregar a imagem: ${src.slice(0, 60)}`))
    img.src = src
  })
}
