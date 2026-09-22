import { especiePorChave, especiesEm, type Especie } from './bestiario'
import { perfilDe, rgba, suave, type Perfil } from './perfil'

/**
 * O oceano ao redor do submarino.
 *
 * Existe UM mundo, simulado uma vez por quadro. Os canvases registrados (dois
 * mini-feeds, o painel de câmera e o fundo do palco) só DESENHAM o mesmo estado
 * de pontos de vista diferentes — simular três vezes seria o triplo do custo
 * por nenhum ganho.
 *
 * Coordenadas de mundo: x em [0, LARGURA_MUNDO), y em [0, 1] (0 = topo do
 * quadro, 1 = fundo). Cada câmera é uma janela de largura `abertura` a partir
 * de `x0`.
 */

const LARGURA_MUNDO = 3
const QTD_PEIXES = 60
const QTD_PARTICULAS = 130
const QTD_BIOLUM = 46
const QTD_AGUAS_VIVAS = 7
const QTD_CORAIS = 14
/**
 * Ameacas. Poucas de proposito: uma rede fantasma a cada quadro vira padrao
 * decorativo, e o que os alunos acabaram de dizer e que sao encontros, nao
 * paisagem. Aparecem so quando o roteiro liga `ameacas`.
 */
const QTD_REDES = 5
const QTD_PLASTICOS = 26
const MAX_FAUNA = 3
/**
 * Intervalo entre aparições de fauna grande. Era [15s, 40s]: numa apresentação
 * de cinco minutos dava pra a câmera passar a cena inteira sem nenhum bicho, e
 * os bichos são metade da graça da câmera externa.
 */
const INTERVALO_FAUNA = [7000, 20000] as const
/** Perda de sinal: a cada tanto, por tanto tempo. */
const INTERVALO_FALHA = [30000, 90000] as const
const DURACAO_FALHA = 400
/** Quanto o visor remendado leva pra parar de chuviscar, na subida. */
const MS_LIMPANDO_VISOR = 9000
/** Duração da passagem da silhueta pela estática, entre rodadas do combate. */
const MS_PASSAGEM_FEED = 1500

const sorteio = (min: number, max: number) => min + Math.random() * (max - min)

export type OpcoesCamera = {
  /** Canto esquerdo da janela, em coordenadas de mundo. */
  x0: number
  /** Largura da janela. Maior = mais mundo visível. */
  abertura: number
  /** Bombordo e estibordo veem lados diferentes do mesmo cardume. */
  espelhado?: boolean
  /** Opacidade geral — o fundo do palco entra bem apagado. */
  opacidade?: number
  /** Feed sem sinal: só estática. */
  estatica?: boolean
  /** Sem moldura nem retículo (usado pelo fundo do palco). */
  simples?: boolean
}

export type Alvo = { x: number; y: number; distancia: number; rotulo: string }

type Peixe = { x: number; y: number; vx: number; vy: number; z: number }
type Fauna = {
  x: number
  y: number
  vx: number
  escala: number
  /** Quem é o bicho: faixa de profundidade, porte e como se desenha. */
  especie: Especie
  distancia: number
  fase: number
  /** 1 = presente; cai até 0 quando a expedição sai da faixa da espécie. */
  vida: number
  /**
   * Vulto: silhueta quase preta cortando o facho, invocada pelo roteiro.
   *
   * Não é um bicho da fauna normal — é um relance. Renderizado em silhueta e
   * sem o piso de opacidade que faz a fauna comum ser vista: aqui o ponto é
   * justamente NÃO se ver direito.
   */
  vulto?: boolean
  /**
   * Multiplicador do relógio da animação. 1 = o ritmo natural da espécie.
   *
   * Existe por causa da travessia do olho: o megalodonte bate a cauda a 0,4 Hz,
   * o que em três segundos é UMA batida — e uma batida não lê como nadar.
   */
  ritmo?: number
  /**
   * Altura de referência. Com ela, o bicho ONDULA em volta de uma linha em vez
   * de derivar.
   *
   * A deriva normal da fauna é um passeio aleatório, e em três segundos de
   * travessia ela tirava o megalodonte do facho: ele entrava no meio do quadro
   * e saía pelo rodapé. Aqui a altura é da cena, não do acaso.
   */
  yBase?: number
  /**
   * Travessia: o bicho passando no facho, DESENHADO — não em silhueta.
   *
   * É o contrário do vulto. O vulto é um relance preto; aqui a plateia tem que
   * ver o CORPO: as guelras, o dorso, a pele pegando a lanterna do submarino.
   * Por isso ele é pintado com a luz do perfil e com opacidade cheia, e por
   * isso escapa da faixa de profundidade da espécie, como o vulto.
   */
  travessia?: boolean
  /** 0 = ondulação natural, 1 = tronco duro e só a cauda varrendo. */
  rigidez?: number
}
type Particula = { x: number; y: number; v: number; raio: number; fase: number }
type Biolum = { x: number; y: number; fase: number; periodo: number; raio: number }
type AguaViva = { x: number; y: number; v: number; fase: number; escala: number }
type Coral = { x: number; ramos: Array<[number, number]>; altura: number }
/** Rede fantasma: malha de pesca a deriva, 1000-3000 m. */
type Rede = { x: number; y: number; v: number; fase: number; largura: number; nos: number }
/** Fragmento de plastico a deriva, 200-1000 m. */
type Plastico = { x: number; y: number; v: number; giro: number; tamanho: number; forma: number }

type Registro = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  camera: OpcoesCamera
  aoDesenhar?: (info: { alvo: Alvo | null; profundidade: number }) => void
}

export class MotorMundo {
  /** Profundidade exibida agora, em metros. Anima até o alvo. */
  private profundidadeAtual = 50
  private profundidadeAlvo = 50
  /** Metros por segundo da descida — calculado a cada alvo novo. */
  private velocidadeDescida = 0
  private aoTicar: ((metros: number) => void) | null = null
  private ultimoTique = 0

  /** Pane: todos os feeds caem pra estática. */
  estaticaGlobal = false

  /**
   * Estado do visor externo.
   *
   * `rachado` derruba todas as câmeras — a pressão quebrou o vidro e não há
   * imagem, só estática. `parcial` é o conserto de emergência do 3A: a imagem
   * volta, mas suja, e a sujeira vai diminuindo sozinha ao longo de alguns
   * segundos. A RACHADURA em si não é desenhada aqui: ela é um overlay de DOM
   * por cima do canvas, porque precisa ficar por cima da estática também.
   */
  private visor: 'ok' | 'rachado' | 'parcial' = 'ok'
  private visorDesde = 0

  definirVisor(estado: 'ok' | 'rachado' | 'parcial') {
    if (estado === this.visor) return
    this.visor = estado
    this.visorDesde = performance.now()
  }

  estadoDoVisor() {
    return this.visor
  }

  private peixes: Peixe[] = []
  private fauna: Fauna[] = []
  private particulas: Particula[] = []
  private bioluminescencia: Biolum[] = []
  private aguasVivas: AguaViva[] = []
  private corais: Coral[] = []
  private redes: Rede[] = []
  private plasticos: Plastico[] = []

