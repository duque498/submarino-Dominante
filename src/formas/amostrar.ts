/**
 * Converte uma silhueta 2D numa nuvem de pontos que o orbe consegue assumir.
 *
 * A leitura a 15 metros é feita pelo CONTORNO, não pelo preenchimento. Por isso
 * a amostragem devolve duas coisas separadas:
 *
 *  - `pontos`: todos os alvos de partícula, cada um sabendo se é borda;
 *  - `contornos`: os índices dos pontos de borda NA ORDEM em que aparecem ao
 *    percorrer a silhueta. É essa ordem que deixa o orbe desenhar o contorno
 *    como polilinha fechada. Sem ela só sobra ligar por distância, que é o que
 *    fazia arestas atravessarem o meio da figura e virar borrão.
 *
 * Uma silhueta pode ter mais de um contorno (o furo do anel, a barriga do "D"),
 * então `contornos` é uma lista de listas.
 */

/** Um alvo de partícula, em coordenadas de modelo (-1 a 1, mesma escala da esfera). */
export type PontoForma = { x: number; y: number; borda: boolean }

export type FormaAmostrada = {
  pontos: PontoForma[]
  /** Cada item é um contorno fechado: índices em `pontos`, na ordem do traçado. */
  contornos: number[][]
}

/**
 * Lado do canvas de amostragem. 400 e não 200: a 200 o contorno de uma letra
 * fina já vinha com degraus do tamanho do espaçamento entre partículas, e a
 * polilinha herdava os degraus.
 */
const LADO_AMOSTRAGEM = 400
/** Fatia das partículas reservada pro contorno. Ele é a leitura; o resto é textura. */
const PROPORCAO_BORDA = 0.45
/** Acima disso a imagem é considerada "sem alpha" e o corte passa a ser por luminância. */
const LIMITE_OPACIDADE = 0.99
/** Contorno menor que isso é ruído de rasterização, não faz parte do desenho. */
const MIN_PIXELS_CONTORNO = 10

type Mascara = { cheio: Uint8Array; largura: number; altura: number }
type Pixel = { x: number; y: number }

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
    if (usarAlpha) {
      cheio[p] = data[i + 3] > 128 ? 1 : 0
    } else {
      const luz = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      cheio[p] = luz < 128 ? 1 : 0
    }
  }
  return { cheio, largura: width, altura: height }
}

/** Pixel cheio com pelo menos um vizinho vazio (ou fora da imagem) está na borda. */
function marcarBorda({ cheio, largura, altura }: Mascara): Uint8Array {
  const borda = new Uint8Array(cheio.length)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = y * largura + x
      if (!cheio[p]) continue
      // Vizinhança 4-conexa: diagonal não conta, senão o contorno engorda nas
      // escadinhas e a polilinha passa a ter espessura em vez de traço.
      if (
        x === 0 || y === 0 || x === largura - 1 || y === altura - 1 ||
        !cheio[p - 1] || !cheio[p + 1] || !cheio[p - largura] || !cheio[p + largura]
      ) {
        borda[p] = 1
      }
    }
  }
  return borda
}

// Vizinhos na ordem 4-conexa primeiro, diagonal depois: andar reto quando dá
// evita que o traçado corte quina e pule pro outro lado da figura.
const PASSOS: Array<[number, number]> = [
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]

/**
 * Percorre a borda pixel a pixel e devolve cada contorno como uma sequência.
 *
 * Caminhada gulosa: a partir de um pixel de borda ainda não visitado, anda pro
 * vizinho de borda mais "reto" disponível até não haver mais para onde ir. Como
 * a borda 4-conexa de uma região cheia é uma curva fina, isso reconstrói o
 * traçado na ordem certa — inclusive em figura côncava, onde ordenar por ângulo
 * em torno do centroide erraria feio (a estrela é o caso clássico).
 */
