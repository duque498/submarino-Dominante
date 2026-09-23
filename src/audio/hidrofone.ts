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

/**
 * Tamanho do laco da chuva.
 *
 * Quatro segundos e nao dois: com gotas esparsas e sorteadas, um laco curto
 * repete o MESMO desenho de gotas e o ouvido pega o loop em poucos ciclos.
 */
const CHUVA_MS = 4000
const NAVIO_HZ_HELICE = 1.5
/** Silencio entre frases. Parte do som: sem ele o canto vira sirene. */
const BALEIA_PAUSA = 0.8

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

  // Gotas ESPARSAS e sorteadas, não um pulso a cada 1,2 ms fixo.
  //
  // A primeira versão soava como chiado de rádio: os pulsos eram tão juntos e
  // tão regulares que se fundiam numa parede de ruído. Chuva se reconhece pelo
  // CREPITAR — impactos separados, de tamanhos diferentes, chegando fora de
  // compasso. Agora cada gota tem início sorteado, força própria e cauda
  // própria, e entre elas há silêncio de verdade.
  const gotas = Math.floor(ctx.sampleRate * segundos * 0.02)
  for (let n = 0; n < gotas; n++) {
    const inicio = Math.floor(Math.random() * dados.length)
    const forca = 0.25 + Math.random() * 0.75
    const tamanho = Math.floor(ctx.sampleRate * (0.0008 + Math.random() * 0.004))
    for (let i = 0; i < tamanho && inicio + i < dados.length; i++) {
      dados[inicio + i] += (Math.random() * 2 - 1) * forca * Math.exp((-i / tamanho) * 5)
    }
  }
  // Um fundo baixo de chuva distante, pra as gotas não flutuarem no vazio.
  for (let i = 0; i < dados.length; i++) {
    dados[i] += (Math.random() * 2 - 1) * 0.12
  }

  // Saturação suave e depois normalização, em vez de cortar em ±1.
  //
  // As gotas são SOMADAS no buffer, e onde duas caem juntas o valor passa de
  // 1: medido, o pico chegava a 1,53. Ceifar transformaria justamente as gotas
  // mais fortes — as que fazem o som ser reconhecível — em estalo de
  // distorção.
  //
  // E só normalizar não bastava: chuva tem fator de crista alto (medido: 10),
  // então baixar o pico pra 0,95 deixava a MÉDIA em 0,09 e o som sumia ao lado
  // dos outros dois. A tangente hiperbólica arredonda as gotas fora de série e
  // sobe o corpo sem tocar no crepitar.
  let pico = 0
  for (let i = 0; i < dados.length; i++) {
    dados[i] = Math.tanh(dados[i] * 2.1)
    pico = Math.max(pico, Math.abs(dados[i]))
  }
  if (pico > 0) {
    const escala = 0.95 / pico
    for (let i = 0; i < dados.length; i++) dados[i] *= escala
  }

  const fonte = ctx.createBufferSource()
  fonte.buffer = buffer
  fonte.loop = true

  // Passa-alta em vez de passa-banda: a gota tem energia de 2 kHz pra cima, e
  // o passa-banda estreito de antes tirava justamente o estalo do impacto.
  const agudos = ctx.createBiquadFilter()
  agudos.type = 'highpass'
  agudos.frequency.value = 1800
  agudos.Q.value = 0.7

  const teto = ctx.createBiquadFilter()
  teto.type = 'lowpass'
  teto.frequency.value = 9000
  // Butterworth: o Q padrão de 1 põe uma ressonância bem em cima da faixa onde
  // a gota tem mais energia, e ela sozinha empurrava o pico acima de 1.
  teto.Q.value = 0.707

  // Ganho baixo de propósito. O compressor da saída de efeitos ataca em 3 ms e
  // a gota dura 1 a 4 ms: ele NÃO pega esses picos (medido: com ganho alto o
  // pico ficava em 1,37 mesmo depois do compressor, ou seja, ceifado na saída).
  // Quem segura a chuva é o ganho na fonte.
  const ganho = ctx.createGain()
  ganho.gain.value = 0.62

  fonte.connect(agudos).connect(teto).connect(ganho).connect(destino)
  fonte.start()
  return {
    saida: ganho,
    parar: () => {
      try {
        fonte.stop()
      } catch {
        /* ja parou */
      }
      for (const no of [fonte, agudos, teto, ganho]) no.disconnect()
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

  // Passa-banda estreito no lugar do passa-baixa: o ruido de casco vira uma
  // FAIXA grave definida em vez de um rumor sem altura, e e essa altura que o
  // ouvido lê como "motor grande" e não como "vento".
  const casco = ctx.createBiquadFilter()
  casco.type = 'lowpass'
  casco.frequency.value = 260
  casco.Q.value = 3

  // Batida da hélice quase até o silêncio entre as pás.
  //
  // Antes ela oscilava de 0,13 a 0,97 do nível e o resultado era um zumbido
  // ondulado. O que entrega um navio é o CHOP: cada pá bate, e entre uma e
  // outra o som cai de verdade. Modulação quase total, e um oscilador exato —
  // bicho nenhum bate tão certo.
  const helice = ctx.createGain()
  helice.gain.value = 0.5
  const lfo = ctx.createOscillator()
  lfo.type = 'triangle'
  lfo.frequency.value = NAVIO_HZ_HELICE
  const profundidade = ctx.createGain()
  profundidade.gain.value = 0.46
  lfo.connect(profundidade).connect(helice.gain)

  // Motor: fundamental e dois harmônicos, que é o que faz soar maquinário e
  // não nota de sintetizador.
  const ganho = ctx.createGain()
  ganho.gain.value = 1.92
  const osciladores: OscillatorNode[] = []
  const nos: AudioNode[] = []
  for (const [hz, pico] of [
    [55, 0.22],
    [110, 0.12],
    [165, 0.05],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = hz
    const corte = ctx.createBiquadFilter()
    corte.type = 'lowpass'
    corte.frequency.value = 600
    const g = ctx.createGain()
    g.gain.value = pico
    // Pelo MODULADOR, não direto na saída.
    //
    // Medido: com o motor entrando por fora, a modulação do envelope de 20 ms
    // ficava em 1,4 — ou seja, não havia batida nenhuma. O tom contínuo
    // preenchia exatamente os vales entre as pás, que são o que identifica uma
    // hélice. Passando por dentro, o som inteiro pulsa.
    osc.connect(corte).connect(g).connect(helice)
    osc.start()
    osciladores.push(osc)
    nos.push(corte, g)
  }

  fonte.connect(casco).connect(helice).connect(ganho)
  ganho.connect(destino)

  fonte.start()
  lfo.start()
  return {
    saida: ganho,
    parar: () => {
      for (const no of [fonte, lfo, ...osciladores]) {
        try {
          no.stop()
        } catch {
          /* ja parou */
        }
      }
      for (const no of [fonte, casco, helice, lfo, profundidade, ganho, ...osciladores, ...nos]) {
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
  ganho.gain.value = 0.78

  // Reverberação MENOR que antes (70% molhado virava sopa: a cauda de uma
  // frase cobria o ataque da seguinte, e o glissando — que é o traço que
  // identifica o canto — se perdia no meio).
  const reverb = ctx.createConvolver()
  reverb.buffer = cauda(ctx, 2.4)
  const molhado = ctx.createGain()
  molhado.gain.value = 0.32
  const seco = ctx.createGain()
  seco.gain.value = 1
  ganho.connect(seco).connect(destino)
  ganho.connect(reverb).connect(molhado).connect(destino)

  let vivo = true
  let agendado = 0
  const nos: AudioScheduledSourceNode[] = []

  /**
   * Uma frase: sobe, segura no topo e cai.
   *
   * O patamar no topo é novo e é o que faz soar canto em vez de sirene: um
   * glissando que sobe e desce sem parar é um varrimento eletrônico. A baleia
   * SUSTENTA a nota lá em cima.
   */
  const frase = (quando: number): number => {
    const base = 150 + Math.random() * 60
    const topo = base * (3.2 + Math.random() * 1.2)
    const subida = 1.1 + Math.random() * 0.4
    const patamar = 0.5 + Math.random() * 0.5
    const queda = 0.9 + Math.random() * 0.4
    const total = subida + patamar + queda

    for (const [mult, pico] of [
      [1, 0.52],
      [2, 0.2],
      [3, 0.08],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(base * mult, quando)
      osc.frequency.exponentialRampToValueAtTime(topo * mult, quando + subida)
      osc.frequency.setValueAtTime(topo * mult, quando + subida + patamar)
      osc.frequency.exponentialRampToValueAtTime(base * 0.8 * mult, quando + total)

      const env = ctx.createGain()
      env.gain.setValueAtTime(0.0001, quando)
      env.gain.exponentialRampToValueAtTime(pico, quando + 0.18)
      env.gain.setValueAtTime(pico, quando + total - 0.35)
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
