/**
 * Efeitos sonoros sintetizados na hora, via Web Audio.
 *
 * O projeto roda completo sem nenhum mp3 de efeito: não dá pra depender de o
 * professor baixar arquivos do freesound na véspera da feira.
 *
 * Dá pra trocar por arquivo de verdade: jogue o mp3 em public/audio/sfx/ com o
 * nome do efeito e rode `python3 scripts/gerar_audios.py` de novo. O segundo
 * passo não é opcional — é ele que embute o arquivo no audios.js, e o player
 * só considera efeito que esteja embutido (por file:// um caminho solto não é
 * confiável, e pedir arquivo inexistente suja o console).
 */

export type NomeSfx =
  | 'sonar'
  | 'alarme'
  | 'estatica'
  | 'ok'
  | 'pressurizacao'
  | 'bipe-timer'
  | 'casco'
  | 'vidro'
  | 'pulso'
  | 'impacto'
  | 'presenca'
  | 'whoosh'
  | 'agua'

/** Solta os nós quando o som acaba, pra não acumular no grafo. */
function limpar(fonte: AudioScheduledSourceNode, ...nos: AudioNode[]) {
  fonte.onended = () => {
    fonte.disconnect()
    for (const no of nos) no.disconnect()
  }
}

/** Envelope com ataque curto e queda exponencial. */
function envelope(
  ganho: GainNode,
  agora: number,
  pico: number,
  ataque: number,
  duracao: number,
) {
  ganho.gain.setValueAtTime(0.0001, agora)
  ganho.gain.exponentialRampToValueAtTime(pico, agora + ataque)
  ganho.gain.exponentialRampToValueAtTime(0.0001, agora + duracao)
}

function tom(
  ctx: AudioContext,
  destino: AudioNode,
  frequencia: number,
  inicio: number,
  duracao: number,
  pico = 0.55,
  tipo: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator()
  const ganho = ctx.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(frequencia, inicio)
  envelope(ganho, inicio, pico, 0.008, duracao)
  osc.connect(ganho).connect(destino)
  limpar(osc, ganho)
  osc.start(inicio)
  osc.stop(inicio + duracao + 0.05)
}

/** Ruído branco, reaproveitado entre os efeitos que precisam dele. */
let bufferRuido: AudioBuffer | null = null
function ruido(ctx: AudioContext): AudioBuffer {
  if (bufferRuido && bufferRuido.sampleRate === ctx.sampleRate) return bufferRuido
  const quadros = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, quadros, ctx.sampleRate)
  const dados = buffer.getChannelData(0)
  for (let i = 0; i < quadros; i++) dados[i] = Math.random() * 2 - 1
  bufferRuido = buffer
  return buffer
}

function fonteDeRuido(ctx: AudioContext): AudioBufferSourceNode {
  const fonte = ctx.createBufferSource()
  fonte.buffer = ruido(ctx)
  fonte.loop = true
  return fonte
}

/** Ping de sonar: seno grave com queda longa e um eco. */
function sonar(ctx: AudioContext, destino: AudioNode, t: number) {
  const eco = ctx.createDelay(1)
  eco.delayTime.value = 0.26
  const ganhoEco = ctx.createGain()
  ganhoEco.gain.value = 0.34
  eco.connect(ganhoEco).connect(destino)
  // Realimenta uma vez só: eco de gruta, não de catedral.
  const eco2 = ctx.createDelay(1)
  eco2.delayTime.value = 0.26
  const ganhoEco2 = ctx.createGain()
  ganhoEco2.gain.value = 0.16
  ganhoEco.connect(eco2).connect(ganhoEco2).connect(destino)

  const osc = ctx.createOscillator()
  const ganho = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(820, t)
  osc.frequency.exponentialRampToValueAtTime(760, t + 0.6)
  envelope(ganho, t, 0.7, 0.005, 0.7)
  osc.connect(ganho)
  ganho.connect(destino)
  ganho.connect(eco)
  limpar(osc, ganho, eco, ganhoEco, eco2, ganhoEco2)
  osc.start(t)
  osc.stop(t + 0.8)
}

/** Alarme: dois tons alternando, três vezes. */
function alarme(ctx: AudioContext, destino: AudioNode, t: number) {
  for (let i = 0; i < 3; i++) {
    tom(ctx, destino, 880, t + i * 0.42, 0.18, 0.5, 'square')
    tom(ctx, destino, 620, t + i * 0.42 + 0.21, 0.18, 0.5, 'square')
  }
}

