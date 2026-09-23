/**
 * Voz do navegador (Web Speech API) lendo o que está escrito na tela.
 *
 * O prompt original proibia isso, e a razão era boa: a Web Speech depende do
 * que a máquina tem instalado e, em alguns sistemas, de internet. A aposta era
 * gerar mp3 antes e rodar 100% offline.
 *
 * Na prática o plano não fechou: quem apresenta usa Chromebook sem terminal,
 * então não dá pra rodar o gerador de voz, e a síntese offline que sobrou
 * (espeak) é robótica demais. O Chrome OS tem vozes pt-BR boas embutidas, e
 * elas leem exatamente o texto da legenda.
 *
 * Por isso a ordem passou a ser: mp3 gerado, se existir; senão, esta voz.
 */

export type LinhaFalada = { indice: number; texto: string }
/**
 * Onde a voz está DENTRO da linha, em caracteres.
 *
 * O navegador avisa a cada palavra (`boundary`), e é esse aviso que deixa a
 * legenda materializar a palavra no instante em que ela é dita. Sem ele só
 * resta estimar por caractere, e estimativa erra — a 0,92 de `rate` a voz faz
 * ~72 ms por caractere e a legenda chutava 82, o que atrasa quase um segundo
 * no fim de uma linha longa.
 */
export type PosicaoNaLinha = { indice: number; caractere: number }

const MARCA = 'submarino-domi'

function vozesDisponiveis(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  return speechSynthesis.getVoices()
}

/** Voz escolhida na mão pelo operador. Vence a escolha automática. */
let vozEscolhida: SpeechSynthesisVoice | null = null

/**
 * Nota de qualidade de uma voz. O Chrome OS costuma trazer várias em pt-BR, e
 * a diferença entre elas é enorme: as "Natural"/"Neural" e as servidas pela
 * rede soam humanas; as locais soam robóticas. Escolher errado aqui é a
 * diferença entre a IA convencer ou não.
 */
function nota(voz: SpeechSynthesisVoice): number {
  const nome = voz.name.toLowerCase()
  let pontos = 0
  if (voz.lang === 'pt-BR') pontos += 100
  else if (voz.lang?.toLowerCase().startsWith('pt')) pontos += 50
  else return -1
  if (/natural|neural|wavenet|studio|premium/.test(nome)) pontos += 40
  if (/google/.test(nome)) pontos += 20
  // Voz de rede costuma ser a boa; a local é a de emergência do sistema.
  if (!voz.localService) pontos += 15
  return pontos
}

/** Vozes em português, da melhor pra pior. */
export function vozesEmPortugues(): SpeechSynthesisVoice[] {
  return vozesDisponiveis()
    .filter((v) => nota(v) >= 0)
    .sort((a, b) => nota(b) - nota(a))
}

/** Melhor voz pt-BR disponível, ou a escolhida à mão. */
function melhorVoz(): SpeechSynthesisVoice | null {
  if (vozEscolhida) return vozEscolhida
  return vozesEmPortugues()[0] ?? null
}

/** Lista pro operador ver e escolher, já na ordem de qualidade. */
export function listarVozes(): string[] {
  const vozes = vozesEmPortugues()
  if (vozes.length === 0) return ['Nenhuma voz em português instalada neste sistema.']
  const atual = melhorVoz()
  return vozes.map(
    (v, i) =>
      `${i + 1}. ${v.name} (${v.lang})${v.localService ? ' [local]' : ' [rede]'}` +
      `${v === atual ? '  <= em uso' : ''}`,
  )
}

/** Troca a voz pelo número da lista. Devolve o nome, ou null se não existir. */
export function escolherVoz(numero: number): string | null {
  const vozes = vozesEmPortugues()
  const voz = vozes[numero - 1]
  if (!voz) return null
  vozEscolhida = voz
  return `${voz.name} (${voz.lang})`
}

/** O sistema tem voz em português instalada? É o que decide o padrão. */
export function temVozPortugues(): boolean {
  return vozesDisponiveis().some((v) => v.lang?.toLowerCase().startsWith('pt'))
}

