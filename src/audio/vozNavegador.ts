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

const MARCA = 'submarino-domi'

function vozesDisponiveis(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  return speechSynthesis.getVoices()
}

/** Melhor voz pt-BR disponível, ou qualquer pt, ou nada. */
function melhorVoz(): SpeechSynthesisVoice | null {
  const vozes = vozesDisponiveis()
  return (
    vozes.find((v) => v.lang === 'pt-BR' && !v.localService) ??
    vozes.find((v) => v.lang === 'pt-BR') ??
    vozes.find((v) => v.lang?.startsWith('pt')) ??
    null
  )
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
  ): Promise<boolean> {
    if (!vozDoNavegadorExiste() || linhas.length === 0) return false
    this.cancelado = false
    const voz = melhorVoz()

    for (let i = 0; i < linhas.length; i++) {
      if (this.cancelado) return true
      const texto = linhas[i].trim()
      if (!texto) continue
      aoComecarLinha?.({ indice: i, texto })
      await this.falarUma(texto, voz, opcoes)
    }
    return true
  }

  private falarUma(
    texto: string,
    voz: SpeechSynthesisVoice | null,
    opcoes: { taxa?: number; tom?: number; volume?: number },
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
