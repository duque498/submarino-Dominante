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
]

/**
 * Toca todos os efeitos em sequência, espaçados. Serve pra conferir, antes da
 * apresentação, se o som da máquina está chegando na caixa.
 */
export function tocarTesteDeSom(ctx: AudioContext, destino: AudioNode): number {
  let t = ctx.currentTime + 0.05
  for (const nome of SEQUENCIA_TESTE) {
    SINTETIZADORES[nome](ctx, destino, t)
    t += nome === 'alarme' ? 1.5 : nome === 'pressurizacao' ? 1.8 : 0.9
  }
  return Math.round((t - ctx.currentTime) * 1000)
}
