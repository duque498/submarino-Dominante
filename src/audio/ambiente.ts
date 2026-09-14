/**
 * Ambiente sonoro do oceano, sintetizado e contínuo.
 *
 * Mesma ideia das câmeras: a profundidade é o único input. Perto da superfície
 * é água mexendo, bolhas e estalo de recife; fundo é pressão, casco rangendo e
 * canto distante. Tudo procedural — não existe loop de arquivo, então nunca
 * dá pra ouvir a emenda repetindo.
 *
 * Volume calibrado pra ficar SOB a voz da IA: quando ela fala, o ambiente
 * abaixa sozinho.
 */

/** Volume normal e volume enquanto a IA fala. */
const GANHO_NORMAL = 0.22
const GANHO_ABAFADO = 0.08
/** De quanto em quanto o agendador acorda pra sortear eventos. */
const MS_TICK = 260

const sorteio = (min: number, max: number) => min + Math.random() * (max - min)

/** Interpolação suave, igual à do perfil das câmeras. */
function suave(inicio: number, fim: number, valor: number): number {
  const t = Math.max(0, Math.min(1, (valor - inicio) / (fim - inicio || 1)))
  return t * t * (3 - 2 * t)
}

function bufferRuido(ctx: AudioContext, segundos = 4): AudioBuffer {
  const quadros = Math.floor(ctx.sampleRate * segundos)
  const buffer = ctx.createBuffer(1, quadros, ctx.sampleRate)
  const dados = buffer.getChannelData(0)
  // Ruído marrom: mais grave que o branco, que é o que soa como água/pressão.
  let ultimo = 0
  for (let i = 0; i < quadros; i++) {
    const branco = Math.random() * 2 - 1
    ultimo = (ultimo + 0.02 * branco) / 1.02
    dados[i] = ultimo * 3.5
  }
  return buffer
}

type Camada = { fonte: AudioBufferSourceNode; filtro: BiquadFilterNode; ganho: GainNode }

export class AmbienteOceano {
  private ctx: AudioContext
  private mestre: GainNode
  private camadas: Record<'pressao' | 'agua', Camada> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private lerProfundidade: () => number = () => 0
  private ligado = false

  constructor(ctx: AudioContext, destino: AudioNode) {
    this.ctx = ctx
    this.mestre = ctx.createGain()
    this.mestre.gain.value = 0
    this.mestre.connect(destino)
  }

  /** Cria as camadas contínuas e começa a sortear os eventos pontuais. */
  iniciar(lerProfundidade: () => number) {
    if (this.ligado) return
    this.ligado = true
    this.lerProfundidade = lerProfundidade

    const ruido = bufferRuido(this.ctx)
    const montar = (tipo: BiquadFilterType, freq: number, q: number): Camada => {
      const fonte = this.ctx.createBufferSource()
      fonte.buffer = ruido
      fonte.loop = true
      const filtro = this.ctx.createBiquadFilter()
      filtro.type = tipo
      filtro.frequency.value = freq
      filtro.Q.value = q
      const ganho = this.ctx.createGain()
      ganho.gain.value = 0
      fonte.connect(filtro).connect(ganho).connect(this.mestre)
      fonte.start(this.ctx.currentTime + sorteio(0, 1))
      return { fonte, filtro, ganho }
    }

    this.camadas = {
      // Zumbido de pressão: sempre presente, mais forte no fundo.
      pressao: montar('lowpass', 180, 1.2),
      // Água mexendo e correnteza: some conforme desce.
      agua: montar('bandpass', 700, 0.6),
    }

    this.mestre.gain.setTargetAtTime(GANHO_NORMAL, this.ctx.currentTime, 1.5)
    this.timer = setInterval(() => this.tique(), MS_TICK)
    this.tique()
  }

