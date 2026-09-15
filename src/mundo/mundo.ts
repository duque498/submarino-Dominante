import { especiesEm, type Especie } from './bestiario'
import { perfilDe, rgba, suave, type Perfil } from './perfil'

/**
 * O oceano ao redor do submarino.
 *
 * Existe UM mundo, simulado uma vez por quadro. Os canvases registrados (dois
 * mini-feeds, o painel de câmera e o fundo do palco) só DESENHAM o mesmo estado
 * de pontos de vista diferentes — simular três vezes seria o triplo do custo
 * por nenhum ganho.
 *
 * Coordenadas de mundo: x em [0, LARGURA_MUNDO), y em [0, 1] (0 = topo do
 * quadro, 1 = fundo). Cada câmera é uma janela de largura `abertura` a partir
 * de `x0`.
 */

const LARGURA_MUNDO = 3
const QTD_PEIXES = 60
const QTD_PARTICULAS = 130
const QTD_BIOLUM = 46
const QTD_AGUAS_VIVAS = 7
const QTD_CORAIS = 14
const MAX_FAUNA = 3
/**
 * Intervalo entre aparições de fauna grande. Era [15s, 40s]: numa apresentação
 * de cinco minutos dava pra a câmera passar a cena inteira sem nenhum bicho, e
 * os bichos são metade da graça da câmera externa.
 */
const INTERVALO_FAUNA = [7000, 20000] as const
/** Perda de sinal: a cada tanto, por tanto tempo. */
const INTERVALO_FALHA = [30000, 90000] as const
const DURACAO_FALHA = 400

const sorteio = (min: number, max: number) => min + Math.random() * (max - min)

export type OpcoesCamera = {
  /** Canto esquerdo da janela, em coordenadas de mundo. */
  x0: number
  /** Largura da janela. Maior = mais mundo visível. */
  abertura: number
  /** Bombordo e estibordo veem lados diferentes do mesmo cardume. */
  espelhado?: boolean
  /** Opacidade geral — o fundo do palco entra bem apagado. */
  opacidade?: number
  /** Feed sem sinal: só estática. */
  estatica?: boolean
  /** Sem moldura nem retículo (usado pelo fundo do palco). */
  simples?: boolean
}

export type Alvo = { x: number; y: number; distancia: number; rotulo: string }

type Peixe = { x: number; y: number; vx: number; vy: number; z: number }
type Fauna = {
  x: number
  y: number
  vx: number
  escala: number
  /** Quem é o bicho: faixa de profundidade, porte e como se desenha. */
  especie: Especie
  distancia: number
  fase: number
  /** 1 = presente; cai até 0 quando a expedição sai da faixa da espécie. */
  vida: number
}
type Particula = { x: number; y: number; v: number; raio: number; fase: number }
type Biolum = { x: number; y: number; fase: number; periodo: number; raio: number }
type AguaViva = { x: number; y: number; v: number; fase: number; escala: number }
type Coral = { x: number; ramos: Array<[number, number]>; altura: number }

type Registro = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  camera: OpcoesCamera
  aoDesenhar?: (info: { alvo: Alvo | null; profundidade: number }) => void
}

export class MotorMundo {
  /** Profundidade exibida agora, em metros. Anima até o alvo. */
  private profundidadeAtual = 50
  private profundidadeAlvo = 50
  /** Metros por segundo da descida — calculado a cada alvo novo. */
  private velocidadeDescida = 0
  private aoTicar: ((metros: number) => void) | null = null
  private ultimoTique = 0

  /** Pane: todos os feeds caem pra estática. */
  estaticaGlobal = false

  private peixes: Peixe[] = []
  private fauna: Fauna[] = []
  private particulas: Particula[] = []
  private bioluminescencia: Biolum[] = []
  private aguasVivas: AguaViva[] = []
  private corais: Coral[] = []