  /**
   * Ameacas visiveis: rede fantasma, plastico e coral branqueado.
   *
   * Desligado por padrao. O 3A liga na subida, depois de os grupos 3 e 4
   * falarem de poluicao — e a unica cena em que aparecem. Sem fala explicando:
   * os alunos acabaram de explicar, e a IA repetir seria tirar deles a fala.
   */
  ameacas = false

  private registros: Registro[] = []
  private quadro = 0
  private anterior = 0
  private t = 0
  private proximaFauna = 0
  private perfil: Perfil = perfilDe(50)
  // Qualidade adaptativa, igual à do orbe.
  private mediaQuadro = 16
  private economizar = false
  /**
   * Inclinação do mergulho, -1 a 1. Positivo desloca a janela do mundo pra
   * baixo, o que na tela lê como o horizonte da água SUBINDO — a proa apontou
   * pro fundo. É só um offset em y: nenhuma simulação nova, nenhum custo.
   */
  pitch = 0
  /** Fluxo de bolhas durante o mergulho, 0 a 1. */
  turbulencia = 0
  /**
   * Agitação: 0 a 1.
   *
   * A água virando antes de o bicho chegar. O farol oscila, o sedimento entra
   * em turbilhão e a imagem treme — é o aviso que a câmera dá antes de a IA
   * entender o que está acontecendo. Ligada por cena, não por profundidade.
   */
  agitacao = 0

  /**
   * Passagem: a silhueta distorcendo a ESTÁTICA, entre rodadas do combate.
   *
   * Não é o bicho aparecendo — as câmeras estão destruídas e não há imagem
   * nenhuma. O que acontece é que o ruído se organiza por um instante na forma
   * dele e volta a ser ruído. É o mais perto de "ver" que a cena permite, e é
   * de propósito que nunca fique nítido: nitidez seria a IA recuperando a
   * visão, e a cena inteira depende de ela não recuperar.
   */
  private passagemCriatura: string | null = null
  private passagemInicio = 0

  passagem(chave: string) {
    if (!especiePorChave(chave)) return
    this.passagemCriatura = chave
    this.passagemInicio = performance.now()
  }

  pararPassagem() {
    this.passagemCriatura = null
  }

  /** Quanto da passagem já correu, 0 a 1. Fora dela, null. */
  private avancoPassagem(agora: number): number | null {
    if (!this.passagemCriatura) return null
    const f = (agora - this.passagemInicio) / MS_PASSAGEM_FEED
    if (f >= 1) {
      this.passagemCriatura = null
      return null
    }
    return f
  }

  /**
   * Manda um vulto atravessar o facho, agora.
   *
   * Uma passada só, rápida e escura. É o relance que o roteiro pede antes do
   * olho — e ele existe pra a criatura não aparecer do nada dois segundos
   * depois, o que leria como truque em vez de perseguição.
   */
  invocarVulto(chave: string) {
    const especie = especiePorChave(chave)
    if (!especie) return
    const paraDireita = Math.random() < 0.5
    this.fauna.push({
      x: paraDireita ? -0.6 : LARGURA_MUNDO + 0.6,
      y: sorteio(0.38, 0.56),
      // Rápido: ele CORTA a luz, não desfila nela.
      vx: (paraDireita ? 1 : -1) * 0.95,
      escala: especie.porte[1] * 1.15,
      especie,
      distancia: sorteio(8, 16),
      fase: Math.random() * Math.PI * 2,
      vida: 1,
      vulto: true,
    })
  }

  /**
   * Travessia: a criatura cruza o facho de ponta a ponta, num tempo dado.
   *
   * Diferente do vulto, que é um relance rápido e fora de controle: aqui a
   * duração é do roteiro, porque a cena depende de a plateia ter TEMPO de
   * medir o bicho com os olhos. Ele entra por um lado, atravessa a luz inteira
   * e sai pelo outro; o que fica é o tamanho.
   *
   * Assume a janela de câmera [0, 1] — a mesma do feed grande do olho.
   */
  travessia(chave: string, segundos: number, escala = 13) {
    const especie = especiePorChave(chave)
    if (!especie) return
    // ESCALA 13: o corpo tem ~3,5 larguras de quadro e o dobro da altura dele.
    // A plateia nunca vê o bicho, vê um FLANCO — e é isso que dá o tamanho.
    //
    // O enquadramento é feito pra o ROSTO não entrar. O focinho começa uma
    // largura e meia de quadro à direita e só se afasta; o que atravessa a
    // câmera é da guelra pra trás. Mostrar a cara resolveria o mistério que a
    // cena seguinte existe pra criar.
    //
    // As contas são da câmera grande (480×304): meio corpo mede ~1,7 unidade,
    // a guelra fica a ~1,04 do centro e a ponta da cauda a ~1,94. Sai quando a
    // cauda passa da borda direita.
    const DE = -0.05
    const ATE = 3.05
    this.travessiaViva = {
      x: DE,
      // Abaixo do quadro: assim o que cruza a tela é a LINHA DO DORSO com o
      // corpo embaixo dela. Centrado, o quadro cairia inteiro dentro do bicho e
      // sobraria uma parede lisa — sem borda, nada diz que aquilo é um animal.
      y: 1,
      yBase: 1,
      vx: (ATE - DE) / segundos,
      escala,
      especie,
      distancia: 7,
      fase: Math.random() * Math.PI * 2,
      // Começa invisível: quem acende é o fade de entrada.
      vida: 0,
      travessia: true,
      // Tronco duro, só a cauda varrendo — tubarão grande não serpenteia.
      rigidez: 1,
      ritmo: 1.3,
    }
    this.fauna.push(this.travessiaViva)
  }

  /** Tira a travessia da água. O Player chama ao sair do passo. */
  pararTravessia() {
    if (!this.travessiaViva) return
    const i = this.fauna.indexOf(this.travessiaViva)
    if (i >= 0) this.fauna.splice(i, 1)
    this.travessiaViva = null
  }

  private travessiaViva: Fauna | null = null
  /**
   * Quanto a fauna COMUM aparece. Cai a quase nada durante a travessia.
   *
   * Sem isto, uma água-viva e um peixinho dividiam o quadro com o megalodonte
   * — e, pior, eram desenhados mais opacos que ele, porque a fauna comum tem
   * piso de opacidade e ele não. Um bicho enorme perde o tamanho na hora em que
   * divide a luz com outra coisa. Aqui a água esvazia e sobra ele.
   */
  private atenuacaoFauna = 1
  /** Canvas de apoio da travessia. Um só, redimensionado quando precisa. */
  private telaFora: HTMLCanvasElement | null = null

  private telaTravessia(L: number, A: number): CanvasRenderingContext2D | null {
    this.telaFora ??= document.createElement('canvas')
    if (this.telaFora.width !== L || this.telaFora.height !== A) {
      this.telaFora.width = L
      this.telaFora.height = A
    }
    return this.telaFora.getContext('2d')
  }

  constructor() {
    this.semear()
  }

