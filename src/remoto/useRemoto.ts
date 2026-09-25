import { useEffect, useRef, useState } from 'react'
import { criarReceptor } from './receptor'
import type { EstadoRemoto, StatusRemoto } from './protocolo'

/**
 * Entrega a tecla do celular pelo MESMO caminho da tecla física.
 *
 * Um `KeyboardEvent` de verdade na janela cai no listener do `useTeclado`, que
 * é quem já sabe tudo: quando o console está aberto o listener nem está
 * pendurado (e a tecla é engolida, como seria a física), o painel que captura
 * teclado recebe igual, e o cooldown do pulso no combate continua sendo o do
 * combate. Nenhuma regra é reescrita aqui — é esse o ponto.
 */
export function digitarRemoto(tecla: string): void {
  try {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: tecla, bubbles: true, cancelable: true }),
    )
  } catch {
    /* navegador sem construtor de KeyboardEvent: o teclado físico segue */
  }
}

export type OpcoesUseRemoto = {
  turma: string
  codigo: string
  /** Lê o estado atual. Precisa ser barato: roda a cada 2 s. */
  lerEstado: () => EstadoRemoto | null
  /** Executa uma linha de console, como se digitada depois do `/`. */
  aoComando: (texto: string) => void
  /** Liga o receptor. Precisa de uma turma escolhida pra saber o canal. */
  ativo: boolean
  /**
   * O `cmd` do celular vira tecla de verdade?
   *
   * Hoje é sempre `true`: quem filtra o que o celular pode fazer é a lista de
   * teclas de cada cena, e a única regra que o remoto não pode furar (iniciar
   * a apresentação com o áudio travado) mora na própria cena de espera. Fica
   * como interruptor porque a alternativa era o Player e o App checarem a
   * mesma condição cada um do seu lado.
   */
  aceitaTeclas: boolean
}

/** O que o resto do app usa pra falar com o receptor. */
export type ConexaoRemota = {
  status: StatusRemoto
  /** O que o supabase-js disse, cru. Só aparece no overlay H. */
  motivo?: string
  /** Publica o estado agora, sem esperar o tique de 2 s. */
  publicar: () => void
  /** Quem sabe montar o estado da cena atual (o Player, quando existe). */
  registrarLeitor: (ler: () => EstadoRemoto | null) => void
  /** Quem sabe executar uma linha de console. */
  registrarComando: (executar: (texto: string) => void) => void
}

/**
 * Liga o controle remoto e devolve o status pro pontinho do HUD.
 *
 * `publicar` é chamado na troca de cena; fora isso o receptor republica
 * sozinho a cada 2 s.
 */
export function useRemoto(opcoes: OpcoesUseRemoto): {
  status: StatusRemoto
  motivo?: string
  publicar: () => void
} {
  const [status, setStatus] = useState<StatusRemoto>('desligado')
  const [motivo, setMotivo] = useState<string | undefined>(undefined)
  // Em refs: o receptor é montado UMA vez e não pode ser derrubado só porque o
  // Player renderizou de novo.
  const refLer = useRef(opcoes.lerEstado)
  const refComando = useRef(opcoes.aoComando)
  refLer.current = opcoes.lerEstado
  refComando.current = opcoes.aoComando
  const refPublicar = useRef<() => void>(() => {})
  const refAceita = useRef(opcoes.aceitaTeclas)
  refAceita.current = opcoes.aceitaTeclas

  const { turma, codigo, ativo } = opcoes

  useEffect(() => {
    if (!ativo) return
    const receptor = criarReceptor({
      turma,
      codigo,
      aoCmd: (tecla) => {
        if (refAceita.current) digitarRemoto(tecla)
      },
      aoComando: (texto) => refComando.current(texto),
      lerEstado: () => refLer.current(),
      aoStatus: (novo, porque) => {
        setStatus(novo)
        setMotivo(porque)
      },
    })
    refPublicar.current = receptor.publicar
    return () => {
      refPublicar.current = () => {}
      receptor.parar()
    }
  }, [turma, codigo, ativo])

  return { status, motivo, publicar: () => refPublicar.current() }
}