  private registros: Registro[] = []
  private quadro = 0
  private anterior = 0
  private t = 0
  private proximaFauna = 0
  private perfil: Perfil = perfilDe(50)
  // Qualidade adaptativa, igual à do orbe.
  private mediaQuadro = 16
  private economizar = false
  /**
   * Inclinação do mergulho, -1 a 1. Positivo desloca a janela do mundo pra
   * baixo, o que na tela lê como o horizonte da água SUBINDO — a proa apontou
   * pro fundo. É só um offset em y: nenhuma simulação nova, nenhum custo.
   */
  pitch = 0
  /** Fluxo de bolhas durante o mergulho, 0 a 1. */
  turbulencia = 0

  constructor() {
    this.semear()
  }

  private semear() {
    for (let i = 0; i < QTD_PEIXES; i++) {
      this.peixes.push({
        x: Math.random() * LARGURA_MUNDO,
        y: 0.15 + Math.random() * 0.7,
        vx: sorteio(0.03, 0.09) * (Math.random() < 0.5 ? -1 : 1),
        vy: sorteio(-0.01, 0.01),
        z: Math.random(),
      })
    }
    for (let i = 0; i < QTD_PARTICULAS; i++) {
      this.particulas.push({
        x: Math.random() * LARGURA_MUNDO,
        y: Math.random(),
        v: sorteio(0.02, 0.07),
        raio: sorteio(0.6, 2.2),
        fase: Math.random() * Math.PI * 2,
      })
    }
    for (let i = 0; i < QTD_BIOLUM; i++) {
      this.bioluminescencia.push({
        x: Math.random() * LARGURA_MUNDO,
        y: Math.random(),
        fase: Math.random() * Math.PI * 2,
        periodo: sorteio(2, 7),
        raio: sorteio(1, 3),
      })
    }
    for (let i = 0; i < QTD_AGUAS_VIVAS; i++) {
      this.aguasVivas.push({
        x: Math.random() * LARGURA_MUNDO,
        y: 0.1 + Math.random() * 0.8,
        v: sorteio(-0.02, 0.02),
        fase: Math.random() * Math.PI * 2,
        escala: sorteio(0.7, 1.6),
      })
    }
    for (let i = 0; i < QTD_CORAIS; i++) {
      // Ramos gerados uma vez: coral não se mexe.
      const ramos: Array<[number, number]> = []
      const galhos = 3 + Math.floor(Math.random() * 4)
      for (let g = 0; g < galhos; g++) {
        ramos.push([sorteio(-0.7, 0.7), sorteio(0.4, 1)])
      }
      this.corais.push({
        x: Math.random() * LARGURA_MUNDO,
        ramos,
        altura: sorteio(0.06, 0.16),
      })
    }
  }

  // --- ciclo de vida -------------------------------------------------------

  iniciar() {
    if (this.quadro) return
    this.anterior = performance.now()
    this.proximaFauna = this.anterior + sorteio(2000, 6000)
    const laco = (agora: number) => {
      this.quadro = requestAnimationFrame(laco)
      const dt = Math.min(0.05, (agora - this.anterior) / 1000)
      this.anterior = agora
      this.mediaQuadro = this.mediaQuadro * 0.95 + dt * 1000 * 0.05
      this.economizar = this.mediaQuadro > 22
      this.atualizar(dt, agora)
      for (const registro of this.registros) this.desenhar(registro, agora)
    }
    this.quadro = requestAnimationFrame(laco)
  }

  parar() {
    if (this.quadro) cancelAnimationFrame(this.quadro)
    this.quadro = 0
  }

  registrar(registro: Registro) {
    this.registros.push(registro)
    this.iniciar()
  }

  desregistrar(canvas: HTMLCanvasElement) {
    this.registros = this.registros.filter((r) => r.canvas !== canvas)
  }

  // --- profundidade --------------------------------------------------------

