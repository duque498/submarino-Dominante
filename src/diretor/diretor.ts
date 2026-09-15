import {
  acoesDaLinha,
  textoDaLinha,
  type Acao,
  type Cena,
  type Linha,
  type Prazo,
  type Quando,
} from '../roteiros/tipos'
import { gatilhosDe, painelDe } from './gatilhos'

/**
 * O Diretor de cena.
 *
 * Antes, a IA reagia a relógio (`atraso` em ms) e a tecla. Agora ela reage ao
 * que ela mesma está dizendo: recebe o fluxo de eventos da fala e decide que
 * painel está na frente, que forma o orbe assume e que efeitos rodam.
 *
 * Duas fontes de decisão, nesta ordem:
 *
 *  1. **Ações explícitas** escritas no JSON, linha a linha. Quem escreve o
 *     roteiro manda.
 *  2. **Gatilhos semânticos** (ver gatilhos.ts), aplicados só aos espaços que a
 *     linha deixou vazios.
 *
 * E uma regra acima das duas: **o operador sempre vence**. Assim que ele mexe
 * em qualquer coisa, o Diretor para de decidir até a próxima cena. No palco,
 * um sistema que insiste em reabrir o que a pessoa acabou de fechar é pior que
 * um sistema burro.
 *
 * A peça central é o PRAZO. Todo painel e toda forma que o Diretor abre têm
 * validade declarada, e ele fecha sozinho quando vence. Nunca existe um painel
 * esquecido na frente da plateia.
 */

export type PainelPedido = {
  nome: string
  args?: string
  /**
   * Só pro sonar aberto por fala: o rótulo do contato que deve aparecer. É o
   * que liga "detectei uma baleia" ao que o mostrador mostra.
   */
  contato?: string
}

export type Saida = {
  painel: (pedido: PainelPedido | null) => void
  forma: (nome: string | null) => void
  sfx: (nome: string) => void
  mergulho: (para: number) => void
  log: (linhas: string[]) => void
}

/** Sobrevida da forma disparada por gatilho, depois que a linha termina. */
const GRACA_FORMA_MS = 1500
/** Teto de vida de um painel aberto por gatilho, aconteça o que acontecer. */
const TETO_PAINEL_GATILHO_MS = 20_000
/** O mesmo painel não reabre por gatilho antes disso. */
const ESPERA_MESMO_PAINEL_MS = 30_000
/** A mesma forma não repete por gatilho antes disso. */
const ESPERA_MESMA_FORMA_MS = 10_000
/**
 * Espera entre DOIS PAINÉIS QUAISQUER abertos por gatilho.
 *
 * Isto não estava na especificação e é meu acréscimo. Sem ele, a cena de
 * entrada abre status, sonar, mapa e câmera em quatro linhas seguidas — uns
 * dez segundos de apresentação de slides, que a plateia lê como defeito e não
 * como direção. O dicionário casa demais porque as palavras são o vocabulário
 * básico da narradora; o freio fica aqui, num número só, fácil de mexer.
 */
const ESPERA_ENTRE_PAINEIS_MS = 12_000

type Origem = 'acao' | 'gatilho'

type Vigencia = {
  origem: Origem
  ate: Prazo
  /** Linha que abriu isto. */
  linha: number
  /** Timestamp absoluto de expiração, ou Infinity quando não é por tempo. */
  expiraEm: number
}

const quandoDa = (acao: Acao): Quando => ('quando' in acao && acao.quando) || 'inicio'

export class Diretor {
  private saida: Saida
  private cena: Cena | null = null
  private linhas: Linha[] = []
  /** Gatilhos ligados? (`?gatilhos=off` e o comando do console desligam.) */
  private gatilhosLigados = true
  /** O operador mexeu: o Diretor cala a boca até a próxima cena. */
  private suspenso = false

  private painel: Vigencia | null = null
  private forma: Vigencia | null = null
  private nomePainel: string | null = null
  private nomeForma: string | null = null

  private ultimoPainelEm = new Map<string, number>()
  private ultimaFormaEm = new Map<string, number>()
  /**
   * -Infinity, e não 0: `performance.now()` conta desde o carregamento da
   * página, então com 0 aqui os primeiros 12 s da apresentação ficariam sem
   * gatilho de painel — e quanto tempo isso engole dependeria de quão rápido o
   * operador apertou a tecla de ativação. Ninguém ia entender por quê.
   */
  private ultimoPainelQualquerEm = -Infinity

  constructor(saida: Saida) {
    this.saida = saida
  }

  ligarGatilhos(ligados: boolean) {
    this.gatilhosLigados = ligados
  }

  gatilhosAtivos(): boolean {
    return this.gatilhosLigados
  }