  private semear() {
    for (let i = 0; i < QTD_PEIXES; i++) {
      this.peixes.push({
        x: Math.random() * LARGURA_MUNDO,
        y: 0.15 + Math.random() * 0.7,
        vx: sorteio(0.03, 0.09) * (Math.random() < 0.5 ? -1 : 1),
        vy: sorteio(-0.01, 0.01),
        z: Math.random(),
      })
    }
    for (let i = 0; i < QTD_PARTICULAS; i++) {
      this.particulas.push({
        x: Math.random() * LARGURA_MUNDO,
        y: Math.random(),
        v: sorteio(0.02, 0.07),
        raio: sorteio(0.6, 2.2),
        fase: Math.random() * Math.PI * 2,
      })
    }
    for (let i = 0; i < QTD_BIOLUM; i++) {
      this.bioluminescencia.push({
        x: Math.random() * LARGURA_MUNDO,
        y: Math.random(),
        fase: Math.random() * Math.PI * 2,
        periodo: sorteio(2, 7),
        raio: sorteio(1, 3),
      })
    }
    for (let i = 0; i < QTD_AGUAS_VIVAS; i++) {
      this.aguasVivas.push({
        x: Math.random() * LARGURA_MUNDO,
        y: 0.1 + Math.random() * 0.8,
        v: sorteio(-0.02, 0.02),
        fase: Math.random() * Math.PI * 2,
        escala: sorteio(0.7, 1.6),
      })
    }
    for (let i = 0; i < QTD_REDES; i++) {
      this.redes.push({
        x: Math.random() * LARGURA_MUNDO,
        y: 0.18 + Math.random() * 0.6,
        // Sobe devagar, como tudo que esta a deriva sem lastro.
        v: sorteio(0.004, 0.012),
        fase: Math.random() * Math.PI * 2,
        largura: sorteio(0.1, 0.22),
        nos: 5 + Math.floor(Math.random() * 3),
      })
    }
    for (let i = 0; i < QTD_PLASTICOS; i++) {
      this.plasticos.push({
        x: Math.random() * LARGURA_MUNDO,
        y: Math.random(),
        v: sorteio(-0.012, 0.012),
        giro: Math.random() * Math.PI * 2,
        tamanho: sorteio(0.004, 0.016),
        forma: Math.random(),
      })
    }
    for (let i = 0; i < QTD_CORAIS; i++) {
      // Ramos gerados uma vez: coral não se mexe.
      const ramos: Array<[number, number]> = []
      const galhos = 3 + Math.floor(Math.random() * 4)
      for (let g = 0; g < galhos; g++) {
        ramos.push([sorteio(-0.7, 0.7), sorteio(0.4, 1)])
      }
      this.corais.push({
        x: Math.random() * LARGURA_MUNDO,
        ramos,
        altura: sorteio(0.06, 0.16),
      })
    }
  }

  // --- ciclo de vida -------------------------------------------------------

  iniciar() {
    if (this.quadro) return
    this.anterior = performance.now()
    this.proximaFauna = this.anterior + sorteio(2000, 6000)
    const laco = (agora: number) => {
      this.quadro = requestAnimationFrame(laco)
      const dt = Math.min(0.05, (agora - this.anterior) / 1000)
      this.anterior = agora
      this.mediaQuadro = this.mediaQuadro * 0.95 + dt * 1000 * 0.05
      this.economizar = this.mediaQuadro > 22
      this.atualizar(dt, agora)
      for (const registro of this.registros) this.desenhar(registro, agora)
    }
    this.quadro = requestAnimationFrame(laco)
  }

  parar() {
    if (this.quadro) cancelAnimationFrame(this.quadro)
    this.quadro = 0
  }

  registrar(registro: Registro) {
    this.registros.push(registro)
    this.iniciar()
  }

  desregistrar(canvas: HTMLCanvasElement) {
    this.registros = this.registros.filter((r) => r.canvas !== canvas)
  }

  // --- profundidade --------------------------------------------------------

  /** Define a profundidade-alvo; o motor anima até lá, sem pulo. */
  definirAlvo(metros: number, duracaoMs?: number) {
    this.profundidadeAlvo = metros
    const distancia = Math.abs(metros - this.profundidadeAtual)
    // 3 a 6 s conforme a distância, como pede o roteiro.
    const duracao = duracaoMs ?? Math.min(6000, Math.max(3000, distancia * 4))
    this.velocidadeDescida = distancia / (duracao / 1000)
  }

  /** Sem animação — usado pelo comando de debug e pelo estado inicial. */
  fixarProfundidade(metros: number) {
    this.profundidadeAtual = metros
    this.profundidadeAlvo = metros
    this.velocidadeDescida = 0
    this.perfil = perfilDe(metros)
    this.aoTicar?.(Math.round(metros))
  }

  profundidade() {
    return this.profundidadeAtual
  }

  descendo() {
    return Math.abs(this.profundidadeAlvo - this.profundidadeAtual) > 1
  }

  /** O HUD escreve o número direto no DOM: virar estado seria render por quadro. */
  observarProfundidade(cb: ((metros: number) => void) | null) {
    this.aoTicar = cb
    if (cb) cb(Math.round(this.profundidadeAtual))
  }

  // --- simulação -----------------------------------------------------------

