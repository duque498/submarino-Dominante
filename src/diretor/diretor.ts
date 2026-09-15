import {
  acoesDaLinha,
  textoDaLinha,
  type Acao,
  type Cena,
  type Linha,
  type Prazo,
  type Quando,
} from '../roteiros/tipos'
import { assuntoDe, gatilhosDe, painelDe } from './gatilhos'

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

/** Por que um painel automático saiu. Vai pro rodapé de depuração e pro log. */
export type MotivoFecho = 'assunto' | 'teto' | 'prazo' | 'troca'

export type Saida = {
  painel: (pedido: PainelPedido | null) => void
  /**
   * O painel vai encerrar: é a hora de despedida, não o fechamento.
   *
   * Existe porque um painel que some é ambíguo — a plateia não sabe se acabou
   * ou se quebrou. Aqui o Player escreve `Encerrando <painel>` no log e, no
   * caso do sonar, dá o ping final e apaga o contato antes de o painel sair.
   */
  despedida: (nome: string, motivo: MotivoFecho) => void
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
/**
 * Cauda: quanto o painel ainda fica depois que o assunto dele acabou.
 *
 * A IA fecha o que abriu ANTES de mudar de assunto, não no meio da frase
 * seguinte. 0,8 s é o tempo de a linha acabar, a plateia registrar, e o painel
 * sair sem parecer que alguém apertou um botão.
 */
const CAUDA_ASSUNTO_MS = 800
/**
 * Piso: nenhum painel automático vive menos que isto.
 *
 * Um painel que aparece e some em dois segundos a plateia lê como defeito, não
 * como direção — e pior, ninguém teve tempo de olhar o que ele mostrava.
 */
const MINIMO_PAINEL_MS = 4000
/**
 * Entre a despedida e a saída do sonar.
 *
 * Só o sonar precisa disso: ele tem um contato marcado na tela, e sumir com o
 * contato junto com o painel desperdiça a única coisa que aquele mostrador
 * tinha pra dizer. Neste intervalo sai o ping final e o contato se apaga.
 */
const MS_DESPEDIDA_SONAR = 450

type Origem = 'acao' | 'gatilho'

type Vigencia = {
  origem: Origem
  ate: Prazo
  /** Linha que abriu isto. */
  linha: number
  /** Timestamp absoluto de expiração, ou Infinity quando não é por tempo. */
  expiraEm: number
  /** Quando abriu. É a partir daqui que o piso de 4 s conta. */
  abertoEm: number
  /** Nome do painel (a Vigência de forma não usa). */
  nome?: string
  args?: string
  /** O termo do dicionário que abriu, quando veio de gatilho. */
  termo?: string
  /**
   * Vive por ASSUNTO: não vence por linha, vence quando a fala muda de tema.
   * Só painel de gatilho.
   */
  porAssunto?: boolean
  /** Última avaliação da próxima linha, pro rodapé de depuração. */
  relacionaProxima?: boolean | null
  /** O termo que fez a próxima linha ainda ser do mesmo assunto. */
  termoProxima?: string
  /** Instante em que a despedida começa. Indefinido = nada agendado. */
  encerrandoEm?: number
  /** Instante em que o painel sai de fato (depois da despedida). */
  saiEm?: number
  motivo?: MotivoFecho
  /** Regra 2: a próxima linha abre outro painel, a troca é no início dela. */
  trocaNaProxima?: boolean
}

/** Leitura ao vivo pro rodapé de `?debugDiretor=1`. Nada aqui decide nada. */
export type EstadoDiretor = {
  suspenso: boolean
  gatilhos: boolean
  painel: string | null
  args?: string
  origem: Origem | null
  termo?: string
  abertoNaLinha: number | null
  /** O `ate` declarado no roteiro, quando o painel veio de uma ação. */
  ate?: Prazo
  /** null = ainda não avaliado (nenhuma linha terminou desde que abriu). */
  relacionaProxima: boolean | null
  termoProxima?: string
  motivo?: MotivoFecho
  faltaPraEncerrar: number | null
  faltaPraSair: number | null
  faltaPraTeto: number | null
  trocaNaProxima: boolean
  forma: string | null
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
    const anterior = this.painel
    this.aplicarAcoes(indice, 'inicio')
    this.aplicarGatilhos(indice)

    // Regra 2: o painel anterior esperava a troca desta linha. Se o painel
    // novo entrou, o pedirPainel já o substituiu e não há nada a fazer. Se a
    // troca não veio (o gatilho previsto não passou pelas folgas), o assunto
    // dele acabou de qualquer jeito — encerra agora, sem esperar mais.
    if (anterior?.trocaNaProxima && this.painel === anterior) {
      this.encerrar(anterior, 'troca', performance.now())
    }
  }

  linhaTerminou(indice: number) {
    if (this.suspenso) return
    this.aplicarAcoes(indice, 'fim')
    this.avaliarPainel(indice)
    this.venceramNaLinha(indice)
  }

  cenaTerminou() {
    // Sem exceção, mesmo que o prazo diga outra coisa: a cena seguinte começa
    // limpa e quem chama o que quiser é o operador.
    this.fecharTudo()
  }

  /**
   * Chamado periodicamente pelo Player: vence o que é por tempo.
   *
   * O painel sai em DUAS fases. Primeiro a despedida (o log escreve
   * `Encerrando <painel>`, o sonar dá o ping final); só depois ele sai de fato,
   * com a animação inteira. Um painel que pisca e some não é direção, é falha.
   */
  tique(agora: number) {
    const v = this.painel
    if (v) {
      if (v.saiEm !== undefined && agora >= v.saiEm) {
        this.pedirPainel(null, null)
      } else if (v.encerrandoEm !== undefined && agora >= v.encerrandoEm) {
        this.despedir(v, v.motivo ?? 'assunto', agora)
      } else if (agora >= v.expiraEm) {
        this.encerrar(v, 'teto', agora)
      }
    }
    if (this.forma && agora >= this.forma.expiraEm) this.pedirForma(null, null)
  }

  /**
   * O estado que o rodapé de `?debugDiretor=1` mostra. Só leitura: quem chama
   * é um componente de depuração rodando a 8 Hz, e ele não decide nada.
   */
  estado(agora: number): EstadoDiretor {
    const v = this.painel
    return {
      suspenso: this.suspenso,
      gatilhos: this.gatilhosLigados,
      painel: v?.nome ?? null,
      args: v?.args,
      origem: v?.origem ?? null,
      termo: v?.termo,
      abertoNaLinha: v?.linha ?? null,
      ate: v && !v.porAssunto ? v.ate : undefined,
      relacionaProxima: v?.relacionaProxima ?? null,
      termoProxima: v?.termoProxima,
      motivo: v?.motivo,
      faltaPraEncerrar: v?.encerrandoEm !== undefined ? v.encerrandoEm - agora : null,
      faltaPraSair: v?.saiEm !== undefined ? v.saiEm - agora : null,
      faltaPraTeto: v && Number.isFinite(v.expiraEm) ? v.expiraEm - agora : null,
      trocaNaProxima: v?.trocaNaProxima === true,
      forma: this.nomeForma,
    }
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
          abertoEm: agora,
          nome: acao.nome,
          args: acao.args,
          expiraEm: prazoEmTempo(acao.ate, agora),
        })
        break
      case 'mapa':
        this.pedirPainel({ nome: 'mapa', args: acao.marcador }, {
          origem: 'acao',
          ate: acao.ate ?? 'fimCena',
          linha,
          abertoEm: agora,
          nome: 'mapa',
          args: acao.marcador,
          expiraEm: prazoEmTempo(acao.ate ?? 'fimCena', agora),
        })
        break
      case 'camera':
        this.pedirPainel({ nome: 'camera', args: String(acao.qual) }, {
          origem: 'acao',
          ate: acao.ate,
          linha,
          abertoEm: agora,
          nome: 'camera',
          args: String(acao.qual),
          expiraEm: prazoEmTempo(acao.ate, agora),
        })
        break
      case 'forma':
        this.pedirForma(acao.nome, {
          origem: 'acao',
          ate: acao.ate,
          linha,
          abertoEm: agora,
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
            // Não vence por linha: vence quando a fala muda de assunto. O
            // `ate` fica só como registro de que o teto é o único prazo duro.
            ate: 'fimCena',
            porAssunto: true,
            linha: indice,
            abertoEm: agora,
            nome: pedido.nome,
            args: pedido.args,
            termo: pedido.termo,
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
          abertoEm: agora,
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
    // JSON (`fimCena`) pelo prazo curto do gatilho — o espectro da Arte,
    // declarado até o fim da cena, fechava uma linha depois de a IA dizer "a
    // luz vermelha se apaga". Ação explícita vence gatilho, e vencer inclui
    // não ter o prazo encurtado por baixo.
    if (this.painel?.origem === 'acao') return false
    return this.podeAbrirIgnorandoOAtual(nome, agora)
  }

  /** Só as folgas, sem olhar o que está aberto. É o que a previsão usa. */
  private podeAbrirIgnorandoOAtual(nome: string, agora: number): boolean {
    // A câmera por gatilho só faz sentido quando os mini-feeds estão fora:
    // com eles na tela, abrir a câmera grande é repetir o que já se vê.
    if (nome === 'camera' && this.cena?.cameras !== false) return false
    if (agora - (this.ultimoPainelEm.get(nome) ?? -Infinity) < ESPERA_MESMO_PAINEL_MS) return false
    if (agora - this.ultimoPainelQualquerEm < ESPERA_ENTRE_PAINEIS_MS) return false
    return true
  }

  // --- prazos ---------------------------------------------------------------

  /**
   * Fim de linha: o painel automático continua ou encerra?
   *
   * A regra é de ASSUNTO, não de contagem de linhas. Olha a próxima linha: se
   * ela ainda toca o mesmo grupo do dicionário (pro mapa, qualquer marcador
   * também vale), o painel fica. Se não, ele encerra 0,8 s depois desta linha
   * — a IA fecha o que abriu ANTES de mudar de assunto, não durante a frase
   * seguinte.
   */
  private avaliarPainel(indice: number) {
    const v = this.painel
    if (!v || v.saiEm !== undefined || v.encerrandoEm !== undefined) return
    const agora = performance.now()

    // Painel escrito no roteiro respeita o `ate` e nada mais: quem escreveu
    // disse até quando, e o dicionário não tem voz nisso. A única concessão é
    // a cauda do `fimLinha`, que é o mesmo problema de não cortar no meio da
    // frase seguinte.
    if (!v.porAssunto) {
      if (venceuNaLinha(v, indice)) {
        if (v.ate === 'fimLinha') this.agendar(v, 'prazo', agora)
        else this.encerrar(v, 'prazo', agora)
      }
      return
    }

    const proxima = this.linhas[indice + 1]
    const liga = proxima ? assuntoDe(textoDaLinha(proxima), v.nome ?? '') : null
    v.relacionaProxima = proxima ? liga !== null : false
    v.termoProxima = liga?.termo

    if (liga) return

    // Regra 2: se a próxima linha já abre OUTRO painel, não existe cauda — a
    // troca acontece no início dela e a tela nunca fica vazia no meio.
    if (proxima && this.proximaAbreOutro(proxima, v.nome ?? '', agora)) {
      v.trocaNaProxima = true
      v.motivo = 'troca'
      return
    }

    this.agendar(v, 'assunto', agora)
  }

  /**
   * Marca a hora de encerrar, respeitando o piso e o teto.
   *
   * O piso é o que impede o painel de piscar: se o assunto durou uma linha
   * curta, ele ainda assim fica os 4 s. O teto continua mandando acima de
   * tudo — um painel nunca passa dos 20 s por causa de uma cauda.
   */
  private agendar(v: Vigencia, motivo: MotivoFecho, agora: number) {
    const desejado = Math.max(agora + CAUDA_ASSUNTO_MS, v.abertoEm + MINIMO_PAINEL_MS)
    v.encerrandoEm = Math.min(desejado, v.expiraEm)
    v.motivo = motivo
  }

  /** Começa a despedida: o log avisa, o sonar se despede, e aí o painel sai. */
  private despedir(v: Vigencia, motivo: MotivoFecho, agora: number) {
    v.encerrandoEm = undefined
    v.motivo = motivo
    this.saida.despedida(v.nome ?? '', motivo)
    // Só o sonar ganha um intervalo: é o único com algo na tela (o contato)
    // que precisa de um instante pra se apagar antes de o painel ir embora.
    v.saiEm = agora + (v.nome === 'sonar' ? MS_DESPEDIDA_SONAR : 0)
  }

  /** Encerramento imediato: despedida agora, saída na sequência. */
  private encerrar(v: Vigencia, motivo: MotivoFecho, agora: number) {
    this.despedir(v, motivo, agora)
    if (v.saiEm !== undefined && v.saiEm <= agora) this.pedirPainel(null, null)
  }

  /**
   * A próxima linha abre outro painel?
   *
   * Ação escrita no roteiro é certeza. Gatilho é PREVISÃO: as folgas são todas
   * do tipo "já passou tempo bastante", então o que passa agora também passa
   * daqui a pouco — um "sim" aqui é sempre verdade. Um "não" pode virar sim,
   * e aí o pior que acontece é a cauda de 0,8 s ter rodado antes da troca.
   */
  private proximaAbreOutro(proxima: Linha, nomeAtual: string, agora: number): boolean {
    for (const acao of acoesDaLinha(proxima)) {
      if (quandoDa(acao) !== 'inicio') continue
      if (acao.tipo === 'painel' && acao.nome !== nomeAtual) return true
      if (acao.tipo === 'mapa' && nomeAtual !== 'mapa') return true
      if (acao.tipo === 'camera' && nomeAtual !== 'camera') return true
    }
    if (!this.gatilhosLigados) return false
    const temPainelExplicito = acoesDaLinha(proxima).some(
      (a) => a.tipo === 'painel' || a.tipo === 'mapa' || a.tipo === 'camera',
    )
    if (temPainelExplicito) return false
    const pedido = painelDe(gatilhosDe(textoDaLinha(proxima)))
    if (!pedido || pedido.nome === nomeAtual) return false
    // A previsão ignora o painel aberto agora: ele é justamente o que vai sair.
    return this.podeAbrirIgnorandoOAtual(pedido.nome, agora)
  }

  private venceramNaLinha(indice: number) {
    const agora = performance.now()

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
      // Mesmo painel, prazo novo: só estende. O `abertoEm` é o da abertura de
      // verdade, não o deste pedido — senão o piso de 4 s reiniciaria a cada
      // renovação e o painel ficaria preso na tela renovando a si mesmo.
      if (vigencia && this.painel) vigencia.abertoEm = this.painel.abertoEm
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
