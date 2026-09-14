import { useEffect, useRef } from 'react'

export type EstadoOrbe = 'ocioso' | 'falando' | 'processando' | 'pane'

type Props = {
  estado: EstadoOrbe
  /**
   * Lê o nível de áudio (0–1) agora. É uma função, não um número, de propósito:
   * o orbe consulta dentro do próprio requestAnimationFrame, então o nível
   * muda a 60 fps sem provocar um render do React por quadro.
   */
  lerNivel?: () => number
  /** Só pro modo "canto" da cena de apresentação. */
  compacto?: boolean
}

const QTD_PONTOS = 760
const VIZINHOS_POR_PONTO = 3
const QTD_PARTICULAS = 40
/** Distância da câmera, em raios da esfera. Controla a perspectiva. */
const DISTANCIA_CAMERA = 3.2
/** Depois disso o orbe em pane congela, como um sistema que travou. */
const MS_ATE_CONGELAR = 4200

type Ponto = { x: number; y: number; z: number; fase: number }
type Particula = {
  raio: number
  angulo: number
  velocidade: number
  inclinacao: number
  brilho: number
}

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
 * Vizinhança fixa, calculada uma vez. São ~290k comparações pra 760 pontos —
 * uns poucos ms no boot, contra fazer isso a cada quadro, que seria inviável.
 */
function gerarArestas(pontos: Ponto[]): Array<[number, number]> {
  const arestas: Array<[number, number]> = []
  const vistas = new Set<string>()

  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i]
    const candidatos: Array<{ indice: number; dist: number }> = []
    for (let j = 0; j < pontos.length; j++) {
      if (i === j) continue
      const b = pontos[j]
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dz = a.z - b.z
      candidatos.push({ indice: j, dist: dx * dx + dy * dy + dz * dz })
    }
    candidatos.sort((um, outro) => um.dist - outro.dist)
    for (let k = 0; k < VIZINHOS_POR_PONTO; k++) {
      const j = candidatos[k].indice
      const chave = i < j ? `${i}-${j}` : `${j}-${i}`
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

export function Orbe({ estado, lerNivel, compacto = false }: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  // Guardadas em refs pra não reiniciar a animação quando a prop muda.
  const refEstado = useRef(estado)
  const refNivel = useRef(lerNivel)
  const refCompacto = useRef(compacto)
  refEstado.current = estado
  refNivel.current = lerNivel
  refCompacto.current = compacto

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pontos = gerarPontos(QTD_PONTOS)
    const arestas = gerarArestas(pontos)
    const particulas = gerarParticulas()
    // Reaproveitados a cada quadro: alocar 760 objetos por frame geraria lixo.
    const projX = new Float32Array(pontos.length)
    const projY = new Float32Array(pontos.length)
    const projA = new Float32Array(pontos.length)

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

      mediaQuadro = mediaQuadro * 0.95 + (dt * 1000) * 0.05
      if (!pularArestas && mediaQuadro > 22) pularArestas = true
      else if (pularArestas && mediaQuadro < 14) pularArestas = false

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
          // Pulso rítmico a ~1,2 Hz, independente do áudio.
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

      t += dt * (1 + nivelSuave)
      rotacao += dt * velocidade

      ctx.clearRect(0, 0, largura, altura)

      const cx = largura / 2
      const cy = altura / 2
      // 0.33 deixa folga pras particulas, que orbitam ate ~1.5 raios e ainda
      // crescem com a perspectiva.
      const raioBase = Math.min(largura, altura) * 0.33
      const cos = Math.cos(rotacao)
      const sen = Math.sin(rotacao)
      const paleta = PALETAS[estadoAtual]

      for (let i = 0; i < pontos.length; i++) {
        const p = pontos[i]
        const r = 1 + amplitude * ondulacao(p, t)
        const x = p.x * r
        const y = p.y * r
        const z = p.z * r
        // Rotação em Y.
        const xr = x * cos - z * sen
        const zr = x * sen + z * cos
        const escala = DISTANCIA_CAMERA / (DISTANCIA_CAMERA - zr)
        projX[i] = cx + xr * raioBase * escala
        projY[i] = cy + y * raioBase * escala
        // O z projetado vira opacidade: a frente brilha, o fundo some.
        projA[i] = (0.12 + ((zr + 1) / 2) * 0.88) * brilho
      }

      // Arestas em duas passadas: uma grossa e fraca faz o glow, uma fina o traço.
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

      // Pontos: um retângulo de 1–2 px é bem mais barato que um arc() por ponto.
      const lado = refCompacto.current ? 1.4 : 1.9
      for (let i = 0; i < pontos.length; i++) {
        ctx.fillStyle = `rgba(${paleta.ponto}, ${Math.min(1, projA[i])})`
        ctx.fillRect(projX[i] - lado / 2, projY[i] - lado / 2, lado, lado)
      }

      // Partículas soltas orbitando fora da esfera.
      for (const particula of particulas) {
        particula.angulo += dt * particula.velocidade * velParticulas
        const px = Math.cos(particula.angulo) * particula.raio
        const pz = Math.sin(particula.angulo) * particula.raio
        const py = particula.inclinacao + Math.sin(t * 0.6 + particula.raio) * 0.1
        const xr = px * cos - pz * sen
        const zr = px * sen + pz * cos
        const escala = DISTANCIA_CAMERA / (DISTANCIA_CAMERA - zr)
        const alpha = particula.brilho * (0.15 + ((zr + 1) / 2) * 0.85) * brilho
        ctx.fillStyle = `rgba(${paleta.particula}, ${Math.min(1, alpha)})`
        ctx.fillRect(cx + xr * raioBase * escala - 1, cy + py * raioBase * escala - 1, 2, 2)
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

    quadro = requestAnimationFrame(desenhar)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [])

  return <canvas className="orbe" ref={refCanvas} aria-hidden="true" />
}
