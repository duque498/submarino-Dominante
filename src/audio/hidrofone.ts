/**
 * Os tres sons do hidrofone, sintetizados em Web Audio.
 *
 * Nao sao efeitos: sao o CONTEUDO da dinamica. A plateia vai gritar o nome do
 * que esta ouvindo, entao cada um precisa ser reconhecivel sozinho, alto e em
 * loop, numa caixa de som de quadra. Por isso cada um e construido em cima do
 * unico tracinho que o identifica:
 *
 *   chuva  — milhares de micro-impactos agudos, sem altura definida;
 *   navio  — grave continuo batendo no ritmo da helice;
 *   baleia — glissando longo, com harmonicos e cauda de reverberacao.
 *
 * Se existir mp3 em public/audio/sfx/hidro-<id>.mp3, o AudioEngine prefere o
 * arquivo: o sintetico e o plano que funciona sem ninguem baixar nada.
 */

export type SomTocando = {
  /** O sinal ja misturado, antes da saida: e daqui que sai o espectrograma. */
  saida: AudioNode
  parar(): void
}

const CHUVA_MS = 2200
const NAVIO_HZ_HELICE = 1.5
const BALEIA_PAUSA = 1.1

function ruidoBranco(ctx: AudioContext, segundos: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * segundos), ctx.sampleRate)
  const dados = buffer.getChannelData(0)
  for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1
  return buffer
}

/**
 * Chuva: ruido de banda larga na faixa da gota (3-6 kHz) com a amplitude
 * chacoalhando depressa.
 *
 * A granulacao nao vem de disparar mil fontes — isso derrubaria o quadro. Vem
 * de um buffer de ruido ja MULTIPLICADO por micro-envelopes na geracao: o
 * custo e uma vez so, na entrada da cena, e o loop depois e de graca.
 */
function chuva(ctx: AudioContext, destino: AudioNode): SomTocando {
  const segundos = CHUVA_MS / 1000
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * segundos), ctx.sampleRate)
  const dados = buffer.getChannelData(0)
  for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1
  // Micro-pulsos: uma gota a cada ~1,2 ms, com queda exponencial propria.
  const passo = Math.floor(ctx.sampleRate * 0.0012)
  for (let inicio = 0; inicio < dados.length; inicio += passo) {
    const forca = 0.35 + Math.random() * 0.65
    const decaimento = 1 / (passo * (0.4 + Math.random() * 0.8))
    for (let i = 0; i < passo && inicio + i < dados.length; i++) {
      dados[inicio + i] *= forca * Math.exp(-i * decaimento)
    }
  }

  const fonte = ctx.createBufferSource()
  fonte.buffer = buffer
  fonte.loop = true

  const passaBanda = ctx.createBiquadFilter()
  passaBanda.type = 'bandpass'
  passaBanda.frequency.value = 4200
  passaBanda.Q.value = 0.7

  const ganho = ctx.createGain()
  ganho.gain.value = 0.9

  fonte.connect(passaBanda).connect(ganho).connect(destino)
  fonte.start()
  return {
    saida: ganho,
    parar: () => {
      try {
        fonte.stop()
      } catch {
        /* ja parou */
      }
      fonte.disconnect()
      passaBanda.disconnect()
      ganho.disconnect()
    },
  }
}

/**
 * Navio: grave de casco (ruido cortado em 200 Hz) pulsando no giro da helice,
 * mais o tom fixo do motor.
 *
 * O que entrega a maquina e a REGULARIDADE — som de bicho nunca bate tao
 * certo. Por isso a modulacao e um oscilador exato a 1,5 Hz e nao um envelope
 * sorteado.
 */
function navio(ctx: AudioContext, destino: AudioNode): SomTocando {
  const fonte = ctx.createBufferSource()
  fonte.buffer = ruidoBranco(ctx, 3)
  fonte.loop = true

  const grave = ctx.createBiquadFilter()
  grave.type = 'lowpass'
  grave.frequency.value = 200
  grave.Q.value = 1.2

  const helice = ctx.createGain()
  helice.gain.value = 0.55
  const lfo = ctx.createOscillator()
  lfo.frequency.value = NAVIO_HZ_HELICE
  const profundidade = ctx.createGain()
  profundidade.gain.value = 0.42
  lfo.connect(profundidade).connect(helice.gain)

  const motor = ctx.createOscillator()
  motor.type = 'sawtooth'
  motor.frequency.value = 60
  const ganhoMotor = ctx.createGain()
  ganhoMotor.gain.value = 0.16
  const corteMotor = ctx.createBiquadFilter()
  corteMotor.type = 'lowpass'
  corteMotor.frequency.value = 420

  const ganho = ctx.createGain()
  ganho.gain.value = 1

  fonte.connect(grave).connect(helice).connect(ganho)
  motor.connect(corteMotor).connect(ganhoMotor).connect(ganho)
  ganho.connect(destino)

  fonte.start()
  lfo.start()
  motor.start()
  return {
    saida: ganho,
    parar: () => {
      for (const no of [fonte, lfo, motor]) {
        try {
          no.stop()
        } catch {
          /* ja parou */
        }
      }
      for (const no of [fonte, grave, helice, lfo, profundidade, motor, corteMotor, ganhoMotor, ganho]) {
        no.disconnect()
      }
    },
  }
}

