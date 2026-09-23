import { AmbienteOceano } from '../audio/ambiente'
import { AUDIO } from '../audio/config'
import {
  aguardarVozes,
  escolherVoz,
  listarVozes,
  nomeDaVoz,
  VozNavegador,
  vozDoNavegadorExiste,
  type LinhaFalada,
} from '../audio/vozNavegador'
import { tocarSintetico, tocarTesteDeSom, type NomeSfx } from '../audio/sfx'
import { tocarSomDoHidrofone, type SomTocando } from '../audio/hidrofone'
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
  'bipe-timer': './audio/sfx/bipe-timer.mp3',
  casco: './audio/sfx/casco.mp3',
  vidro: './audio/sfx/vidro.mp3',
  pulso: './audio/sfx/pulso.mp3',
  impacto: './audio/sfx/impacto.mp3',
  presenca: './audio/sfx/presenca.mp3',
  whoosh: './audio/sfx/whoosh.mp3',
  agua: './audio/sfx/agua.mp3',
}

/**
 * Trilha de fundo do combate do 3A.
 *
 * Fora do `CAMINHOS_SFX` de propósito: os SFX exigem estar EMBUTIDOS no
 * audios.js, e a trilha tem 2,4 MB — em base64 viraria 3,2 MB dentro de um
 * arquivo que já pesa. Ela toca num `<audio>` comum com caminho relativo, que
 * por `file://` funciona (o que não funciona por lá é `fetch`, e a trilha não
 * precisa de análise de nível).
 */
const CAMINHO_TRILHA = './audio/sfx/Theme battle.mp3'

/**
 * Volume de repouso da trilha.
 *
 * Foi 0,42, depois 0,62, agora 0,9 — e as duas subidas vieram de medir, não de
 * achar. Amostrando o volume a cada 200 ms por 51 s de combate, a 0,42 a trilha
 * ficava no cheio só 9% do tempo e abafada 70%: a IA fala em toda aparição,
 * acerto, perda e retorno, e um ducking calibrado pra três perguntas espaçadas
 * deixava a música inaudível numa cena que é quase toda fala.
 *
 * A comparação que fecha a conta: a voz da IA toca pelo Web Audio direto no
 * destino, sem nó de ganho — ou seja, no nível do próprio mp3, que é 1. A
 * trilha é um `<audio>` com `volume` absoluto. A 0,62 ela estava mesmo bem
 * abaixo da voz, e numa sala de escola com o ventilador do projetor junto isso
 * é a diferença entre música e nada.
 */
const TRILHA_VOLUME = 0.9
/**
 * Ducking enquanto a IA fala: -6 dB (10^(-6/20) = 0,5).
 *
 * O recuo existe pra a fala passar por cima, não pra a música sumir. Passou por
 * -9 e por -4 antes de parar aqui; o que mudou junto foi a voz ganhar um nó de
 * ganho próprio (-4 dB, `AUDIO.voz.ganho`), então a trilha a -6 dB fica MAIS
 * presente em relação à voz do que estava a -4 sem esse nó.
 */
const TRILHA_DUCK = 0.5
/** Fade de entrada e de saída, quando ninguém pede outro. */
const MS_FADE_TRILHA = 1500

/** Efeitos moram em audio/sfx/ e seguem regra própria — ver preload(). */
const ehSfx = (url: string): boolean => url.includes('/sfx/')

/** Quantos AudioBuffer decodificados ficam na memória (cena atual + vizinhas). */
const MAX_BUFFERS = 2

/** "./audio/2a/entrada.mp3" -> "2a/entrada", que é a chave usada em __AUDIOS. */
function chaveDoCaminho(url: string): string | null {
  const casou = /^\.\/audio\/(.+)\.mp3$/.exec(url)
  return casou ? casou[1] : null
}