/** Estática: ruído branco passando por um filtro de rádio. */
function estatica(ctx: AudioContext, destino: AudioNode, t: number) {
  const fonte = fonteDeRuido(ctx)
  const passa = ctx.createBiquadFilter()
  passa.type = 'bandpass'
  passa.frequency.value = 1800
  passa.Q.value = 0.7
  const ganho = ctx.createGain()
  envelope(ganho, t, 1.0, 0.01, 0.34)
  fonte.connect(passa).connect(ganho).connect(destino)
  limpar(fonte, passa, ganho)
  fonte.start(t)
  fonte.stop(t + 0.4)
}

/** Confirmação: dois bipes curtos ascendentes. */
function ok(ctx: AudioContext, destino: AudioNode, t: number) {
  tom(ctx, destino, 880, t, 0.07, 0.6)
  tom(ctx, destino, 1320, t + 0.09, 0.09, 0.6)
}

/** Pressurização: ruído grave que sobe e desce, acompanhando a descida. */
function pressurizacao(ctx: AudioContext, destino: AudioNode, t: number) {
  const fonte = fonteDeRuido(ctx)
  const passa = ctx.createBiquadFilter()
  passa.type = 'lowpass'
  passa.frequency.setValueAtTime(140, t)
  passa.frequency.linearRampToValueAtTime(420, t + 0.7)
  passa.frequency.linearRampToValueAtTime(120, t + 1.4)
  passa.Q.value = 3
  const ganho = ctx.createGain()
  ganho.gain.setValueAtTime(0.0001, t)
  ganho.gain.linearRampToValueAtTime(1.8, t + 0.5)
  ganho.gain.linearRampToValueAtTime(0.0001, t + 1.5)
  fonte.connect(passa).connect(ganho).connect(destino)
  limpar(fonte, passa, ganho)
  fonte.start(t)
  fonte.stop(t + 1.6)
}

/** Bipe seco do timer das dinâmicas. */
function bipeTimer(ctx: AudioContext, destino: AudioNode, t: number) {
  tom(ctx, destino, 1200, t, 0.05, 0.5, 'triangle')
}

/**
 * Estalo de casco sob pressão: um pulso grave curto, com a ressonância do
 * metal por cima.
 *
 * O medo aqui é o aço, não o susto — por isso não tem ataque estalado nem
 * agudo. É um "toc" fundo que a caixa reproduz mais como pressão no peito do
 * que como som, que é exatamente o que se quer quando o número da profundidade
 * está subindo na tela.
 */
function casco(ctx: AudioContext, destino: AudioNode, t: number) {
  // corpo: seno grave caindo, o "toc"
  const grave = ctx.createOscillator()
  const ganhoGrave = ctx.createGain()
  grave.type = 'sine'
  grave.frequency.setValueAtTime(96, t)
  grave.frequency.exponentialRampToValueAtTime(38, t + 0.2)
  envelope(ganhoGrave, t, 0.5, 0.004, 0.28)
  grave.connect(ganhoGrave).connect(destino)
  limpar(grave, ganhoGrave)
  grave.start(t)
  grave.stop(t + 0.35)

  // ressonância: ruído passando por um passa-banda alto e estreito, que é o
  // metal respondendo ao pulso
  const amostras = Math.floor(ctx.sampleRate * 0.25)
  const buffer = ctx.createBuffer(1, amostras, ctx.sampleRate)
  const dados = buffer.getChannelData(0)
  for (let i = 0; i < amostras; i++) {
    dados[i] = (Math.random() * 2 - 1) * (1 - i / amostras) ** 3
  }
  const fonte = ctx.createBufferSource()
  fonte.buffer = buffer
  const banda = ctx.createBiquadFilter()
  banda.type = 'bandpass'
  banda.frequency.value = 420 + Math.random() * 260
  banda.Q.value = 9
  const ganhoRes = ctx.createGain()
  envelope(ganhoRes, t, 0.24, 0.002, 0.22)
  fonte.connect(banda).connect(ganhoRes).connect(destino)
  limpar(fonte, banda, ganhoRes)
  fonte.start(t)
}

/**
 * Ruido branco JA MODELADO por um envelope, em buffer.
 *
 * Diferente do `ruido()` la de cima, que devolve dois segundos de branco puro
 * pra quem quiser filtrar: aqui a forma entra na amostra, o que e o jeito certo
 * de fazer transiente curto — um envelope de GainNode com ataque de 1 ms ja
 * chega tarde pra um estalo de vidro.
 */
