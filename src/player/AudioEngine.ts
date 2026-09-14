import { tocarSintetico, type NomeSfx } from '../audio/sfx'
import type { Sfx } from '../roteiros/tipos'

/**
 * Uma reprodução em andamento.
 * `tocou: false` significa que o áudio não existe ou não pôde ser reproduzido —
 * o Player usa isso pra cair no tempo de fallback em vez de travar.
 */
/** Offsets de cada linha dentro do mp3 de uma cena, em ms. */
export type TemposDaCena = {
  duracaoMs: number
  linhas: Array<{ inicio: number; fim: number }>
}

export type Reproducao = {
  tocou: boolean
  /** Só conhecida quando o áudio realmente começou. */
  duracaoMs: number | null
  /** Resolve quando o áudio termina (ou é interrompido). */
  fim: Promise<void>
}

declare global {
  interface Window {
    /** Preenchido por ./audios.js, gerado pelo script Python. Pode não existir. */
    __AUDIOS?: Record<string, string>
    /** Resolve quando o ./audios.js terminou de carregar (ou falhou). */
    __AUDIOS_PRONTO?: Promise<void>
    /**
     * Offsets reais de cada linha dentro do mp3 da cena, por turma e por cena.
     * Vem do tempos.json que o gerar_audios.py emite, embutido no audios.js.
     */
    __TEMPOS?: Record<string, Record<string, TemposDaCena>>
  }
}

const SILENCIO_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA='

const CAMINHOS_SFX: Record<Sfx, string> = {
  sonar: './audio/sfx/sonar.mp3',
  alarme: './audio/sfx/alarme.mp3',
  estatica: './audio/sfx/estatica.mp3',
  ok: './audio/sfx/ok.mp3',
  pressurizacao: './audio/sfx/pressurizacao.mp3',
}

/** Quantos AudioBuffer decodificados ficam na memória (cena atual + vizinhas). */
const MAX_BUFFERS = 3

/** "./audio/2a/entrada.mp3" -> "2a/entrada", que é a chave usada em __AUDIOS. */
function chaveDoCaminho(url: string): string | null {
  const casou = /^\.\/audio\/(.+)\.mp3$/.exec(url)
  return casou ? casou[1] : null
}

const misturar = (atual: number, alvo: number, fator: number) =>
  atual + (alvo - atual) * fator

const sorteio = (min: number, max: number) => min + Math.random() * (max - min)

/**
 * Áudio com duas camadas, escolhidas por arquivo:
 *
 * A) mp3 embutido em `window.__AUDIOS` como data URL, decodificado na Web Audio
 *    API. É a única forma de ler o nível real do áudio via `file://` — o Chrome
 *    silencia `createMediaElementSource` de arquivo local por CORS.
 * B) `HTMLAudioElement` cru, com um envelope sintético no lugar do nível real.
 *
 * Quem consome só chama `tocar()` e lê `nivel()`; a camada é detalhe interno.
 */
export class AudioEngine {
  private elementos = new Map<string, HTMLAudioElement>()
  private buffers = new Map<string, AudioBuffer>()
  private contexto: AudioContext | null = null
  private analisador: AnalyserNode | null = null
  private amostras: Uint8Array<ArrayBuffer> | null = null

  private fonteAtual: AudioBufferSourceNode | null = null
  private elementoAtual: HTMLAudioElement | null = null
  private sfxAtual: HTMLAudioElement | null = null

  private nivelAtual = 0
  private loopNivel = 0
  /** Estado do envelope sintético da camada B. */
  private silaba = { fase: 0, freq: 5, amplitude: 0.7, pausaAte: 0, proximaPausa: 0 }

  private desbloqueado = false
  private ausentes = new Set<string>()

  // --- ciclo de vida --------------------------------------------------------

  /**
   * Chrome não toca áudio sem gesto do usuário. Chamado dentro do handler da
   * primeira tecla: libera o autoplay e acorda o AudioContext.
   */
  async desbloquear(): Promise<void> {
    if (this.desbloqueado) return
    // O ./audios.js entra de forma assíncrona; sem esperar por ele, a primeira
    // cena decidiria a camada antes de saber que a A existe.
    await window.__AUDIOS_PRONTO?.catch(() => undefined)
    try {
      const silencio = new Audio(SILENCIO_WAV)
      silencio.volume = 0
      await silencio.play()
      silencio.pause()
    } catch (erro) {
      console.warn('[audio] não foi possível desbloquear o áudio:', erro)
    }
    try {
      const contexto = this.obterContexto()
      if (contexto && contexto.state === 'suspended') await contexto.resume()
    } catch (erro) {
      console.warn('[audio] AudioContext indisponível:', erro)
    }
    this.desbloqueado = true
  }