  /**
   * Nova cena: fecha tudo e recomeça. O operador reganha a confiança do
   * Diretor aqui — a suspensão dura uma cena, não a apresentação inteira.
   */
  novaCena(cena: Cena | null) {
    this.fecharTudo()
    this.cena = cena
    // Só fala e transição têm linhas; apresentação tem título e status.
    const tela = cena && 'tela' in cena ? (cena.tela as { linhas?: unknown }) : null
    this.linhas = Array.isArray(tela?.linhas) ? (tela.linhas as Linha[]) : []
    this.suspenso = false
  }

  /** O operador assumiu (tecla O, Esc, M, ou comando no console). */
  operadorAssumiu() {
    this.suspenso = true
    // Solta a posse sem fechar: o que está na tela agora é dele, e o Diretor
    // não fecha o que não abriu.
    this.painel = null
    this.forma = null
  }

  estaSuspenso(): boolean {
    return this.suspenso
  }

  linhaComecou(indice: number) {
    if (this.suspenso) return
    this.aplicarAcoes(indice, 'inicio')
    this.aplicarGatilhos(indice)
  }

  linhaTerminou(indice: number) {
    if (this.suspenso) return
    this.aplicarAcoes(indice, 'fim')
    this.venceramNaLinha(indice)
  }

  cenaTerminou() {
    // Sem exceção, mesmo que o prazo diga outra coisa: a cena seguinte começa
    // limpa e quem chama o que quiser é o operador.
    this.fecharTudo()
  }

  /** Chamado periodicamente pelo Player: vence o que é por tempo. */
  tique(agora: number) {
    if (this.painel && agora >= this.painel.expiraEm) this.pedirPainel(null, null)
    if (this.forma && agora >= this.forma.expiraEm) this.pedirForma(null, null)
  }

  // --- ações explícitas -----------------------------------------------------

  private aplicarAcoes(indice: number, momento: Quando) {
    const linha = this.linhas[indice]
    if (!linha) return
    for (const acao of acoesDaLinha(linha)) {
      if (quandoDa(acao) !== momento) continue
      this.executar(acao, indice)
    }
  }

  private executar(acao: Acao, linha: number) {
    const agora = performance.now()
    switch (acao.tipo) {
      case 'painel':
        this.pedirPainel({
          nome: acao.nome,
          args: acao.args,
          // O sonar aberto por ação também nomeia o bicho que a linha citou:
          // a origem da ordem não muda o que o mostrador deveria mostrar.
          contato: acao.nome === 'sonar' ? this.formaCitadaEm(linha) : undefined,
        }, {
          origem: 'acao',
          ate: acao.ate,
          linha,
          expiraEm: prazoEmTempo(acao.ate, agora),
        })
        break
      case 'mapa':
        this.pedirPainel({ nome: 'mapa', args: acao.marcador }, {
          origem: 'acao',
          ate: acao.ate ?? 'fimCena',
          linha,
          expiraEm: prazoEmTempo(acao.ate ?? 'fimCena', agora),
        })
        break
      case 'camera':
        this.pedirPainel({ nome: 'camera', args: String(acao.qual) }, {
          origem: 'acao',
          ate: acao.ate,
          linha,
          expiraEm: prazoEmTempo(acao.ate, agora),
        })
        break
      case 'forma':
        this.pedirForma(acao.nome, {
          origem: 'acao',
          ate: acao.ate,
          linha,
          expiraEm: prazoEmTempo(acao.ate, agora),
        })
        break
      case 'fechar':
        if (acao.alvo === 'painel' || acao.alvo === 'tudo') this.pedirPainel(null, null)
        if (acao.alvo === 'forma' || acao.alvo === 'tudo') this.pedirForma(null, null)
        break
      case 'sfx':
        this.saida.sfx(acao.nome)
        break
      case 'mergulho':
        this.saida.mergulho(acao.para)
        break
    }
  }

  // --- gatilhos -------------------------------------------------------------

  private cenaAceitaGatilho(): boolean {
    const tipo = this.cena?.tipo
    // Nas apresentações e nas dinâmicas quem manda é o operador; na pane, o
    // sistema está quebrado e não deveria estar ilustrando nada.
    return tipo === 'fala' || tipo === 'transicao'
  }