  /** Define a profundidade-alvo; o motor anima até lá, sem pulo. */
  definirAlvo(metros: number, duracaoMs?: number) {
    this.profundidadeAlvo = metros
    const distancia = Math.abs(metros - this.profundidadeAtual)
    // 3 a 6 s conforme a distância, como pede o roteiro.
    const duracao = duracaoMs ?? Math.min(6000, Math.max(3000, distancia * 4))
    this.velocidadeDescida = distancia / (duracao / 1000)
  }

  /** Sem animação — usado pelo comando de debug e pelo estado inicial. */
  fixarProfundidade(metros: number) {
    this.profundidadeAtual = metros
    this.profundidadeAlvo = metros
    this.velocidadeDescida = 0
    this.perfil = perfilDe(metros)
    this.aoTicar?.(Math.round(metros))
  }

  profundidade() {
    return this.profundidadeAtual
  }

  descendo() {
    return Math.abs(this.profundidadeAlvo - this.profundidadeAtual) > 1
  }

  /** O HUD escreve o número direto no DOM: virar estado seria render por quadro. */
  observarProfundidade(cb: ((metros: number) => void) | null) {
    this.aoTicar = cb
    if (cb) cb(Math.round(this.profundidadeAtual))
  }

  // --- simulação -----------------------------------------------------------