function ruidoModelado(
  ctx: AudioContext,
  duracao: number,
  forma: (i: number, n: number) => number,
): AudioBuffer {
  const amostras = Math.max(1, Math.floor(ctx.sampleRate * duracao))
  const buffer = ctx.createBuffer(1, amostras, ctx.sampleRate)
  const dados = buffer.getChannelData(0)
  for (let i = 0; i < amostras; i++) dados[i] = (Math.random() * 2 - 1) * forma(i, amostras)
  return buffer
}

/**
 * Vidro rachando.
 *
 * Transiente agudo e curto com cauda: o estalo e quase instantaneo (vidro nao
 * racha devagar) e o que sobra e o tilintar dos caquinhos assentando. Duas
 * camadas — um "crack" de banda alta e uma cauda de ruido filtrado descendo.
 */
function vidro(ctx: AudioContext, destino: AudioNode, t: number) {
  // o estalo: 8 ms de ruido cortado alto, com pico forte
  const estalo = ctx.createBufferSource()
  estalo.buffer = ruidoModelado(ctx, 0.05, (i, n) => (1 - i / n) ** 8)
  const alto = ctx.createBiquadFilter()
  alto.type = 'highpass'
  alto.frequency.value = 2600
  const ganhoEstalo = ctx.createGain()
  envelope(ganhoEstalo, t, 0.62, 0.001, 0.05)
  estalo.connect(alto).connect(ganhoEstalo).connect(destino)
  limpar(estalo, alto, ganhoEstalo)
  estalo.start(t)

  // a cauda: os caquinhos. Banda estreita varrendo pra baixo, bem mais baixa
  // em nivel — o que se ouve depois de um vidro rachar e quase nada.
  const cauda = ctx.createBufferSource()
  cauda.buffer = ruidoModelado(ctx, 0.55, (i, n) => (1 - i / n) ** 2 * (0.3 + Math.random() * 0.7))
  const banda = ctx.createBiquadFilter()
  banda.type = 'bandpass'
  banda.frequency.setValueAtTime(5200, t)
  banda.frequency.exponentialRampToValueAtTime(1400, t + 0.5)
  banda.Q.value = 2.4
  const ganhoCauda = ctx.createGain()
  envelope(ganhoCauda, t + 0.01, 0.2, 0.01, 0.5)
  cauda.connect(banda).connect(ganhoCauda).connect(destino)
  limpar(cauda, banda, ganhoCauda)
  cauda.start(t)
}

/**
 * Pulso acustico de alta intensidade.
 *
 * E a arma do 3A, entao precisa soar como energia SAINDO do casco, nao como o
 * ping de sonar de sempre: varredura descendente longa, grave, com distorcao.
 * A distorcao e o que separa "instrumento" de "disparo" — um seno limpo a 60 Hz
 * e um tom de teste; o mesmo seno saturado e um estrondo.
 */
function pulso(ctx: AudioContext, destino: AudioNode, t: number) {
  const forma = ctx.createWaveShaper()
  // Curva de saturacao suave (tanh). Sem oversampling nao daria: a distorcao
  // cria harmonicos acima de Nyquist e volta como chiado metalico.
  const curva = new Float32Array(1024)
  for (let i = 0; i < curva.length; i++) {
    const x = (i / (curva.length - 1)) * 2 - 1
    curva[i] = Math.tanh(x * 3.2)
  }
  forma.curve = curva
  forma.oversample = '4x'
  const saida = ctx.createGain()
  saida.gain.value = 0.8
  forma.connect(saida).connect(destino)

  // varredura principal: 220 Hz caindo a 34 Hz em 0,9 s
  const osc = ctx.createOscillator()
  const ganho = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(220, t)
  osc.frequency.exponentialRampToValueAtTime(34, t + 0.9)
  envelope(ganho, t, 0.55, 0.012, 1.0)
  osc.connect(ganho).connect(forma)
  limpar(osc, ganho, forma, saida)
  osc.start(t)
  osc.stop(t + 1.05)

  // segunda voz uma quinta acima, desafinada: da o batimento que faz o som
  // parecer potente em vez de fino
  const alta = ctx.createOscillator()
  const ganhoAlta = ctx.createGain()
  alta.type = 'sine'
  alta.frequency.setValueAtTime(331, t)
  alta.frequency.exponentialRampToValueAtTime(52, t + 0.85)
  envelope(ganhoAlta, t, 0.3, 0.01, 0.85)
  alta.connect(ganhoAlta).connect(forma)
  limpar(alta, ganhoAlta)
  alta.start(t)
  alta.stop(t + 0.95)

  // sopro de saida: o ar deslocado
  const sopro = ctx.createBufferSource()
  sopro.buffer = ruidoModelado(ctx, 0.4, (i, n) => (1 - i / n) ** 2.5)
  const passa = ctx.createBiquadFilter()
  passa.type = 'lowpass'
  passa.frequency.setValueAtTime(1800, t)
  passa.frequency.exponentialRampToValueAtTime(300, t + 0.4)
  const ganhoSopro = ctx.createGain()
  envelope(ganhoSopro, t, 0.24, 0.004, 0.4)
  sopro.connect(passa).connect(ganhoSopro).connect(destino)
  limpar(sopro, passa, ganhoSopro)
  sopro.start(t)
}