  private aplicarGatilhos(indice: number) {
    if (!this.gatilhosLigados || !this.cenaAceitaGatilho()) return
    const linha = this.linhas[indice]
    if (!linha) return

    const agora = performance.now()
    const explicitas = acoesDaLinha(linha)
    const temPainelExplicito = explicitas.some(
      (a) => a.tipo === 'painel' || a.tipo === 'mapa' || a.tipo === 'camera',
    )
    const temFormaExplicita = explicitas.some((a) => a.tipo === 'forma')

    const g = gatilhosDe(textoDaLinha(linha))

    if (!temPainelExplicito) {
      const pedido = painelDe(g)
      if (pedido && this.painelPodeAbrir(pedido.nome, agora)) {
        this.ultimoPainelEm.set(pedido.nome, agora)
        this.ultimoPainelQualquerEm = agora
        this.pedirPainel(
          {
            nome: pedido.nome,
            args: pedido.args,
            // Sonar aberto por fala mostra o contato do que ela citou.
            contato: pedido.nome === 'sonar' ? g.forma?.nome : undefined,
          },
          {
            origem: 'gatilho',
            // Ela costuma comentar na linha seguinte o que acabou de abrir.
            ate: { linha: indice + 1 },
            linha: indice,
            expiraEm: agora + TETO_PAINEL_GATILHO_MS,
          },
        )
      }
    }

    if (!temFormaExplicita && g.forma) {
      const nome = g.forma.nome
      const ultima = this.ultimaFormaEm.get(nome) ?? -Infinity
      // A mesma forma repetida em linhas seguidas vira tique, não ilustração.
      if (agora - ultima >= ESPERA_MESMA_FORMA_MS) {
        this.ultimaFormaEm.set(nome, agora)
        this.pedirForma(nome, {
          origem: 'gatilho',
          ate: 'fimLinha',
          linha: indice,
          expiraEm: Infinity,
        })
      }
    }
  }

  /** A forma que a linha cita, se o dicionário reconhecer alguma. */
  private formaCitadaEm(indice: number): string | undefined {
    const linha = this.linhas[indice]
    if (!linha) return undefined
    return gatilhosDe(textoDaLinha(linha)).forma?.nome
  }

  private painelPodeAbrir(nome: string, agora: number): boolean {
    // Painel aberto por ação escrita no roteiro é intocável enquanto está no
    // ar, MESMO que o gatilho peça o mesmo painel. Sem isto, o gatilho caía no
    // ramo de "mesmo painel, prazo novo" do pedirPainel e trocava o prazo do
    // JSON (`fimCena`) pelo prazo curto do gatilho (`{ linha: i + 1 }`) — o
    // espectro da Arte, declarado até o fim da cena, fechava uma linha depois
    // de a IA dizer "a luz vermelha se apaga". Ação explícita vence gatilho,
    // e vencer inclui não ter o prazo encurtado por baixo.
    if (this.painel?.origem === 'acao') return false
    // A câmera por gatilho só faz sentido quando os mini-feeds estão fora:
    // com eles na tela, abrir a câmera grande é repetir o que já se vê.
    if (nome === 'camera' && this.cena?.cameras !== false) return false
    if (agora - (this.ultimoPainelEm.get(nome) ?? -Infinity) < ESPERA_MESMO_PAINEL_MS) return false
    if (agora - this.ultimoPainelQualquerEm < ESPERA_ENTRE_PAINEIS_MS) return false
    return true
  }

  // --- prazos ---------------------------------------------------------------

  private venceramNaLinha(indice: number) {
    const agora = performance.now()

    if (this.painel && venceuNaLinha(this.painel, indice)) {
      this.pedirPainel(null, null)
    }
    if (this.forma && venceuNaLinha(this.forma, indice)) {
      if (this.forma.origem === 'gatilho') {
        // Sobrevida curta: a palavra acabou de ser dita e o olho ainda está
        // na forma. Cortar no fim exato da sílaba parece engasgo.
        this.forma.expiraEm = agora + GRACA_FORMA_MS
      } else {
        this.pedirForma(null, null)
      }
    }
  }

  // --- emissão --------------------------------------------------------------

  private pedirPainel(pedido: PainelPedido | null, vigencia: Vigencia | null) {
    const nome = pedido ? `${pedido.nome}:${pedido.args ?? ''}` : null
    if (nome === this.nomePainel && pedido) {
      // Mesmo painel, prazo novo: só estende.
      this.painel = vigencia
      return
    }
    this.nomePainel = nome
    this.painel = vigencia
    this.saida.painel(pedido)
  }

  private pedirForma(nome: string | null, vigencia: Vigencia | null) {
    if (nome === this.nomeForma && nome) {
      this.forma = vigencia
      return
    }
    this.nomeForma = nome
    this.forma = vigencia
    this.saida.forma(nome)
  }

  private fecharTudo() {
    if (this.nomePainel !== null) this.pedirPainel(null, null)
    if (this.nomeForma !== null) this.pedirForma(null, null)
    this.painel = null
    this.forma = null
  }
}

function prazoEmTempo(prazo: Prazo, agora: number): number {
  return typeof prazo === 'object' && 'segundos' in prazo
    ? agora + prazo.segundos * 1000
    : Infinity
}

function venceuNaLinha(v: Vigencia, indice: number): boolean {
  if (v.ate === 'fimLinha') return v.linha === indice
  if (v.ate === 'fimCena') return false
  if (typeof v.ate === 'object' && 'linha' in v.ate) return v.ate.linha === indice
  return false
}