  private atualizar(dt: number, agora: number) {
    this.t += dt

    // Esvazia (e depois repovoa) a água em ~250 ms. Em rampa, e não em corte,
    // pra os bichos não sumirem de um quadro pro outro na frente da plateia.
    const alvoFauna = this.travessiaViva ? 0.1 : 1
    this.atenuacaoFauna += (alvoFauna - this.atenuacaoFauna) * Math.min(1, dt * 4)

    // profundidade
    if (this.velocidadeDescida > 0) {
      const passo = this.velocidadeDescida * dt
      const resta = this.profundidadeAlvo - this.profundidadeAtual
      if (Math.abs(resta) <= passo) {
        this.profundidadeAtual = this.profundidadeAlvo
        this.velocidadeDescida = 0
      } else {
        this.profundidadeAtual += Math.sign(resta) * passo
      }
      if (agora - this.ultimoTique > 80) {
        this.ultimoTique = agora
        this.aoTicar?.(Math.round(this.profundidadeAtual))
      }
    }
    this.perfil = perfilDe(this.profundidadeAtual)

    // cardume: boids com vizinhança amostrada (8 vizinhos por peixe e quadro)
    const total = this.peixes.length
    for (let i = 0; i < total; i++) {
      const peixe = this.peixes[i]
      let cx = 0
      let cy = 0
      let ax = 0
      let ay = 0
      let sx = 0
      let sy = 0
      let vizinhos = 0

      for (let k = 0; k < 8; k++) {
        const outro = this.peixes[(Math.random() * total) | 0]
        if (outro === peixe) continue
        const dx = outro.x - peixe.x
        const dy = outro.y - peixe.y
        const dist2 = dx * dx + dy * dy
        if (dist2 > 0.09) continue
        vizinhos++
        cx += outro.x
        cy += outro.y
        ax += outro.vx
        ay += outro.vy
        if (dist2 < 0.0016) {
          sx -= dx
          sy -= dy
        }
      }

      if (vizinhos > 0) {
        peixe.vx += ((cx / vizinhos - peixe.x) * 0.35 + (ax / vizinhos - peixe.vx) * 0.5) * dt
        peixe.vy += ((cy / vizinhos - peixe.y) * 0.35 + (ay / vizinhos - peixe.vy) * 0.5) * dt
      }
      peixe.vx += sx * dt * 2
      peixe.vy += sy * dt * 2
      // Puxa de volta pra faixa central do quadro.
      peixe.vy += (0.5 - peixe.y) * 0.04 * dt

      const vel = Math.hypot(peixe.vx, peixe.vy) || 1
      const alvo = 0.06
      peixe.vx = (peixe.vx / vel) * alvo
      peixe.vy = (peixe.vy / vel) * alvo

      peixe.x += peixe.vx * dt
      peixe.y += peixe.vy * dt
      if (peixe.x < 0) peixe.x += LARGURA_MUNDO
      if (peixe.x > LARGURA_MUNDO) peixe.x -= LARGURA_MUNDO
      peixe.y = Math.max(0.08, Math.min(0.92, peixe.y))
    }

    // fauna grande atravessando o quadro
    if (agora > this.proximaFauna && this.fauna.length < MAX_FAUNA) {
      this.proximaFauna = agora + sorteio(INTERVALO_FAUNA[0], INTERVALO_FAUNA[1])
      const paraDireita = Math.random() < 0.5
      // Quem aparece depende só dos metros. Descer troca o elenco: a tartaruga
      // some, o cachalote entra, e mais fundo ainda quem passa é a lula-gigante.
      const possiveis = especiesEm(this.profundidadeAtual)
      const especie = possiveis[(Math.random() * possiveis.length) | 0]
      this.fauna.push({
        x: paraDireita ? -0.5 : LARGURA_MUNDO + 0.5,
        // Faixa estreita de propósito: uma raia ocupa quase toda a altura do
        // quadro, e nascendo em 0,7 metade dela ficava fora da tela.
        y: sorteio(0.32, 0.62),
        // Bicho grande nada mais devagar — senão o cachalote cruza o quadro
        // como um peixinho e o tamanho não convence. Mas o freio era forte
        // demais: a 0,06 unidade/s ele levava quase um minuto pra atravessar o
        // mundo, e a câmera passava a maior parte do tempo vazia.
        vx: (sorteio(0.1, 0.22) / (0.8 + especie.porte[1] * 0.35)) * (paraDireita ? 1 : -1),
        escala: sorteio(especie.porte[0], especie.porte[1]),
        especie,
        distancia: sorteio(6, 40),
        fase: Math.random() * Math.PI * 2,
        vida: 1,
      })
    }
    for (let i = this.fauna.length - 1; i >= 0; i--) {
      const f = this.fauna[i]
      f.x += f.vx * dt
      if (f.yBase !== undefined) {
        f.y = f.yBase + Math.sin(this.t * 0.9 + f.fase) * 0.018
      } else {
        f.y += Math.sin(this.t * 0.6 + f.fase) * 0.004 * dt * 60
      }
      f.distancia += sorteio(-0.4, 0.4)
      f.distancia = Math.max(4, Math.min(60, f.distancia))

      // O vulto e a travessia são invocados pelo roteiro e não obedecem à
      // faixa: eles estão ali porque a cena disse que estão.
      if (f.travessia) {
        // Entra por fade, não por corte. O corpo é maior que o quadro, então
        // ele não tem borda pra "entrar" — o que a plateia vê é o facho
        // encontrando uma coisa que já estava ali, que assusta mais do que um
        // peixe passando.
        f.vida = Math.min(1, f.vida + dt * 2.2)
      }
      if (f.vulto || f.travessia) {
        if (f.x < -1.2 || f.x > LARGURA_MUNDO + 1.2) this.fauna.splice(i, 1)
        continue
      }

      // A expedição desce enquanto o bicho ainda atravessa o quadro. Se a nova
      // profundidade não é mais a dele, ele se apaga no escuro em vez de
      // continuar ali — um tubarão a 4500 m entrega a farsa na hora.
      const [de, ate] = f.especie.faixa
      // Folga proporcional, mas com teto: 25% de uma faixa larga dava 750 m de
      // tolerância, e um peixe-víbora continuava aparecendo a 4500 m.
      const folga = Math.min(350, (ate - de) * 0.15)
      const cabe = this.profundidadeAtual >= de - folga && this.profundidadeAtual <= ate + folga
      f.vida = Math.max(0, Math.min(1, f.vida + (cabe ? dt : -dt / 2.2)))

      if (f.vida <= 0 || f.x < -1 || f.x > LARGURA_MUNDO + 1) this.fauna.splice(i, 1)
    }

    // partículas: bolhas sobem perto da superfície, neve marinha desce no fundo
    // Durante o mergulho tudo sobe em fluxo, independente da zona: é a água
    // passando pelo casco, não a partícula de sempre.
    const subindo = this.turbulencia > 0.05 ? true : this.perfil.bolhas > this.perfil.neve
    // Turbulência (mergulho) e agitação (o bicho chegando) empurram a água do
    // mesmo jeito, então somam na mesma conta.
    const corrida = 1 + this.turbulencia * 5 + this.agitacao * 3.5
    for (const particula of this.particulas) {
      particula.y += (subindo ? -particula.v : particula.v * 0.35) * dt * corrida
      // Na agitação o sedimento roda em vez de subir reto: é turbilhão, não
      // corrente. O seno lateral ganha amplitude e frequência.
      const giro = 1 + this.agitacao * 6
      particula.x +=
        Math.sin(this.t * 0.7 * giro + particula.fase) * 0.004 * (1 + this.agitacao * 5) * dt * 60
      if (particula.y < -0.05) particula.y = 1.05
      if (particula.y > 1.05) particula.y = -0.05
    }

    for (const agua of this.aguasVivas) {
      agua.y -= 0.006 * dt
      agua.x += agua.v * dt
      if (agua.y < -0.1) agua.y = 1.1
      if (agua.x < 0) agua.x += LARGURA_MUNDO
      if (agua.x > LARGURA_MUNDO) agua.x -= LARGURA_MUNDO
    }

    // Ameacas: so simula quando estao ligadas. No 2A isto custa um `if`.
    if (this.ameacas) {
      for (const rede of this.redes) {
        rede.y -= rede.v * dt
        if (rede.y < -0.2) rede.y = 1.2
      }
      for (const p of this.plasticos) {
        p.y -= 0.009 * dt
        p.x += p.v * dt
        p.giro += dt * 0.25
        if (p.y < -0.06) p.y = 1.06
        if (p.x < 0) p.x += LARGURA_MUNDO
        if (p.x > LARGURA_MUNDO) p.x -= LARGURA_MUNDO
      }
    }
  }

  // --- desenho -------------------------------------------------------------

