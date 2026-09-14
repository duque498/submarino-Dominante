/**
 * Ambiente sonoro: por dentro do casco do Submarino DOMI.
 *
 * O ponto de escuta é a cabine, não a praia. Três coisas definem isso:
 *
 *  1. NADA é brilhante. A água absorve agudo muito rápido, e o casco abafa o
 *     resto — tudo passa por um passa-baixa geral. Foi o que faltava na
 *     primeira versão, que soava como onda quebrando.
 *  2. O que domina é um ZUMBIDO TONAL de maquinário, com uma pulsação lenta de
 *     motor. Ruído sozinho não dá a sensação de estar dentro de uma máquina.
 *  3. O espaço é fechado e metálico: tudo tem uma cauda curta de reverberação,
 *     gerada aqui mesmo.
 *
 * A profundidade é o mesmo input das câmeras: raso tem hélice distante e massa
 * d'água mexendo; fundo tem pressão, casco rangendo e ecos sem origem.
 */

const GANHO_NORMAL = 0.26
const GANHO_ABAFADO = 0.09
const MS_TICK = 260
/** Teto de frequência do ambiente inteiro. Acima disso não soa submerso. */
const CORTE_GERAL = 1500

const sorteio = (min: number, max: number) => min + Math.random() * (max - min)

function suave(inicio: number, fim: number, valor: number): number {
  const t = Math.max(0, Math.min(1, (valor - inicio) / (fim - inicio || 1)))
  return t * t * (3 - 2 * t)
}

/** Ruído marrom: energia concentrada no grave, que é o que soa como água. */
function bufferRuido(ctx: AudioContext, segundos = 5): AudioBuffer {
  const quadros = Math.floor(ctx.sampleRate * segundos)
  const buffer = ctx.createBuffer(1, quadros, ctx.sampleRate)
  const dados = buffer.getChannelData(0)
  let ultimo = 0
  for (let i = 0; i < quadros; i++) {
    ultimo = (ultimo + 0.02 * (Math.random() * 2 - 1)) / 1.02
    dados[i] = ultimo * 3.5
  }
  return buffer
}

/**
 * Resposta ao impulso de um compartimento metálico pequeno: ruído decaindo
 * exponencialmente, já escurecido. Gerar é mais barato que carregar um arquivo
 * e dá o fechamento do espaço, que é metade da sensação de "dentro".
 */
function bufferReverb(ctx: AudioContext): AudioBuffer {
  const dur = 1.4
  const quadros = Math.floor(ctx.sampleRate * dur)
  const buffer = ctx.createBuffer(2, quadros, ctx.sampleRate)
  for (let canal = 0; canal < 2; canal++) {
    const dados = buffer.getChannelData(canal)
    let anterior = 0
    for (let i = 0; i < quadros; i++) {
      const decaimento = Math.pow(1 - i / quadros, 2.6)
      const bruto = (Math.random() * 2 - 1) * decaimento
      // Passa-baixa de um polo: cauda escura, como metal e água.
      anterior = anterior * 0.72 + bruto * 0.28
      dados[i] = anterior
    }
  }
  return buffer
}

type Continua = { ganho: GainNode; filtro: BiquadFilterNode }

export class AmbienteOceano {
  private ctx: AudioContext
  private mestre: GainNode
  /** Tudo entra aqui e sai abafado — é o que faz soar submerso. */
  private entrada: GainNode

  private pressao: Continua | null = null
  private ventilacao: Continua | null = null
  private massaDagua: Continua | null = null
  private drones: Array<{ osc: OscillatorNode; ganho: GainNode }> = []
  private lfo: OscillatorNode | null = null
  private fontes: AudioBufferSourceNode[] = []

  private timer: ReturnType<typeof setInterval> | null = null
  private lerProfundidade: () => number = () => 0
  private ligado = false