/** Cauda de reverberacao: ruido decaindo, convoluido com a voz da baleia. */
function cauda(ctx: AudioContext, segundos: number): AudioBuffer {
  const buffer = ctx.createBuffer(2, Math.floor(ctx.sampleRate * segundos), ctx.sampleRate)
  for (let canal = 0; canal < 2; canal++) {
    const dados = buffer.getChannelData(canal)
    for (let i = 0; i < dados.length; i++) {
      dados[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / dados.length, 2.4)
    }
  }
  return buffer
}

/**
 * Baleia: frases de glissando com harmonicos, separadas por silencio.
 *
 * O silencio entre as frases e parte do som. Um glissando continuo vira
 * sirene; o que faz a plateia dizer "baleia" e a frase que sobe, para, e
 * volta noutra altura.
 */
function baleia(ctx: AudioContext, destino: AudioNode): SomTocando {
  const ganho = ctx.createGain()
  ganho.gain.value = 0.9

  const reverb = ctx.createConvolver()
  reverb.buffer = cauda(ctx, 3.2)
  const molhado = ctx.createGain()
  molhado.gain.value = 0.7
  const seco = ctx.createGain()
  seco.gain.value = 0.75
  ganho.connect(seco).connect(destino)
  ganho.connect(reverb).connect(molhado).connect(destino)

  let vivo = true
  let agendado = 0
  const nos: AudioScheduledSourceNode[] = []

  /** Uma frase: fundamental subindo e caindo, mais dois harmonicos. */
  const frase = (quando: number): number => {
    const base = 180 + Math.random() * 90
    const topo = base * (2.6 + Math.random() * 1.2)
    const subida = 1.6 + Math.random() * 0.8
    const queda = 1.1 + Math.random() * 0.6
    const total = subida + queda

    for (const [mult, pico] of [
      [1, 0.5],
      [2, 0.16],
      [3, 0.07],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(base * mult, quando)
      osc.frequency.exponentialRampToValueAtTime(topo * mult, quando + subida)
      osc.frequency.exponentialRampToValueAtTime(base * 0.85 * mult, quando + total)

      const env = ctx.createGain()
      env.gain.setValueAtTime(0.0001, quando)
      env.gain.exponentialRampToValueAtTime(pico, quando + 0.25)
      env.gain.setValueAtTime(pico, quando + total - 0.4)
      env.gain.exponentialRampToValueAtTime(0.0001, quando + total)

      osc.connect(env).connect(ganho)
      osc.start(quando)
      osc.stop(quando + total + 0.05)
      osc.onended = () => {
        osc.disconnect()
        env.disconnect()
      }
      nos.push(osc)
    }
    return total + BALEIA_PAUSA
  }

  // Agenda com folga e reagenda antes de acabar: agendar tudo de uma vez
  // amarraria a cena a um numero de frases, e ela dura o que a plateia levar.
  const abastecer = () => {
    if (!vivo) return
    const agora = ctx.currentTime
    if (agendado < agora + 1) agendado = agora + 0.1
    while (agendado < agora + 6) agendado += frase(agendado)
    timer = window.setTimeout(abastecer, 2000)
  }
  let timer = 0
  abastecer()

  return {
    saida: ganho,
    parar: () => {
      vivo = false
      clearTimeout(timer)
      for (const no of nos) {
        try {
          no.stop()
        } catch {
          /* ja terminou */
        }
      }
      for (const no of [ganho, reverb, molhado, seco]) no.disconnect()
    },
  }
}

const SINTETIZADORES: Record<string, (ctx: AudioContext, destino: AudioNode) => SomTocando> = {
  chuva,
  navio,
  baleia,
}

export function idSintetizado(id: string): boolean {
  return id in SINTETIZADORES
}

export function tocarSomDoHidrofone(
  ctx: AudioContext,
  destino: AudioNode,
  id: string,
): SomTocando | null {
  const sintetizar = SINTETIZADORES[id]
  return sintetizar ? sintetizar(ctx, destino) : null
}
