import { useEffect, useRef } from 'react'

/**
 * O olho.
 *
 * A plateia vê a criatura uma vez, por três segundos, e o que ela vê é um olho.
 * Mostrar o bicho inteiro resolveria o mistério; mostrar só o olho deixa o
 * tamanho por conta de quem está assistindo — e um olho de setenta por cento da
 * tela já diz tudo sobre o resto.
 *
 * Procedural, não imagem, e não por purismo: a cena depende de a **pupila
 * contrair quando o farol bate**, e isso é animação. Um PNG daria um olho
 * morto, que é exatamente o contrário do efeito.
 *
 * Anatomia, de dentro pra fora:
 *
 *  1. esclera — o branco sujo, que num bicho abissal é quase cinza-esverdeado;
 *  2. íris com fibras radiais, sorteadas uma vez e guardadas: elas são o que
 *     faz o olho parecer tecido em vez de gradiente;
 *  3. pupila vertical, de tubarão, que contrai sob a luz;
 *  4. reflexo do farol na córnea — a mancha branca que diz "isto está molhado";
 *  5. pele com sulcos em volta, pra o olho não flutuar no vazio.
 *
 * O bicho está nadando, então tudo deriva devagar: sem isso o olho fica colado
 * na tela como um adesivo.
 */

type Props = {
  /** Quanto o olho fica no facho, em ms. */
  duracao: number
  /**
   * Chamado no instante da rachadura, um quadro depois do olho terminar. É o
   * Player que toca `impacto` + `vidro` e derruba o visor — esta cena só avisa
   * a hora.
   */
  aoQuebrar: () => void
}

/** Quantas fibras radiais a íris tem. Sorteadas uma vez, na montagem. */
const FIBRAS = 190

/**
 * Resolução interna do canvas, em fração do tamanho na tela.
 *
 * Medido: os desenhos do olho somam 0,04 ms por quadro — não é a pintura que
 * custa. O que custa é COMPOSITAR um canvas de 962×628 sessenta vezes por
 * segundo num container sem GPU: são 600 mil pixels reenviados por quadro, e
 * isso derrubava a cena pra 47 fps.
 *
 * A 0,55 são 180 mil pixels, na mesma ordem do feed de câmera grande — que
 * roda a 60. E o olho não perde nada com isso: ele é todo gradiente e curva,
 * sem uma linha fina ou um texto que a escala pudesse borrar. É exatamente o
 * mesmo truque que as câmeras já usam desde o começo.
 */
const RESOLUCAO = 0.55

type Fibra = { angulo: number; comeco: number; fim: number; brilho: number; largura: number }