function tracarContornos(borda: Uint8Array, largura: number, altura: number): Pixel[][] {
  const visitado = new Uint8Array(borda.length)
  const contornos: Pixel[][] = []

  for (let inicio = 0; inicio < borda.length; inicio++) {
    if (!borda[inicio] || visitado[inicio]) continue

    const caminho: Pixel[] = []
    let atual = inicio
    let dirAnterior = 0
    visitado[atual] = 1
    caminho.push({ x: atual % largura, y: Math.floor(atual / largura) })

    for (;;) {
      const x = atual % largura
      const y = Math.floor(atual / largura)
      let proximo = -1
      let melhorGiro = Infinity

      for (let d = 0; d < PASSOS.length; d++) {
        const vx = x + PASSOS[d][0]
        const vy = y + PASSOS[d][1]
        if (vx < 0 || vy < 0 || vx >= largura || vy >= altura) continue
        const v = vy * largura + vx
        if (!borda[v] || visitado[v]) continue
        // Quanto menos o passo desvia do anterior, melhor: mantém o traço fluido.
        const giro = Math.abs(((d - dirAnterior + 12) % 8) - 4)
        const peso = giro + (d < 4 ? 0 : 0.5)
        if (peso < melhorGiro) {
          melhorGiro = peso
          proximo = d
        }
      }

      if (proximo < 0) break
      const vx = x + PASSOS[proximo][0]
      const vy = y + PASSOS[proximo][1]
      atual = vy * largura + vx
      dirAnterior = proximo
      visitado[atual] = 1
      caminho.push({ x: vx, y: vy })
    }

    if (caminho.length >= MIN_PIXELS_CONTORNO) contornos.push(caminho)
  }

  return contornos
}

/**
 * Poisson-disk (Bridson) dentro da máscara. Grade com jitter deixa rastro de
 * alinhamento que o olho lê como grade, e grade é justamente o que faz o
 * interior competir com o contorno pela atenção.
 */
function amostrarPoisson(
  mascara: Mascara,
  quantidade: number,
  caixa: { minX: number; maxX: number; minY: number; maxY: number },
  areaCheia: number,
): Pixel[] {
  if (quantidade <= 0 || areaCheia <= 0) return []

  const larguraCaixa = caixa.maxX - caixa.minX + 1
  const alturaCaixa = caixa.maxY - caixa.minY + 1
  // Mira em ~30% a mais de pontos do que o necessário e depois desbasta em
  // passo constante: é mais barato que acertar o raio na primeira tentativa.
  const raio = Math.max(1.4, Math.sqrt(areaCheia / (quantidade * 1.3)))
  const celula = raio / Math.SQRT2
  const colunas = Math.ceil(larguraCaixa / celula)
  const linhas = Math.ceil(alturaCaixa / celula)
  const grade = new Int32Array(colunas * linhas).fill(-1)

  const amostras: Pixel[] = []
  const ativos: number[] = []
  const dentro = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < mascara.largura && y < mascara.altura &&
    mascara.cheio[Math.floor(y) * mascara.largura + Math.floor(x)] === 1

  const registrar = (p: Pixel): number => {
    const indice = amostras.length
    amostras.push(p)
    const cx = Math.floor((p.x - caixa.minX) / celula)
    const cy = Math.floor((p.y - caixa.minY) / celula)
    grade[cy * colunas + cx] = indice
    ativos.push(indice)
    return indice
  }

  const cabe = (x: number, y: number): boolean => {
    const cx = Math.floor((x - caixa.minX) / celula)
    const cy = Math.floor((y - caixa.minY) / celula)
    if (cx < 0 || cy < 0 || cx >= colunas || cy >= linhas) return false
    for (let j = Math.max(0, cy - 2); j <= Math.min(linhas - 1, cy + 2); j++) {
      for (let i = Math.max(0, cx - 2); i <= Math.min(colunas - 1, cx + 2); i++) {
        const vizinho = grade[j * colunas + i]
        if (vizinho < 0) continue
        const dx = amostras[vizinho].x - x
        const dy = amostras[vizinho].y - y
        if (dx * dx + dy * dy < raio * raio) return false
      }
    }
    return true
  }

  // Semente: varre até achar um pixel cheio, em vez de sortear até dar sorte
  // (silhueta fina pode ter área minúscula perto da caixa).
  for (let y = caixa.minY; y <= caixa.maxY && amostras.length === 0; y++) {
    for (let x = caixa.minX; x <= caixa.maxX; x++) {
      if (mascara.cheio[y * mascara.largura + x]) {
        registrar({ x, y })
        break
      }
    }
  }
  if (amostras.length === 0) return []

  const TENTATIVAS = 12
  while (ativos.length > 0) {
    const posicao = Math.floor(Math.random() * ativos.length)
    const base = amostras[ativos[posicao]]
    let nasceu = false
    for (let k = 0; k < TENTATIVAS; k++) {
      const angulo = Math.random() * Math.PI * 2
      const dist = raio * (1 + Math.random())
      const x = base.x + Math.cos(angulo) * dist
      const y = base.y + Math.sin(angulo) * dist
      if (!dentro(x, y) || !cabe(x, y)) continue
      registrar({ x, y })
      nasceu = true
      break
    }
    if (!nasceu) ativos.splice(posicao, 1)
  }

  if (amostras.length <= quantidade) return amostras
  const salto = amostras.length / quantidade
  const filtrados: Pixel[] = []
  for (let i = 0; filtrados.length < quantidade; i += salto) {
    filtrados.push(amostras[Math.floor(i)])
  }
  return filtrados
}

