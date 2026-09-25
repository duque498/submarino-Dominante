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
 */

import {
  CDN_SUPABASE,
  MS_ESTADO,
  MS_RECONEXAO,
  nomeDoCanal,
  SUPABASE_KEY,
  SUPABASE_URL,
} from './config'
import type { EstadoRemoto, StatusRemoto } from './protocolo'

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
   * `motivo` é o texto cru que o supabase-js devolveu: o status do canal e,
   * quando existe, a mensagem do erro. Vai pro overlay H sem tradução nenhuma
   * — quem precisa dele é quem está depurando às sete da manhã do dia da
   * feira, e nessa hora "não deu" não ajuda ninguém.
   */
  aoStatus: (status: StatusRemoto, motivo?: string) => void
}

/** O corpo da mensagem de broadcast, com o formato que o supabase-js entrega. */
function corpo(mensagem: unknown): Record<string, unknown> {
  const m = mensagem as { payload?: Record<string, unknown> } | undefined
  return m?.payload ?? {}
}

export function criarReceptor(opcoes: OpcoesReceptor): Receptor {
  let cliente: ClienteSupabase | null = null
  let canal: CanalSupabase | null = null
  let parado = false
  let timerEstado = 0
  let timerReconexao = 0
  let status: StatusRemoto = 'desligado'

  let motivo: string | undefined

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

  const publicar = () => {
    if (parado || !canal || status !== 'ligado') return
    const estado = opcoes.lerEstado()
    if (!estado) return
    try {
      void canal.send({ type: 'broadcast', event: 'estado', payload: estado })
    } catch {
      /* uma publicação perdida é só uma colinha desatualizada por 2 s */
    }
  }

  /**
   * `semBiblioteca` separa dois casos que parecem iguais por dentro e são bem
   * diferentes na tela: sem o supabase-js não existe nem o que reconectar (é o
   * Chromebook offline do dia a dia, e o ponto fica CINZA, quieto), enquanto um
   * canal que caiu no meio é âmbar pulsando, porque ali realmente há uma
   * tentativa em curso. Âmbar piscando a apresentação inteira num Chromebook
   * sem internet seria um alarme para nada, no projetor, na frente da plateia.
   */
  const agendarReconexao = (semBiblioteca = false, porque?: string) => {
    if (parado || timerReconexao) return
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
      // A biblioteca não carregou (sem rede, CDN fora, script bloqueado). Sem
      // drama: tenta de novo daqui a pouco e o app segue normal.
      agendarReconexao(true, 'supabase-js não carregou (sem rede ou CDN bloqueada)')
      return
    }
    try {
      cliente =
        cliente ??
        fabrica(SUPABASE_URL, SUPABASE_KEY, {
          realtime: { params: { eventsPerSecond: 20 } },
        })

      const anterior = canal
      canal = cliente.channel(nomeDoCanal(opcoes.turma, opcoes.codigo), {
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

      canal
        .on('broadcast', { event: 'cmd' }, (mensagem) => {
          const tecla = corpo(mensagem).tecla
          if (typeof tecla === 'string' && tecla) opcoes.aoCmd(tecla)
        })
        .on('broadcast', { event: 'comando' }, (mensagem) => {
          const texto = corpo(mensagem).texto
          if (typeof texto === 'string' && texto.trim()) opcoes.aoComando(texto.trim())
        })
        .on('broadcast', { event: 'ping' }, (mensagem) => {
          const id = corpo(mensagem).id
          const estado = opcoes.lerEstado()
          try {
            void canal?.send({
              type: 'broadcast',
              event: 'pong',
              payload: {
                id: typeof id === 'string' ? id : '',
                turma: opcoes.turma,
                cenaId: estado?.cenaId ?? '',
              },
            })
          } catch {
            /* o celular tenta de novo */
          }
          // O celular acabou de chegar: manda o estado junto, pra ele não ficar
          // até 2 s numa tela vazia.
          publicar()
        })
        // O segundo argumento é o erro, e ele é a única coisa que diz POR QUE
        // um canal não sobe. Ignorá-lo (como esta chamada fazia) transformava
        // chave recusada, projeto pausado e wi-fi da escola na mesma tela:
        // "abrindo o canal do celular...", pra sempre.
        .subscribe((estadoDoCanal, erro) => {
          if (parado) return
          if (estadoDoCanal === 'SUBSCRIBED') {
            mudarStatus('ligado')
            publicar()
            return
          }
          const detalhe = erro?.message ? `${estadoDoCanal}: ${erro.message}` : estadoDoCanal
          if (
            estadoDoCanal === 'CLOSED' ||
            estadoDoCanal === 'CHANNEL_ERROR' ||
            estadoDoCanal === 'TIMED_OUT'
          ) {
            agendarReconexao(false, detalhe)
          } else {
            // JOINING e afins: ainda não é falha, mas já é informação.
            mudarStatus('reconectando', detalhe)
          }
        })
    } catch (erro) {
      agendarReconexao(false, erro instanceof Error ? erro.message : String(erro))
    }
  }

  timerEstado = window.setInterval(publicar, MS_ESTADO)
  conectar()

  return {
    publicar,
    parar() {
      if (parado) return
      parado = true
      window.clearInterval(timerEstado)
      window.clearTimeout(timerReconexao)
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