  private atualizar(dt: number, agora: number) {
    this.t += dt

    // profundidade
    if (this.velocidadeDescida > 0) {
      const passo = this.velocidadeDescida * dt
      const resta = this.profundidadeAlvo - this.profundidadeAtual
      if (Math.abs(resta) <= passo) {
        this.profundidadeAtual = this.profundidadeAlvo
        this.velocidadeDescida = 0
      } else {
        this.profundidadeAtual += Math.sign(resta) * passo
      }
      if (agora - this.ultimoTique > 80) {
        this.ultimoTique = agora
        this.aoTicar?.(Math.round(this.profundidadeAtual))
      }
    }
    this.perfil = perfilDe(this.profundidadeAtual)

    // cardume: boids com vizinhança amostrada (8 vizinhos por peixe e quadro)
    const total = this.peixes.length
    for (let i = 0; i < total; i++) {
      const peixe = this.peixes[i]
      let cx = 0
      let cy = 0
      let ax = 0
      let ay = 0
      let sx = 0
      let sy = 0
      let vizinhos = 0

      for (let k = 0; k < 8; k++) {
        const outro = this.peixes[(Math.random() * total) | 0]
        if (outro === peixe) continue
        const dx = outro.x - peixe.x
        const dy = outro.y - peixe.y
        const dist2 = dx * dx + dy * dy
        if (dist2 > 0.09) continue
        vizinhos++
        cx += outro.x
        cy += outro.y
        ax += outro.vx
        ay += outro.vy
        if (dist2 < 0.0016) {
          sx -= dx
          sy -= dy
        }
      }

      if (vizinhos > 0) {
        peixe.vx += ((cx / vizinhos - peixe.x) * 0.35 + (ax / vizinhos - peixe.vx) * 0.5) * dt
        peixe.vy += ((cy / vizinhos - peixe.y) * 0.35 + (ay / vizinhos - peixe.vy) * 0.5) * dt
      }
      peixe.vx += sx * dt * 2
      peixe.vy += sy * dt * 2
      // Puxa de volta pra faixa central do quadro.
      peixe.vy += (0.5 - peixe.y) * 0.04 * dt

      const vel = Math.hypot(peixe.vx, peixe.vy) || 1
      const alvo = 0.06
      peixe.vx = (peixe.vx / vel) * alvo
      peixe.vy = (peixe.vy / vel) * alvo

      peixe.x += peixe.vx * dt
      peixe.y += peixe.vy * dt
      if (peixe.x < 0) peixe.x += LARGURA_MUNDO
      if (peixe.x > LARGURA_MUNDO) peixe.x -= LARGURA_MUNDO
      peixe.y = Math.max(0.08, Math.min(0.92, peixe.y))
    }

    // fauna grande atravessando o quadro
    if (agora > this.proximaFauna && this.fauna.length < MAX_FAUNA) {
      this.proximaFauna = agora + sorteio(INTERVALO_FAUNA[0], INTERVALO_FAUNA[1])
      const paraDireita = Math.random() < 0.5
      // Quem aparece depende só dos metros. Descer troca o elenco: a tartaruga
      // some, o cachalote entra, e mais fundo ainda quem passa é a lula-gigante.
      const possiveis = especiesEm(this.profundidadeAtual)
      const especie = possiveis[(Math.random() * possiveis.length) | 0]
      this.fauna.push({
        x: paraDireita ? -0.5 : LARGURA_MUNDO + 0.5,
        // Faixa estreita de propósito: uma raia ocupa quase toda a altura do
        // quadro, e nascendo em 0,7 metade dela ficava fora da tela.
        y: sorteio(0.32, 0.62),
        // Bicho grande nada mais devagar — senão o cachalote cruza o quadro
        // como um peixinho e o tamanho não convence. Mas o freio era forte
        // demais: a 0,06 unidade/s ele levava quase um minuto pra atravessar o
        // mundo, e a câmera passava a maior parte do tempo vazia.
        vx: (sorteio(0.1, 0.22) / (0.8 + especie.porte[1] * 0.35)) * (paraDireita ? 1 : -1),
        escala: sorteio(especie.porte[0], especie.porte[1]),
        especie,
        distancia: sorteio(6, 40),
        fase: Math.random() * Math.PI * 2,
        vida: 1,
      })
    }
    for (let i = this.fauna.length - 1; i >= 0; i--) {
      const f = this.fauna[i]
      f.x += f.vx * dt
      f.y += Math.sin(this.t * 0.6 + f.fase) * 0.004 * dt * 60
      f.distancia += sorteio(-0.4, 0.4)
      f.distancia = Math.max(4, Math.min(60, f.distancia))

      // A expedição desce enquanto o bicho ainda atravessa o quadro. Se a nova
      // profundidade não é mais a dele, ele se apaga no escuro em vez de
      // continuar ali — um tubarão a 4500 m entrega a farsa na hora.
      const [de, ate] = f.especie.faixa
      // Folga proporcional, mas com teto: 25% de uma faixa larga dava 750 m de
      // tolerância, e um peixe-víbora continuava aparecendo a 4500 m.
      const folga = Math.min(350, (ate - de) * 0.15)
      const cabe = this.profundidadeAtual >= de - folga && this.profundidadeAtual <= ate + folga
      f.vida = Math.max(0, Math.min(1, f.vida + (cabe ? dt : -dt / 2.2)))

      if (f.vida <= 0 || f.x < -1 || f.x > LARGURA_MUNDO + 1) this.fauna.splice(i, 1)
    }

    // partículas: bolhas sobem perto da superfície, neve marinha desce no fundo
    // Durante o mergulho tudo sobe em fluxo, independente da zona: é a água
    // passando pelo casco, não a partícula de sempre.
    const subindo = this.turbulencia > 0.05 ? true : this.perfil.bolhas > this.perfil.neve
    // A turbulência multiplica a velocidade: no mergulho a água passa rápido.
    const corrida = 1 + this.turbulencia * 5
    for (const particula of this.particulas) {
      particula.y += (subindo ? -particula.v : particula.v * 0.35) * dt * corrida
      particula.x += Math.sin(this.t * 0.7 + particula.fase) * 0.004 * dt * 60
      if (particula.y < -0.05) particula.y = 1.05
      if (particula.y > 1.05) particula.y = -0.05
    }

    for (const agua of this.aguasVivas) {
      agua.y -= 0.006 * dt
      agua.x += agua.v * dt
      if (agua.y < -0.1) agua.y = 1.1
      if (agua.x < 0) agua.x += LARGURA_MUNDO
      if (agua.x > LARGURA_MUNDO) agua.x -= LARGURA_MUNDO
    }
  }