/**
 * Impacto no casco.
 *
 * Ruido grave com transiente: primeiro a pancada (banda larga, 20 ms), depois o
 * casco inteiro respondendo em frequencia baixa. Mais pesado e mais sujo que o
 * `casco`, que e so um estalo de pressao — aqui alguma coisa BATEU.
 */
function impacto(ctx: AudioContext, destino: AudioNode, t: number) {
  // transiente: a pancada seca
  const batida = ctx.createBufferSource()
  batida.buffer = ruidoModelado(ctx, 0.12, (i, n) => (1 - i / n) ** 5)
  const corte = ctx.createBiquadFilter()
  corte.type = 'lowpass'
  corte.frequency.setValueAtTime(2400, t)
  corte.frequency.exponentialRampToValueAtTime(180, t + 0.12)
  const ganhoBatida = ctx.createGain()
  envelope(ganhoBatida, t, 0.62, 0.001, 0.14)
  batida.connect(corte).connect(ganhoBatida).connect(destino)
  limpar(batida, corte, ganhoBatida)
  batida.start(t)

  // o casco respondendo: grave longo caindo
  const corpo = ctx.createOscillator()
  const ganhoCorpo = ctx.createGain()
  corpo.type = 'sine'
  corpo.frequency.setValueAtTime(74, t)
  corpo.frequency.exponentialRampToValueAtTime(26, t + 0.7)
  envelope(ganhoCorpo, t, 0.58, 0.003, 0.8)
  corpo.connect(ganhoCorpo).connect(destino)
  limpar(corpo, ganhoCorpo)
  corpo.start(t)
  corpo.stop(t + 0.9)

  // ressonancia metalica sobrando, desafinada do corpo
  const metal = ctx.createBufferSource()
  metal.buffer = ruidoModelado(ctx, 0.9, (i, n) => (1 - i / n) ** 2)
  const banda = ctx.createBiquadFilter()
  banda.type = 'bandpass'
  banda.frequency.value = 310
  banda.Q.value = 7
  const ganhoMetal = ctx.createGain()
  envelope(ganhoMetal, t + 0.02, 0.2, 0.01, 0.75)
  metal.connect(banda).connect(ganhoMetal).connect(destino)
  limpar(metal, banda, ganhoMetal)
  metal.start(t)
}

/**
 * Presença: a vibração que se sente antes de ver.
 *
 * Infrassom de verdade — 28 Hz de fundamental, abaixo do que a maioria das
 * caixas de som reproduz como NOTA. O que chega à plateia não é um tom: são os
 * harmônicos (56, 84, 112 Hz) e a batida entre a fundamental e uma vizinha
 * desafinada. Numa caixa de quadra isso vira pressão no peito, que é o efeito
 * que a cena quer: o bicho é grande demais pra caber num som agudo.
 *
 * O waveshaper suave por 2 s é o que impede o infrassom de sumir: sem
 * distorção, 28 Hz num alto-falante pequeno é silêncio. Saturando, a
 * fundamental "vaza" pros harmônicos e o ouvido reconstrói o grave que a caixa
 * não consegue emitir — é o mesmo truque de missing fundamental.
 */
