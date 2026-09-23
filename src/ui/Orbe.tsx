import { useEffect, useRef } from 'react'
import { FORMA_PADRAO, obterForma } from '../formas'

export type EstadoOrbe = 'ocioso' | 'falando' | 'processando' | 'pane'

type Props = {
  estado: EstadoOrbe
  /**
   * Lê o nível de áudio (0–1) agora. É uma função, não um número, de propósito:
   * o orbe consulta dentro do próprio requestAnimationFrame, então o nível
   * muda a 60 fps sem provocar um render do React por quadro.
   */
  lerNivel?: () => number
  /** Nome registrado em src/formas, ou "esfera". Mudou, morfa. */
  forma?: string
  /** Ajuste fino do tamanho no projetor (teclas [ e ]). */
  escala?: number
  /** Sacode o orbe por alguns quadros — erro ou comando não reconhecido. */
  tremor?: boolean
  /** Pulso curto de aprovação — acerto numa dinâmica. */
  pulso?: boolean
  /** Só pro modo "canto" da cena de apresentação. */
  compacto?: boolean
  /**
   * Modo reduzido do 2B: o orbe fica mais lento e mais escuro.
   *
   * É a única coisa que conta a avaria enquanto a IA está calada e os alunos
   * falam. Não é um estado novo (`pane` já existe e é agitado demais pra
   * durar três cenas): é o mesmo ocioso, com menos energia.
   */
  avariado?: boolean
}

const QTD_PONTOS = 760
const VIZINHOS_POR_PONTO = 3
const QTD_PARTICULAS = 40
/** Distância da câmera, em raios da esfera. Controla a perspectiva. */
const DISTANCIA_CAMERA = 3.2
/** Depois disso o orbe em pane congela, como um sistema que travou. */
const MS_ATE_CONGELAR = 4200
/**
 * Duração fixa do morph, com easing: diferente do amortecimento exponencial,
 * ela diz o instante exato em que a forma assenta — que é quando a vizinhança
 * precisa ser recalculada, uma vez só.
 */
const MS_MORPH = 1400
/** Até aqui as partículas se espalham um pouco antes de assentar. */
const FRACAO_SOPRO = 0.4
/**
 * Modo forma: a partir daqui o morph já acabou. O easing é remapeado pra
 * chegar em 1 neste ponto, então os últimos 15% são a silhueta encaixada
 * exatamente no alvo, parada. É nesse instante que o contorno aparece.
 */
const FRACAO_ENCAIXE = 0.85
/** Respiração da silhueta: um quarto da ondulação da esfera. */
const FATOR_RESPIRACAO = 0.25

type Ponto = { x: number; y: number; z: number; fase: number }
type Aresta = [number, number]
type Particula = {
  raio: number
  angulo: number
  velocidade: number
  inclinacao: number
  brilho: number
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/** Distribuição uniforme numa esfera (espiral de Fibonacci). */
function gerarPontos(quantidade: number): Ponto[] {
  const pontos: Ponto[] = []
  const anguloOuro = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < quantidade; i++) {
    const y = 1 - (i / (quantidade - 1)) * 2
    const raio = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = anguloOuro * i
    pontos.push({
      x: Math.cos(theta) * raio,
      y,
      z: Math.sin(theta) * raio,
      // Fase própria: sem ela todos os pontos ondulariam em uníssono.
      fase: (i % 17) * 0.37,
    })
  }
  return pontos
}

/**
 * Vizinhança fixa de uma nuvem de pontos. São ~290k comparações pra 760 pontos —
 * uns poucos ms, contra fazer isso a cada quadro, que seria inviável. Roda no
 * mount (esfera) e uma vez por forma, no instante em que ela assenta.
 */
function gerarArestas(xs: Float32Array, ys: Float32Array, zs: Float32Array): Aresta[] {
  const total = xs.length
  const arestas: Aresta[] = []
  const vistas = new Set<number>()
  const candidatos: Array<{ indice: number; dist: number }> = []

  for (let i = 0; i < total; i++) {
    candidatos.length = 0
    for (let j = 0; j < total; j++) {
      if (i === j) continue
      const dx = xs[i] - xs[j]
      const dy = ys[i] - ys[j]
      const dz = zs[i] - zs[j]
      candidatos.push({ indice: j, dist: dx * dx + dy * dy + dz * dz })
    }
    candidatos.sort((um, outro) => um.dist - outro.dist)
    for (let k = 0; k < VIZINHOS_POR_PONTO && k < candidatos.length; k++) {
      const j = candidatos[k].indice
      const chave = i < j ? i * total + j : j * total + i
      if (vistas.has(chave)) continue
      vistas.add(chave)
      arestas.push([i, j])
    }
  }
  return arestas
}