  private obterContexto(): AudioContext | null {
    if (this.contexto) return this.contexto
    if (typeof AudioContext === 'undefined') return null
    this.contexto = new AudioContext()
    this.analisador = this.contexto.createAnalyser()
    this.analisador.fftSize = 1024
    this.analisador.connect(this.contexto.destination)
    this.amostras = new Uint8Array(new ArrayBuffer(this.analisador.fftSize))
    return this.contexto
  }

  /** true quando existe mp3 embutido pra esse caminho (camada A disponível). */
  private embutido(url: string): string | null {
    const chave = chaveDoCaminho(url)
    if (!chave) return null
    return window.__AUDIOS?.[chave] ?? null
  }

  // --- carregamento ---------------------------------------------------------

  /**
   * Decodifica um mp3 embutido e guarda o AudioBuffer. Decodificar é caro em
   * memória, então só mantemos alguns por vez (cena atual e vizinhas).
   */
  async preparar(url: string | null): Promise<AudioBuffer | null> {
    if (!url || this.ausentes.has(url)) return null
    const jaTem = this.buffers.get(url)
    if (jaTem) return jaTem

    const dataUrl = this.embutido(url)
    const contexto = this.obterContexto()
    if (!dataUrl || !contexto) return null

    try {
      const resposta = await fetch(dataUrl)
      const bytes = await resposta.arrayBuffer()
      const buffer = await contexto.decodeAudioData(bytes)
      // Descarta o mais antigo antes de guardar o novo.
      while (this.buffers.size >= MAX_BUFFERS) {
        const maisAntigo = this.buffers.keys().next().value
        if (maisAntigo === undefined) break
        this.buffers.delete(maisAntigo)
      }
      this.buffers.set(url, buffer)
      return buffer
    } catch (erro) {
      console.warn(`[audio] falha ao decodificar ${url}, caindo na camada B:`, erro)
      return null
    }
  }

  private obterElemento(url: string): HTMLAudioElement {
    let elemento = this.elementos.get(url)
    if (!elemento) {
      elemento = new Audio(url)
      elemento.preload = 'auto'
      this.elementos.set(url, elemento)
    }
    return elemento
  }

  /**
   * Prepara os áudios da turma logo depois do gesto inicial.
   * Nunca rejeita: arquivo faltando vira aviso no console, não erro de tela.
   */
  async preload(urls: string[]): Promise<void> {
    const unicos = [...new Set(urls.filter(Boolean))]
    // Camada A: o data URL já está em memória, só a primeira cena é decodificada
    // aqui; as demais entram sob demanda via preparar().
    const semEmbutido = unicos.filter((url) => !this.embutido(url))
    const primeiroEmbutido = unicos.find((url) => this.embutido(url))
    if (primeiroEmbutido) await this.preparar(primeiroEmbutido)

    await Promise.all(
      semEmbutido.map(
        (url) =>
          new Promise<void>((resolve) => {
            const elemento = this.obterElemento(url)
            if (elemento.readyState >= 3) return resolve()

            const encerrar = () => {
              elemento.removeEventListener('canplaythrough', aoCarregar)
              elemento.removeEventListener('error', aoFalhar)
              clearTimeout(limite)
              resolve()
            }
            const aoCarregar = () => encerrar()
            const aoFalhar = () => {
              this.ausentes.add(url)
              // SFX ausente não é problema: cai no sintetizado.
              if (!url.includes('/sfx/')) {
                console.warn(`[audio] arquivo não encontrado: ${url}`)
              }
              encerrar()
            }
            // Não deixa um arquivo lento travar a tela de ativação.
            const limite = setTimeout(encerrar, 8000)

            elemento.addEventListener('canplaythrough', aoCarregar)
            elemento.addEventListener('error', aoFalhar)
            elemento.load()
          }),
      ),
    )
  }

  // --- reprodução -----------------------------------------------------------