  // --- desenho -------------------------------------------------------------

  private desenhar(registro: Registro, agora: number) {
    const { ctx, canvas, camera } = registro
    const L = canvas.width
    const A = canvas.height
    if (L < 2 || A < 2) return

    const perfil = this.perfil
    const estatica = camera.estatica || this.estaticaGlobal

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1

    if (estatica) {
      this.desenharEstatica(ctx, L, A)
      registro.aoDesenhar?.({ alvo: null, profundidade: this.profundidadeAtual })
      return
    }

    ctx.globalAlpha = camera.opacidade ?? 1

    // tremor de pressão no abisso
    const tremor = perfil.tremor * (Math.sin(agora / 90) + Math.sin(agora / 37)) * 0.9
    ctx.translate(tremor, tremor * 0.4)

    // fundo — pintado ANTES da inclinação, senão sobraria faixa vazia na borda
    const gradiente = ctx.createLinearGradient(0, 0, 0, A)
    gradiente.addColorStop(0, rgba(perfil.fundoTopo, 1))
    gradiente.addColorStop(1, rgba(perfil.fundoBaixo, 1))
    ctx.fillStyle = gradiente
    ctx.fillRect(-4, -4, L + 8, A + 8)

    // Inclinação do mergulho: desloca o conteúdo, não o fundo.
    if (this.pitch !== 0) ctx.translate(0, this.pitch * A * 0.14)

    const mundoParaTela = (x: number) => {
      let dx = x - camera.x0
      // Mundo cilíndrico: o que sai de um lado volta do outro.
      if (dx < -LARGURA_MUNDO / 2) dx += LARGURA_MUNDO
      if (dx > LARGURA_MUNDO / 2) dx -= LARGURA_MUNDO
      const frac = dx / camera.abertura
      return (camera.espelhado ? 1 - frac : frac) * L
    }
    const visivel = (sx: number, margem = 40) => sx > -margem && sx < L + margem

    this.desenharSuperficie(ctx, L, A, perfil)
    this.desenharRaios(ctx, L, A, perfil, agora)
    this.desenharCorais(ctx, L, A, perfil, mundoParaTela, visivel)
    this.desenharAguasVivas(ctx, L, A, perfil, mundoParaTela, visivel)
    this.desenharCardume(ctx, L, A, perfil, mundoParaTela, visivel)
    const alvo = this.desenharFauna(ctx, L, A, perfil, mundoParaTela, visivel, camera)
    this.desenharParticulas(ctx, L, A, perfil, mundoParaTela, visivel)
    this.desenharBioluminescencia(ctx, L, A, perfil, mundoParaTela, visivel, agora)
    this.desenharFarol(ctx, L, A, perfil)
    if (!camera.simples) this.desenharGrao(ctx, L, A)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    registro.aoDesenhar?.({ alvo, profundidade: this.profundidadeAtual })
  }

  private desenharEstatica(ctx: CanvasRenderingContext2D, L: number, A: number) {
    ctx.fillStyle = '#050a0c'
    ctx.fillRect(0, 0, L, A)
    const linhas = 90
    for (let i = 0; i < linhas; i++) {
      const y = Math.random() * A
      const alt = Math.random() * 3
      ctx.fillStyle = `rgba(120, 200, 210, ${Math.random() * 0.32})`
      ctx.fillRect(Math.random() * L - L * 0.2, y, L * (0.3 + Math.random()), alt)
    }
  }

  private desenharSuperficie(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
  ) {
    if (perfil.superficie < 0.02) return
    ctx.globalAlpha *= perfil.superficie
    ctx.beginPath()
    ctx.moveTo(0, 0)
    const base = A * 0.08
    for (let x = 0; x <= L; x += 8) {
      const y =
        base +
        Math.sin(x * 0.03 + this.t * 1.4) * A * 0.02 +
        Math.sin(x * 0.07 - this.t * 0.9) * A * 0.012
      ctx.lineTo(x, y)
    }
    ctx.lineTo(L, 0)
    ctx.closePath()
    ctx.fillStyle = 'rgba(150, 240, 255, 0.22)'
    ctx.fill()
    ctx.globalAlpha /= perfil.superficie
  }