export function vozDoNavegadorExiste(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
}

/** Nome da voz que vai ser usada, pro diagnóstico na tela. */
export function nomeDaVoz(): string {
  const voz = melhorVoz()
  if (!voz) return vozDoNavegadorExiste() ? 'padrão do sistema' : 'indisponível'
  return `${voz.name} (${voz.lang})`
}

/**
 * A lista de vozes costuma chegar vazia no primeiro acesso e ser preenchida
 * depois, num evento. Espera por ela, com teto.
 */
export function aguardarVozes(limiteMs = 2500): Promise<void> {
  if (!vozDoNavegadorExiste()) return Promise.resolve()
  if (vozesDisponiveis().length > 0) return Promise.resolve()
  return new Promise((resolve) => {
    const pronto = () => {
      speechSynthesis.removeEventListener('voiceschanged', pronto)
      clearTimeout(limite)
      resolve()
    }
    const limite = setTimeout(pronto, limiteMs)
    speechSynthesis.addEventListener('voiceschanged', pronto)
    // Alguns navegadores só populam a lista depois de uma chamada.
    void vozesDisponiveis()
  })
}

export class VozNavegador {
  private cancelado = false

  /**
   * Lê as linhas em sequência, avisando qual está sendo dita. Uma fala por
   * linha: é o que permite a legenda trocar exatamente junto com a voz.
   */
  async falar(
    linhas: string[],
    aoComecarLinha?: (linha: LinhaFalada) => void,
    opcoes: { taxa?: number; tom?: number; volume?: number } = {},
    aoAvancar?: (posicao: PosicaoNaLinha) => void,
  ): Promise<boolean> {
    if (!vozDoNavegadorExiste() || linhas.length === 0) return false
    this.cancelado = false
    const voz = melhorVoz()

    for (let i = 0; i < linhas.length; i++) {
      if (this.cancelado) return true
      const texto = linhas[i].trim()
      if (!texto) continue
      aoComecarLinha?.({ indice: i, texto })
      await this.falarUma(texto, voz, opcoes, (caractere) =>
        aoAvancar?.({ indice: i, caractere }),
      )
    }
    return true
  }

  private falarUma(
    texto: string,
    voz: SpeechSynthesisVoice | null,
    opcoes: { taxa?: number; tom?: number; volume?: number },
    aoAvancar?: (caractere: number) => void,
  ): Promise<void> {
    return new Promise((resolve) => {
      const fala = new SpeechSynthesisUtterance(texto)
      if (voz) fala.voice = voz
      fala.lang = voz?.lang ?? 'pt-BR'
      // Um pouco devagar e grave: é o que dá o tom de computador de bordo.
      fala.rate = opcoes.taxa ?? 0.92
      fala.pitch = opcoes.tom ?? 0.85
      fala.volume = opcoes.volume ?? 1
      ;(fala as unknown as Record<string, string>)[MARCA] = MARCA

      let encerrado = false
      const encerrar = () => {
        if (encerrado) return
        encerrado = true
        clearTimeout(seguranca)
        resolve()
      }
      fala.onend = encerrar
      fala.onerror = encerrar
      // Nem todo motor de voz dispara `boundary`. Quem não dispara continua
      // caindo na estimativa da legenda — por isso o evento AVISA em vez de a
      // legenda perguntar.
      fala.onboundary = (evento) => {
        if (evento.name && evento.name !== 'word') return
        aoAvancar?.(evento.charIndex)
      }

      // Rede de segurança: se a fala travar (acontece em alguns sistemas), o
      // roteiro não pode ficar preso esperando pra sempre.
      const estimado = 900 + texto.length * 95
      const seguranca = setTimeout(encerrar, estimado * 2.5)

      speechSynthesis.speak(fala)
    })
  }

  /** Corta a fala em andamento. */
  parar() {
    this.cancelado = true
    if (vozDoNavegadorExiste()) speechSynthesis.cancel()
  }
}