function presenca(ctx: AudioContext, destino: AudioNode, t: number) {
  const DUR = 3.4
  /** Janela da saturação. Depois dela o som fica limpo e some. */
  const DUR_FORMA = 2

  const forma = ctx.createWaveShaper()
  const curva = new Float32Array(2048)
  for (let i = 0; i < curva.length; i++) {
    const x = (i / (curva.length - 1)) * 2 - 1
    // Saturação suave: harmônicos ímpares sem virar fuzz.
    curva[i] = Math.tanh(x * 2.4) * 0.92
  }
  forma.curve = curva
  forma.oversample = '4x'

  // A saturação entra e sai: seca no começo, cheia no meio, limpa no fim.
  const seco = ctx.createGain()
  const molhado = ctx.createGain()
  seco.gain.setValueAtTime(1, t)
  seco.gain.linearRampToValueAtTime(0.35, t + DUR_FORMA * 0.6)
  seco.gain.linearRampToValueAtTime(1, t + DUR_FORMA)
  molhado.gain.setValueAtTime(0.0001, t)
  molhado.gain.linearRampToValueAtTime(1, t + DUR_FORMA * 0.6)
  molhado.gain.linearRampToValueAtTime(0.0001, t + DUR_FORMA)

  const mestre = ctx.createGain()
  mestre.gain.setValueAtTime(0.0001, t)
  mestre.gain.exponentialRampToValueAtTime(0.6, t + DUR * 0.8)
  mestre.gain.exponentialRampToValueAtTime(0.0001, t + DUR)
  mestre.connect(destino)

  const entrada = ctx.createGain()
  entrada.connect(seco).connect(mestre)
  entrada.connect(forma).connect(molhado).connect(mestre)

  // 28 Hz e a vizinha a 29,1: batimento de ~1,1 Hz, a respiração do bicho.
  // Mais os harmônicos, que são o que a caixa realmente entrega.
  for (const [freq, pico, tipo] of [
    [28, 1, 'sine'],
    [29.1, 0.85, 'sine'],
    [56, 0.42, 'sine'],
    [84, 0.2, 'sine'],
    [112, 0.1, 'triangle'],
  ] as Array<[number, number, OscillatorType]>) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = tipo
    osc.frequency.setValueAtTime(freq, t)
    // Sobe meio tom ao longo da cena: ele está se aproximando.
    osc.frequency.linearRampToValueAtTime(freq * 1.06, t + DUR)
    g.gain.value = pico
    osc.connect(g).connect(entrada)
    limpar(osc, g)
    osc.start(t)
    osc.stop(t + DUR + 0.05)
  }

  // Água deslocada por baixo de tudo, subindo junto.
  const fluxo = ctx.createBufferSource()
  fluxo.buffer = ruidoModelado(ctx, DUR, (i, n) => (i / n) ** 1.6 * 0.8)
  const banda = ctx.createBiquadFilter()
  banda.type = 'bandpass'
  banda.frequency.setValueAtTime(120, t)
  banda.frequency.exponentialRampToValueAtTime(520, t + DUR)
  banda.Q.value = 0.8
  const gFluxo = ctx.createGain()
  gFluxo.gain.value = 0.42
  fluxo.connect(banda).connect(gFluxo).connect(mestre)
  limpar(fluxo, banda, gFluxo, forma, seco, molhado, entrada, mestre)
  fluxo.start(t)
}

/**
 * Whoosh grave: a massa de água que o bicho empurra ao cruzar um setor.
 *
 * Varredura de ruído filtrado, não tom: o que passa perto do casco não tem
 * altura definida. O panorâmico fica por conta de quem chama — é ele que diz
 * de que lado foi.
 */
function whoosh(ctx: AudioContext, destino: AudioNode, t: number) {
  const DUR = 1.1
  const fonte = ctx.createBufferSource()
  fonte.buffer = ruidoModelado(ctx, DUR, (i, n) => {
    const f = i / n
    // Envelope em sino: ele chega, passa e vai.
    return Math.sin(f * Math.PI) ** 1.6
  })
  const passa = ctx.createBiquadFilter()
  passa.type = 'bandpass'
  // Efeito Doppler barato: a banda sobe enquanto se aproxima e desce depois.
  passa.frequency.setValueAtTime(90, t)
  passa.frequency.exponentialRampToValueAtTime(320, t + DUR * 0.45)
  passa.frequency.exponentialRampToValueAtTime(70, t + DUR)
  passa.Q.value = 1.1
  const grave = ctx.createBiquadFilter()
  grave.type = 'lowshelf'
  grave.frequency.value = 140
  grave.gain.value = 9
  const g = ctx.createGain()
  g.gain.value = 0.72
  fonte.connect(passa).connect(grave).connect(g).connect(destino)
  limpar(fonte, passa, grave, g)
  fonte.start(t)
}