const mistura = (a: number, b: number, t: number) => a + (b - a) * t
const suave = (t: number) => t * t * (3 - 2 * t)
const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export function Olho({ duracao, aoQuebrar }: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const refQuebrar = useRef(aoQuebrar)
  refQuebrar.current = aoQuebrar

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let L = 0
    let A = 0
    const ajustar = () => {
      const caixa = canvas.getBoundingClientRect()
      // O desenho continua pensando em pixels de TELA; quem encolhe é o buffer.
      L = Math.max(1, Math.round(caixa.width))
      A = Math.max(1, Math.round(caixa.height))
      canvas.width = Math.max(1, Math.round(L * RESOLUCAO))
      canvas.height = Math.max(1, Math.round(A * RESOLUCAO))
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(canvas)

    // Fibras da íris: sorteadas UMA vez. Regerar por quadro faria a íris
    // fervilhar, e olho não fervilha.
    const fibras: Fibra[] = Array.from({ length: FIBRAS }, () => ({
      angulo: Math.random() * Math.PI * 2,
      comeco: 0.18 + Math.random() * 0.2,
      fim: 0.62 + Math.random() * 0.38,
      brilho: 0.25 + Math.random() * 0.75,
      largura: 0.4 + Math.random() * 1.9,
    }))
    // Manchas mais escuras na íris, também fixas.
    const manchas = Array.from({ length: 14 }, () => ({
      angulo: Math.random() * Math.PI * 2,
      raio: 0.3 + Math.random() * 0.55,
      tamanho: 0.05 + Math.random() * 0.13,
      forca: 0.15 + Math.random() * 0.3,
    }))

    /**
     * Textura da íris num canvas de apoio, pintada UMA vez.
     *
     * Eram 190 `stroke()` separados e 14 gradientes radiais POR QUADRO, e isso
     * derrubava a cena pra 47 fps — numa cena que dura três segundos e é o
     * clímax da apresentação. As fibras não mudam: o que muda é a cor por
     * baixo delas. Então elas viram uma imagem branca com alfa, e a cor vem do
     * gradiente que fica embaixo.
     */
    const apoio = document.createElement('canvas')
    const apoioCtx = apoio.getContext('2d')!
    let apoioLado = 0

    const pintarIris = (lado: number) => {
      apoioLado = lado
      apoio.width = lado
      apoio.height = lado
      const c = apoioCtx
      const r = lado / 2
      c.clearRect(0, 0, lado, lado)
      c.save()
      c.translate(r, r)
      c.beginPath()
      c.arc(0, 0, r, 0, Math.PI * 2)
      c.clip()
      for (const f of fibras) {
        c.beginPath()
        c.moveTo(Math.cos(f.angulo) * r * f.comeco, Math.sin(f.angulo) * r * f.comeco)
        c.lineTo(Math.cos(f.angulo) * r * f.fim, Math.sin(f.angulo) * r * f.fim)
        c.strokeStyle = `rgba(255, 246, 224, ${f.brilho * 0.3})`
        c.lineWidth = f.largura
        c.stroke()
      }
      for (const m of manchas) {
        const x = Math.cos(m.angulo) * r * m.raio
        const y = Math.sin(m.angulo) * r * m.raio
        const g = c.createRadialGradient(x, y, 0, x, y, r * m.tamanho)
        g.addColorStop(0, `rgba(28, 30, 24, ${m.forca})`)
        g.addColorStop(1, 'rgba(28, 30, 24, 0)')
        c.fillStyle = g
        c.beginPath()
        c.arc(x, y, r * m.tamanho, 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
    }

    /** Sulcos da pele, também fixos. Nove arcos de 34 segmentos por quadro. */
    const sulcos = document.createElement('canvas')
    const sulcosCtx = sulcos.getContext('2d')!
    let sulcosLado = 0

    const pintarSulcos = (lado: number, raio: number) => {
      sulcosLado = lado
      sulcos.width = lado
      sulcos.height = lado
      const c = sulcosCtx
      c.clearRect(0, 0, lado, lado)
      c.save()
      c.translate(lado / 2, lado / 2)
      c.strokeStyle = 'rgba(96, 108, 106, 1)'
      for (let i = 0; i < 9; i++) {
        const rr0 = raio * (1.12 + i * 0.16)
        c.lineWidth = 1 + (i % 3)
        c.beginPath()
        for (let k = 0; k <= 34; k++) {
          const ang = (k / 34) * Math.PI * 2
          const rr = rr0 * (1 + Math.sin(ang * (3 + i) + i * 2.1) * 0.035)
          const x = Math.cos(ang) * rr
          const y = Math.sin(ang) * rr * 0.86
          if (k === 0) c.moveTo(x, y)
          else c.lineTo(x, y)
        }
        c.stroke()
      }
      c.restore()
    }

    // Vinheta: o gradiente só depende do tamanho, então é criado uma vez.
    let vinheta: CanvasGradient | null = null
    let vinhetaLado = ''

    const nascimento = performance.now()
    let quebrou = false
    let quadro = 0

    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(desenhar)
      const t = agora - nascimento
      const seg = t / 1000

      if (!quebrou && t >= duracao) {
        quebrou = true
        refQuebrar.current()
      }

      ctx.setTransform(RESOLUCAO, 0, 0, RESOLUCAO, 0, 0)
      ctx.clearRect(0, 0, L, A)
      // Fundo: o escuro de onde ele sai. Não é preto chapado — é a água.
      ctx.fillStyle = '#02080b'
      ctx.fillRect(0, 0, L, A)

      // --- fases da cena -----------------------------------------------------
      // 0 a 35%: emergindo do escuro, ainda fora do facho.
      // 35 a 55%: o farol bate. A pupila contrai.
      // 55 a 100%: deriva, e o brilho da córnea acompanha.
      const avanco = limitar(t / duracao, 0, 1)
      const entrada = suave(limitar(avanco / 0.35, 0, 1))
      const luz = suave(limitar((avanco - 0.3) / 0.25, 0, 1))
      // A contração é RÁPIDA e a volta é lenta, como pupila de verdade.
      const contracao = suave(limitar((avanco - 0.32) / 0.14, 0, 1)) * 0.78

      // Deriva: o bicho está nadando, então o olho passa devagar.
      const derivaX = Math.sin(seg * 0.42) * L * 0.035 + avanco * L * 0.05
      const derivaY = Math.sin(seg * 0.31 + 1.4) * A * 0.028

      const cx = L * 0.5 + derivaX
      const cy = A * 0.5 + derivaY
      // ~70% do quadro. O olho é maior que a tela em altura: só o miolo cabe,
      // e é justamente isso que passa a escala.
      const raio = Math.min(L, A) * 0.37

      ctx.save()
      ctx.translate(cx, cy)
      // Inclinação lenta: a cabeça dele não está paralela à câmera.
      ctx.rotate(Math.sin(seg * 0.23) * 0.05 - 0.07)

      // --- 5) pele em volta, com sulcos --------------------------------------
      // O retângulo cobre o quadro com folga pra rotação, e não `L*2 x A*2`:
      // eram quatro vezes a área do canvas pintadas com gradiente radial a
      // cada quadro, e essa conta sozinha custava mais que o olho inteiro.
      const pele = ctx.createRadialGradient(0, 0, raio * 0.9, 0, 0, raio * 3.4)
      pele.addColorStop(0, `rgba(38, 44, 44, ${0.95 * entrada})`)
      pele.addColorStop(0.35, `rgba(20, 26, 28, ${0.82 * entrada})`)
      pele.addColorStop(1, 'rgba(2, 8, 11, 0)')
      ctx.fillStyle = pele
      ctx.fillRect(-L * 0.62, -A * 0.68, L * 1.24, A * 1.36)

      // Sulcos: arcos concêntricos irregulares em volta da órbita.
      // Lado do canvas de apoio: o último arco vai a 1,12 + 8×0,16 = 2,4 raios,
      // então 5 raios cobrem com folga. Antes era 7, o que dava uma imagem
      // maior que a tela sendo copiada sessenta vezes por segundo.
      const ladoSulcos = Math.ceil(raio * 5)
      if (sulcosLado !== ladoSulcos) pintarSulcos(ladoSulcos, raio)
      ctx.globalAlpha = 0.2 * entrada * (0.5 + luz * 0.5)
      ctx.drawImage(sulcos, -ladoSulcos / 2, -ladoSulcos / 2)
      ctx.globalAlpha = 1

      // --- 1) esclera ---------------------------------------------------------
      // Amendoada, não circular: pálpebra em cima e embaixo.
      const traçarOlho = () => {
        ctx.beginPath()
        ctx.moveTo(-raio * 1.7, 0)
        ctx.bezierCurveTo(-raio * 1.1, -raio * 1.15, raio * 1.1, -raio * 1.15, raio * 1.7, 0)
        ctx.bezierCurveTo(raio * 1.1, raio * 1.12, -raio * 1.1, raio * 1.12, -raio * 1.7, 0)
        ctx.closePath()
      }
      traçarOlho()
      ctx.save()
      ctx.clip()

      const esclera = ctx.createRadialGradient(0, 0, raio * 0.4, 0, 0, raio * 1.8)
      esclera.addColorStop(0, `rgba(146, 152, 140, ${0.9 * entrada})`)
      esclera.addColorStop(1, `rgba(52, 62, 58, ${0.9 * entrada})`)
      ctx.fillStyle = esclera
      ctx.fillRect(-raio * 1.8, -raio * 1.2, raio * 3.6, raio * 2.4)

      // Vasos na esclera: poucos, finos, só pra ela não ser um papel liso.
      ctx.strokeStyle = `rgba(122, 70, 62, ${0.3 * entrada})`
      ctx.lineWidth = 1
      for (const lado of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(lado * raio * 1.65, 0)
        ctx.quadraticCurveTo(lado * raio * 1.3, -raio * 0.22, lado * raio * 1.05, -raio * 0.08)
        ctx.moveTo(lado * raio * 1.6, raio * 0.1)
        ctx.quadraticCurveTo(lado * raio * 1.25, raio * 0.3, lado * raio * 1.02, raio * 0.14)
        ctx.stroke()
      }

      // --- 2) íris -------------------------------------------------------------
      const rIris = raio
      // Âmbar sob o facho, cinza no escuro: a cor CHEGA com a luz.
      const corIris = (a: number) =>
        `rgba(${mistura(96, 196, luz) | 0}, ${mistura(92, 146, luz) | 0}, ${
          mistura(78, 62, luz) | 0
        }, ${a * entrada})`

      const iris = ctx.createRadialGradient(0, -rIris * 0.1, rIris * 0.12, 0, 0, rIris)
      iris.addColorStop(0, corIris(0.95))
      iris.addColorStop(0.55, corIris(0.85))
      // Anel escuro na borda: o limbo, e é ele que separa íris de esclera.
      iris.addColorStop(1, `rgba(16, 20, 18, ${0.95 * entrada})`)
      ctx.beginPath()
      ctx.arc(0, 0, rIris, 0, Math.PI * 2)
      ctx.fillStyle = iris
      ctx.fill()

      // Fibras e manchas: uma imagem só, pintada na montagem. A cor vem do
      // gradiente que já está embaixo.
      const ladoIris = Math.ceil(rIris * 2)
      if (apoioLado !== ladoIris) pintarIris(ladoIris)
      ctx.globalAlpha = entrada
      ctx.drawImage(apoio, -rIris, -rIris)
      ctx.globalAlpha = 1

      // --- 3) pupila vertical ---------------------------------------------------
      // Contrai em LARGURA, quase não em altura: é assim que uma pupila em fenda
      // funciona, e encolher os dois eixos daria olho de gato assustado.
      const larguraPupila = rIris * mistura(0.42, 0.11, contracao)
      const alturaPupila = rIris * mistura(1.12, 0.95, contracao)
      ctx.beginPath()
      ctx.ellipse(0, 0, larguraPupila, alturaPupila, 0, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(2, 4, 5, ${0.97 * entrada})`
      ctx.fill()
      // Borda da pupila levemente clara: sem isso ela some na íris escura.
      ctx.strokeStyle = `rgba(${mistura(120, 210, luz) | 0}, ${
        mistura(112, 168, luz) | 0
      }, 92, ${0.35 * entrada})`
      ctx.lineWidth = 1.4
      ctx.stroke()

      // --- 4) reflexo do farol na córnea ----------------------------------------
      // Duas manchas: o facho principal e uma secundária menor. É o par que
      // vende "molhado" — uma sozinha parece furo na textura.
      const brilhoFarol = luz * (0.85 + Math.sin(seg * 2.1) * 0.08)
      const rx = -rIris * 0.34
      const ry = -rIris * 0.36
      const reflexo = ctx.createRadialGradient(rx, ry, 0, rx, ry, rIris * 0.3)
      reflexo.addColorStop(0, `rgba(238, 252, 255, ${0.92 * brilhoFarol})`)
      reflexo.addColorStop(0.4, `rgba(200, 240, 250, ${0.3 * brilhoFarol})`)
      reflexo.addColorStop(1, 'rgba(200, 240, 250, 0)')
      ctx.fillStyle = reflexo
      ctx.beginPath()
      ctx.ellipse(rx, ry, rIris * 0.3, rIris * 0.22, -0.5, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = `rgba(226, 246, 252, ${0.5 * brilhoFarol})`
      ctx.beginPath()
      ctx.ellipse(rIris * 0.42, rIris * 0.3, rIris * 0.07, rIris * 0.05, 0.6, 0, Math.PI * 2)
      ctx.fill()

      // Brilho geral da córnea: uma lâmina de luz atravessando o olho todo.
      const lamina = ctx.createLinearGradient(-rIris, -rIris, rIris, rIris)
      lamina.addColorStop(0, `rgba(190, 230, 240, ${0.12 * brilhoFarol})`)
      lamina.addColorStop(0.5, 'rgba(190, 230, 240, 0)')
      ctx.fillStyle = lamina
      ctx.fillRect(-raio * 1.8, -raio * 1.2, raio * 3.6, raio * 2.4)

      ctx.restore()

      // Contorno da pálpebra, POR FORA do clip: ele define a forma do olho.
      traçarOlho()
      ctx.strokeStyle = `rgba(14, 18, 20, ${0.9 * entrada})`
      ctx.lineWidth = Math.max(2, raio * 0.04)
      ctx.stroke()
      // Fio de luz na pálpebra de cima, onde o farol pega.
      ctx.beginPath()
      ctx.moveTo(-raio * 1.6, -raio * 0.16)
      ctx.bezierCurveTo(-raio * 1.05, -raio * 1.12, raio * 1.05, -raio * 1.12, raio * 1.6, -raio * 0.16)
      ctx.strokeStyle = `rgba(150, 170, 168, ${0.4 * luz})`
      ctx.lineWidth = Math.max(1, raio * 0.016)
      ctx.stroke()

      ctx.restore()

      // Partículas na água entre a lente e o bicho: sedimento no facho. Dá a
      // distância que faltava — sem elas o olho parece colado no vidro.
      ctx.fillStyle = `rgba(190, 220, 225, ${0.28 * entrada})`
      for (let i = 0; i < 26; i++) {
        const fase = i * 2.4
        const x = ((Math.sin(fase) * 0.5 + 0.5) * L + seg * 22 * (1 + (i % 3))) % L
        const y = ((Math.cos(fase * 1.7) * 0.5 + 0.5) * A + seg * 9) % A
        ctx.fillRect(x, y, 1.6, 1.6)
      }

      // Vinheta: o facho só alcança o meio do quadro.
      if (!vinheta || vinhetaLado !== `${L}x${A}`) {
        vinhetaLado = `${L}x${A}`
        vinheta = ctx.createRadialGradient(
          L / 2, A / 2, Math.min(L, A) * 0.22,
          L / 2, A / 2, Math.max(L, A) * 0.62,
        )
        vinheta.addColorStop(0, 'rgba(2, 8, 11, 0)')
        vinheta.addColorStop(1, 'rgba(2, 8, 11, 0.9)')
      }
      ctx.fillStyle = vinheta
      ctx.fillRect(0, 0, L, A)
    }

    quadro = requestAnimationFrame(desenhar)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [duracao])

  return (
    <div className="olho" aria-hidden="true">
      <canvas ref={refCanvas} className="olho__canvas" />
      <div className="olho__barra">
        <span>CAM 01 · EXT BOMBORDO</span>
        <span className="olho__rec">● rec</span>
      </div>
    </div>
  )
}