  /** Toca uma fala. A camada é escolhida aqui, de forma transparente. */
  async tocar(url: string): Promise<Reproducao> {
    this.pararVoz()

    if (this.ausentes.has(url)) {
      return { tocou: false, duracaoMs: null, fim: Promise.resolve() }
    }

    const buffer = await this.preparar(url)
    if (buffer) return this.tocarBuffer(buffer)
    return this.tocarElemento(url)
  }

  /** Camada A: AudioBufferSourceNode -> AnalyserNode -> saída. */
  private tocarBuffer(buffer: AudioBuffer): Reproducao {
    const contexto = this.contexto!
    const fonte = contexto.createBufferSource()
    fonte.buffer = buffer
    fonte.connect(this.analisador!)
    this.fonteAtual = fonte

    const fim = new Promise<void>((resolve) => {
      fonte.onended = () => {
        if (this.fonteAtual === fonte) {
          this.fonteAtual = null
          this.pararLoopNivel()
        }
        resolve()
      }
    })

    fonte.start()
    this.iniciarLoopNivel('real')
    return { tocou: true, duracaoMs: buffer.duration * 1000, fim }
  }

  /** Camada B: HTMLAudioElement cru + envelope sintético pro orbe. */
  private tocarElemento(url: string): Promise<Reproducao> {
    const elemento = this.obterElemento(url)
    this.elementoAtual = elemento

    let resolverFim: () => void = () => {}
    const fim = new Promise<void>((resolve) => {
      resolverFim = resolve
    })

    return new Promise<Reproducao>((resolve) => {
      let decidido = false
      const encerrarTentativa = (reproducao: Reproducao) => {
        if (decidido) return
        decidido = true
        resolve(reproducao)
      }

      const aoTerminar = () => {
        elemento.removeEventListener('ended', aoTerminar)
        elemento.removeEventListener('error', aoFalhar)
        if (this.elementoAtual === elemento) {
          this.elementoAtual = null
          this.pararLoopNivel()
        }
        resolverFim()
      }
      const aoFalhar = () => {
        this.ausentes.add(url)
        console.warn(`[audio] falha ao tocar: ${url}`)
        elemento.removeEventListener('ended', aoTerminar)
        elemento.removeEventListener('error', aoFalhar)
        this.pararLoopNivel()
        resolverFim()
        encerrarTentativa({ tocou: false, duracaoMs: null, fim })
      }

      elemento.addEventListener('ended', aoTerminar)
      elemento.addEventListener('error', aoFalhar)
      elemento.currentTime = 0
      elemento
        .play()
        .then(() => {
          this.iniciarLoopNivel('sintetico')
          const duracao = elemento.duration
          encerrarTentativa({
            tocou: true,
            duracaoMs: Number.isFinite(duracao) && duracao > 0 ? duracao * 1000 : null,
            fim,
          })
        })
        .catch((erro) => {
          this.ausentes.add(url)
          console.warn(`[audio] play() rejeitado para ${url}:`, erro)
          resolverFim()
          encerrarTentativa({ tocou: false, duracaoMs: null, fim })
        })
    })
  }

  /**
   * Roda só o envelope sintético, sem áudio nenhum, por um tempo dado. É o que
   * mantém orbe, legenda e sparkline vivos enquanto os mp3 não existem.
   */
  simularVoz(duracaoMs: number): void {
    this.iniciarLoopNivel('sintetico')
    setTimeout(() => this.pararLoopNivel(), duracaoMs)
  }

  /**
   * Dispara um efeito sonoro. O mp3 tem prioridade; sem ele, o efeito é
   * sintetizado na hora — assim o projeto roda completo sem nenhum arquivo.
   */
  tocarSfx(sfx: Sfx): void {
    const url = CAMINHOS_SFX[sfx]
    if (this.ausentes.has(url)) return this.tocarSfxSintetico(sfx)

    const elemento = this.obterElemento(url)
    this.sfxAtual = elemento
    elemento.currentTime = 0
    elemento.play().catch(() => {
      this.ausentes.add(url)
      this.tocarSfxSintetico(sfx)
    })
  }

  private tocarSfxSintetico(sfx: Sfx): void {
    const contexto = this.obterContexto()
    if (!contexto) return
    tocarSintetico(contexto, contexto.destination, sfx as NomeSfx)
  }

  /** Offsets reais das linhas de uma cena, se o tempos.json foi gerado. */
  temposDaCena(turma: string, grupo: string): TemposDaCena | null {
    return window.__TEMPOS?.[turma.toLowerCase()]?.[grupo] ?? null
  }

