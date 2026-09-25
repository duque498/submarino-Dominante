/**
 * O lado Chromebook do controle remoto.
 *
 * REGRA QUE MANDA EM TUDO AQUI: isto nunca pode atrapalhar a apresentação. Sem
 * rede, sem a biblioteca, com o projeto do Supabase pausado, com o canal caindo
 * no meio — em todos os casos o app segue exatamente como antes e o teclado
 * físico continua sendo a fonte principal de teclas. Por isso cada passo está
 * dentro de try/catch e nada aqui é esperado por ninguém.
 *
 * O remoto é uma SEGUNDA fonte de teclas, não um segundo roteamento: quando
 * chega um `cmd`, ele dispara um KeyboardEvent de verdade na janela, que cai no
 * mesmo listener do `useTeclado`. Assim toda regra existente vale igual, de
 * graça — console aberto engole a tecla, o cooldown do pulso no combate
 * continua valendo, tecla que a cena ignora segue ignorada. Um `if` a mais aqui
 * seria uma regra a mais pra manter em dois lugares.
 *
 * DOIS TRANSPORTES (Fase 6.3). O Realtime é sempre o primeiro. Se ele não
 * chegar em SUBSCRIBED em `MS_ESPERA_REALTIME`, ou morrer com transport
 * failed, o receptor troca sozinho pro REST e não volta mais nesta sessão —
 * voltar seria arriscar uma segunda janela de silêncio no meio da feira, pra
 * ganhar uma latência que já está boa o bastante. O que muda é SÓ como o byte
 * anda: os eventos, o protocolo e tudo daqui pra fora são idênticos.
 */

import {
  canalDeResposta,
  CDN_SUPABASE,
  MS_ESCUTA_RESGATE,
  MS_ESPERA_REALTIME,
  MS_ESTADO,
  MS_LIMPEZA,
  MS_POLL_REST,
  MS_REALTIME_ESTAVEL,
  MS_RECONEXAO,
  MS_RETENTAR_REALTIME,
  MS_RETENTAR_SUBSCRIBE,
  nomeDoCanal,
  PROMOCOES_ANTES_DE_DESISTIR,
  SUPABASE_KEY,
  SUPABASE_URL,
} from './config'
import * as rest from './rest'
import type { EstadoRemoto, InfoCanal, StatusRemoto, Transporte } from './protocolo'

type ClienteSupabase = {
  channel: (nome: string, opcoes?: unknown) => CanalSupabase
  removeChannel: (canal: CanalSupabase) => void
}
type CanalSupabase = {
  on: (tipo: string, filtro: unknown, aoReceber: (mensagem: unknown) => void) => CanalSupabase
  subscribe: (aoMudar: (status: string, erro?: Error) => void) => CanalSupabase
  send: (mensagem: unknown) => unknown
  unsubscribe: () => unknown
}

declare global {
  interface Window {
    supabase?: { createClient: (url: string, chave: string, opcoes?: unknown) => ClienteSupabase }
  }
}

export type Receptor = {
  /** Publica o estado agora (usado na troca de cena). */
  publicar: () => void
  /** Foto do canal AGORA. Lida pelo overlay H enquanto ele está aberto. */
  info: () => InfoCanal
  /** Desliga tudo. Idempotente. */
  parar: () => void
}

export type OpcoesReceptor = {
  turma: string
  codigo: string
  /** Uma tecla chegou do celular. */
  aoCmd: (tecla: string) => void
  /** Uma linha de console chegou do celular. */
  aoComando: (texto: string) => void
  /** Lido na hora de publicar. Devolve null enquanto a cena não está pronta. */
  lerEstado: () => EstadoRemoto | null
  /**
   * Só o pontinho do HUD. O detalhe (transporte, idade, erro de cada lado)
   * sai pelo `info()`, que é getter: ele muda a cada segundo, e virar estado
   * do React faria a árvore renderizar de 2 em 2 s no meio da apresentação.
   */
  aoStatus: (status: StatusRemoto) => void
}