/**
 * Deslocamento de água: o borbulhar surdo que fica DEPOIS do whoosh.
 *
 * Separado dele de propósito — o whoosh é a passagem, isto é a esteira. Tocar
 * os dois juntos com um atraso curto dá a sensação de volume que um só não dá.
 */
function agua(ctx: AudioContext, destino: AudioNode, t: number) {
  const DUR = 1.6
  const fonte = ctx.createBufferSource()
  fonte.buffer = ruidoModelado(ctx, DUR, (i, n) => (1 - i / n) ** 1.8 * (0.4 + Math.random() * 0.6))
  const passa = ctx.createBiquadFilter()
  passa.type = 'lowpass'
  passa.frequency.setValueAtTime(700, t)
  passa.frequency.exponentialRampToValueAtTime(160, t + DUR)
  const g = ctx.createGain()
  envelope(g, t, 0.34, 0.08, DUR)
  fonte.connect(passa).connect(g).connect(destino)
  limpar(fonte, passa, g)
  fonte.start(t)
}

const SINTETIZADORES: Record<
  NomeSfx,
  (ctx: AudioContext, destino: AudioNode, t: number) => void
> = {
  sonar,
  alarme,
  estatica,
  ok,
  pressurizacao,
  'bipe-timer': bipeTimer,
  casco,
  vidro,
  pulso,
  impacto,
  presenca,
  whoosh,
  agua,
}

/**
 * Toca um efeito sintetizado agora. Não bloqueia nada.
 *
 * `altura` desafina o efeito inteiro, 1 = original. Existe pro ping do sonar
 * ficar mais GRAVE conforme o contato se aproxima — a altura caindo é a coisa
 * que a plateia lê como "está chegando" sem precisar de nenhuma legenda. Em vez
 * de reescrever cada sintetizador, ela é aplicada a todo o grafo por um
 * detune no destino, o que vale pra qualquer efeito.
 */
export function tocarSintetico(
  ctx: AudioContext,
  destino: AudioNode,
  nome: NomeSfx,
  altura = 1,
  pan = 0,
): void {
  const sintetizador = SINTETIZADORES[nome]
  if (!sintetizador) return

  // Panorâmico: o combate precisa que o som venha DO LADO do setor. Um nó só,
  // inserido antes do destino, e todo o resto do grafo continua mono.
  let saida = destino
  let panner: StereoPannerNode | null = null
  if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
    panner = ctx.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, pan))
    panner.connect(destino)
    saida = panner
  }
  const soltar = () => {
    if (panner) window.setTimeout(() => panner?.disconnect(), 4000)
  }

  if (altura === 1) {
    sintetizador(ctx, saida, ctx.currentTime + 0.01)
    soltar()
    return
  }
  // Renderiza o efeito num buffer e toca esse buffer mais devagar. É o jeito
  // de transpor um grafo inteiro sem tocar em nenhum oscilador: mais lento =
  // mais grave, exatamente como uma fita.
  const DUR = 4
  const offline = new OfflineAudioContext(1, Math.ceil(ctx.sampleRate * DUR), ctx.sampleRate)
  sintetizador(offline as unknown as AudioContext, offline.destination, 0)
  void offline.startRendering().then((buffer) => {
    const fonte = ctx.createBufferSource()
    fonte.buffer = buffer
    fonte.playbackRate.value = Math.max(0.25, altura)
    fonte.connect(saida)
    fonte.onended = () => {
      fonte.disconnect()
      soltar()
    }
    fonte.start()
  })
}

/** Ordem do teste de som disparado pelo comando `som`. */
export const SEQUENCIA_TESTE: NomeSfx[] = [
  'ok',
  'sonar',
  'bipe-timer',
  'estatica',
  'alarme',
  'pressurizacao',
  'casco',
  'vidro',
  'impacto',
  'pulso',
  'whoosh',
  'presenca',
]

/**
 * Toca todos os efeitos em sequência, espaçados. Serve pra conferir, antes da
 * apresentação, se o som da máquina está chegando na caixa.
 */
export function tocarTesteDeSom(ctx: AudioContext, destino: AudioNode): number {
  let t = ctx.currentTime + 0.05
  for (const nome of SEQUENCIA_TESTE) {
    SINTETIZADORES[nome](ctx, destino, t)
    t +=
      nome === 'presenca'
        ? 3.7
        : nome === 'alarme'
          ? 1.5
          : nome === 'pressurizacao'
            ? 1.8
            : nome === 'pulso'
              ? 1.3
              : 0.9
  }
  return Math.round((t - ctx.currentTime) * 1000)
}