/** data:audio/mpeg;base64,XXXX -> ArrayBuffer, sem passar por rede. */
function base64ParaBytes(dataUrl: string): ArrayBuffer | null {
  const virgula = dataUrl.indexOf(',')
  if (virgula < 0) return null
  const binario = atob(dataUrl.slice(virgula + 1))
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes.buffer
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
  /** Ganho da voz. Depois do analisador: mexer no mix não mexe no orbe. */
  private ganhoVoz: GainNode | null = null
  /** Saída dos efeitos sintetizados, com compressor pra não estourar. */
  private saidaSfx: AudioNode | null = null
  private ambiente: AmbienteOceano | null = null
  private voz = new VozNavegador()
  /**
   * Qual voz lê as falas. O padrão vira a do navegador quando a máquina tem
   * voz em português instalada: ela lê exatamente o texto da legenda e soa
   * melhor que o mp3 de emergência. Sem voz no sistema, cai no mp3.
   * O operador troca a qualquer momento com o comando `voz`.
   */
  private forcarVozNavegador = false
  private amostras: Uint8Array<ArrayBuffer> | null = null

  private fonteAtual: AudioBufferSourceNode | null = null
  private elementoAtual: HTMLAudioElement | null = null
  private sfxAtual: HTMLAudioElement | null = null

  private nivelAtual = 0
  private loopNivel = 0

  // --- hidrofone (2B) ---
  /**
   * Analisador SÓ do hidrofone.
   *
   * O da voz não serviria: durante a dinâmica a IA fala entre um som e outro, e
   * o espectrograma passaria a desenhar a locução dela. O que a plateia tem que
   * ver na tela é o som que ela está tentando identificar, e mais nada.
   */
  private analisadorHidro: AnalyserNode | null = null
  private espectroHidro: Uint8Array<ArrayBuffer> | null = null
  private ondaHidro: Uint8Array<ArrayBuffer> | null = null
  private somHidro: SomTocando | null = null
  private elementoHidro: HTMLAudioElement | null = null
  /**
   * Elementos que já foram ligados ao grafo.
   *
   * `createMediaElementSource` só pode ser chamado UMA vez por elemento, e os
   * elementos são cacheados por URL: reentrar na cena chamaria de novo e
   * lançaria InvalidStateError no meio da apresentação.
   */
  private roteadosHidro = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>()
  private nivelHidro = 0
  private loopHidro = 0
  /** Estado do envelope sintético da camada B. */
  private silaba = { fase: 0, freq: 5, amplitude: 0.7, pausaAte: 0, proximaPausa: 0 }

  private desbloqueado = false
  private ausentes = new Set<string>()

  /** Trilha: elemento, estado e o laço do fade. */
  private trilha: HTMLAudioElement | null = null
  private trilhaOk: boolean | null = null
  private trilhaAbafada = false
  private trilhaAlvo = 0
  private fadeTrilha = 0
  /** Duração do fade em curso. A saída do combate pede uma mais longa. */
  private msFade = MS_FADE_TRILHA

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
    // A lista de vozes do navegador costuma chegar vazia na primeira consulta.
    // Consultamos assim mesmo pra que o comando "vozes" já tenha o que listar.
    await aguardarVozes()
    // Nasce no mp3, sempre. A voz do sistema existe como rede de segurança
    // (Chromebook sem os arquivos, mp3 corrompido) e como escolha do operador
    // pelo console — não como padrão. Os mp3 são a voz que a professora ouviu
    // e aprovou; a do sistema varia de máquina pra máquina e ninguém testou.
    this.forcarVozNavegador = false
    this.desbloqueado = true
  }

  private obterContexto(): AudioContext | null {
    if (this.contexto) return this.contexto
    if (typeof AudioContext === 'undefined') return null
    this.contexto = new AudioContext()
    this.analisador = this.contexto.createAnalyser()
    this.analisador.fftSize = 1024
    this.ganhoVoz = this.contexto.createGain()
    this.ganhoVoz.gain.value = AUDIO.voz.ganho
    this.analisador.connect(this.ganhoVoz)
    this.ganhoVoz.connect(this.contexto.destination)
    this.amostras = new Uint8Array(new ArrayBuffer(this.analisador.fftSize))

    // Os efeitos sintetizados passam por um compressor: eles são altos de
    // propósito (caixa de som na quadra, não fone), e o eco do sonar podia
    // somar acima de 1 e distorcer.
    const compressor = this.contexto.createDynamicsCompressor()
    compressor.threshold.value = -12
    compressor.ratio.value = 6
    compressor.attack.value = 0.003
    compressor.release.value = 0.15
    compressor.connect(this.contexto.destination)
    this.saidaSfx = compressor
    this.ambiente = new AmbienteOceano(this.contexto, compressor)

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
      // Decodifica o base64 na mão, sem fetch. A versão anterior fazia
      // `fetch(dataUrl)`, e uma página publicada pode barrar QUALQUER
      // requisição — inclusive de data URL. O resultado era a voz sumir sem
      // erro visível, enquanto os efeitos (que não fazem requisição) tocavam.
      const bytes = base64ParaBytes(dataUrl)
      if (!bytes) return null
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
      // Quando o áudio está embutido, o elemento aponta pro data URL. Por
      // file:// um caminho relativo só funciona se o mp3 tiver viajado junto
      // com o index.html; o data URL não depende de nada.
      elemento = new Audio(this.embutido(url) ?? url)
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
    const naoEmbutidos = unicos.filter((url) => !this.embutido(url))
    const primeiroEmbutido = unicos.find((url) => this.embutido(url))
    if (primeiroEmbutido) await this.preparar(primeiroEmbutido)

    // Efeito não embutido não existe. Os SFX nascem sintetizados (camada B) e
    // só viram arquivo se alguém puser um mp3 em public/audio/sfx/ E rodar o
    // gerar_audios.py de novo, que é o passo que embute. Sem este filtro o
    // navegador pede os 5 arquivos, não acha, e escreve ERR_FILE_NOT_FOUND no
    // console — erro que o JS não consegue silenciar, só evitar não pedindo.
    const paraBaixar: string[] = []
    for (const url of naoEmbutidos) {
      if (ehSfx(url)) this.ausentes.add(url)
      else paraBaixar.push(url)
    }

    await Promise.all(
      paraBaixar.map(
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
              // SFX já foi filtrado antes do Promise.all, então o que falha
              // aqui é sempre fala — e fala faltando merece aviso.
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

  /**
   * Camada B: HTMLAudioElement cru + envelope sintético pro orbe.
   *
   * Não passa pelo grafo do Web Audio, então o ganho da voz entra aqui na mão —
   * senão a reserva tocaria mais alto que a camada principal.
   */
  private tocarElemento(url: string): Promise<Reproducao> {
    const elemento = this.obterElemento(url)
    elemento.volume = AUDIO.voz.ganho
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
  /**
   * `altura` desafina o efeito: 1 = original, 0,5 = uma oitava abaixo. Serve
   * pro ping do sonar ficar mais grave conforme o contato se aproxima.
   */
  /**
   * Toca um efeito. NUNCA lança.
   *
   * Isto roda no meio de uma cena, às vezes de dentro de um `setTimeout` que
   * não tem `catch` nenhum em volta. Web Audio falha por motivos que só
   * aparecem em máquina de verdade — teto de contextos, dispositivo ocupado,
   * navegador sem um nó — e nenhum deles pode derrubar a apresentação. Som é
   * o que se perde primeiro quando alguma coisa dá errado; a cena continua.
   */
  tocarSfx(sfx: Sfx, altura = 1, pan = 0): void {
    try {
      this.tocarSfxInterno(sfx, altura, pan)
    } catch (erro) {
      console.warn('[audio] efeito falhou e foi ignorado:', sfx, erro)
    }
  }

  private tocarSfxInterno(sfx: Sfx, altura = 1, pan = 0): void {
    const url = CAMINHOS_SFX[sfx]
    // Com panorâmico não dá pra usar o `<audio>`: ele não tem para onde
    // apontar. Quem precisa de lado vai pelo caminho sintético, que passa por
    // um StereoPannerNode.
    if (pan !== 0 || this.ausentes.has(url) || !this.embutido(url)) {
      return this.tocarSfxSintetico(sfx, altura, pan)
    }

    const elemento = this.obterElemento(url)
    this.sfxAtual = elemento
    elemento.currentTime = 0
    // `preservesPitch` é true por padrão, e com ele a taxa muda a duração sem
    // mudar a altura — o contrário do que se quer aqui.
    const comTom = elemento as HTMLAudioElement & { preservesPitch?: boolean }
    comTom.preservesPitch = false
    elemento.playbackRate = Math.max(0.25, altura)
    elemento.play().catch(() => {
      this.ausentes.add(url)
      this.tocarSfxSintetico(sfx, altura, pan)
    })
  }

  private tocarSfxSintetico(sfx: Sfx, altura = 1, pan = 0): void {
    const contexto = this.obterContexto()
    if (!contexto || !this.saidaSfx) return
    tocarSintetico(contexto, this.saidaSfx, sfx as NomeSfx, altura, pan)
  }

  /**
   * Toca todos os efeitos em sequência e devolve quanto tempo isso leva.
   * Serve pra conferir o som da máquina antes da apresentação.
   */
  testarSom(): number {
    const contexto = this.obterContexto()
    if (!contexto || !this.saidaSfx) return 0
    void contexto.resume()
    return tocarTesteDeSom(contexto, this.saidaSfx)
  }

  /**
   * Lê as linhas com a voz do navegador. É o caminho usado quando não existe
   * mp3 gerado pra cena — e o que faz a IA falar em qualquer máquina, sem
   * depender de ninguém rodar o gerador de áudio antes.
   */
  async falarComNavegador(
    linhas: string[],
    aoComecarLinha?: (linha: LinhaFalada) => void,
  ): Promise<boolean> {
    if (!vozDoNavegadorExiste()) return false
    this.iniciarLoopNivel('sintetico')
    const falou = await this.voz.falar(linhas, aoComecarLinha)
    this.pararLoopNivel()
    return falou
  }

  /** O operador manda: mp3 gravado ou voz do sistema. */
  definirMotorDeVoz(motor: 'mp3' | 'sistema'): void {
    this.forcarVozNavegador = motor === 'sistema'
  }

  vozNavegadorForcada(): boolean {
    return this.forcarVozNavegador
  }

  /** Nome da voz do navegador, pro diagnóstico na tela. */
  descricaoDaVoz(): string {
    return nomeDaVoz()
  }

  /** Vozes em português instaladas, da melhor pra pior. */
  vozesDisponiveis(): string[] {
    return listarVozes()
  }

  /** Troca a voz pelo número da lista. */
  escolherVoz(numero: number): string | null {
    return escolherVoz(numero)
  }

  /** Liga o som de fundo do oceano, que segue a profundidade. */
  iniciarAmbiente(lerProfundidade: () => number): void {
    this.obterContexto()
    this.ambiente?.iniciar(lerProfundidade)
  }

  pararAmbiente(): void {
    this.ambiente?.parar()
  }

  /** Liga/desliga e devolve o estado novo. */
  alternarAmbiente(lerProfundidade: () => number): boolean {
    if (this.ambiente?.estaLigado()) {
      this.ambiente.parar()
      return false
    }
    this.iniciarAmbiente(lerProfundidade)
    return true
  }

  /** A voz da IA tem prioridade: o ambiente recua enquanto ela fala. */
  abafarAmbiente(sim: boolean): void {
    this.ambiente?.abafar(sim)
  }

  // --- trilha ---------------------------------------------------------------

  /**
   * Prepara a trilha e diz se o arquivo existe.
   *
   * Não há trilha sintética de reserva, por decisão: um sintetizador imitando
   * música de suspense soaria pior que silêncio, e a cena se sustenta sem ela.
   * O que não pode acontecer é ninguém descobrir a falta antes da feira — daí
   * a resposta entrar no log de ativação.
   */
  async prepararTrilha(): Promise<boolean> {
    if (this.trilhaOk !== null) return this.trilhaOk
    try {
      return await this.carregarTrilha()
    } catch (erro) {
      console.warn('[audio] trilha indisponível:', erro)
      this.trilhaOk = false
      this.trilha = null
      return false
    }
  }

  private async carregarTrilha(): Promise<boolean> {
    const elemento = new Audio(CAMINHO_TRILHA)
    elemento.loop = true
    elemento.preload = 'auto'
    elemento.volume = 0
    // No DOM, escondido. Um `<audio>` solto toca igual, mas fica invisível pra
    // quem precisar conferir o que está acontecendo com o som — e o operador
    // que abre o inspetor no dia da feira merece encontrar o elemento.
    elemento.hidden = true
    elemento.dataset.papel = 'trilha'
    document.body.appendChild(elemento)
    this.trilhaOk = await new Promise<boolean>((resolve) => {
      let respondido = false
      const responder = (ok: boolean) => {
        if (respondido) return
        respondido = true
        resolve(ok)
      }
      elemento.addEventListener('canplaythrough', () => responder(true), { once: true })
      elemento.addEventListener('loadeddata', () => responder(true), { once: true })
      elemento.addEventListener('error', () => responder(false), { once: true })
      // Rede de segurança: por file:// o Chrome às vezes não dispara nenhum dos
      // dois. Sem o teto, a tela de ativação ficaria esperando pra sempre.
      window.setTimeout(() => responder(elemento.readyState > 0), 4000)
      elemento.load()
    })
    this.trilha = this.trilhaOk ? elemento : null
    return this.trilhaOk
  }

  temTrilha(): boolean {
    return this.trilhaOk === true
  }

  /** Entra com fade de 1,5 s. Chamar de novo enquanto toca não reinicia. */
  iniciarTrilha(): void {
    const trilha = this.trilha
    if (!trilha) return
    try {
      this.trilhaAlvo = TRILHA_VOLUME
      this.msFade = MS_FADE_TRILHA
      if (trilha.paused) {
        trilha.currentTime = 0
        void trilha.play().catch(() => {
          this.trilhaOk = false
          this.trilha = null
        })
      }
      this.rodarFadeTrilha()
    } catch (erro) {
      console.warn('[audio] trilha não iniciou:', erro)
      this.trilha = null
    }
  }

  /** Sai com fade de 1,5 s, ou de corte quando a cena pede silêncio seco. */
  /**
   * Silencia a trilha. `corte` mata na hora; sem ele, desce em `ms`.
   *
   * O fim do combate pede 3 s: o contato foi neutralizado e a música se
   * despede junto com a ameaça, em vez de ser cortada como no susto.
   */
  pararTrilha(corte = false, ms = MS_FADE_TRILHA): void {
    if (!this.trilha) return
    this.trilhaAlvo = 0
    this.msFade = ms
    if (corte) {
      this.trilha.volume = 0
      this.trilha.pause()
      if (this.fadeTrilha) {
        window.clearInterval(this.fadeTrilha)
        this.fadeTrilha = 0
      }
      return
    }
    this.rodarFadeTrilha()
  }

  /** A voz da IA tem prioridade: a trilha recua 9 dB enquanto ela fala. */
  abafarTrilha(sim: boolean): void {
    if (this.trilhaAbafada === sim) return
    this.trilhaAbafada = sim
    if (this.trilha && !this.trilha.paused) this.rodarFadeTrilha()
  }

  /**
   * Um único intervalo cuida do fade e do ducking.
   *
   * Os dois mexem no mesmo volume, e com dois laços separados eles brigariam:
   * o ducking puxaria pra baixo enquanto o fade puxa pra cima, e o resultado
   * dependeria de qual rodasse por último. Aqui existe um alvo só.
   */
  private rodarFadeTrilha(): void {
    if (this.fadeTrilha) return
    const passo = 40
    this.fadeTrilha = window.setInterval(() => {
      const trilha = this.trilha
      if (!trilha) {
        window.clearInterval(this.fadeTrilha)
        this.fadeTrilha = 0
        return
      }
      const alvo = this.trilhaAlvo * (this.trilhaAbafada ? TRILHA_DUCK : 1)
      const delta = (TRILHA_VOLUME * passo) / this.msFade
      const resta = alvo - trilha.volume
      trilha.volume = Math.max(
        0,
        Math.min(1, Math.abs(resta) <= delta ? alvo : trilha.volume + Math.sign(resta) * delta),
      )
      if (trilha.volume === alvo) {
        if (alvo === 0) trilha.pause()
        window.clearInterval(this.fadeTrilha)
        this.fadeTrilha = 0
      }
    }, passo)
  }

  /** Estado do AudioContext, pro diagnóstico do operador. */
  estadoDoContexto(): string {
    return this.contexto?.state ?? 'não criado'
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
    this.voz.parar()
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
  /** Encerra a trilha junto com tudo o mais. */
  pararTudoDeFundo(): void {
    this.pararTrilha(true)
  }

  stop(): void {
    this.pararVoz()
    this.pararHidrofone()
    if (this.sfxAtual) {
      this.sfxAtual.pause()
      this.sfxAtual.currentTime = 0
      this.sfxAtual = null
    }
  }

  // --- hidrofone (2B) -----------------------------------------------------

  /**
   * Põe um som do hidrofone em loop e devolve `true` se conseguiu.
   *
   * Prefere o mp3 embutido (`./audio/sfx/hidro-<id>.mp3`) e cai no sintetizado
   * — o projeto inteiro roda sem nenhum arquivo de som, e esta dinâmica não
   * podia ser a exceção que quebra a apresentação por falta de download.
   */
  iniciarHidrofone(id: string): boolean {
    this.pararHidrofone()
    const contexto = this.obterContexto()
    if (!contexto || !this.saidaSfx) return false
    void contexto.resume()

    if (!this.analisadorHidro) {
      this.analisadorHidro = contexto.createAnalyser()
      this.analisadorHidro.fftSize = 1024
      this.analisadorHidro.smoothingTimeConstant = 0.6
      this.analisadorHidro.connect(this.saidaSfx)
      this.espectroHidro = new Uint8Array(
        new ArrayBuffer(this.analisadorHidro.frequencyBinCount),
      )
      this.ondaHidro = new Uint8Array(new ArrayBuffer(this.analisadorHidro.fftSize))
    }

    const url = `./audio/sfx/hidro-${id}.mp3`
    if (this.embutido(url)) {
      const elemento = this.obterElemento(url)
      elemento.loop = true
      elemento.currentTime = 0
      let fonte = this.roteadosHidro.get(elemento)
      if (!fonte) {
        fonte = contexto.createMediaElementSource(elemento)
        this.roteadosHidro.set(elemento, fonte)
      }
      fonte.connect(this.analisadorHidro)
      this.elementoHidro = elemento
      void elemento.play().catch(() => {
        /* cai no sintetizado no próximo som */
      })
    } else {
      this.somHidro = tocarSomDoHidrofone(contexto, this.analisadorHidro, id)
      if (!this.somHidro) return false
    }

    this.iniciarLoopHidro()
    return true
  }

  pararHidrofone(): void {
    this.somHidro?.parar()
    this.somHidro = null
    if (this.elementoHidro) {
      this.elementoHidro.pause()
      this.elementoHidro.currentTime = 0
      this.elementoHidro = null
    }
    if (this.loopHidro) cancelAnimationFrame(this.loopHidro)
    this.loopHidro = 0
    this.nivelHidro = 0
  }

  /** Espectro do hidrofone agora (0–255 por faixa). Vazio se nada toca. */
  espectroDoHidrofone(): Uint8Array | null {
    if (!this.analisadorHidro || !this.espectroHidro) return null
    this.analisadorHidro.getByteFrequencyData(this.espectroHidro)
    return this.espectroHidro
  }

  /** Forma de onda do hidrofone agora (0–255, 128 = silêncio). */
  ondaDoHidrofone(): Uint8Array | null {
    if (!this.analisadorHidro || !this.ondaHidro) return null
    this.analisadorHidro.getByteTimeDomainData(this.ondaHidro)
    return this.ondaHidro
  }

  private iniciarLoopHidro(): void {
    const passo = () => {
      const onda = this.ondaDoHidrofone()
      if (onda) {
        let soma = 0
        for (let i = 0; i < onda.length; i++) {
          const desvio = (onda[i] - 128) / 128
          soma += desvio * desvio
        }
        const rms = Math.sqrt(soma / onda.length)
        this.nivelHidro = misturar(this.nivelHidro, Math.min(1, rms * 3), 0.3)
      }
      this.loopHidro = requestAnimationFrame(passo)
    }
    this.loopHidro = requestAnimationFrame(passo)
  }

  // --- nível --------------------------------------------------------------

  /**
   * Intensidade da voz agora, de 0 a 1. Lido pelo orbe dentro do próprio
   * requestAnimationFrame dele — nunca vira estado do React, que a 60 fps
   * re-renderizaria a árvore inteira.
   */
  nivel(): number {
    // O orbe pulsa com o que estiver soando: a voz da IA ou, na dinâmica do
    // hidrofone, o próprio som captado. São dois caminhos separados no grafo,
    // e o orbe só quer saber do mais alto dos dois.
    return Math.max(this.nivelAtual, this.nivelHidro)
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