/** Reamostra um caminho mantendo a ordem: pega um pixel a cada `passo`. */
function reamostrarCaminho(caminho: Pixel[], quantidade: number): Pixel[] {
  if (quantidade <= 0) return []
  if (caminho.length <= quantidade) return caminho
  const passo = caminho.length / quantidade
  const saida: Pixel[] = []
  for (let i = 0; saida.length < quantidade; i += passo) {
    saida.push(caminho[Math.min(caminho.length - 1, Math.floor(i))])
  }
  return saida
}

/**
 * Amostra uma silhueta já rasterizada. `quantidade` é o número de partículas do
 * orbe — cada ponto devolvido vira o alvo de uma delas.
 */
export function amostrarImageData(imagem: ImageData, quantidade: number): FormaAmostrada {
  const mascara = construirMascara(imagem)
  const { cheio, largura, altura } = mascara
  const borda = marcarBorda(mascara)

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let areaCheia = 0
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (!cheio[y * largura + x]) continue
      areaCheia++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (areaCheia === 0) return { pontos: [], contornos: [] }

  // 1) contornos, na ordem do traçado
  const caminhos = tracarContornos(borda, largura, altura)
  const pixelsDeBorda = caminhos.reduce((soma, c) => soma + c.length, 0)
  const alvoBorda = Math.min(quantidade, Math.round(quantidade * PROPORCAO_BORDA))

  const pontos: PontoForma[] = []
  const contornos: number[][] = []
  const brutos: Pixel[] = []

  if (pixelsDeBorda > 0) {
    let restante = alvoBorda
    caminhos.forEach((caminho, i) => {
      // Reparte proporcional ao comprimento; o último contorno leva o resto,
      // pra não sobrar nem faltar ponto por arredondamento.
      const fatia =
        i === caminhos.length - 1
          ? restante
          : Math.min(restante, Math.round((caminho.length / pixelsDeBorda) * alvoBorda))
      restante -= fatia
      if (fatia < 2) return
      const indices: number[] = []
      for (const pixel of reamostrarCaminho(caminho, fatia)) {
        indices.push(brutos.length)
        brutos.push(pixel)
      }
      contornos.push(indices)
    })
  }

  const naBorda = brutos.length

  // 2) interior em Poisson-disk, com o que sobrou de partícula
  const interior = amostrarPoisson(
    mascara,
    quantidade - naBorda,
    { minX, maxX, minY, maxY },
    areaCheia,
  )
  brutos.push(...interior)

  // 3) faltou ponto (silhueta fininha, sem interior): completa repetindo a
  //    borda, que é onde a leitura está. Nunca devolve menos que `quantidade`,
  //    senão sobra partícula sem alvo e ela fica parada no meio da tela.
  while (brutos.length < quantidade && naBorda > 0) {
    brutos.push(brutos[brutos.length % naBorda])
  }
  while (brutos.length < quantidade) {
    brutos.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 })
  }

  // 4) normaliza pro mesmo raio visual da esfera: maior dimensão vira 2 unidades
  const centroX = (minX + maxX) / 2
  const centroY = (minY + maxY) / 2
  const escala = 2 / Math.max(maxX - minX, maxY - minY, 1)

  for (let i = 0; i < brutos.length; i++) {
    pontos.push({
      x: (brutos[i].x - centroX) * escala,
      y: (brutos[i].y - centroY) * escala,
      borda: i < naBorda,
    })
  }

  return { pontos, contornos }
}

/** Amostra um canvas já desenhado (usado pelas formas geradas em código). */
export function amostrarCanvas(canvas: HTMLCanvasElement, quantidade: number): FormaAmostrada {
  return amostrarImageData(rasterizar(canvas, canvas.width, canvas.height), quantidade)
}

/**
 * Amostra um PNG. A `src` precisa ser data URI: imagem carregada por caminho de
 * arquivo via file:// contamina o canvas e o getImageData lança SecurityError.
 */
export function amostrarImagem(src: string, quantidade: number): Promise<FormaAmostrada> {
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