  parar() {
    this.ligado = false
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.mestre.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6)
    const camadas = this.camadas
    this.camadas = null
    setTimeout(() => {
      if (!camadas) return
      for (const camada of Object.values(camadas)) {
        try {
          camada.fonte.stop()
        } catch {
          // já havia parado
        }
      }
    }, 2500)
  }

  estaLigado() {
    return this.ligado
  }

  /** A IA falando tem prioridade: o ambiente recua. */
  abafar(sim: boolean) {
    if (!this.ligado) return
    this.mestre.gain.setTargetAtTime(
      sim ? GANHO_ABAFADO : GANHO_NORMAL,
      this.ctx.currentTime,
      0.35,
    )
  }

  // --- eventos pontuais ----------------------------------------------------

  /** Estalo curto: bolha subindo ou estalo de recife. */
  private estalo(agudo: boolean) {
    const t = this.ctx.currentTime + sorteio(0, 0.2)
    const osc = this.ctx.createOscillator()
    const ganho = this.ctx.createGain()
    osc.type = 'sine'
    const base = agudo ? sorteio(1400, 3200) : sorteio(320, 700)
    osc.frequency.setValueAtTime(base, t)
    // A bolha sobe de tom; o estalo de recife cai.
    osc.frequency.exponentialRampToValueAtTime(agudo ? base * 0.4 : base * 1.8, t + 0.06)
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(sorteio(0.05, 0.16), t + 0.005)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + sorteio(0.05, 0.12))
    osc.connect(ganho).connect(this.mestre)
    osc.start(t)
    osc.stop(t + 0.2)
  }

  /** Canto distante: uma glissada lenta, como um cetáceo longe. */
  private canto() {
    const t = this.ctx.currentTime + sorteio(0, 0.4)
    const dur = sorteio(1.6, 3.4)
    const osc = this.ctx.createOscillator()
    const ganho = this.ctx.createGain()
    const filtro = this.ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.frequency.value = 900
    osc.type = 'sine'
    const inicio = sorteio(140, 320)
    osc.frequency.setValueAtTime(inicio, t)
    osc.frequency.exponentialRampToValueAtTime(inicio * sorteio(0.5, 2.1), t + dur * 0.7)
    osc.frequency.exponentialRampToValueAtTime(inicio * 0.8, t + dur)
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(sorteio(0.06, 0.13), t + dur * 0.25)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(filtro).connect(ganho).connect(this.mestre)
    osc.start(t)
    osc.stop(t + dur + 0.1)
  }

  /** Casco rangendo sob pressão: grave, lento, com um quê de metal. */
  private range() {
    const t = this.ctx.currentTime + sorteio(0, 0.3)
    const dur = sorteio(0.7, 1.8)
    const osc = this.ctx.createOscillator()
    const ganho = this.ctx.createGain()
    const filtro = this.ctx.createBiquadFilter()
    filtro.type = 'bandpass'
    filtro.frequency.value = sorteio(120, 260)
    filtro.Q.value = 8
    osc.type = 'sawtooth'
    const base = sorteio(52, 96)
    osc.frequency.setValueAtTime(base, t)
    osc.frequency.linearRampToValueAtTime(base * sorteio(1.05, 1.4), t + dur)
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(sorteio(0.05, 0.12), t + dur * 0.4)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(filtro).connect(ganho).connect(this.mestre)
    osc.start(t)
    osc.stop(t + dur + 0.1)
  }

  /** Eco distante do abisso: um ping sem origem. */
  private ecoDistante() {
    const t = this.ctx.currentTime + sorteio(0, 0.3)
    const osc = this.ctx.createOscillator()
    const ganho = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(sorteio(380, 620), t)
    ganho.gain.setValueAtTime(0.0001, t)
    ganho.gain.exponentialRampToValueAtTime(0.05, t + 0.03)
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
    osc.connect(ganho).connect(this.mestre)
    osc.start(t)
    osc.stop(t + 1.5)
  }

  /**
   * Ajusta as camadas contínuas à profundidade e sorteia os eventos do momento.
   * As probabilidades são por tique (a cada 260 ms).
   */
  private tique() {
    if (!this.camadas) return
    const m = this.lerProfundidade()
    const agora = this.ctx.currentTime

    const fundo = suave(200, 2200, m)
    const raso = 1 - suave(60, 500, m)

    // Pressão: sobe com a profundidade e vai ficando mais grave.
    this.camadas.pressao.ganho.gain.setTargetAtTime(0.5 + fundo * 0.9, agora, 1.2)
    this.camadas.pressao.filtro.frequency.setTargetAtTime(190 - fundo * 110, agora, 1.2)

    // Água mexendo: coisa de superfície.
    this.camadas.agua.ganho.gain.setTargetAtTime(raso * 0.5, agora, 1.2)
    this.camadas.agua.filtro.frequency.setTargetAtTime(500 + raso * 900, agora, 1.2)

    // Bolhas e estalos de recife: só na zona iluminada.
    if (Math.random() < raso * 0.35) this.estalo(true)
    if (Math.random() < raso * 0.22) this.estalo(false)

    // Canto de cetáceo: some no abisso.
    const zonaCanto = suave(40, 300, m) * (1 - suave(1200, 3000, m))
    if (Math.random() < zonaCanto * 0.022) this.canto()

    // Casco rangendo: quanto mais fundo, mais frequente.
    if (Math.random() < fundo * 0.03) this.range()

    // Eco sem origem, só no fundo de verdade.
    if (Math.random() < suave(1500, 4000, m) * 0.02) this.ecoDistante()
  }
}