  constructor(ctx: AudioContext, destino: AudioNode) {
    this.ctx = ctx
    this.mestre = ctx.createGain()
    this.mestre.gain.value = 0
    this.mestre.connect(destino)

    this.entrada = ctx.createGain()

    const passaBaixa = ctx.createBiquadFilter()
    passaBaixa.type = 'lowpass'
    passaBaixa.frequency.value = CORTE_GERAL
    passaBaixa.Q.value = 0.7
    this.entrada.connect(passaBaixa).connect(this.mestre)

    try {
      const convolver = ctx.createConvolver()
      convolver.buffer = bufferReverb(ctx)
      const envio = ctx.createGain()
      envio.gain.value = 0.3
      this.entrada.connect(envio).connect(convolver).connect(this.mestre)
    } catch {
      // Sem convolver o ambiente continua, só mais seco.
    }
  }

  iniciar(lerProfundidade: () => number) {
    if (this.ligado) return
    this.ligado = true
    this.lerProfundidade = lerProfundidade

    const ruido = bufferRuido(this.ctx)
    const camadaDeRuido = (freq: number, q: number): Continua => {
      const fonte = this.ctx.createBufferSource()
      fonte.buffer = ruido
      fonte.loop = true
      const filtro = this.ctx.createBiquadFilter()
      filtro.type = 'lowpass'
      filtro.frequency.value = freq
      filtro.Q.value = q
      const ganho = this.ctx.createGain()
      ganho.gain.value = 0
      fonte.connect(filtro).connect(ganho).connect(this.entrada)
      fonte.start(this.ctx.currentTime + sorteio(0, 1.5))
      this.fontes.push(fonte)
      return { ganho, filtro }
    }

    // Pressão da coluna d'água contra o casco.
    this.pressao = camadaDeRuido(120, 1.4)
    // Ar circulando na cabine: o chiado constante de qualquer lugar fechado.
    this.ventilacao = camadaDeRuido(520, 0.6)
    // Massa d'água passando por fora.
    this.massaDagua = camadaDeRuido(300, 0.9)

    // Zumbido do maquinário: frequências ligeiramente desafinadas entre si,
    // que é o que faz um motor soar como motor e não como uma nota.
    for (const [freq, nivel] of [
      [51, 0.5],
      [77.5, 0.3],
      [103, 0.16],
      [154.5, 0.07],
    ] as const) {
      const osc = this.ctx.createOscillator()
      const ganho = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq * sorteio(0.997, 1.003)
      ganho.gain.value = nivel
      osc.connect(ganho).connect(this.entrada)
      osc.start(this.ctx.currentTime)
      this.drones.push({ osc, ganho })
    }

    // Pulsação lenta do motor, modulando o zumbido.
    const lfo = this.ctx.createOscillator()
    const profundidadeLfo = this.ctx.createGain()
    lfo.frequency.value = 2.3
    profundidadeLfo.gain.value = 0.12
    lfo.connect(profundidadeLfo)
    for (const drone of this.drones) profundidadeLfo.connect(drone.ganho.gain)
    lfo.start(this.ctx.currentTime)
    this.lfo = lfo

    this.mestre.gain.setTargetAtTime(GANHO_NORMAL, this.ctx.currentTime, 1.5)
    this.timer = setInterval(() => this.tique(), MS_TICK)
    this.tique()
  }

  parar() {
    this.ligado = false
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.mestre.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6)