/** O corpo da mensagem de broadcast, com o formato que o supabase-js entrega. */
function corpo(mensagem: unknown): Record<string, unknown> {
  const m = mensagem as { payload?: Record<string, unknown> } | undefined
  return m?.payload ?? {}
}

export function criarReceptor(opcoes: OpcoesReceptor): Receptor {
  const canalIda = nomeDoCanal(opcoes.turma, opcoes.codigo)
  const canalVolta = canalDeResposta(canalIda)

  let cliente: ClienteSupabase | null = null
  let canal: CanalSupabase | null = null
  let parado = false
  let timerEstado = 0
  let timerReconexao = 0
  let timerEsperaRealtime = 0
  let timerPoll = 0
  let timerLimpeza = 0
  let status: StatusRemoto = 'desligado'
  /** Desde quando o transporte atual está valendo. */
  let desde = Date.now()
  /**
   * O último erro de CADA lado, guardado mesmo enquanto o outro funciona.
   *
   * É essa memória que responde à pergunta do dia da feira: "estou no rest —
   * o realtime falhou por quê?". Sem ela o motivo some no instante em que o
   * plano B assume, que é justamente quando alguém vai querer saber.
   */
  let erroRealtime: string | undefined
  let erroRest: string | undefined

  let transporte: Transporte | null = null
  /** O maior id que já lemos do canal de ida. Sobe a cada linha processada. */
  let marcador = 0
  /**
   * Já perguntamos à tabela onde ela está?
   *
   * Precisa ser uma flag e não `marcador > 0`: numa tabela recém-limpa o
   * marcador legítimo é ZERO, e tratar zero como "ainda não perguntei" fazia
   * o `irParaRest` pular pro fim da tabela bem na hora em que a linha que nos
   * trouxe pra cá estava lá esperando — o `ping` do celular era engolido e os
   * dois lados ficavam se esperando.
   */
  let marcadorPronto = false
  /** true entre o começo e o fim de um GET, pra duas leituras não se cruzarem. */
  let lendo = false
  let falhasSeguidas = 0
  const amostras: number[] = []
  let timerRetentarSub = 0
  /**
   * Quem nos trouxe pro REST: a nossa própria falha, ou o outro lado?
   *
   * Muda o que fazer depois. Se o nosso Realtime caiu, vale tentar de novo —
   * pode ter sido o aperto de todo mundo abrindo junto. Se foi o celular que
   * só alcança o REST, voltar pro Realtime não ajuda ninguém: ele nos puxa de
   * volta na escuta de resgate, e o único efeito é uma janelinha sem polling
   * a cada tentativa.
   */
  let quedaFoiNossa = true
  /** Quando a última volta pro Realtime deu certo. Ver `MS_REALTIME_ESTAVEL`. */
  let promovidoEm = 0
  let promocoesRuins = 0
  /** Com qual intervalo a tentativa de volta foi marcada. Ver abaixo. */
  let intervaloArmado = MS_RETENTAR_REALTIME

  const mudarStatus = (novo: StatusRemoto) => {
    if (status === novo) return
    status = novo
    try {
      opcoes.aoStatus(novo)
    } catch {
      /* o indicador do HUD não pode derrubar a conexão */
    }
  }

  /** Trocar de transporte reinicia o relógio que o H mostra. */
  const trocarTransporte = (novo: Transporte | null) => {
    if (transporte === novo) return
    transporte = novo
    desde = Date.now()
  }

  /** Mediana das últimas idas e voltas. Mediana, não média: um pico de wi-fi
   *  não pode fazer o número dançar na tela do operador. */
  const medianaMs = (): number => {
    if (!amostras.length) return 0
    const ordenadas = [...amostras].sort((a, b) => a - b)
    return ordenadas[Math.floor(ordenadas.length / 2)]
  }

  /** A foto que o overlay H lê. Getter, não estado: ver `aoStatus`. */
  const info = (): InfoCanal => ({
    transporte,
    desde,
    ms: transporte === 'rest' ? medianaMs() : undefined,
    erroRealtime,
    erroRest,
  })

  // ------------------------------------------------------------------
  // Eventos, iguais para os dois transportes
  // ------------------------------------------------------------------

  /**
   * Escreve na tabela e NÃO engole a falha.
   *
   * O caso concreto: o SQL rodado sem o `grant` da sequência deixa o
   * Chromebook lendo perfeitamente e sem conseguir inserir nada. Por fora
   * parece saúde — ponto verde, latência boa — e o celular fica dizendo que
   * nenhum submarino respondeu. Sem esta linha, não há como descobrir isso
   * de dentro do ginásio.
   */
  const escrever = (nome: string, evento: string, payload: unknown) => {
    void rest.enviar(nome, evento, payload).then((falha) => {
      if (parado || transporte !== 'rest') return
      if (falha) {
        erroRest = falha
        mudarStatus('reconectando')
      } else if (erroRest) {
        erroRest = undefined
        mudarStatus('ligado')
      }
    })
  }

  const responderPing = (id: unknown) => {
    const estado = opcoes.lerEstado()
    const pong = {
      id: typeof id === 'string' ? id : '',
      turma: opcoes.turma,
      cenaId: estado?.cenaId ?? '',
    }
    if (transporte === 'rest') {
      escrever(canalVolta, 'pong', pong)
    } else {
      try {
        void canal?.send({ type: 'broadcast', event: 'pong', payload: pong })
      } catch {
        /* o celular tenta de novo */
      }
    }
    // O celular acabou de chegar: manda o estado junto, pra ele não ficar até
    // 2 s numa tela vazia.
    publicar()
  }

  /** O ponto único por onde todo evento entra, venha de onde vier. */
  const aplicarEvento = (evento: string, dados: Record<string, unknown>) => {
    if (evento === 'cmd') {
      const tecla = dados.tecla
      if (typeof tecla === 'string' && tecla) opcoes.aoCmd(tecla)
    } else if (evento === 'comando') {
      const texto = dados.texto
      if (typeof texto === 'string' && texto.trim()) opcoes.aoComando(texto.trim())
    } else if (evento === 'ping') {
      responderPing(dados.id)
    }
  }

  const publicar = () => {
    if (parado || status !== 'ligado') return
    const estado = opcoes.lerEstado()
    if (!estado) return
    if (transporte === 'rest') {
      escrever(canalVolta, 'estado', estado)
      return
    }
    if (!canal) return
    try {
      void canal.send({ type: 'broadcast', event: 'estado', payload: estado })
    } catch {
      /* uma publicação perdida é só uma colinha desatualizada por 2 s */
    }
  }

  // ------------------------------------------------------------------
  // Transporte B: REST
  // ------------------------------------------------------------------

  /**
   * Uma passada de leitura. Devolve quantas linhas vieram.
   *
   * `soEspiar` existe por causa da escuta de resgate: ali a gente quer
   * SABER que chegou linha sem consumi-la, porque responder um `ping`
   * ainda no transporte velho manda o pong por um caminho que o celular
   * não escuta — ele ficaria esperando pra sempre um submarino que
   * respondeu. Espiando, o `irParaRest` relê do mesmo marcador e
   * responde já pelo caminho certo.
   */
  const puxar = async (soEspiar = false): Promise<number> => {
    if (parado || lendo) return 0
    lendo = true
    try {
      const leitura = await rest.ler(canalIda, marcador)
      if (parado) return 0
      if (!leitura.ok) {
        falhasSeguidas += 1
        // "Tabela não existe" não é falha intermitente: aparece na primeira,
        // porque é acionável e não vai melhorar esperando. As outras esperam
        // três seguidas — uma isolada é wi-fi de escola.
        const agora = leitura.motivo === rest.MOTIVO_SEM_TABELA
        if ((agora || falhasSeguidas >= 3) && transporte === 'rest') {
          erroRest = leitura.motivo
          mudarStatus('reconectando')
        }
        return 0
      }
      falhasSeguidas = 0
      erroRest = undefined
      amostras.push(leitura.ms)
      if (amostras.length > 7) amostras.shift()
      if (soEspiar) return leitura.linhas.length
      for (const linha of leitura.linhas) {
        if (linha.id > marcador) marcador = linha.id
        aplicarEvento(linha.evento, linha.payload)
      }
      return leitura.linhas.length
    } finally {
      lendo = false
    }
  }

  const cicloRest = () => {
    if (parado) return
    void puxar().then(() => {
      if (parado || transporte !== 'rest') return
      if (status !== 'ligado' && falhasSeguidas === 0) mudarStatus('ligado')
      agendarVoltaAoRealtime()
      timerPoll = window.setTimeout(cicloRest, MS_POLL_REST)
    })
  }

  /**
   * Volta a tentar o Realtime de tempos em tempos, estando no REST.
   *
   * O REST custa uns 600 ms por tecla; se o aperto que nos derrubou passou,
   * vale voltar. A guarda é `quedaFoiNossa`: quando quem nos trouxe pro REST
   * foi o outro lado, o Realtime não resolve nada — ele nos puxaria de volta
   * na próxima escuta de resgate, e o único efeito seria uma janelinha fora
   * do transporte bom a cada 30 s pelo resto da apresentação.
   */
  const agendarVoltaAoRealtime = () => {
    if (parado || transporte !== 'rest') return
    if (!quedaFoiNossa || !window.supabase?.createClient) return
    // Com o REST fora também, não há transporte bom pra proteger: aí a
    // pressa vale mais que a cautela, e a tentativa é a cada 5 s. É esse o
    // caso do wi-fi que piscou e levou tudo junto.
    const quanto = falhasSeguidas >= 3 ? MS_RECONEXAO : MS_RETENTAR_REALTIME
    if (timerReconexao) {
      // Já tem tentativa marcada, mas pro intervalo errado: o REST caiu
      // depois que ela foi agendada. Remarca pra perto.
      if (intervaloArmado <= quanto) return
      window.clearTimeout(timerReconexao)
    }
    intervaloArmado = quanto
    timerReconexao = window.setTimeout(() => {
      timerReconexao = 0
      if (parado || transporte !== 'rest') return
      conectar()
      agendarVoltaAoRealtime()
    }, quanto)
  }

  /**
   * Troca pro REST. Só acontece uma vez: `transporte === 'rest'` é porta de
   * saída em todo lugar que poderia chamar isto de novo.
   */
  const irParaRest = async (porque: string, foiNossa = true) => {
    if (parado || transporte === 'rest') return
    // Voltamos pro Realtime há pouco e já estamos caindo de novo? Então a
    // volta não vingou. Duas dessas e paramos de tentar: numa rede que só
    // deixa passar uma conexão, cada tentativa nossa derruba a de outro
    // Chromebook, e o revezamento é pior que ficar no REST.
    if (foiNossa && promovidoEm && Date.now() - promovidoEm < MS_REALTIME_ESTAVEL) {
      promocoesRuins += 1
      if (promocoesRuins >= PROMOCOES_ANTES_DE_DESISTIR) {
        quedaFoiNossa = false
        porque = `${porque} — cai em segundos, ficando no rest`
      }
    }
    promovidoEm = 0
    trocarTransporte('rest')
    // Saímos do Realtime: o porquê é o erro DELE, e fica guardado mesmo
    // depois que o REST assumir.
    erroRealtime = porque
    // Uma vez que o outro lado se mostrou preso no REST, nunca mais voltamos
    // a tentar — ele nos puxaria de novo, e de novo.
    if (!foiNossa) quedaFoiNossa = false
    window.clearTimeout(timerEsperaRealtime)
    window.clearTimeout(timerRetentarSub)
    window.clearTimeout(timerReconexao)
    window.clearTimeout(timerPoll)
    window.clearInterval(timerLimpeza)
    timerEsperaRealtime = 0
    timerRetentarSub = 0
    timerReconexao = 0
    timerPoll = 0
    timerLimpeza = 0
    // O Realtime não serve mais e não pode continuar entregando evento pelas
    // costas: dois transportes vivos ao mesmo tempo é tecla duplicada.
    try {
      canal?.unsubscribe()
      if (cliente && canal) cliente.removeChannel(canal)
    } catch {
      /* o canal já podia estar morto — é justamente por isso que estamos aqui */
    }
    canal = null

    mudarStatus('reconectando')

    // Só pergunta onde a tabela está se ainda não sabemos: a escuta de resgate
    // pode já ter espiado linhas, e voltar pro fim aqui perderia justamente o
    // ping que nos trouxe pra cá.
    if (!marcadorPronto) {
      // Primeira coisa que o REST faz, e é ela que descobre se alguém rodou
      // o SQL. Falhou aqui, o H já diz o que fazer antes de qualquer polling.
      const inicio = await rest.ultimoId(canalIda)
      if (parado) return
      marcador = inicio.id
      marcadorPronto = true
      if (inicio.motivo) {
        erroRest = inicio.motivo
        mudarStatus('reconectando')
      }
    }
    if (parado) return

    const primeira = await rest.ler(canalIda, marcador)
    if (parado) return
    if (primeira.ok) {
      amostras.push(primeira.ms)
      for (const linha of primeira.linhas) {
        if (linha.id > marcador) marcador = linha.id
        aplicarEvento(linha.evento, linha.payload)
      }
      erroRest = undefined
      mudarStatus('ligado')
      publicar()
    } else {
      erroRest = primeira.motivo
      mudarStatus('reconectando')
    }

    timerPoll = window.setTimeout(cicloRest, MS_POLL_REST)
    timerLimpeza = window.setInterval(() => void rest.apagarAntigas(canalIda), MS_LIMPEZA)
    void rest.apagarAntigas(canalIda)
    agendarVoltaAoRealtime()
  }

  /**
   * A escuta de resgate: enquanto o Realtime está de pé, dá uma olhada lenta na
   * tabela. Ver `MS_ESCUTA_RESGATE` no config pra o porquê.
   */
  const escutarResgate = () => {
    if (parado || transporte !== 'realtime') return
    void puxar(true).then((quantas) => {
      if (parado || transporte !== 'realtime') return
      if (quantas > 0) {
        void irParaRest('o celular só alcança o rest', false)
        return
      }
      timerPoll = window.setTimeout(escutarResgate, MS_ESCUTA_RESGATE)
    })
  }

  // ------------------------------------------------------------------
  // Transporte A: Realtime
  // ------------------------------------------------------------------

  /**
   * `semBiblioteca` separa dois casos que parecem iguais por dentro e são bem
   * diferentes na tela: sem o supabase-js não existe nem o que reconectar (é o
   * Chromebook offline do dia a dia, e o ponto fica CINZA, quieto), enquanto um
   * canal que caiu no meio é âmbar pulsando, porque ali realmente há uma
   * tentativa em curso. Âmbar piscando a apresentação inteira num Chromebook
   * sem internet seria um alarme para nada, no projetor, na frente da plateia.
   */
  const agendarReconexao = (semBiblioteca = false, porque?: string) => {
    if (parado || timerReconexao || transporte === 'rest') return
    erroRealtime = porque
    mudarStatus(semBiblioteca ? 'desligado' : 'reconectando')
    timerReconexao = window.setTimeout(() => {
      timerReconexao = 0
      conectar()
    }, MS_RECONEXAO)
  }

  const conectar = () => {
    if (parado) return
    const fabrica = window.supabase?.createClient
    if (!fabrica) {
      // Sem a biblioteca não há Realtime — mas o REST não precisa dela, é
      // `fetch` com header. Então isto não é mais o fim da linha: se o
      // Chromebook tem HTTPS, o celular ainda funciona.
      void irParaRest('supabase-js não carregou')
      return
    }
    try {
      cliente =
        cliente ??
        fabrica(SUPABASE_URL, SUPABASE_KEY, {
          realtime: {
            // `params` viram query string do websocket. `log_level` e lido
            // pelo SERVIDOR: com ele o Realtime registra conexao e join nos
            // logs do projeto, que e onde da pra ver se o join foi recusado
            // quando daqui so se ve "nao conectou". Nao e segredo nenhum —
            // vai na URL, junto com a chave publishable.
            params: { eventsPerSecond: 20, log_level: 'info' },
          },
        })

      const anterior = canal
      canal = cliente.channel(canalIda, {
        // Sem isto o Chromebook recebe o próprio `estado` de volta e gasta
        // trabalho à toa.
        config: { broadcast: { self: false } },
      })
      if (anterior) {
        try {
          cliente.removeChannel(anterior)
        } catch {
          /* o canal velho já pode ter morrido sozinho */
        }
      }

      // Os relógios. Só na tentativa de estreia: quando isto é a volta
      // periódica lá do REST, uma tentativa que não vinga simplesmente não
      // vinga — a gente já está no transporte que funciona.
      // `!timerEsperaRealtime` quer dizer "não há ciclo em andamento". Sem
      // essa guarda, a nova inscrição dos 6 s chamaria `conectar` e o prazo
      // dos 12 s seria rearmado do zero a cada 6 — o prazo nunca venceria e
      // a tela ficaria tentando pra sempre, que é exatamente o que ele
      // existe pra impedir.
      if (transporte !== 'rest' && !timerEsperaRealtime) {
        // Aos 6 s, refazer a inscrição em vez de continuar esperando. Um join
        // perdido no aperto de todo mundo abrindo junto não volta sozinho: o
        // canal fica pendurado até o prazo estourar.
        timerRetentarSub = window.setTimeout(() => {
          timerRetentarSub = 0
          if (parado || transporte === 'rest' || status === 'ligado') return
          erroRealtime = 'demorou — refazendo o subscribe aos 6s'
          mudarStatus('reconectando')
          conectar()
        }, MS_RETENTAR_SUBSCRIBE)

        // Os 12 s. Cobrem o caso que mais dói e que NENHUM callback reporta:
        // o WebSocket que abre, não recebe resposta e fica pendurado. Sem
        // eles, "conectando..." era pra sempre.
        timerEsperaRealtime = window.setTimeout(() => {
          timerEsperaRealtime = 0
          if (parado || transporte === 'rest') return
          void irParaRest(`timeout ${MS_ESPERA_REALTIME / 1000}s`)
        }, MS_ESPERA_REALTIME)
      }

      canal
        .on('broadcast', { event: 'cmd' }, (m) => aplicarEvento('cmd', corpo(m)))
        .on('broadcast', { event: 'comando' }, (m) => aplicarEvento('comando', corpo(m)))
        .on('broadcast', { event: 'ping' }, (m) => aplicarEvento('ping', corpo(m)))
        // O segundo argumento é o erro, e ele é a única coisa que diz POR QUE
        // um canal não sobe. Ignorá-lo (como esta chamada fazia) transformava
        // chave recusada, projeto pausado e wi-fi da escola na mesma tela:
        // "abrindo o canal do celular...", pra sempre.
        .subscribe((estadoDoCanal, erro) => {
          if (parado) return
          if (estadoDoCanal === 'SUBSCRIBED') {
            window.clearTimeout(timerEsperaRealtime)
            window.clearTimeout(timerRetentarSub)
            window.clearTimeout(timerPoll)
            timerEsperaRealtime = 0
            timerRetentarSub = 0
            // Se viemos do REST, o ciclo de polling se desliga sozinho no
            // próximo tique (ele checa o transporte), mas a limpeza é um
            // setInterval e precisa ser cortada na mão.
            window.clearInterval(timerLimpeza)
            timerLimpeza = 0
            falhasSeguidas = 0
            const voltandoDoRest = transporte === 'rest'
            if (voltandoDoRest) promovidoEm = Date.now()
            trocarTransporte('realtime')
            erroRealtime = undefined
            mudarStatus('ligado')
            // Avisa o celular pela tabela que aqui voltou a dar Realtime.
            // Sem este recado ele ficaria no REST sozinho, escrevendo num
            // canal que ninguém lê mais — e a escuta de resgate nos puxaria
            // de volta, desfazendo a volta que acabou de dar certo.
            if (voltandoDoRest) void rest.enviar(canalVolta, 'transporte', { via: 'realtime' })
            publicar()
            // A escuta de resgate só faz sentido depois que sabemos onde a
            // tabela está — senão ela leria a sessão inteira de ontem.
            if (!marcadorPronto) {
              void rest.ultimoId(canalIda).then((inicio) => {
                if (parado || transporte !== 'realtime') return
                marcador = inicio.id
                marcadorPronto = true
                // Estando no Realtime isto não derruba nada — mas já registra
                // que a tabela não existe, e o H mostra o erro do OUTRO
                // transporte antes de precisar dele.
                if (inicio.motivo) erroRest = inicio.motivo
                timerPoll = window.setTimeout(escutarResgate, MS_ESCUTA_RESGATE)
              })
            } else {
              timerPoll = window.setTimeout(escutarResgate, MS_ESCUTA_RESGATE)
            }
            return
          }
          // Já estamos no REST: esta é a tentativa de volta que não vingou.
          // Seguir no REST é o certo — e o motivo na tela continua sendo o
          // da tabela, que é o transporte que está valendo.
          if (transporte === 'rest') return
          // Com mensagem, ela vai literal — é a pista real. Sem mensagem, o
          // status sozinho ("CHANNEL_ERROR") não diz nada pra quem está
          // olhando a tela, então vira a frase que descreve o que houve.
          const detalhe = erro?.message
            ? `${estadoDoCanal}: ${erro.message}`
            : `transport failed (${estadoDoCanal})`
          if (
            estadoDoCanal === 'CLOSED' ||
            estadoDoCanal === 'CHANNEL_ERROR' ||
            estadoDoCanal === 'TIMED_OUT'
          ) {
            // Transport failed. Não adianta insistir no mesmo caminho: é
            // exatamente este o caso que o REST existe pra cobrir.
            void irParaRest(detalhe)
          } else {
            // JOINING e afins: ainda não é falha, mas já é informação.
            erroRealtime = detalhe
            mudarStatus('reconectando')
          }
        })
    } catch (erro) {
      agendarReconexao(false, erro instanceof Error ? erro.message : String(erro))
    }
  }

  timerEstado = window.setInterval(() => {
    publicar()
    // O número do overlay H anda aqui, a cada 2 s, e não a cada leitura: um
    // texto que muda 2,5 vezes por segundo no canto da tela é ruído, e cada
    // mudança é um render do React durante a apresentação.
    // A latência e a idade NÃO passam mais por aqui: o H lê por getter, e
    // um setState de 2 em 2 s renderizaria a árvore inteira durante a
    // apresentação só pra mexer num número que quase ninguém está olhando.
  }, MS_ESTADO)
  conectar()

  return {
    publicar,
    info,
    parar() {
      if (parado) return
      parado = true
      window.clearInterval(timerEstado)
      window.clearInterval(timerLimpeza)
      window.clearTimeout(timerReconexao)
      window.clearTimeout(timerEsperaRealtime)
      window.clearTimeout(timerPoll)
      trocarTransporte(null)
      mudarStatus('desligado')
      try {
        canal?.unsubscribe()
        if (cliente && canal) cliente.removeChannel(canal)
      } catch {
        /* desligar não pode falhar de um jeito que apareça na tela */
      }
      canal = null
      cliente = null
    },
  }
}

/** Endereço da biblioteca, pra quem precisa injetar o script. */
export { CDN_SUPABASE }