function gerarParticulas(): Particula[] {
  return Array.from({ length: QTD_PARTICULAS }, () => ({
    raio: 1.12 + Math.random() * 0.38,
    angulo: Math.random() * Math.PI * 2,
    velocidade: (0.15 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1),
    inclinacao: (Math.random() - 0.5) * 1.6,
    brilho: 0.3 + Math.random() * 0.7,
  }))
}

/** Soma de senos em vez de lib de ruído: barato e suficientemente orgânico. */
function ondulacao(ponto: Ponto, t: number): number {
  return (
    (Math.sin(ponto.x * 3.1 + t * 1.15 + ponto.fase) +
      Math.sin(ponto.y * 2.4 - t * 0.93) +
      Math.sin(ponto.z * 3.7 + t * 1.41 + ponto.fase * 0.5)) /
    3
  )
}

type Paleta = { linha: string; ponto: string; particula: string }

const PALETAS: Record<EstadoOrbe, Paleta> = {
  ocioso: { linha: '27, 106, 120', ponto: '56, 232, 255', particula: '77, 255, 166' },
  falando: { linha: '56, 232, 255', ponto: '77, 255, 166', particula: '77, 255, 166' },
  processando: { linha: '56, 232, 255', ponto: '56, 232, 255', particula: '255, 194, 77' },
  pane: { linha: '255, 77, 94', ponto: '255, 194, 77', particula: '255, 77, 94' },
}

/**
 * A IA avariada, no modo reduzido do 2B.
 *
 * Vermelha e não ciano, do momento em que ela quebra até a plateia devolver a
 * comunicação no hidrofone. O orbe É a IA na tela — deixá-la da mesma cor de
 * sempre, só um pouco mais escura, contava a avaria só pra quem estivesse
 * olhando as luzinhas do canto.
 *
 * Mais contida que a paleta de `pane`: lá o âmbar entra junto e a coisa toda
 * pisca, o que é certo num alarme de dez segundos e insuportável num estado
 * que fica no ar durante duas apresentações inteiras. Aqui é só vermelho, e a
 * agitação vem da lentidão, não do tremor.
 */
const PALETA_AVARIADA: Paleta = {
  linha: '186, 58, 72',
  ponto: '255, 104, 118',
  particula: '255, 138, 104',
}

