import type { Sfx } from '../roteiros/tipos'

/**
 * Resultado de uma tentativa de tocar um áudio.
 * `tocou: false` significa que o mp3 não existe ou não pôde ser reproduzido —
 * o Player usa isso pra cair no tempo de fallback em vez de travar.
 */
export type ResultadoAudio = { tocou: boolean; motivo?: string }

const SILENCIO_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA='

/** Caminhos dos efeitos sonoros, fora do bundle como todo o resto do áudio. */
const CAMINHOS_SFX: Record<Sfx, string> = {
  sonar: './audio/sfx/sonar.mp3',
  alarme: './audio/sfx/alarme.mp3',
  estatica: './audio/sfx/estatica.mp3',
  ok: './audio/sfx/ok.mp3',
}

/**
 * Áudio com HTMLAudioElement nativo, sem biblioteca.
 * Dois canais independentes: a voz da IA e os efeitos sonoros, pra um sonar
 * poder tocar por cima de uma fala sem cortá-la.
 */
export class AudioEngine {
  private cache = new Map<string, HTMLAudioElement>()
  private vozAtual: HTMLAudioElement | null = null
  private sfxAtual: HTMLAudioElement | null = null
  private desbloqueado = false
  /** Caminhos que já sabemos que não carregam — evita repetir o aviso. */
  private ausentes = new Set<string>()

  /**
   * Chrome não toca áudio sem gesto do usuário. Tocamos um wav silencioso
   * dentro do handler da tecla pra liberar o autoplay do resto da sessão.
   */
  async desbloquear(): Promise<void> {
    if (this.desbloqueado) return
    try {
      const silencio = new Audio(SILENCIO_WAV)
      silencio.volume = 0
      await silencio.play()
      silencio.pause()
      this.desbloqueado = true
    } catch (erro) {
      console.warn('[audio] não foi possível desbloquear o áudio:', erro)
    }
  }

  private obter(url: string): HTMLAudioElement {
    let elemento = this.cache.get(url)
    if (!elemento) {
      elemento = new Audio(url)
      elemento.preload = 'auto'
      this.cache.set(url, elemento)
    }
    return elemento
  }

  /**
   * Pré-carrega todos os mp3 de uma vez (feito logo após o gesto inicial).
   * Nunca rejeita: arquivo faltando vira aviso no console, não erro de tela.
   */
  async preload(urls: string[]): Promise<void> {
    const unicos = [...new Set(urls.filter(Boolean))]
    await Promise.all(
      unicos.map(
        (url) =>
          new Promise<void>((resolve) => {
            const elemento = this.obter(url)
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
              console.warn(`[audio] arquivo não encontrado: ${url}`)
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

  /** Duração em ms do áudio já carregado, ou null se desconhecida. */
  duracaoMs(url: string): number | null {
    const elemento = this.cache.get(url)
    if (!elemento) return null
    const duracao = elemento.duration
    return Number.isFinite(duracao) && duracao > 0 ? duracao * 1000 : null
  }

  /**
   * Toca uma fala no canal de voz. A Promise resolve quando o áudio termina
   * (evento `ended`) ou imediatamente, com `tocou: false`, se o arquivo falhar.
   */
  tocar(url: string): Promise<ResultadoAudio> {
    this.pararVoz()

    if (this.ausentes.has(url)) {
      return Promise.resolve({ tocou: false, motivo: 'arquivo ausente' })
    }

    const elemento = this.obter(url)
    this.vozAtual = elemento

    return new Promise<ResultadoAudio>((resolve) => {
      let encerrado = false
      const encerrar = (resultado: ResultadoAudio) => {
        if (encerrado) return
        encerrado = true
        elemento.removeEventListener('ended', aoTerminar)
        elemento.removeEventListener('error', aoFalhar)
        resolve(resultado)
      }
      const aoTerminar = () => encerrar({ tocou: true })
      const aoFalhar = () => {
        this.ausentes.add(url)
        console.warn(`[audio] falha ao tocar: ${url}`)
        encerrar({ tocou: false, motivo: 'erro de reprodução' })
      }

      elemento.addEventListener('ended', aoTerminar)
      elemento.addEventListener('error', aoFalhar)
      elemento.currentTime = 0
      elemento.play().catch((erro) => {
        this.ausentes.add(url)
        console.warn(`[audio] play() rejeitado para ${url}:`, erro)
        encerrar({ tocou: false, motivo: 'play() rejeitado' })
      })
    })
  }

  /** Dispara um efeito sonoro no canal paralelo, sem esperar o fim. */
  tocarSfx(sfx: Sfx): void {
    const url = CAMINHOS_SFX[sfx]
    if (this.ausentes.has(url)) return
    const elemento = this.obter(url)
    this.sfxAtual = elemento
    elemento.currentTime = 0
    elemento.play().catch(() => {
      this.ausentes.add(url)
      console.warn(`[audio] sfx indisponível: ${url}`)
    })
  }

  /** Interrompe só a voz (usado pelo Espaço, que pula a fala atual). */
  pararVoz(): void {
    if (!this.vozAtual) return
    this.vozAtual.pause()
    this.vozAtual.currentTime = 0
    this.vozAtual = null
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

  /** Todos os caminhos de SFX, pro preload inicial. */
  static urlsSfx(): string[] {
    return Object.values(CAMINHOS_SFX)
  }
}