  private desenhar(registro: Registro, agora: number) {
    const { ctx, canvas, camera } = registro
    const L = canvas.width
    const A = canvas.height
    if (L < 2 || A < 2) return

    const perfil = this.perfil
    const estatica = camera.estatica || this.estaticaGlobal || this.visor === 'rachado'

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1

    if (estatica) {
      this.desenharEstatica(ctx, L, A)
      const passagem = this.avancoPassagem(agora)
      if (passagem !== null) this.desenharPassagem(ctx, L, A, passagem, camera)
      registro.aoDesenhar?.({ alvo: null, profundidade: this.profundidadeAtual })
      return
    }

    ctx.globalAlpha = camera.opacidade ?? 1

    // Tremor de pressão no abisso, mais o da agitação quando o roteiro liga.
    const balanco =
      perfil.tremor + this.agitacao * 2.6 * (0.7 + Math.sin(agora / 140) * 0.3)
    const tremor = balanco * (Math.sin(agora / 90) + Math.sin(agora / 37)) * 0.9
    ctx.translate(tremor, tremor * 0.4)

    // fundo — pintado ANTES da inclinação, senão sobraria faixa vazia na borda
    const gradiente = ctx.createLinearGradient(0, 0, 0, A)
    gradiente.addColorStop(0, rgba(perfil.fundoTopo, 1))
    gradiente.addColorStop(1, rgba(perfil.fundoBaixo, 1))
    ctx.fillStyle = gradiente
    ctx.fillRect(-4, -4, L + 8, A + 8)

    // Inclinação do mergulho: desloca o conteúdo, não o fundo.
    if (this.pitch !== 0) ctx.translate(0, this.pitch * A * 0.14)

    const mundoParaTela = (x: number) => {
      let dx = x - camera.x0
      // Mundo cilíndrico: o que sai de um lado volta do outro.
      if (dx < -LARGURA_MUNDO / 2) dx += LARGURA_MUNDO
      if (dx > LARGURA_MUNDO / 2) dx -= LARGURA_MUNDO
      const frac = dx / camera.abertura
      return (camera.espelhado ? 1 - frac : frac) * L
    }
    const visivel = (sx: number, margem = 40) => sx > -margem && sx < L + margem

    this.desenharSuperficie(ctx, L, A, perfil)
    this.desenharRaios(ctx, L, A, perfil, agora)
    this.desenharCorais(ctx, L, A, perfil, mundoParaTela, visivel)
    if (this.ameacas) {
      this.desenharRedes(ctx, A, mundoParaTela, visivel)
      this.desenharPlasticos(ctx, A, perfil, mundoParaTela, visivel)
    }
    this.desenharAguasVivas(ctx, L, A, perfil, mundoParaTela, visivel)
    this.desenharCardume(ctx, L, A, perfil, mundoParaTela, visivel)
    const alvo = this.desenharFauna(ctx, L, A, perfil, mundoParaTela, visivel, camera)
    this.desenharParticulas(ctx, L, A, perfil, mundoParaTela, visivel)
    this.desenharBioluminescencia(ctx, L, A, perfil, mundoParaTela, visivel, agora)
    this.desenharFarol(ctx, L, A, perfil, agora)
    if (!camera.simples) this.desenharGrao(ctx, L, A)
    // Visor remendado: a imagem voltou suja e vai limpando sozinha. É o que
    // conta que alguém consertou às pressas, sem precisar de uma linha de fala.
    if (this.visor === 'parcial') {
      const sujeira = Math.max(0, 1 - (agora - this.visorDesde) / MS_LIMPANDO_VISOR)
      if (sujeira > 0.02) this.desenharChuvisco(ctx, L, A, sujeira)
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    registro.aoDesenhar?.({ alvo, profundidade: this.profundidadeAtual })
  }

  /**
   * A silhueta organizando o ruído.
   *
   * O truque é não desenhar o bicho: desenha-se a MÁSCARA dele e, dentro dela,
   * a estática ganha outra densidade e outro brilho. O olho reconhece a forma
   * pela diferença de textura, não por um contorno — e é isso que deixa a
   * imagem ambígua o tempo todo, sem nunca virar um desenho.
   */
  private desenharPassagem(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    avanco: number,
    camera: OpcoesCamera,
  ) {
    const especie = especiePorChave(this.passagemCriatura ?? '')
    if (!especie) return
    // Entra e sai: sem o seno ela apareceria e sumiria em corte.
    const forca = Math.sin(avanco * Math.PI) ** 0.7
    if (forca < 0.02) return

    ctx.save()
    // Atravessa o quadro no tempo da passagem.
    const x = L * (camera.espelhado ? 1.35 - avanco * 1.7 : -0.35 + avanco * 1.7)
    ctx.translate(x, A * 0.52)
    if (camera.espelhado) ctx.scale(-1, 1)
    const comp = L * 0.95
    ctx.beginPath()
    especie.desenhar({
      ctx,
      comp,
      alt: comp * especie.proporcao,
      t: this.t,
      fase: 0.4,
      luz: 0,
      farol: 0,
      alpha: 1,
      silhueta: true,
    })
    ctx.restore()

    // A máscara acabou de ser pintada em preto por cima da estática. Agora o
    // ruído volta SÓ ali dentro, mais denso e mais claro.
    ctx.save()
    ctx.globalCompositeOperation = 'source-atop'
    const linhas = Math.round(70 * forca)
    for (let i = 0; i < linhas; i++) {
      const y = Math.random() * A
      ctx.fillStyle = `rgba(150, 220, 230, ${Math.random() * 0.5 * forca})`
      ctx.fillRect(Math.random() * L - L * 0.2, y, L * (0.2 + Math.random() * 0.8), Math.random() * 3)
    }
    ctx.restore()
  }

  /** Chuvisco por cima da imagem: interferência, não perda total de sinal. */
  private desenharChuvisco(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    intensidade: number,
  ) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    const linhas = Math.round(26 * intensidade)
    for (let i = 0; i < linhas; i++) {
      ctx.fillStyle = `rgba(150, 215, 225, ${Math.random() * 0.3 * intensidade})`
      ctx.fillRect(Math.random() * L - L * 0.3, Math.random() * A, L * (0.2 + Math.random()), Math.random() * 2.5)
    }
    // Rolagem vertical de quadro perdido: uma faixa escura descendo devagar.
    const y = ((performance.now() / 9) % (A + 60)) - 30
    ctx.fillStyle = `rgba(6, 16, 20, ${0.35 * intensidade})`
    ctx.fillRect(0, y, L, 16)
  }

  private desenharEstatica(ctx: CanvasRenderingContext2D, L: number, A: number) {
    ctx.fillStyle = '#050a0c'
    ctx.fillRect(0, 0, L, A)
    const linhas = 90
    for (let i = 0; i < linhas; i++) {
      const y = Math.random() * A
      const alt = Math.random() * 3
      ctx.fillStyle = `rgba(120, 200, 210, ${Math.random() * 0.32})`
      ctx.fillRect(Math.random() * L - L * 0.2, y, L * (0.3 + Math.random()), alt)
    }
  }

