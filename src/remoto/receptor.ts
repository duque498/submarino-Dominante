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
  MS_RECONEXAO,
  nomeDoCanal,
  SUPABASE_KEY,
  SUPABASE_URL,
} from './config'
import * as rest from './rest'
import type { EstadoRemoto, StatusRemoto, Transporte } from './protocolo'

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
   * `motivo` é o texto cru que o transporte devolveu. Com o canal de pé ele
   * diz QUAL transporte está valendo (`realtime`, `rest · 420ms`); com o canal
   * fora, diz por quê (`CHANNEL_ERROR: Invalid API key`). Vai pro overlay H
   * sem tradução nenhuma — quem precisa dele é quem está depurando às sete da
   * manhã do dia da feira, e nessa hora "não deu" não ajuda ninguém.
   */
  aoStatus: (status: StatusRemoto, motivo?: string) => void
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
  let motivo: string | undefined

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

  const mudarStatus = (novo: StatusRemoto, porque?: string) => {
    // O motivo entra na comparação: o status pode continuar 'reconectando' e a
    // RAZÃO mudar (de TIMED_OUT pra CHANNEL_ERROR, por exemplo), e é justamente
    // essa mudança que conta a história pra quem está olhando o H.
    if (status === novo && motivo === porque) return
    status = novo
    motivo = porque
    try {
      opcoes.aoStatus(novo, porque)
    } catch {
      /* o indicador do HUD não pode derrubar a conexão */
    }
  }

  /** Mediana das últimas idas e voltas. Mediana, não média: um pico de wi-fi
   *  não pode fazer o número dançar na tela do operador. */
  const medianaMs = (): number => {
    if (!amostras.length) return 0
    const ordenadas = [...amostras].sort((a, b) => a - b)
    return ordenadas[Math.floor(ordenadas.length / 2)]
  }

  const rotuloRest = () => `rest · ${medianaMs()}ms`

  // ------------------------------------------------------------------
  // Eventos, iguais para os dois transportes
  // ------------------------------------------------------------------

  const responderPing = (id: unknown) => {
    const estado = opcoes.lerEstado()
    const pong = {
      id: typeof id === 'string' ? id : '',
      turma: opcoes.turma,
      cenaId: estado?.cenaId ?? '',
    }
    if (transporte === 'rest') {
      void rest.enviar(canalVolta, 'pong', pong)
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
      void rest.enviar(canalVolta, 'estado', estado)
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
        // Uma falha isolada é wi-fi de escola; três seguidas já é o servidor
        // fora, e aí o operador precisa saber que o celular não vale mais.
        if (falhasSeguidas >= 3 && transporte === 'rest') {
          mudarStatus('reconectando', 'rest: a tabela não respondeu')
        }
        return 0
      }
      falhasSeguidas = 0
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
      if (status !== 'ligado' && falhasSeguidas === 0) {
        mudarStatus('ligado', rotuloRest())
      }
      talvezVoltarAoRealtime()
      timerPoll = window.setTimeout(cicloRest, MS_POLL_REST)
    })
  }

  /**
   * Volta a tentar o Realtime — SÓ quando o REST também está fora.
   *
   * Com o REST funcionando a gente fica nele de propósito: trocar de
   * transporte no meio da apresentação é uma janela de silêncio, e a
   * latência do REST já é boa o bastante. Mas quando os dois estão fora não
   * há nada a preservar, e insistir só no caminho que já falhou é escolher
   * não voltar nunca de um piscar do wi-fi.
   */
  const talvezVoltarAoRealtime = () => {
    if (parado || transporte !== 'rest' || falhasSeguidas < 3) return
    if (timerReconexao || !window.supabase?.createClient) return
    timerReconexao = window.setTimeout(() => {
      timerReconexao = 0
      if (parado || transporte !== 'rest' || falhasSeguidas < 3) return
      conectar()
    }, MS_RECONEXAO)
  }

  /**
   * Troca pro REST. Só acontece uma vez: `transporte === 'rest'` é porta de
   * saída em todo lugar que poderia chamar isto de novo.
   */
  const irParaRest = async (porque: string) => {
    if (parado || transporte === 'rest') return
    transporte = 'rest'
    window.clearTimeout(timerEsperaRealtime)
    window.clearTimeout(timerReconexao)
    window.clearTimeout(timerPoll)
    window.clearInterval(timerLimpeza)
    timerEsperaRealtime = 0
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

    mudarStatus('reconectando', `${porque} — indo pro rest`)

    // Só pergunta onde a tabela está se ainda não sabemos: a escuta de resgate
    // pode já ter espiado linhas, e voltar pro fim aqui perderia justamente o
    // ping que nos trouxe pra cá.
    if (!marcadorPronto) {
      marcador = await rest.ultimoId(canalIda)
      marcadorPronto = true
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
      mudarStatus('ligado', rotuloRest())
      publicar()
    } else {
      mudarStatus('reconectando', 'rest: a tabela não respondeu')
    }

    timerPoll = window.setTimeout(cicloRest, MS_POLL_REST)
    timerLimpeza = window.setInterval(() => void rest.apagarAntigas(canalIda), MS_LIMPEZA)
    void rest.apagarAntigas(canalIda)
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
        void irParaRest('o celular só alcança o rest')
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
    mudarStatus(semBiblioteca ? 'desligado' : 'reconectando', porque)
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

      // O relógio dos 4 s. Cobre o caso que mais dói e que NENHUM callback
      // reporta: o WebSocket que abre, não recebe resposta e fica pendurado.
      // Sem ele, "conectando..." era pra sempre.
      window.clearTimeout(timerEsperaRealtime)
      timerEsperaRealtime = window.setTimeout(() => {
        timerEsperaRealtime = 0
        if (parado || transporte === 'rest') return
        void irParaRest(`realtime não subiu em ${MS_ESPERA_REALTIME / 1000}s`)
      }, MS_ESPERA_REALTIME)

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
            timerEsperaRealtime = 0
            // Se viemos do REST, o ciclo de polling se desliga sozinho no
            // próximo tique (ele checa o transporte), mas a limpeza é um
            // setInterval e precisa ser cortada na mão.
            window.clearInterval(timerLimpeza)
            timerLimpeza = 0
            falhasSeguidas = 0
            transporte = 'realtime'
            mudarStatus('ligado', 'realtime')
            publicar()
            // A escuta de resgate só faz sentido depois que sabemos onde a
            // tabela está — senão ela leria a sessão inteira de ontem.
            if (!marcadorPronto) {
              void rest.ultimoId(canalIda).then((id) => {
                if (parado || transporte !== 'realtime') return
                marcador = id
                marcadorPronto = true
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
          const detalhe = erro?.message ? `${estadoDoCanal}: ${erro.message}` : estadoDoCanal
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
            mudarStatus('reconectando', detalhe)
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
    if (transporte === 'rest' && status === 'ligado') mudarStatus('ligado', rotuloRest())
  }, MS_ESTADO)
  conectar()

  return {
    publicar,
    parar() {
      if (parado) return
      parado = true
      window.clearInterval(timerEstado)
      window.clearInterval(timerLimpeza)
      window.clearTimeout(timerReconexao)
      window.clearTimeout(timerEsperaRealtime)
      window.clearTimeout(timerPoll)
      mudarStatus('desligado', undefined)
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