  private desenharRaios(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    agora: number,
  ) {
    if (perfil.raios < 0.02) return
    const raios = this.economizar ? 3 : 6
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < raios; i++) {
      const base = ((i + 0.5) / raios) * L + Math.sin(agora / 3400 + i) * L * 0.06
      const largura = L * 0.07
      const gradiente = ctx.createLinearGradient(0, 0, 0, A * 0.9)
      gradiente.addColorStop(0, `rgba(160, 240, 255, ${0.14 * perfil.raios})`)
      gradiente.addColorStop(1, 'rgba(160, 240, 255, 0)')
      ctx.fillStyle = gradiente
      ctx.beginPath()
      ctx.moveTo(base - largura * 0.3, 0)
      ctx.lineTo(base + largura * 0.3, 0)
      ctx.lineTo(base + largura * 1.6, A * 0.9)
      ctx.lineTo(base - largura * 1.1, A * 0.9)
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  private desenharCorais(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
  ) {
    void L
    if (perfil.corais < 0.02) return
    ctx.strokeStyle = `rgba(30, 120, 130, ${0.55 * perfil.corais})`
    ctx.lineWidth = 2
    for (const coral of this.corais) {
      const sx = projetar(coral.x)
      if (!visivel(sx)) continue
      const base = A
      const alt = coral.altura * A * 2.4
      ctx.beginPath()
      ctx.moveTo(sx, base)
      ctx.lineTo(sx, base - alt)
      for (const [inclinacao, comprimento] of coral.ramos) {
        const y = base - alt * comprimento
        ctx.moveTo(sx, y)
        ctx.lineTo(sx + inclinacao * alt * 0.7, y - alt * 0.35)
      }
      ctx.stroke()
    }
  }

  private desenharAguasVivas(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
  ) {
    void L
    if (perfil.aguasVivas < 0.02) return
    const quantas = Math.round(this.aguasVivas.length * perfil.aguasVivas)
    for (let i = 0; i < quantas; i++) {
      const agua = this.aguasVivas[i]
      const sx = projetar(agua.x)
      if (!visivel(sx)) continue
      const sy = agua.y * A
      const r = agua.escala * A * 0.055 * (1 + Math.sin(this.t * 1.6 + agua.fase) * 0.16)
      ctx.beginPath()
      ctx.arc(sx, sy, r, Math.PI, 0)
      ctx.fillStyle = `rgba(150, 230, 255, ${0.16 * perfil.aguasVivas})`
      ctx.fill()
      ctx.beginPath()
      for (let t = 0; t < 4; t++) {
        const tx = sx - r + (t / 3) * r * 2
        ctx.moveTo(tx, sy)
        ctx.lineTo(tx + Math.sin(this.t * 2 + t + agua.fase) * r * 0.3, sy + r * 1.9)
      }
      ctx.strokeStyle = `rgba(150, 230, 255, ${0.13 * perfil.aguasVivas})`
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  private desenharCardume(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
  ) {
    void L
    if (perfil.cardume < 0.02) return
    const quantos = Math.round(this.peixes.length * perfil.cardume)
    for (let i = 0; i < quantos; i++) {
      const peixe = this.peixes[i]
      const sx = projetar(peixe.x)
      if (!visivel(sx, 20)) continue
      const sy = peixe.y * A
      // z faz o parallax: peixe de trás é menor e mais apagado.
      const escala = (0.5 + peixe.z * 0.8) * (A / 144)
      const alpha = (0.25 + peixe.z * 0.55) * (0.3 + perfil.luz * 0.7)
      const dir = Math.sign(peixe.vx) || 1
      ctx.beginPath()
      ctx.ellipse(sx, sy, 3.4 * escala, 1.5 * escala, 0, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(190, 240, 235, ${alpha})`
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(sx - dir * 3.2 * escala, sy)
      ctx.lineTo(sx - dir * 5.6 * escala, sy - 1.6 * escala)
      ctx.lineTo(sx - dir * 5.6 * escala, sy + 1.6 * escala)
      ctx.closePath()
      ctx.fill()
    }
  }

  private desenharFauna(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
    camera: OpcoesCamera,
  ): Alvo | null {
    let alvo: Alvo | null = null
    let menorDesvio = Infinity
    if (perfil.fauna < 0.05) return null

    for (const f of this.fauna) {
      const sx = projetar(f.x)
      if (!visivel(sx, 120)) continue
      const sy = f.y * A
      const comp = f.escala * A * 0.42
      const alt = comp * f.especie.proporcao
      const dir = Math.sign(f.vx)
      // A opacidade NÃO é multiplicada por perfil.fauna: aquilo é densidade de
      // população, não visibilidade. Lá embaixo aparece menos bicho, mas o que
      // aparece está no facho do farol e tem que ser visto.
      // Piso alto de propósito. A 4500 m a cena inteira é escura, e com alpha
      // baixo o bicho — que é o motivo de a câmera existir — virava um vulto
      // que nem de perto se lia. Debaixo do farol ele é o objeto mais claro do
      // quadro, que é o que acontece de verdade.
      const alpha = Math.min(1, 0.45 + perfil.luz * 0.35 + perfil.farol * 0.35) * f.vida

      ctx.save()
      ctx.translate(sx, sy)
      ctx.scale(dir * (camera.espelhado ? -1 : 1), 1)
      f.especie.desenhar({
        ctx,
        comp,
        alt,
        t: this.t,
        fase: f.fase,
        luz: perfil.luz,
        farol: perfil.farol,
        alpha,
      })
      ctx.restore()

      // O retículo segue o bicho MAIS PERTO DO CENTRO do quadro, não o
      // primeiro da lista: com três na água, "o primeiro" podia estar na borda
      // e a mira ficava apontando pro vazio com o nome dele.
      if (sx > L * 0.08 && sx < L * 0.92 && f.vida > 0.5) {
        const desvio = Math.abs(sx / L - 0.5)
        if (desvio < menorDesvio) {
          menorDesvio = desvio
          alvo = { x: sx / L, y: sy / A, distancia: f.distancia, rotulo: f.especie.rotulo }
        }
      }
    }
    return alvo
  }

  private desenharParticulas(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
  ) {
    void L
    // No mergulho a densidade sobe: é a esteira de bolhas do lastro. Mas só
    // até a metade — a 1.0 são 130 partículas por câmera, e três câmeras
    // desenhando isso custaram 2 fps medidos. O olho não distingue.
    const densidade = Math.max(perfil.bolhas, perfil.neve, this.turbulencia * 0.5)
    if (densidade < 0.02) return
    const bolha = perfil.bolhas > perfil.neve
    let quantas = Math.round(this.particulas.length * densidade)
    if (this.economizar) quantas = quantas >> 1
    ctx.fillStyle = bolha ? 'rgba(200, 250, 255, 0.3)' : 'rgba(215, 235, 240, 0.32)'
    for (let i = 0; i < quantas; i++) {
      const p = this.particulas[i]
      const sx = projetar(p.x)
      if (!visivel(sx, 10)) continue
      ctx.beginPath()
      ctx.arc(sx, p.y * A, p.raio * (A / 144), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private desenharBioluminescencia(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
    agora: number,
  ) {
    void L
    if (perfil.biolum < 0.02) return
    ctx.globalCompositeOperation = 'lighter'
    const quantos = Math.round(this.bioluminescencia.length * perfil.biolum)
    for (let i = 0; i < quantos; i++) {
      const b = this.bioluminescencia[i]
      const sx = projetar(b.x)
      if (!visivel(sx, 10)) continue
      const ciclo = (Math.sin((agora / 1000 / b.periodo) * Math.PI * 2 + b.fase) + 1) / 2
      const brilho = ciclo * ciclo * perfil.biolum
      if (brilho < 0.02) continue
      // O halo era 4x o raio com a escala do mini-feed (A/144). Em tela cheia
      // isso virava bolha de 130 px: a bioluminescência tapava o bicho que a
      // câmera estava justamente apontando. Ponto de luz é faísca, não névoa —
      // daí o halo menor e o núcleo duro.
      const r = b.raio * (A / 200) * (1 + brilho)
      const halo = r * 2.6
      const g = ctx.createRadialGradient(sx, b.y * A, 0, sx, b.y * A, halo)
      g.addColorStop(0, `rgba(130, 255, 220, ${0.6 * brilho})`)
      g.addColorStop(0.36, `rgba(130, 255, 220, ${0.2 * brilho})`)
      g.addColorStop(1, 'rgba(130, 255, 220, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(sx, b.y * A, halo, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgba(214, 255, 240, ${0.85 * brilho})`
      ctx.beginPath()
      ctx.arc(sx, b.y * A, Math.max(0.6, r * 0.34), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  private desenharFarol(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
  ) {
    if (perfil.farol < 0.02) return

    const cx = L * 0.5
    const cy = A * 0.52
    // Escurece o que está FORA do cone.
    //
    // Isto era um retângulo preto a 82% sobre o quadro inteiro — e roda DEPOIS
    // da fauna. O resultado é que a 4500 m o bicho no meio do facho era apagado
    // junto com o fundo: sobrava uma tela preta com manchas. Agora a máscara é
    // radial, transparente no miolo, então o que está sob o farol continua
    // aceso e só as bordas afundam no escuro.
    const escuro = perfil.farol * 0.86
    const alcance = Math.max(L, A) * 0.78
    const mascara = ctx.createRadialGradient(cx, cy, alcance * 0.1, cx, cy, alcance)
    mascara.addColorStop(0, 'rgba(0, 3, 6, 0)')
    mascara.addColorStop(0.42, `rgba(0, 3, 6, ${escuro * 0.3})`)
    mascara.addColorStop(1, `rgba(0, 3, 6, ${escuro})`)
    ctx.fillStyle = mascara
    ctx.fillRect(-4, -4, L + 8, A + 8)

    // O brilho do facho é a luz espalhada pela água, e ela é DISCRETA. A 0.38
    // no miolo ele virava uma névoa branca cobrindo meia tela: o fundo subia
    // até o brilho do bicho e o contraste ia a zero — o bicho estava lá,
    // desenhado, e ninguém via. Cone estreito e fraco devolve o contraste.
    const raio = Math.min(L, A) * 0.55
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, raio)
    g.addColorStop(0, `rgba(200, 245, 255, ${0.15 * perfil.farol})`)
    g.addColorStop(0.3, `rgba(170, 230, 245, ${0.07 * perfil.farol})`)
    g.addColorStop(0.62, `rgba(140, 210, 235, ${0.02 * perfil.farol})`)
    g.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, raio, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }

  /** Grão de vídeo: poucos pontos, redesenhados a cada quadro. */
  private desenharGrao(ctx: CanvasRenderingContext2D, L: number, A: number) {
    const pontos = this.economizar ? 30 : 70
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)'
    for (let i = 0; i < pontos; i++) {
      ctx.fillRect(Math.random() * L, Math.random() * A, 1, 1)
    }
  }

  /** Perda de sinal ocasional, sorteada por feed. */
  static agendarFalha(agora: number) {
    return agora + sorteio(INTERVALO_FALHA[0], INTERVALO_FALHA[1])
  }

  static readonly DURACAO_FALHA = DURACAO_FALHA
}

export { LARGURA_MUNDO, suave }