  private desenharSuperficie(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
  ) {
    if (perfil.superficie < 0.02) return
    ctx.globalAlpha *= perfil.superficie
    ctx.beginPath()
    ctx.moveTo(0, 0)
    const base = A * 0.08
    for (let x = 0; x <= L; x += 8) {
      const y =
        base +
        Math.sin(x * 0.03 + this.t * 1.4) * A * 0.02 +
        Math.sin(x * 0.07 - this.t * 0.9) * A * 0.012
      ctx.lineTo(x, y)
    }
    ctx.lineTo(L, 0)
    ctx.closePath()
    ctx.fillStyle = 'rgba(150, 240, 255, 0.22)'
    ctx.fill()
    ctx.globalAlpha /= perfil.superficie
  }

  private desenharRaios(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    agora: number,
  ) {
    if (perfil.raios < 0.02) return
    const raios = this.economizar ? 3 : 6
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < raios; i++) {
      const base = ((i + 0.5) / raios) * L + Math.sin(agora / 3400 + i) * L * 0.06
      const largura = L * 0.07
      const gradiente = ctx.createLinearGradient(0, 0, 0, A * 0.9)
      gradiente.addColorStop(0, `rgba(160, 240, 255, ${0.14 * perfil.raios})`)
      gradiente.addColorStop(1, 'rgba(160, 240, 255, 0)')
      ctx.fillStyle = gradiente
      ctx.beginPath()
      ctx.moveTo(base - largura * 0.3, 0)
      ctx.lineTo(base + largura * 0.3, 0)
      ctx.lineTo(base + largura * 1.6, A * 0.9)
      ctx.lineTo(base - largura * 1.1, A * 0.9)
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  private desenharCorais(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
  ) {
    void L
    if (perfil.corais < 0.02) return
    // Branqueamento: os MESMOS corais, sem cor. É esse o ponto — não morreram
    // nem sumiram, perderam a alga que lhes dava cor e ficaram o esqueleto
    // branco. Desenhar um coral diferente diria a coisa errada.
    ctx.strokeStyle = this.ameacas
      ? `rgba(224, 228, 226, ${0.6 * perfil.corais})`
      : `rgba(30, 120, 130, ${0.55 * perfil.corais})`
    ctx.lineWidth = 2
    for (const coral of this.corais) {
      const sx = projetar(coral.x)
      if (!visivel(sx)) continue
      const base = A
      const alt = coral.altura * A * 2.4
      ctx.beginPath()
      ctx.moveTo(sx, base)
      ctx.lineTo(sx, base - alt)
      for (const [inclinacao, comprimento] of coral.ramos) {
        const y = base - alt * comprimento
        ctx.moveTo(sx, y)
        ctx.lineTo(sx + inclinacao * alt * 0.7, y - alt * 0.35)
      }
      ctx.stroke()
    }
  }

  /**
   * Rede fantasma: malha de pesca perdida, à deriva na batipelágica.
   *
   * Desenhada como GRADE distorcida, não como mancha: o que a torna
   * reconhecível — e sinistra — é a regularidade industrial no meio de um
   * lugar onde nada mais é reto. As linhas ondulam com a corrente, e a malha
   * some nas bordas em vez de terminar num retângulo.
   */
  private desenharRedes(
    ctx: CanvasRenderingContext2D,
    A: number,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
  ) {
    const escala = A / 144
    for (const rede of this.redes) {
      const sx = projetar(rede.x)
      if (!visivel(sx, 120)) continue
      const sy = rede.y * A
      const larg = rede.largura * A * 2.2
      const altura = larg * 0.75
      const passo = larg / rede.nos

      ctx.save()
      ctx.translate(sx, sy)
      ctx.rotate(Math.sin(this.t * 0.25 + rede.fase) * 0.2)
      ctx.strokeStyle = `rgba(206, 226, 224, 0.3)`
      ctx.lineWidth = Math.max(0.5, 0.7 * escala)

      const ondular = (i: number, j: number) =>
        Math.sin(this.t * 0.8 + rede.fase + i * 0.7 + j * 0.4) * passo * 0.28

      ctx.beginPath()
      for (let i = 0; i <= rede.nos; i++) {
        for (let j = 0; j <= rede.nos; j++) {
          const x = -larg / 2 + i * passo + ondular(i, j)
          const y = -altura / 2 + (j * altura) / rede.nos + ondular(j, i) * 0.6
          if (j > 0) {
            const xa = -larg / 2 + i * passo + ondular(i, j - 1)
            const ya = -altura / 2 + ((j - 1) * altura) / rede.nos + ondular(j - 1, i) * 0.6
            ctx.moveTo(xa, ya)
            ctx.lineTo(x, y)
          }
          if (i > 0) {
            const xa = -larg / 2 + (i - 1) * passo + ondular(i - 1, j)
            const ya = -altura / 2 + (j * altura) / rede.nos + ondular(j, i - 1) * 0.6
            ctx.moveTo(xa, ya)
            ctx.lineTo(x, y)
          }
        }
      }
      ctx.stroke()

      // A ponta rasgada: alguns fios soltos pendurados, que é o que uma rede
      // arrebentada tem e uma grade desenhada não tem.
      ctx.beginPath()
      for (let k = 0; k < 4; k++) {
        const x = -larg / 2 + ((k + 0.5) / 4) * larg
        const y = altura / 2
        ctx.moveTo(x, y)
        ctx.quadraticCurveTo(
          x + Math.sin(this.t * 1.1 + k) * passo * 0.5,
          y + passo * 0.8,
          x + Math.sin(this.t * 0.9 + k) * passo,
          y + passo * 1.7,
        )
      }
      ctx.strokeStyle = 'rgba(206, 226, 224, 0.22)'
      ctx.stroke()
      ctx.restore()
    }
  }

  /**
   * Plástico à deriva.
   *
   * Três formas, e a diferença entre elas importa: sacola (contorno mole que
   * ondula), fragmento (polígono duro) e anel. O que identifica plástico na
   * água é ele ser CLARO e não reagir à luz como o resto — não emite, não tem
   * volume, só reflete um pouco. Por isso é desenhado quase branco e chapado,
   * enquanto todo o resto do mundo tem gradiente.
   */
  private desenharPlasticos(
    ctx: CanvasRenderingContext2D,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
  ) {
    const brilho = 0.3 + perfil.luz * 0.4 + perfil.farol * 0.4
    for (const item of this.plasticos) {
      const sx = projetar(item.x)
      if (!visivel(sx, 20)) continue
      const sy = item.y * A
      const r = item.tamanho * A * 2.4
      ctx.save()
      ctx.translate(sx, sy)
      ctx.rotate(item.giro + Math.sin(this.t * 0.7 + item.giro) * 0.3)
      ctx.fillStyle = `rgba(228, 240, 238, ${0.34 * brilho})`
      ctx.strokeStyle = `rgba(236, 248, 246, ${0.5 * brilho})`
      ctx.lineWidth = Math.max(0.5, r * 0.12)

      if (item.forma < 0.45) {
        // sacola: contorno mole, ondulando
        ctx.beginPath()
        const ondula = Math.sin(this.t * 1.4 + item.giro) * r * 0.3
        ctx.moveTo(-r, -r * 0.7)
        ctx.quadraticCurveTo(0, -r * 1.3 + ondula, r, -r * 0.6)
        ctx.quadraticCurveTo(r * 1.2, r * 0.6, ondula * 0.5, r)
        ctx.quadraticCurveTo(-r * 1.1, r * 0.7, -r, -r * 0.7)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else if (item.forma < 0.8) {
        // fragmento: polígono duro, quebrado
        ctx.beginPath()
        ctx.moveTo(-r, -r * 0.4)
        ctx.lineTo(r * 0.3, -r)
        ctx.lineTo(r, r * 0.2)
        ctx.lineTo(-r * 0.2, r * 0.9)
        ctx.closePath()
        ctx.fill()
      } else {
        // anel de seis-packs — o mais citado quando se fala em fauna presa
        ctx.beginPath()
        ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2)
        ctx.moveTo(r * 0.5, 0)
        ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  private desenharAguasVivas(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
  ) {
    void L
    if (perfil.aguasVivas < 0.02) return
    const quantas = Math.round(this.aguasVivas.length * perfil.aguasVivas)
    for (let i = 0; i < quantas; i++) {
      const agua = this.aguasVivas[i]
      const sx = projetar(agua.x)
      if (!visivel(sx)) continue
      const sy = agua.y * A
      const r = agua.escala * A * 0.055 * (1 + Math.sin(this.t * 1.6 + agua.fase) * 0.16)
      ctx.beginPath()
      ctx.arc(sx, sy, r, Math.PI, 0)
      ctx.fillStyle = `rgba(150, 230, 255, ${0.16 * perfil.aguasVivas})`
      ctx.fill()
      ctx.beginPath()
      for (let t = 0; t < 4; t++) {
        const tx = sx - r + (t / 3) * r * 2
        ctx.moveTo(tx, sy)
        ctx.lineTo(tx + Math.sin(this.t * 2 + t + agua.fase) * r * 0.3, sy + r * 1.9)
      }
      ctx.strokeStyle = `rgba(150, 230, 255, ${0.13 * perfil.aguasVivas})`
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  private desenharCardume(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
  ) {
    void L
    if (perfil.cardume < 0.02) return
    const quantos = Math.round(this.peixes.length * perfil.cardume)
    for (let i = 0; i < quantos; i++) {
      const peixe = this.peixes[i]
      const sx = projetar(peixe.x)
      if (!visivel(sx, 20)) continue
      const sy = peixe.y * A
      // z faz o parallax: peixe de trás é menor e mais apagado.
      const escala = (0.5 + peixe.z * 0.8) * (A / 144)
      const alpha = (0.25 + peixe.z * 0.55) * (0.3 + perfil.luz * 0.7)
      const dir = Math.sign(peixe.vx) || 1
      ctx.beginPath()
      ctx.ellipse(sx, sy, 3.4 * escala, 1.5 * escala, 0, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(190, 240, 235, ${alpha})`
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(sx - dir * 3.2 * escala, sy)
      ctx.lineTo(sx - dir * 5.6 * escala, sy - 1.6 * escala)
      ctx.lineTo(sx - dir * 5.6 * escala, sy + 1.6 * escala)
      ctx.closePath()
      ctx.fill()
    }
  }

  private desenharFauna(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
    camera: OpcoesCamera,
  ): Alvo | null {
    let alvo: Alvo | null = null
    let menorDesvio = Infinity
    /** Projeção em linha reta, sem a volta do mundo cilíndrico. */
    const semVolta = (x: number) => {
      const frac = (x - camera.x0) / camera.abertura
      return (camera.espelhado ? 1 - frac : frac) * L
    }
    if (perfil.fauna < 0.05) return null

    for (const f of this.fauna) {
      // A travessia não obedece ao mundo cilíndrico.
      //
      // A projeção normal dá a volta passando de 1,5 unidade da câmera, e isso
      // limitava o TAMANHO do bicho: um corpo de 1,6 unidade sumia de repente
      // com a cauda ainda no meio do quadro. Aqui ele atravessa numa reta, que
      // é o que uma câmera fixa veria.
      const sx = f.travessia ? semVolta(f.x) : projetar(f.x)
      const comp = f.escala * A * 0.42
      // A margem do corte acompanha o TAMANHO. Com 220 px fixos, um corpo de
      // 1600 px era descartado enquanto ainda enchia a tela: o corte olha o
      // centro do bicho, e o centro dele passa longe da borda.
      if (!visivel(sx, f.travessia ? comp : 220)) continue
      const sy = f.y * A
      const alt = comp * f.especie.proporcao
      const dir = Math.sign(f.vx)
      // A opacidade NÃO é multiplicada por perfil.fauna: aquilo é densidade de
      // população, não visibilidade. Lá embaixo aparece menos bicho, mas o que
      // aparece está no facho do farol e tem que ser visto.
      // Piso alto de propósito. A 4500 m a cena inteira é escura, e com alpha
      // baixo o bicho — que é o motivo de a câmera existir — virava um vulto
      // que nem de perto se lia. Debaixo do farol ele é o objeto mais claro do
      // quadro, que é o que acontece de verdade.
      const alpha = f.vulto
        ? 0.9 * f.vida
        : f.travessia
          ? 0.58 * f.vida
          : Math.min(1, 0.45 + perfil.luz * 0.35 + perfil.farol * 0.35) *
            f.vida *
            this.atenuacaoFauna

      const pincel = {
        comp,
        alt,
        t: this.t * (f.ritmo ?? 1),
        fase: f.fase,
        // Silhueta e sem farol: o vulto é um buraco preto passando na frente da
        // luz, não um bicho iluminado.
        luz: f.vulto ? 0 : perfil.luz,
        farol: f.vulto ? 0 : perfil.farol,
        silhueta: f.vulto === true,
        // O bicho da travessia passa sem olhar pra câmera: o olho é a cena
        // seguinte, e mostrá-lo aqui gastaria o plano antes da hora.
        olhar: !f.travessia,
        rigidez: f.rigidez,
      }

      if (f.travessia) {
        // A travessia é composta FORA e depois colada com a opacidade.
        //
        // O bicho é desenhado em partes — corpo, peitorais, dorsal, cauda — e
        // com alpha direto no pincel cada parte fica translúcida em relação às
        // outras: via-se a nadadeira ATRAVÉS do corpo e ele virava um modelo de
        // vidro. Pintado opaco num canvas próprio e colado de uma vez, o corpo
        // é sólido e só o conjunto é que é translúcido contra a água.
        const fora = this.telaTravessia(L, A)
        if (fora) {
          fora.clearRect(0, 0, L, A)
          fora.save()
          fora.translate(sx, sy)
          fora.scale(dir * (camera.espelhado ? -1 : 1), 1)
          f.especie.desenhar({ ctx: fora, ...pincel, alpha: 1 })
          fora.restore()
          ctx.save()
          ctx.globalAlpha = alpha
          ctx.drawImage(fora.canvas, 0, 0)
          ctx.restore()
        }
      } else {
        ctx.save()
        ctx.translate(sx, sy)
        ctx.scale(dir * (camera.espelhado ? -1 : 1), 1)
        f.especie.desenhar({ ctx, ...pincel, alpha })
        ctx.restore()
      }

      // O retículo segue o bicho MAIS PERTO DO CENTRO do quadro, não o
      // primeiro da lista: com três na água, "o primeiro" podia estar na borda
      // e a mira ficava apontando pro vazio com o nome dele.
      if (sx > L * 0.08 && sx < L * 0.92 && f.vida > 0.5) {
        const desvio = Math.abs(sx / L - 0.5)
        if (desvio < menorDesvio) {
          menorDesvio = desvio
          alvo = { x: sx / L, y: sy / A, distancia: f.distancia, rotulo: f.especie.rotulo }
        }
      }
    }
    return alvo
  }

  private desenharParticulas(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
  ) {
    void L
    // No mergulho a densidade sobe: é a esteira de bolhas do lastro. Mas só
    // até a metade — a 1.0 são 130 partículas por câmera, e três câmeras
    // desenhando isso custaram 2 fps medidos. O olho não distingue.
    const densidade = Math.max(perfil.bolhas, perfil.neve, this.turbulencia * 0.5)
    if (densidade < 0.02) return
    const bolha = perfil.bolhas > perfil.neve
    let quantas = Math.round(this.particulas.length * densidade)
    if (this.economizar) quantas = quantas >> 1
    ctx.fillStyle = bolha ? 'rgba(200, 250, 255, 0.3)' : 'rgba(215, 235, 240, 0.32)'
    for (let i = 0; i < quantas; i++) {
      const p = this.particulas[i]
      const sx = projetar(p.x)
      if (!visivel(sx, 10)) continue
      ctx.beginPath()
      ctx.arc(sx, p.y * A, p.raio * (A / 144), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private desenharBioluminescencia(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfil: Perfil,
    projetar: (x: number) => number,
    visivel: (sx: number, margem?: number) => boolean,
    agora: number,
  ) {
    void L
    if (perfil.biolum < 0.02) return
    ctx.globalCompositeOperation = 'lighter'
    const quantos = Math.round(this.bioluminescencia.length * perfil.biolum)
    for (let i = 0; i < quantos; i++) {
      const b = this.bioluminescencia[i]
      const sx = projetar(b.x)
      if (!visivel(sx, 10)) continue
      const ciclo = (Math.sin((agora / 1000 / b.periodo) * Math.PI * 2 + b.fase) + 1) / 2
      const brilho = ciclo * ciclo * perfil.biolum
      if (brilho < 0.02) continue
      // O halo era 4x o raio com a escala do mini-feed (A/144). Em tela cheia
      // isso virava bolha de 130 px: a bioluminescência tapava o bicho que a
      // câmera estava justamente apontando. Ponto de luz é faísca, não névoa —
      // daí o halo menor e o núcleo duro.
      const r = b.raio * (A / 200) * (1 + brilho)
      const halo = r * 2.6
      const g = ctx.createRadialGradient(sx, b.y * A, 0, sx, b.y * A, halo)
      g.addColorStop(0, `rgba(130, 255, 220, ${0.6 * brilho})`)
      g.addColorStop(0.36, `rgba(130, 255, 220, ${0.2 * brilho})`)
      g.addColorStop(1, 'rgba(130, 255, 220, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(sx, b.y * A, halo, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = `rgba(214, 255, 240, ${0.85 * brilho})`
      ctx.beginPath()
      ctx.arc(sx, b.y * A, Math.max(0.6, r * 0.34), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  /**
   * Oscilação do farol durante a agitação.
   *
   * Ruído de duas frequências, e nunca abaixo de 0,45: um farol que apaga de
   * vez deixa a tela preta e a plateia acha que o projetor caiu. O que se quer
   * é a luz VACILANDO.
   */
  private fatorFarol(agora: number): number {
    if (this.agitacao <= 0.01) return 1
    const ruido = Math.sin(agora / 47) * 0.5 + Math.sin(agora / 113) * 0.5
    return 1 - this.agitacao * 0.55 * (0.5 + ruido * 0.5)
  }

  private desenharFarol(
    ctx: CanvasRenderingContext2D,
    L: number,
    A: number,
    perfilOriginal: Perfil,
    agora: number,
  ) {
    // Cópia com o farol já oscilado: mexer no perfil real contaminaria todos os
    // outros desenhos do quadro, que leem o mesmo objeto.
    const fator = this.fatorFarol(agora)
    const perfil = fator === 1 ? perfilOriginal : { ...perfilOriginal, farol: perfilOriginal.farol * fator }
    if (perfil.farol < 0.02) return

    const cx = L * 0.5
    const cy = A * 0.52
    // Escurece o que está FORA do cone.
    //
    // Isto era um retângulo preto a 82% sobre o quadro inteiro — e roda DEPOIS
    // da fauna. O resultado é que a 4500 m o bicho no meio do facho era apagado
    // junto com o fundo: sobrava uma tela preta com manchas. Agora a máscara é
    // radial, transparente no miolo, então o que está sob o farol continua
    // aceso e só as bordas afundam no escuro.
    const escuro = perfil.farol * 0.86
    const alcance = Math.max(L, A) * 0.78
    const mascara = ctx.createRadialGradient(cx, cy, alcance * 0.1, cx, cy, alcance)
    mascara.addColorStop(0, 'rgba(0, 3, 6, 0)')
    mascara.addColorStop(0.42, `rgba(0, 3, 6, ${escuro * 0.3})`)
    mascara.addColorStop(1, `rgba(0, 3, 6, ${escuro})`)
    ctx.fillStyle = mascara
    ctx.fillRect(-4, -4, L + 8, A + 8)

    // O brilho do facho é a luz espalhada pela água, e ela é DISCRETA. A 0.38
    // no miolo ele virava uma névoa branca cobrindo meia tela: o fundo subia
    // até o brilho do bicho e o contraste ia a zero — o bicho estava lá,
    // desenhado, e ninguém via. Cone estreito e fraco devolve o contraste.
    const raio = Math.min(L, A) * 0.55
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, raio)
    g.addColorStop(0, `rgba(200, 245, 255, ${0.15 * perfil.farol})`)
    g.addColorStop(0.3, `rgba(170, 230, 245, ${0.07 * perfil.farol})`)
    g.addColorStop(0.62, `rgba(140, 210, 235, ${0.02 * perfil.farol})`)
    g.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, raio, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }

  /** Grão de vídeo: poucos pontos, redesenhados a cada quadro. */
  private desenharGrao(ctx: CanvasRenderingContext2D, L: number, A: number) {
    const pontos = this.economizar ? 30 : 70
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)'
    for (let i = 0; i < pontos; i++) {
      ctx.fillRect(Math.random() * L, Math.random() * A, 1, 1)
    }
  }

  /** Perda de sinal ocasional, sorteada por feed. */
  static agendarFalha(agora: number) {
    return agora + sorteio(INTERVALO_FALHA[0], INTERVALO_FALHA[1])
  }

  static readonly DURACAO_FALHA = DURACAO_FALHA
}

export { LARGURA_MUNDO, suave }
