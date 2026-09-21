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
}

/** Toca um efeito sintetizado agora. Não bloqueia nada. */
export function tocarSintetico(ctx: AudioContext, destino: AudioNode, nome: NomeSfx): void {
  const sintetizador = SINTETIZADORES[nome]
  if (!sintetizador) return
  sintetizador(ctx, destino, ctx.currentTime + 0.01)
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
]

/**
 * Toca todos os efeitos em sequência, espaçados. Serve pra conferir, antes da
 * apresentação, se o som da máquina está chegando na caixa.
 */
export function tocarTesteDeSom(ctx: AudioContext, destino: AudioNode): number {
  let t = ctx.currentTime + 0.05
  for (const nome of SEQUENCIA_TESTE) {
    SINTETIZADORES[nome](ctx, destino, t)
    t += nome === 'alarme' ? 1.5 : nome === 'pressurizacao' ? 1.8 : nome === 'pulso' ? 1.3 : 0.9
  }
  return Math.round((t - ctx.currentTime) * 1000)
}