    const fontes = this.fontes
    const drones = this.drones
    const lfo = this.lfo
    this.fontes = []
    this.drones = []
    this.lfo = null
    setTimeout(() => {
      for (const no of [...fontes, ...drones.map((d) => d.osc), lfo]) {
        try {
          no?.stop()
        } catch {
          // já havia parado
        }
      }
    }, 2500)
  }

  estaLigado() {
    return this.ligado
  }

  abafar(sim: boolean) {
    if (!this.ligado) return
    this.mestre.gain.setTargetAtTime(
      sim ? GANHO_ABAFADO : GANHO_NORMAL,
      this.ctx.currentTime,
      0.35,
    )
  }

  // --- eventos pontuais ----------------------------------------------------

  /** Casco rangendo sob pressão: metal cedendo devagar. */
  private range() {
    const t = this.ctx.currentTime + sorteio(0, 0.3)
    const dur = sorteio(0.9, 2.2)
    const osc = this.ctx.createOscillator()
    const ganho = this.ctx.createGain()
    const ressonancia = this.ctx.createBiquadFilter()
    ressonancia.type = 'bandpass'
    ressonancia.frequency.value = sorteio(110, 240)
    ressonancia.Q.value = 12
    osc.type = 'sawtooth'
    const base = sorteio(44, 82)
    osc.frequency.setValueAtTime(base, t)
    osc.frequency.linearRampToValueAtTime(base * sorteio(1.08, 1.5), t + dur)
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(sorteio(0.1, 0.24), t + dur * 0.45)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(ressonancia).connect(ganho).connect(this.entrada)
    osc.start(t)
    osc.stop(t + dur + 0.1)
  }

  /** Estalo seco de metal: uma válvula, um relé, o casco acomodando. */
  private estaloMetalico() {
    const t = this.ctx.currentTime + sorteio(0, 0.2)
    const osc = this.ctx.createOscillator()
    const ganho = this.ctx.createGain()
    const filtro = this.ctx.createBiquadFilter()
    filtro.type = 'bandpass'
    filtro.frequency.value = sorteio(500, 1100)
    filtro.Q.value = 14
    osc.type = 'square'
    osc.frequency.value = sorteio(160, 420)
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(sorteio(0.08, 0.2), t + 0.003)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + sorteio(0.05, 0.13))
    osc.connect(filtro).connect(ganho).connect(this.entrada)
    osc.start(t)
    osc.stop(t + 0.2)
  }

  /** Gota caindo na cabine. Curto, com a cauda ficando por conta do reverb. */
  private gota() {
    const t = this.ctx.currentTime + sorteio(0, 0.3)
    const osc = this.ctx.createOscillator()
    const ganho = this.ctx.createGain()
    osc.type = 'sine'
    const base = sorteio(620, 1150)
    osc.frequency.setValueAtTime(base, t)
    osc.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.07)
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(0.12, t + 0.004)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    osc.connect(ganho).connect(this.entrada)
    osc.start(t)
    osc.stop(t + 0.2)
  }

  /**
   * Cacho de bolhas subindo pelo casco: vários "glugs" graves em sequência,
   * subindo de tom. Nada de brilho — bolha debaixo d'água é grave e curta.
   */
  private bolhas() {
    const quantas = 3 + Math.floor(Math.random() * 6)
    const inicio = this.ctx.currentTime + sorteio(0, 0.2)
    for (let i = 0; i < quantas; i++) {
      const t = inicio + i * sorteio(0.03, 0.11)
      const osc = this.ctx.createOscillator()
      const ganho = this.ctx.createGain()
      osc.type = 'sine'
      const base = sorteio(150, 380)
      osc.frequency.setValueAtTime(base, t)
      osc.frequency.exponentialRampToValueAtTime(base * sorteio(1.6, 2.6), t + 0.05)
      ganho.gain.setValueAtTime(0.0001, t)
      ganho.gain.exponentialRampToValueAtTime(sorteio(0.05, 0.13), t + 0.005)
      ganho.gain.exponentialRampToValueAtTime(0.0001, t + sorteio(0.05, 0.09))
      osc.connect(ganho).connect(this.entrada)
      osc.start(t)
      osc.stop(t + 0.2)
    }
  }

  /** Hélice de embarcação na superfície: batida grave e regular, ao longe. */
  private helice() {
    const t = this.ctx.currentTime + sorteio(0, 0.3)
    const dur = sorteio(3.5, 7)
    const batidas = Math.floor(dur / 0.17)
    const filtro = this.ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.frequency.value = 220
    const saida = this.ctx.createGain()
    saida.gain.setValueAtTime(0.0001, t)
    saida.gain.exponentialRampToValueAtTime(0.1, t + dur * 0.3)
    saida.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    filtro.connect(saida).connect(this.entrada)

    for (let i = 0; i < batidas; i++) {
      const tb = t + i * 0.17
      const osc = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = sorteio(58, 74)
      g.gain.setValueAtTime(0.0001, tb)
      g.gain.exponentialRampToValueAtTime(0.5, tb + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, tb + 0.14)
      osc.connect(g).connect(filtro)
      osc.start(tb)
      osc.stop(tb + 0.2)
    }
  }

  /** Canto de cetáceo, ouvido de longe: grave, lento e muito abafado. */
  private canto() {
    const t = this.ctx.currentTime + sorteio(0, 0.5)
    const dur = sorteio(2.4, 5)
    const osc = this.ctx.createOscillator()
    const ganho = this.ctx.createGain()
    const filtro = this.ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.frequency.value = 340
    osc.type = 'sine'
    const inicio = sorteio(90, 210)
    osc.frequency.setValueAtTime(inicio, t)
    osc.frequency.exponentialRampToValueAtTime(inicio * sorteio(0.45, 2.3), t + dur * 0.65)
    osc.frequency.exponentialRampToValueAtTime(inicio * 0.85, t + dur)
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(sorteio(0.1, 0.2), t + dur * 0.3)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(filtro).connect(ganho).connect(this.entrada)
    osc.start(t)
    osc.stop(t + dur + 0.2)
  }

  /** Ping sem origem, vindo do escuro. Só o reverb dá a cauda. */
  private ecoDistante() {
    const t = this.ctx.currentTime + sorteio(0, 0.3)
    const osc = this.ctx.createOscillator()
    const ganho = this.ctx.createGain()
    const filtro = this.ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.frequency.value = 700
    osc.type = 'sine'
    osc.frequency.setValueAtTime(sorteio(280, 480), t)
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(0.09, t + 0.04)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 1.2)
    osc.connect(filtro).connect(ganho).connect(this.entrada)
    osc.start(t)
    osc.stop(t + 1.4)
  }

  /** Ajusta as camadas contínuas e sorteia os eventos da profundidade atual. */
  private tique() {
    if (!this.pressao || !this.ventilacao || !this.massaDagua) return
    const m = this.lerProfundidade()
    const agora = this.ctx.currentTime

    const fundo = suave(200, 2400, m)
    const raso = 1 - suave(80, 600, m)

    // Pressão sobe e escurece conforme desce.
    this.pressao.ganho.gain.setTargetAtTime(0.35 + fundo * 1.1, agora, 1.2)
    this.pressao.filtro.frequency.setTargetAtTime(130 - fundo * 55, agora, 1.2)

    // Ventilação é constante: é a cabine, não o mar.
    this.ventilacao.ganho.gain.setTargetAtTime(0.26, agora, 1.2)

    // Massa d'água por fora: mais presente perto da superfície, onde tem
    // movimento; no fundo a água é parada.
    this.massaDagua.ganho.gain.setTargetAtTime(0.18 + raso * 0.5, agora, 1.2)
    this.massaDagua.filtro.frequency.setTargetAtTime(240 + raso * 260, agora, 1.2)

    // O maquinário trabalha mais fundo: o zumbido engrossa.
    for (const drone of this.drones) {
      drone.osc.detune.setTargetAtTime(fundo * -55, agora, 2)
    }

    // Eventos. As probabilidades são por tique (260 ms).
    if (Math.random() < 0.02 + fundo * 0.05) this.estaloMetalico()
    if (Math.random() < fundo * 0.035) this.range()
    if (Math.random() < 0.006 + fundo * 0.012) this.gota()
    if (Math.random() < raso * 0.045) this.bolhas()
    if (Math.random() < raso * 0.006) this.helice()

    const zonaCanto = suave(60, 400, m) * (1 - suave(1400, 3200, m))
    if (Math.random() < zonaCanto * 0.02) this.canto()
    if (Math.random() < suave(1200, 3800, m) * 0.022) this.ecoDistante()
  }
}