  /** Quantas cenas da turma têm tempos reais — só pro log de diagnóstico. */
  contarTempos(turma: string): number {
    return Object.keys(window.__TEMPOS?.[turma.toLowerCase()] ?? {}).length
  }

  /** Interrompe só a voz (usado pelo Espaço, que pula a fala atual). */
  pararVoz(): void {
    if (this.fonteAtual) {
      const fonte = this.fonteAtual
      this.fonteAtual = null
      try {
        fonte.stop()
      } catch {
        // já havia terminado
      }
    }
    if (this.elementoAtual) {
      this.elementoAtual.pause()
      this.elementoAtual.currentTime = 0
      this.elementoAtual = null
    }
    this.pararLoopNivel()
  }

  /** Interrompe voz e efeitos. */
  stop(): void {
    this.pararVoz()
    if (this.sfxAtual) {
      this.sfxAtual.pause()
      this.sfxAtual.currentTime = 0
      this.sfxAtual = null
    }
  }

  // --- nível --------------------------------------------------------------

  /**
   * Intensidade da voz agora, de 0 a 1. Lido pelo orbe dentro do próprio
   * requestAnimationFrame dele — nunca vira estado do React, que a 60 fps
   * re-renderizaria a árvore inteira.
   */
  nivel(): number {
    return this.nivelAtual
  }

  private iniciarLoopNivel(modo: 'real' | 'sintetico'): void {
    this.pararLoopNivel()
    const agora = performance.now()
    this.silaba = {
      fase: 0,
      freq: sorteio(4, 6),
      amplitude: sorteio(0.55, 1),
      pausaAte: 0,
      proximaPausa: agora + sorteio(2000, 4000),
    }

    let anterior = agora
    const passo = (tempo: number) => {
      const dt = Math.min(0.1, (tempo - anterior) / 1000)
      anterior = tempo
      this.nivelAtual =
        modo === 'real' ? this.calcularNivelReal() : this.calcularNivelSintetico(dt, tempo)
      this.loopNivel = requestAnimationFrame(passo)
    }
    this.loopNivel = requestAnimationFrame(passo)
  }

  private pararLoopNivel(): void {
    if (this.loopNivel) cancelAnimationFrame(this.loopNivel)
    this.loopNivel = 0
    this.nivelAtual = 0
  }

  /** RMS da forma de onda, normalizado e suavizado. */
  private calcularNivelReal(): number {
    if (!this.analisador || !this.amostras) return 0
    this.analisador.getByteTimeDomainData(this.amostras)
    let soma = 0
    for (let i = 0; i < this.amostras.length; i++) {
      const desvio = (this.amostras[i] - 128) / 128
      soma += desvio * desvio
    }
    const rms = Math.sqrt(soma / this.amostras.length)
    // Fala fica na faixa de ~0.05 a ~0.3 de RMS; o fator 4 espalha isso em 0–1.
    return misturar(this.nivelAtual, Math.min(1, rms * 4), 0.35)
  }

  /**
   * Envelope sintético da camada B: "sílabas" a 4–6 Hz com amplitude variável e
   * vales curtos a cada 2–4 s imitando as pausas entre frases.
   */
  private calcularNivelSintetico(dt: number, tempo: number): number {
    const s = this.silaba

    if (tempo > s.proximaPausa && tempo > s.pausaAte) {
      s.pausaAte = tempo + sorteio(250, 450)
      s.proximaPausa = s.pausaAte + sorteio(2000, 4000)
    }

    let alvo = 0
    if (tempo > s.pausaAte) {
      s.fase += dt * s.freq
      if (s.fase >= 1) {
        s.fase -= Math.floor(s.fase)
        s.freq = sorteio(4, 6)
        s.amplitude = sorteio(0.35, 1)
      }
      // Meia-onda de seno: ataque e queda rápidos, como uma sílaba.
      alvo = s.amplitude * Math.sin(Math.PI * s.fase)
    }

    return misturar(this.nivelAtual, alvo, 0.25)
  }

  /** Todos os caminhos de SFX, pro preload inicial. */
  static urlsSfx(): string[] {
    return Object.values(CAMINHOS_SFX)
  }

  /** Diz qual camada está ativa — só pra log de diagnóstico. */
  camadaDe(url: string): 'A' | 'B' {
    return this.embutido(url) ? 'A' : 'B'
  }
}