export function Orbe({
  estado,
  lerNivel,
  forma = FORMA_PADRAO,
  escala = 1,
  tremor = false,
  pulso = false,
  compacto = false,
  avariado = false,
}: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  // Tudo em refs: o loop de animação monta uma vez e vive a sessão inteira.
  // Se as props entrassem nas dependências do efeito, trocar de cena
  // reiniciaria a animação do zero.
  const refEstado = useRef(estado)
  const refNivel = useRef(lerNivel)
  const refAvariado = useRef(avariado)
  const refCompacto = useRef(compacto)
  const refEscala = useRef(escala)
  const refForma = useRef(forma)
  refEstado.current = estado
  refNivel.current = lerNivel
  refAvariado.current = avariado
  refCompacto.current = compacto
  refEscala.current = escala
  refForma.current = forma

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const esfera = gerarPontos(QTD_PONTOS)
    const particulas = gerarParticulas()
    const total = esfera.length

    // Reaproveitados a cada quadro: alocar 760 objetos por frame geraria lixo.
    const posX = new Float32Array(total)
    const posY = new Float32Array(total)
    const posZ = new Float32Array(total)
    const origX = new Float32Array(total)
    const origY = new Float32Array(total)
    const origZ = new Float32Array(total)
    const alvoX = new Float32Array(total)
    const alvoY = new Float32Array(total)
    const alvoZ = new Float32Array(total)
    // Alvos da forma de destino, já casados partícula a partícula.
    const formaX = new Float32Array(total)
    const formaY = new Float32Array(total)
    const formaZ = new Float32Array(total)
    const projX = new Float32Array(total)
    const projY = new Float32Array(total)
    const projA = new Float32Array(total)
    /** Profundidade falsa em modo forma: só pra variar o alpha e dar volume. */
    const zFalso = new Float32Array(total)
    /** 1 quando a partícula está no contorno da forma atual. */
    const bordaParticula = new Uint8Array(total)
    /** Índices de partícula na ordem do contorno, um array por contorno fechado. */
    let contornoParticulas: number[][] = []
    /** Direção fixa do sopro de cada partícula durante o morph. */
    const soproX = new Float32Array(total)
    const soproY = new Float32Array(total)
    const soproZ = new Float32Array(total)

    for (let i = 0; i < total; i++) {
      posX[i] = esfera[i].x
      posY[i] = esfera[i].y
      posZ[i] = esfera[i].z
      zFalso[i] = (Math.random() - 0.5) * 0.5
      const a = Math.random() * Math.PI * 2
      const b = Math.random() * Math.PI
      soproX[i] = Math.cos(a) * Math.sin(b)
      soproY[i] = Math.sin(a) * Math.sin(b)
      soproZ[i] = Math.cos(b)
    }

    // Só a esfera tem arestas por vizinhança. A silhueta é desenhada pelo
    // contorno traçado na amostragem, que é ordenado — ligar por distância era
    // o que produzia arestas atravessando o meio da figura.
    const arestasEsfera = gerarArestas(
      Float32Array.from(esfera, (p) => p.x),
      Float32Array.from(esfera, (p) => p.y),
      Float32Array.from(esfera, (p) => p.z),
    )

    /**
     * Casa partículas com alvos por ângulo em torno do centroide de cada nuvem.
     * O(N log N) e o morph "gira pra fora" em vez de cruzar caoticamente;
     * casamento ótimo custaria muito mais e a diferença não apareceria.
     */
    const casarComForma = (nome: string): boolean => {
      const forma = obterForma(nome)
      const pontos = forma?.pontos
      if (!forma || !pontos || pontos.length === 0) return false

      let pcx = 0
      let pcy = 0
      for (let i = 0; i < total; i++) {
        pcx += posX[i]
        pcy += posY[i]
      }
      pcx /= total
      pcy /= total

      const ordemParticulas = Array.from({ length: total }, (_, i) => i).sort(
        (a, b) =>
          Math.atan2(posY[a] - pcy, posX[a] - pcx) - Math.atan2(posY[b] - pcy, posX[b] - pcx),
      )

      // Centroide dos alvos: serve SÓ pra ordenar por ângulo (o casamento
      // partícula->alvo). NÃO entra na posição final: a amostragem já centra
      // pela caixa da silhueta, e subtrair o centroide por cima disso desloca
      // a figura pro lado onde ela tem mais massa. Na baleia, o corpo gordo
      // puxava o centroide ~0,12 unidade pra direita e o focinho era cortado
      // pela borda do canvas do orbe.
      let acx = 0
      let acy = 0
      for (const p of pontos) {
        acx += p.x
        acy += p.y
      }
      acx /= pontos.length
      acy /= pontos.length

      const ordemAlvos = Array.from({ length: pontos.length }, (_, i) => i).sort(
        (a, b) =>
          Math.atan2(pontos[a].y - acy, pontos[a].x - acx) -
          Math.atan2(pontos[b].y - acy, pontos[b].x - acx),
      )

      // Onde cada ponto de borda mora dentro dos contornos, pra reconstruir a
      // ordem do traçado depois do casamento.
      const enderecoNoContorno = new Map<number, [number, number]>()
      forma.contornos.forEach((contorno, c) => {
        contorno.forEach((indicePonto, posicao) => {
          enderecoNoContorno.set(indicePonto, [c, posicao])
        })
      })
      contornoParticulas = forma.contornos.map((contorno) => new Array<number>(contorno.length).fill(-1))

      for (let k = 0; k < total; k++) {
        const indiceAlvo = ordemAlvos[k % ordemAlvos.length]
        const alvo = pontos[indiceAlvo]
        const i = ordemParticulas[k]
        formaX[i] = alvo.x
        formaY[i] = alvo.y
        // Partícula de contorno fica no plano z=0. Com profundidade falsa cada
        // vizinha ganharia uma escala de perspectiva diferente e a polilinha
        // sairia serrilhada — justamente o que estamos tentando eliminar.
        formaZ[i] = alvo.borda ? 0 : zFalso[i] * 0.6
        bordaParticula[i] = alvo.borda ? 1 : 0
        const endereco = enderecoNoContorno.get(indiceAlvo)
        if (endereco) contornoParticulas[endereco[0]][endereco[1]] = i
      }
      // Posição sem partícula não deve existir (o casamento é bijetivo), mas se
      // existir é melhor encurtar o contorno que desenhar uma reta pro índice 0.
      contornoParticulas = contornoParticulas
        .map((c) => c.filter((i) => i >= 0))
        .filter((c) => c.length >= 2)
      return true
    }

    let destino = FORMA_PADRAO
    let morfando = false
    let inicioMorph = 0

    const iniciarMorph = (nome: string) => {
      if (nome !== FORMA_PADRAO && !casarComForma(nome)) {
        // Forma não registrada ou que falhou ao carregar: volta pra esfera.
        nome = FORMA_PADRAO
        if (destino === FORMA_PADRAO) return
      }
      origX.set(posX)
      origY.set(posY)
      origZ.set(posZ)
      destino = nome
      morfando = true
      inicioMorph = performance.now()
    }

    let largura = 0
    let altura = 0
    // devicePixelRatio fixo em 1: o Chromebook da escola é fraco e o orbe é uma
    // mancha luminosa — a serrilha some debaixo das scanlines.
    const redimensionar = () => {
      const caixa = canvas.getBoundingClientRect()
      largura = Math.max(1, Math.round(caixa.width))
      altura = Math.max(1, Math.round(caixa.height))
      canvas.width = largura
      canvas.height = altura
    }
    redimensionar()
    const observador = new ResizeObserver(redimensionar)
    observador.observe(canvas)

    let quadro = 0
    let t = 0
    let rotacao = 0
    let anterior = performance.now()
    let nivelSuave = 0
    let paneDesde = 0
    let congelado = false
    // Qualidade adaptativa: se a máquina não der conta, metade das arestas cai.
    let mediaQuadro = 16
    let pularArestas = false

    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(desenhar)
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora

      mediaQuadro = mediaQuadro * 0.95 + dt * 1000 * 0.05
      if (!pularArestas && mediaQuadro > 22) pularArestas = true
      else if (pularArestas && mediaQuadro < 14) pularArestas = false

      if (refForma.current !== destino) iniciarMorph(refForma.current)

      const estadoAtual = refEstado.current

      if (estadoAtual === 'pane') {
        if (!paneDesde) paneDesde = agora
        if (agora - paneDesde > MS_ATE_CONGELAR) congelado = true
      } else {
        paneDesde = 0
        congelado = false
      }
      if (congelado) return

      const nivelBruto = estadoAtual === 'falando' ? (refNivel.current?.() ?? 0) : 0
      nivelSuave += (nivelBruto - nivelSuave) * 0.2

      // Cada estado é um conjunto de números: velocidade, amplitude e brilho.
      let velocidade = 0.18
      let amplitude = 0.05
      let brilho = 0.55
      let velParticulas = 1

      switch (estadoAtual) {
        case 'falando':
          velocidade = 0.24
          amplitude = 0.05 + nivelSuave * 0.22
          brilho = 0.6 + nivelSuave * 0.4
          velParticulas = 1 + nivelSuave * 1.5
          break
        case 'processando': {
          // Pulso rítmico, independente do áudio.
          const pulso = (Math.sin(t * 7.5) + 1) / 2
          velocidade = 0.85
          amplitude = 0.07 + pulso * 0.09
          brilho = 0.6 + pulso * 0.35
          velParticulas = 3
          break
        }
        case 'pane':
          velocidade = 1.6
          amplitude = 0.18 + Math.random() * 0.22
          brilho = 0.5 + Math.random() * 0.5
          velParticulas = 4
          break
      }

      if (refAvariado.current) {
        velocidade *= 0.45
        // Praticamente sem escurecer: agora quem conta a avaria é a COR.
        //
        // Com a paleta vermelha e os 60% de brilho do plano original o orbe
        // sumia no fundo escuro — vermelho é a cor que o olho menos enxerga no
        // escuro, e o que estava indo pro projetor era uma malha quase
        // invisível. A avaria fica por conta da cor e da lentidão.
        brilho *= 0.95
        velParticulas *= 0.5
      }

      t += dt * (1 + nivelSuave)
      // O ângulo avança sempre, mas só entra no alvo da esfera: uma silhueta
      // girada em Y ficaria achatada.
      rotacao += dt * velocidade

      let avanco = 1
      if (morfando) {
        const bruto = Math.min(1, (agora - inicioMorph) / MS_MORPH)
        // Remapeado pra chegar em 1 no encaixe: dali até o fim a partícula fica
        // exatamente em cima do alvo, sem resíduo de interpolação nem sopro.
        avanco = bruto >= FRACAO_ENCAIXE ? 1 : easeOutCubic(bruto / FRACAO_ENCAIXE)
        if (bruto >= 1) morfando = false
      }

      const emForma = destino !== FORMA_PADRAO
      const cos = Math.cos(rotacao)
      const sen = Math.sin(rotacao)

      // 1) alvo do quadro
      if (emForma) {
        // Respiração radial lenta, IGUAL pra todas as partículas: a fase por
        // partícula que existia aqui era ruído, e ruído num contorno é borrão.
        const resp =
          1 + (0.025 + amplitude * 0.25) * FATOR_RESPIRACAO * Math.sin(t * 0.9)
        for (let i = 0; i < total; i++) {
          alvoX[i] = formaX[i] * resp
          alvoY[i] = formaY[i] * resp
          alvoZ[i] = formaZ[i]
        }
      } else {
        for (let i = 0; i < total; i++) {
          const p = esfera[i]
          const r = 1 + amplitude * ondulacao(p, t)
          const x = p.x * r
          const z = p.z * r
          alvoX[i] = x * cos - z * sen
          alvoY[i] = p.y * r
          alvoZ[i] = x * sen + z * cos
        }
      }

      // 2) posição = alvo, ou interpolação com o sopro durante o morph
      if (morfando) {
        const sopro =
          avanco < FRACAO_SOPRO ? Math.sin((Math.PI * avanco) / FRACAO_SOPRO) * 0.22 : 0
        for (let i = 0; i < total; i++) {
          posX[i] = origX[i] + (alvoX[i] - origX[i]) * avanco + soproX[i] * sopro
          posY[i] = origY[i] + (alvoY[i] - origY[i]) * avanco + soproY[i] * sopro
          posZ[i] = origZ[i] + (alvoZ[i] - origZ[i]) * avanco + soproZ[i] * sopro
        }
      } else {
        posX.set(alvoX)
        posY.set(alvoY)
        posZ.set(alvoZ)
      }

      ctx.clearRect(0, 0, largura, altura)

      const cx = largura / 2
      const cy = altura / 2
      const menorLado = Math.min(largura, altura)
      // A esfera fica em 0.33 pra sobrar folga pras partículas, que orbitam até
      // ~1.5 raios e ainda crescem com a perspectiva. Uma silhueta não tem esse
      // problema e pode ocupar mais da tela — o que importa é ela ser lida a 15
      // metros. O fator acompanha o morph nos dois sentidos.
      const fatorForma = emForma ? avanco : 1 - avanco
      const raioBase = menorLado * (0.33 + 0.13 * fatorForma) * refEscala.current
      const raioParticulas = menorLado * 0.33 * refEscala.current
      const paleta = refAvariado.current ? PALETA_AVARIADA : PALETAS[estadoAtual]

      for (let i = 0; i < total; i++) {
        const zr = posZ[i]
        const escalaPerspectiva = DISTANCIA_CAMERA / (DISTANCIA_CAMERA - zr)
        projX[i] = cx + posX[i] * raioBase * escalaPerspectiva
        projY[i] = cy + posY[i] * raioBase * escalaPerspectiva
        // O z projetado vira opacidade: a frente brilha, o fundo some.
        projA[i] = (0.12 + ((zr + 1) / 2) * 0.88) * brilho
      }

      // Vinheta atrás da silhueta: escurece o fundo logo ali e o contorno
      // descola do HUD. Entra e sai junto com o morph.
      if (fatorForma > 0.01) {
        const vinheta = ctx.createRadialGradient(cx, cy, 0, cx, cy, raioBase * 1.6)
        vinheta.addColorStop(0, `rgba(1, 6, 8, ${0.6 * fatorForma})`)
        vinheta.addColorStop(0.7, `rgba(1, 6, 8, ${0.34 * fatorForma})`)
        vinheta.addColorStop(1, 'rgba(1, 6, 8, 0)')
        ctx.fillStyle = vinheta
        ctx.fillRect(0, 0, largura, altura)
      }

      if (emForma) {
        // Contorno: UMA passada fina, e só depois do encaixe. Desenhar a
        // polilinha no meio do morph faria a silhueta parecer um elástico.
        if (avanco >= 1 && contornoParticulas.length > 0) {
          ctx.lineWidth = refCompacto.current ? 0.9 : 1.2
          ctx.lineJoin = 'round'
          ctx.beginPath()
          for (const contorno of contornoParticulas) {
            ctx.moveTo(projX[contorno[0]], projY[contorno[0]])
            for (let k = 1; k < contorno.length; k++) {
              ctx.lineTo(projX[contorno[k]], projY[contorno[k]])
            }
            ctx.closePath()
          }
          ctx.strokeStyle = `rgba(${paleta.ponto}, ${Math.min(1, 0.82 * brilho)})`
          ctx.stroke()
        }

        // Dois pesos de ponto: a borda é a leitura, o interior é textura.
        const ladoBorda = refCompacto.current ? 1.7 : 2.2
        const ladoInterior = refCompacto.current ? 1.2 : 1.5
        for (let i = 0; i < total; i++) {
          const naBorda = bordaParticula[i] === 1
          const lado = naBorda ? ladoBorda : ladoInterior
          const alpha = Math.min(1, projA[i]) * (naBorda ? 1 : 0.5)
          ctx.fillStyle = `rgba(${paleta.ponto}, ${alpha})`
          ctx.fillRect(projX[i] - lado / 2, projY[i] - lado / 2, lado, lado)
        }
      } else {
        // Esfera: halo grosso + traço fino, ponto de tamanho único. Intocada —
        // é a identidade do orbe em repouso.
        const arestas = morfando ? null : arestasEsfera
        if (arestas) {
          const passos: Array<{ espessura: number; alpha: number }> = [
            { espessura: refCompacto.current ? 1.6 : 2.6, alpha: 0.1 },
            { espessura: 0.7, alpha: 0.55 },
          ]
          for (const passo of passos) {
            ctx.lineWidth = passo.espessura
            ctx.beginPath()
            for (let i = 0; i < arestas.length; i++) {
              if (pularArestas && i % 2) continue
              const [a, b] = arestas[i]
              ctx.moveTo(projX[a], projY[a])
              ctx.lineTo(projX[b], projY[b])
            }
            ctx.strokeStyle = `rgba(${paleta.linha}, ${passo.alpha * brilho})`
            ctx.stroke()
          }
        }

        // Um retângulo de 1–2 px é bem mais barato que um arc() por ponto.
        const lado = refCompacto.current ? 1.4 : 1.9
        for (let i = 0; i < total; i++) {
          ctx.fillStyle = `rgba(${paleta.ponto}, ${Math.min(1, projA[i])})`
          ctx.fillRect(projX[i] - lado / 2, projY[i] - lado / 2, lado, lado)
        }
      }

      // Partículas soltas orbitando fora da esfera.
      for (const particula of particulas) {
        particula.angulo += dt * particula.velocidade * velParticulas
        const px = Math.cos(particula.angulo) * particula.raio
        const pz = Math.sin(particula.angulo) * particula.raio
        const py = particula.inclinacao + Math.sin(t * 0.6 + particula.raio) * 0.1
        const xr = px * cos - pz * sen
        const zr = px * sen + pz * cos
        const esc = DISTANCIA_CAMERA / (DISTANCIA_CAMERA - zr)
        const alpha = particula.brilho * (0.15 + ((zr + 1) / 2) * 0.85) * brilho
        ctx.fillStyle = `rgba(${paleta.particula}, ${Math.min(1, alpha)})`
        ctx.fillRect(
          cx + xr * raioParticulas * esc - 1,
          cy + py * raioParticulas * esc - 1,
          2,
          2,
        )
      }

      // Glitch da pane: fatias horizontais deslocadas. Copiar o canvas em cima
      // dele mesmo com drawImage é muito mais barato que getImageData.
      if (estadoAtual === 'pane') {
        const fatias = 3 + Math.floor(Math.random() * 3)
        for (let i = 0; i < fatias; i++) {
          const sy = Math.random() * altura
          const sh = 6 + Math.random() * 26
          const dx = (Math.random() - 0.5) * largura * 0.16
          ctx.drawImage(canvas, 0, sy, largura, sh, dx, sy, largura, sh)
        }
      }
    }

    if (refForma.current !== FORMA_PADRAO) iniciarMorph(refForma.current)
    quadro = requestAnimationFrame(desenhar)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [])

  // Efeito à parte: a classe do tremor não pode entrar nas dependências do
  // loop de animação, que precisa montar uma vez só.
  useEffect(() => {
    refCanvas.current?.classList.toggle('orbe--tremor', tremor)
  }, [tremor])

  useEffect(() => {
    refCanvas.current?.classList.toggle('orbe--pulso', pulso)
  }, [pulso])

  return <canvas className="orbe" ref={refCanvas} aria-hidden="true" />
}

export { QTD_PONTOS }
